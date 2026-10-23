import { useCallback, useEffect, useState } from "react";
import type { JobView } from "../../shared/contract.ts";
import { api, ApiError } from "./api.ts";

const active = (j: JobView) => j.status === "queued" || j.status === "running";

/** Polls GET /api/jobs/:id every 2 s until the job finishes. Survives refresh because the id is persisted. */
export function useJob(jobId: string | undefined) {
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const j = await api.getJob(jobId);
        if (stopped) return;
        setJob(j);
        setError(null);
        if (active(j)) timer = setTimeout(poll, 2000);
      } catch (err) {
        if (stopped) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setError({ message: err instanceof Error ? err.message : String(err), notFound });
        if (!notFound) timer = setTimeout(poll, 4000); // transient: keep trying
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, nonce]);

  const retry = useCallback(async () => {
    if (!jobId) return;
    setJob(await api.retryJob(jobId));
    setNonce((n) => n + 1);
  }, [jobId]);

  return { job: job?.id === jobId ? job : null, error, retry };
}
