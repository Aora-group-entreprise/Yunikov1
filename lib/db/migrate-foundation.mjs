import fs from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

const migrations = [
  "0001_yunikov_foundation",
  "0002_plan_completion",
];

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
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
    await client.query(sql);
    await client.query("insert into _yuniko_migrations (name) values ($1)", [
      name,
    ]);
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
