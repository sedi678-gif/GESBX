const replayLocks = new Map<string, Promise<unknown>>();

/** Eyni request açarı in-flight Promise-ə bağlanır — ikinci göndəriş yeni action açmır. */
export function replayBattleRequest<T>(key: string, run: () => Promise<T>): Promise<T> {
  const id = String(key || '').trim();
  if (!id) return run();
  const existing = replayLocks.get(id);
  if (existing) return existing as Promise<T>;
  const work = run().finally(() => {
    replayLocks.delete(id);
  });
  replayLocks.set(id, work);
  return work;
}
