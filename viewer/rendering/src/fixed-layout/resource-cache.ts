interface CacheEntry<T> {
  readonly promise: Promise<T | null>;
  cost: number;
  value?: T | null;
  users: number;
}

export interface LoadedResource<T> {
  readonly value: T | null;
  /** Budget units (bytes, pixels…) charged while the value stays cached. */
  readonly cost: number;
}

export interface AcquiredResources<T> {
  readonly values: ReadonlyMap<string, T | null>;
  /** Unpins the values; idempotent. Unpinned entries may be evicted (and closed) afterwards. */
  release(): void;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Reference-counted LRU cache for decoded page resources (fonts, images) shared across pages.
 * Values pinned by an in-flight render are never evicted; a failed load resolves to `null`
 * so a broken resource only blanks the elements that use it (aborts still reject).
 */
export class SharedResourceCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private disposed = false;

  constructor(
    private readonly budget: number,
    private readonly load: (key: string) => Promise<LoadedResource<T>>,
    private readonly close?: (value: T) => void,
  ) {}

  async acquire(keys: Iterable<string>): Promise<AcquiredResources<T>> {
    const pinned = [...new Set(keys)].map((key) => [key, this.entry(key)] as const);
    for (const [, entry] of pinned) entry.users += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const [, entry] of pinned) entry.users -= 1;
      this.trim();
    };
    try {
      const values = new Map<string, T | null>();
      for (const [key, entry] of pinned) values.set(key, await entry.promise);
      return { values, release };
    } catch (error) {
      release();
      throw error;
    }
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) if (entry.value) this.close?.(entry.value);
    this.entries.clear();
  }

  private entry(key: string) {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing); // most recently used last
      return existing;
    }
    const entry: CacheEntry<T> = {
      cost: 0,
      users: 0,
      promise: this.load(key).then(
        ({ value, cost }) => {
          entry.value = value;
          entry.cost = cost;
          if (this.disposed && value) this.close?.(value);
          return value;
        },
        (error: unknown) => {
          this.entries.delete(key);
          if (isAbort(error)) throw error;
          return null;
        },
      ),
    };
    this.entries.set(key, entry);
    return entry;
  }

  private trim() {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.cost;
    for (const [key, entry] of this.entries) {
      if (total <= this.budget) return;
      if (entry.users > 0 || entry.value === undefined) continue;
      this.entries.delete(key);
      total -= entry.cost;
      if (entry.value) this.close?.(entry.value);
    }
  }
}
