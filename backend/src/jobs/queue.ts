import { newId } from '../lib/ids.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job<T = unknown> {
  id: string;
  type: string;
  status: JobStatus;
  result: T | null;
  error: string | null;
  ticketId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * In-process async job runner (build-prompt §1.8 — "don't block the event loop").
 *
 * AI/eval work is kicked off here and the HTTP handler returns a job id
 * immediately (202). Unrelated ticket reads stay responsive because the work
 * runs on a later tick with bounded concurrency. The Job store is intentionally
 * behind a tiny interface so it can be swapped for Redis/BullMQ at scale
 * (see STRETCH.md) without changing call sites.
 */
class JobQueue {
  private jobs = new Map<string, Job>();
  private queue: Array<() => Promise<void>> = [];
  private active = 0;
  private readonly concurrency: number;
  private readonly ttlMs = 30 * 60 * 1000; // reap finished jobs after 30 min

  constructor(concurrency = 4) {
    this.concurrency = concurrency;
  }

  enqueue<T>(type: string, work: () => Promise<T>, meta?: { ticketId?: string | null }): Job<T> {
    const now = new Date().toISOString();
    const job: Job<T> = {
      id: newId(),
      type,
      status: 'queued',
      result: null,
      error: null,
      ticketId: meta?.ticketId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job as Job);

    this.queue.push(async () => {
      this.update(job.id, { status: 'running' });
      try {
        const result = await work();
        this.update(job.id, { status: 'done', result });
      } catch (err) {
        this.update(job.id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
    // Yield to the event loop before doing any work.
    setImmediate(() => this.pump());
    return job;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.active++;
      void task().finally(() => {
        this.active--;
        this.reap();
        if (this.queue.length > 0) setImmediate(() => this.pump());
      });
    }
  }

  private update(id: string, patch: Partial<Job>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }

  private reap(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, job] of this.jobs) {
      if ((job.status === 'done' || job.status === 'error') && Date.parse(job.updatedAt) < cutoff) {
        this.jobs.delete(id);
      }
    }
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }
}

export const jobQueue = new JobQueue();
