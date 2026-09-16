import type { PoolClient } from "pg";

export type PostProcessingJob = {
  id: string;
  postId: string;
  status: "pending" | "running" | "succeeded" | "failed";
};

/**
 * Creates the durable processing boundary for a post.
 *
 * This intentionally does not pretend to transcode or moderate media. A real
 * worker/provider must claim the job, process every media object, run the
 * moderation pipeline, and only then transition the post to `ready`.
 */
export async function enqueuePostProcessingJob(
  client: PoolClient,
  postId: string,
): Promise<PostProcessingJob> {
  const result = await client.query(
    `insert into post_processing_jobs (post_id)
     values ($1)
     on conflict (post_id) where status in ('pending', 'running')
     do update set updated_at = now()
     returning id, post_id, status`,
    [postId],
  );

  const row = result.rows[0];
  if (!row) throw new Error("post_processing_job_not_created");

  return {
    id: row.id,
    postId: row.post_id,
    status: row.status,
  };
}
