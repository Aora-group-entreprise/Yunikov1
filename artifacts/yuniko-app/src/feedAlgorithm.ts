export type FeedPost = {
  id: string;
  userId: string;
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  views: number;
  createdAt: number;
  country?: string;
};

export type FeedUserSignals = {
  followedUserIds: string[];
  interests: Record<string, number>;
  recentlySeenPostIds: string[];
  recentlySeenUserIds: string[];
  notInterestedPostIds: string[];
  notInterestedUserIds: string[];
};

export type FeedRankingOptions = {
  now?: number;
  discoveryRatio?: number;
  maxPostsPerUser?: number;
};

export type RankedFeedPost = FeedPost & {
  score: number;
  engagementRate: number;
  velocity: number;
  relevance: number;
  discovery: number;
};

export type DistributionStage = 3 | 5 | 7 | 999;

export type DistributionDecision = {
  stage: DistributionStage;
  countries: string[];
  engagementRate: number;
  velocity: number;
  reason: "initial-test" | "expand" | "hold" | "second-chance" | "global";
};

// These are Yuniko's initial simulation countries, not copied from another platform.
const COUNTRY_POOL = [
  "United States",
  "China",
  "South Korea",
  "France",
  "Congo",
  "Brazil",
  "Japan",
  "United Kingdom",
  "Canada",
  "Germany",
  "India",
  "South Africa",
  "Australia",
  "Mexico",
  "Spain",
  "Italy",
  "Madagascar",
  "Nigeria",
  "Kenya",
  "Argentina",
];

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function normalize(value: number, target: number) {
  return clamp(value / Math.max(1, target));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededOrder(values: string[], seed: string) {
  return [...values]
    .map((value) => ({ value, score: hashString(`${seed}:${value}`) }))
    .sort((a, b) => a.score - b.score)
    .map(({ value }) => value);
}

function interestMatch(post: FeedPost, interests: Record<string, number>) {
  if (!post.hashtags.length) return 0;
  const scores = post.hashtags.map((tag) => interests[tag.replace(/^#/, "").toLowerCase()] ?? 0);
  return clamp(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function freshness(post: FeedPost, now: number) {
  const ageHours = Math.max(0, (now - post.createdAt) / 3_600_000);
  return Math.exp(-ageHours / 48);
}

export function getEngagementRate(post: FeedPost) {
  const weightedInteractions = post.likes + post.comments * 2 + post.shares * 3 + (post.saves ?? 0) * 2;
  return clamp(weightedInteractions / Math.max(20, post.views));
}

export function getEngagementVelocity(post: FeedPost, now = Date.now()) {
  const ageHours = Math.max(1 / 60, (now - post.createdAt) / 3_600_000);
  const weightedInteractions = post.likes + post.comments * 2 + post.shares * 3 + (post.saves ?? 0) * 2;
  return clamp(weightedInteractions / Math.max(20, post.views) / ageHours * 4);
}

export function rankFeedPosts(
  posts: FeedPost[],
  user: FeedUserSignals,
  options: FeedRankingOptions = {},
): RankedFeedPost[] {
  const now = options.now ?? Date.now();
  const discoveryRatio = clamp(options.discoveryRatio ?? 0.2);
  const maxPostsPerUser = Math.max(1, options.maxPostsPerUser ?? 2);

  const ranked = posts
    .filter((post) => !user.notInterestedPostIds.includes(post.id) && !user.notInterestedUserIds.includes(post.userId))
    .map((post) => {
      const engagementRate = getEngagementRate(post);
      const velocity = getEngagementVelocity(post, now);
      const relevance = clamp(
        interestMatch(post, user.interests) * 0.65
        + (user.followedUserIds.includes(post.userId) ? 0.35 : 0),
      );
      const isRecentRepeat = user.recentlySeenPostIds.includes(post.id);
      const creatorRepeat = user.recentlySeenUserIds.includes(post.userId);
      const discovery = clamp((1 - relevance) * discoveryRatio + (post.userId === "" ? 0 : 0.1));
      const score = (
        relevance * 0.30
        + engagementRate * 0.20
        + velocity * 0.15
        + freshness(post, now) * 0.10
        + (user.followedUserIds.includes(post.userId) ? 0.10 : 0)
        + discovery * 0.10
        + freshness(post, now) * 0.05
        - (isRecentRepeat ? 0.16 : 0)
        - (creatorRepeat ? 0.08 : 0)
      );

      return { ...post, score, engagementRate, velocity, relevance, discovery };
    })
    .sort((a, b) => b.score - a.score);

  const result: RankedFeedPost[] = [];
  const creatorCounts = new Map<string, number>();
  const deferred: RankedFeedPost[] = [];

  for (const post of ranked) {
    const count = creatorCounts.get(post.userId) ?? 0;
    if (count < maxPostsPerUser) {
      result.push(post);
      creatorCounts.set(post.userId, count + 1);
    } else {
      deferred.push(post);
    }
  }

  // Re-introduce deferred creators only when the main list is exhausted.
  return result.concat(deferred);
}

export function chooseDistribution(
  post: FeedPost,
  testedCountries: string[] = [],
  cycle = 0,
  now = Date.now(),
): DistributionDecision {
  const engagementRate = getEngagementRate(post);
  const velocity = getEngagementVelocity(post, now);
  const performance = engagementRate * 0.7 + velocity * 0.3;
  const nextCountries = seededOrder(COUNTRY_POOL, `${post.id}:${cycle}`)
    .filter((country) => !testedCountries.includes(country));

  let stage: DistributionStage = 3;
  let reason: DistributionDecision["reason"] = "initial-test";

  if (cycle > 0 && performance < 0.08) {
    reason = "second-chance";
  }
  if (performance >= 0.35) {
    stage = 999;
    reason = "global";
  } else if (performance >= 0.20) {
    stage = 7;
    reason = "expand";
  } else if (performance >= 0.10) {
    stage = 5;
    reason = "expand";
  } else if (cycle > 0) {
    reason = "hold";
  }

  const count = stage === 999 ? COUNTRY_POOL.length : stage;
  const countries = seededOrder(
    [...testedCountries, ...nextCountries],
    `${post.id}:${cycle}:distribution`,
  ).slice(0, count);

  return { stage, countries, engagementRate, velocity, reason };
}

export function getFeedCandidates(posts: FeedPost[], user: FeedUserSignals, options?: FeedRankingOptions) {
  return rankFeedPosts(posts, user, options);
}
