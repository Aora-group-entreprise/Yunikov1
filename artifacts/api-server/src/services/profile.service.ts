import { eq } from "drizzle-orm";
import { db, pool, profiles, setRlsUser } from "@workspace/db";
import type { UpdateProfileInput, ProfileResponse } from "@workspace/api-zod";

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
  const [profile] = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
  return profile ? toProfileResponse(profile) : null;
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
      const result = await client.query(
        "select id, username, display_name, bio, avatar_url, is_private, country_code, follower_count, following_count from profiles where id = $1",
        [userId],
      );
      if (!result.rows[0]) throw new Error("profile_not_found");
      await client.query("commit");
      const row = result.rows[0];
      return ProfileResponse.parse({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        bio: row.bio ?? null,
        avatarUrl: row.avatar_url ?? null,
        isPrivate: row.is_private,
        countryCode: row.country_code ?? null,
        followerCount: row.follower_count,
        followingCount: row.following_count,
      });
    }

    const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(", ");
    const values = [...keys.map((key) => updates[key]), userId];
    const result = await client.query(
      `update profiles set ${setClause} where id = $${keys.length + 1} returning id, username, display_name, bio, avatar_url, is_private, country_code, follower_count, following_count`,
      values,
    );

    if (!result.rows[0]) throw new Error("profile_not_found");
    await client.query("commit");
    const row = result.rows[0];
    return ProfileResponse.parse({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      bio: row.bio ?? null,
      avatarUrl: row.avatar_url ?? null,
      isPrivate: row.is_private,
      countryCode: row.country_code ?? null,
      followerCount: row.follower_count,
      followingCount: row.following_count,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
