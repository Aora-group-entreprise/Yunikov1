import { eq } from "drizzle-orm";
import { db, pool, profiles, setRlsUser } from "@workspace/db";
import type { UpdateProfileInput } from "@workspace/api-zod";
import { ProfileResponse } from "@workspace/api-zod";

function toProfileResponse(profile: typeof profiles.$inferSelect): ProfileResponse {
  return { id: profile.id, username: profile.username, displayName: profile.displayName, bio: profile.bio ?? null, avatarUrl: profile.avatarUrl ?? null, isPrivate: profile.isPrivate, countryCode: profile.countryCode ?? null, followerCount: profile.followerCount, followingCount: profile.followingCount };
}

export async function getProfileByUsername(username: string, viewerId?: string): Promise<ProfileResponse | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (viewerId) await setRlsUser(client, viewerId);
    const result = await client.query(`select id,username,display_name,bio,avatar_url,is_private,country_code,follower_count,following_count from profiles where username=$1 limit 1`, [username]);
    await client.query("commit");
    return result.rows[0] ? ProfileResponse.parse({ id: result.rows[0].id, username: result.rows[0].username, displayName: result.rows[0].display_name, bio: result.rows[0].bio ?? null, avatarUrl: result.rows[0].avatar_url ?? null, isPrivate: result.rows[0].is_private, countryCode: result.rows[0].country_code ?? null, followerCount: result.rows[0].follower_count, followingCount: result.rows[0].following_count }) : null;
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; } finally { client.release(); }
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<ProfileResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin"); await setRlsUser(client, userId);
    const updates: Record<string, unknown> = {};
    if (input.username !== undefined) updates.username = input.username;
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl;
    if (input.countryCode !== undefined) updates.country_code = input.countryCode?.toUpperCase() ?? null;
    if (input.isPrivate !== undefined) updates.is_private = input.isPrivate;
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      const result = await client.query(`select id,username,display_name,bio,avatar_url,is_private,country_code,follower_count,following_count from profiles where id=$1`, [userId]);
      if (!result.rows[0]) throw new Error("profile_not_found");
      await client.query("commit");
      return ProfileResponse.parse({ id: result.rows[0].id, username: result.rows[0].username, displayName: result.rows[0].display_name, bio: result.rows[0].bio ?? null, avatarUrl: result.rows[0].avatar_url ?? null, isPrivate: result.rows[0].is_private, countryCode: result.rows[0].country_code ?? null, followerCount: result.rows[0].follower_count, followingCount: result.rows[0].following_count });
    }
    if (input.username !== undefined) {
      const old = await client.query<{ username: string }>(`select username from profiles where id=$1`, [userId]);
      if (!old.rows[0]) throw new Error("profile_not_found");
      if (old.rows[0].username !== input.username) await client.query(`insert into username_history(user_id,username) values ($1,$2) on conflict do nothing`, [userId, old.rows[0].username]);
    }
    const setClause = keys.map((key, index) => `${key}=$${index + 1}`).join(",");
    const values = [...keys.map((key) => updates[key]), userId];
    const result = await client.query(`update profiles set ${setClause} where id=$${keys.length + 1} returning id,username,display_name,bio,avatar_url,is_private,country_code,follower_count,following_count`, values);
    if (!result.rows[0]) throw new Error("profile_not_found");
    await client.query("commit");
    const row = result.rows[0];
    return ProfileResponse.parse({ id: row.id, username: row.username, displayName: row.display_name, bio: row.bio ?? null, avatarUrl: row.avatar_url ?? null, isPrivate: row.is_private, countryCode: row.country_code ?? null, followerCount: row.follower_count, followingCount: row.following_count });
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; } finally { client.release(); }
}
