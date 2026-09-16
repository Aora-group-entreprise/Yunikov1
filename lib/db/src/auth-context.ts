import type { PoolClient } from "pg";

/** Set the authenticated user for the current PostgreSQL transaction.
 * RLS policies read app.user_id; never accept this value from the browser directly.
 */
export async function setRlsUser(client: PoolClient, userId: string): Promise<void> {
  await client.query("select set_config('app.user_id', $1, true)", [userId]);
}

export async function withRlsUser<T>(client: PoolClient, userId: string, work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await setRlsUser(client, userId);
    const result = await work();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
