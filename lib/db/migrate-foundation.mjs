import fs from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

const migrations = [
  "0000_yunikov_v1_schema",
  "0001_yunikov_foundation",
  "0002_plan_completion",
  "0003_follow_automation",
  "0004_post_metadata",
  "0005_post_media_visibility",
  "0006_post_purge_schedule",
  "0007_post_processing_jobs",
  "0008_post_processing_state_machine",
  "0009_post_processing_recovery",
  "0010_auth_sessions",
  "0011_profile_phase1",
  "0012_harden_migration_registry",
  "0013_auth_rate_limits",
  "0014_realtime_messaging",
  "0015_stories_complete",
  "0016_moderation_realtime",
];

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("create schema if not exists yunikov_v1");
  await client.query("set search_path to yunikov_v1, public");
  await client.query(
    "create table if not exists _yuniko_migrations (name text primary key, applied_at timestamptz not null default now())",
  );

  for (const name of migrations) {
    const { rowCount } = await client.query(
      "select 1 from _yuniko_migrations where name = $1",
      [name],
    );
    if (rowCount) {
      console.log(`${name}: already applied`);
      continue;
    }

    const sql = await fs.readFile(
      new URL(`./migrations/${name}.sql`, import.meta.url),
      "utf8",
    );
    await client.query("begin");
    await client.query("set local search_path to yunikov_v1, public");
    await client.query(sql);
    await client.query("insert into _yuniko_migrations (name) values ($1)", [name]);
    await client.query("commit");
    console.log(`${name}: applied`);
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
