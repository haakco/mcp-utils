/**
 * Cache utilities for MCP servers
 */

export interface CacheEntry<T> {
  value: T;
  expires: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  onEvict?: (key: string, value: unknown) => void;
}

/**
 * Simple time-based cache
 */
export class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttl: number;

  constructor(ttl = 5 * 60 * 1000) {
    // 5 minutes default
    this.ttl = ttl;
  }

  set(key: string, value: T, customTtl?: number): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + (customTtl ?? this.ttl)
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
      }
    }
  }

  keys(): string[] {
    this.cleanup();
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    this.cleanup();
    return Array.from(this.cache.values()).map((entry) => entry.value);
  }
}

/**
 * LRU (Least Recently Used) Cache
 */
export class LRUCache<T> {
  private cache = new Map<string, T>();
  private readonly maxSize: number;
  private readonly onEvict?: (key: string, value: T) => void;

  constructor(maxSize: number, onEvict?: (key: string, value: T) => void) {
    this.maxSize = maxSize;
    this.onEvict = onEvict;
  }

  set(key: string, value: T): void {
    // Delete and re-add to move to end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const evictedValue = this.cache.get(firstKey);
        this.cache.delete(firstKey);
        if (this.onEvict && evictedValue !== undefined) {
          this.onEvict(firstKey, evictedValue);
        }
      }
    }

    this.cache.set(key, value);
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    return Array.from(this.cache.values());
  }
}

/**
 * TTL + LRU Cache (combines time expiration with LRU eviction)
 */
export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttl: number;
  private readonly maxSize: number;
  private readonly onEvict?: (key: string, value: T) => void;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl ?? 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize ?? 1000;
    this.onEvict = options.onEvict;
  }

  set(key: string, value: T, customTtl?: number): void {
    // Clean up expired entries first
    this.cleanup();

    // Check if we need to evict
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      // Find and evict the oldest entry
      let oldestKey: string | undefined;
      let oldestTime = Infinity;

      for (const [k, entry] of this.cache.entries()) {
        if (entry.expires < oldestTime) {
          oldestTime = entry.expires;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        const evictedEntry = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        if (this.onEvict && evictedEntry) {
          this.onEvict(oldestKey, evictedEntry.value);
        }
      }
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + (customTtl ?? this.ttl)
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        if (this.onEvict) {
          this.onEvict(key, entry.value);
        }
      }
    }
  }

  keys(): string[] {
    this.cleanup();
    return Array.from(this.cache.keys());
  }

  values(): T[] {
    this.cleanup();
    return Array.from(this.cache.values()).map((entry) => entry.value);
  }
}

/**
 * Create a memoized version of an async function
 */
export function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: {
    ttl?: number;
    keyGenerator?: (...args: Args) => string;
  } = {}
): (...args: Args) => Promise<Result> {
  const cache = new SimpleCache<Result>(options.ttl);
  const keyGen = options.keyGenerator ?? ((...args: Args) => JSON.stringify(args));

  return async (...args: Args): Promise<Result> => {
    const key = keyGen(...args);

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Create a debounced cache that batches get requests
 */
export class DebouncedCache<T> {
  private cache: TTLCache<T>;
  private pendingGets = new Map<
    string,
    {
      resolve: (value: T | undefined) => void;
      reject: (error: Error) => void;
    }
  >();
  private batchTimeout?: NodeJS.Timeout;
  private batchQueue: Set<string> = new Set();

  constructor(
    private fetcher: (keys: string[]) => Promise<Map<string, T>>,
    private options: CacheOptions & { batchDelay?: number } = {}
  ) {
    this.cache = new TTLCache(options);
  }

  async get(key: string): Promise<T | undefined> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Check if already fetching
    if (this.pendingGets.has(key)) {
      return new Promise((resolve, reject) => {
        const existing = this.pendingGets.get(key);
        if (existing) {
          // Chain to existing promise
          const originalResolve = existing.resolve;
          const originalReject = existing.reject;
          existing.resolve = (value) => {
            originalResolve(value);
            resolve(value);
          };
          existing.reject = (error) => {
            originalReject(error);
            reject(error);
          };
        }
      });
    }

    // Add to batch queue
    this.batchQueue.add(key);

    // Create promise for this key
    return new Promise<T | undefined>((resolve, reject) => {
      this.pendingGets.set(key, { resolve, reject });

      // Schedule batch fetch
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.executeBatch(), this.options.batchDelay ?? 10);
      }
    });
  }

  private async executeBatch(): Promise<void> {
    const keys = Array.from(this.batchQueue);
    this.batchQueue.clear();
    this.batchTimeout = undefined;

    if (keys.length === 0) return;

    try {
      const results = await this.fetcher(keys);

      // Cache results and resolve promises
      for (const [key, value] of results.entries()) {
        this.cache.set(key, value);
        const pending = this.pendingGets.get(key);
        if (pending) {
          pending.resolve(value);
          this.pendingGets.delete(key);
        }
      }

      // Resolve remaining keys with undefined
      for (const key of keys) {
        if (!results.has(key)) {
          const pending = this.pendingGets.get(key);
          if (pending) {
            pending.resolve(undefined);
            this.pendingGets.delete(key);
          }
        }
      }
    } catch (error) {
      // Reject all pending promises
      for (const key of keys) {
        const pending = this.pendingGets.get(key);
        if (pending) {
          pending.reject(error as Error);
          this.pendingGets.delete(key);
        }
      }
    }
  }

  set(key: string, value: T): void {
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
