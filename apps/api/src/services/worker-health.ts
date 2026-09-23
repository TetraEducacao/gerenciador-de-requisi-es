/** Detect workers connected to this queue, including idle workers. */
export async function checkWorkerStatus(queue: {
  getWorkers(): Promise<unknown[]>;
}): Promise<'online' | 'offline' | 'degraded'> {
  try {
    const workers = await queue.getWorkers();
    return workers.length > 0 ? 'online' : 'offline';
  } catch {
    // A failed Redis inspection cannot establish whether the worker is stopped.
    return 'degraded';
  }
}
