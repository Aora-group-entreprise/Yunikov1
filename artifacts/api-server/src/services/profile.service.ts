import { eq } from "drizzle-orm";
import { pool, profiles } from "@workspace/db";
import type { UpdateProfileInput, ProfileResponse } from "@workspace/api-zod";
import { setRlsUser } from "@workspace/db";

function toProfileResponse(profile: typeof profiles.$inferSelect): ProfileResponse {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    isPrivate: profile.isPrivate,
    countryCode: profile.countryCode ?? null,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
  };
}

export async function getProfileByUsername(username: string): Promise<ProfileResponse | null> {
  const [profile] = await dbSelectProfile(eq(profiles.username, username));
  return profile ? toProfileResponse(profile) : null;
}

async function dbSelectProfile(condition: ReturnType<typeof eq>) {
  const { db } = await import("@workspace/db");
  return db.select().from(profiles).where(condition).limit(1);
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<ProfileResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await setRlsUser(client, userId);

    const updates: Record<string, unknown> = {};
    if (input.username !== undefined) updates.username = input.username;
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl;
    if (input.countryCode !== undefined) updates.country_code = input.countryCode?.toUpperCase() ?? null;
    if (input.isPrivate !== undefined) updates.is_private = input.isPrivate;

    const keys = Object.keys(updates);
    if (keys.length === 0) {
      const result = await client.query("select id, username, display_name, bio, avatar_url, is_private, country_code, follower_count, following_count from profiles where id = $1", [userId]);
      if (!result.rows[0]) throw new Error("profile_not_found");
      await client.query("commit");
      return ProfileResponse.parse({ ...result.rows[0], bio: result.rows[0].bio ?? null, avatarUrl: result.rows[0].avatar_url ?? null, countryCode: result.rows[0].country_code ?? null });
    }

    const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");
    const values = [...keys.map((key) => updates[key]), userId];
    const result = await client.query(
      `update profiles set ${setClause} where id = $${keys.length + 1} returning id, username, display_name, bio, avatar_url, is_private, country_code, follower_count, following_count`,
      values,
    );

    if (!result.rows[0]) throw new Error("profile_not_found");
    await client.query("commit");

    return ProfileResponse.parse({
      ...result.rows[0],
      displayName: result.rows[0].display_name,
      avatarUrl: result.rows[0].avatar_url ?? null,
      countryCode: result.rows[0].country_code ?? null,
      followerCount: result.rows[0].follower_count,
      followingCount: result.rows[0].following_count,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
