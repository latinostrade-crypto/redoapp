/** Serializes writes and acknowledges only the exact, successfully stored JSON.
 * The caller owns the snapshot; never retain mutable references across an await.
 */
export function createChangedSnapshotWriter<T>(write: (snapshot: T) => Promise<void>) {
  let lastStored: string | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  return (value: T): Promise<boolean> => {
    const serialized = JSON.stringify(value);
    const result = tail.then(async () => {
      if (serialized === lastStored) return false;
      await write(JSON.parse(serialized) as T);
      lastStored = serialized;
      return true;
    });
    // A failed write remains dirty and must not poison subsequent retries.
    tail = result.catch(() => undefined);
    return result;
  };
}
