/**
 * Rate limiting utilities for MCP servers
 */

export interface RateLimiterOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Maximum requests per window
}

/**
 * Token bucket rate limiter
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire tokens
   */
  async acquire(tokens = 1): Promise<boolean> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Acquire tokens or wait until available
   */
  async acquireOrWait(tokens = 1): Promise<void> {
    while (!(await this.acquire(tokens))) {
      const tokensNeeded = tokens - this.tokens;
      const waitTime = (tokensNeeded / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 100)));
    }
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get the bucket capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter {
  private requests: number[] = [];

  constructor(
    private windowMs: number,
    private maxRequests: number
  ) {}

  /**
   * Check if request is allowed
   */
  async acquire(): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove old requests outside the window
    this.requests = this.requests.filter((time) => time > windowStart);

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get current request count
   */
  getCount(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.requests = this.requests.filter((time) => time > windowStart);
    return this.requests.length;
  }

  /**
   * Get time until next available request
   */
  getTimeUntilNextRequest(): number {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }

    const oldestRequest = Math.min(...this.requests);
    const timeUntilExpiry = oldestRequest + this.windowMs - Date.now();
    return Math.max(0, timeUntilExpiry);
  }

  /**
   * Get the max requests limit
   */
  getMaxRequests(): number {
    return this.maxRequests;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
  }
}

/**
 * Fixed window rate limiter
 */
export class FixedWindowRateLimiter {
  private count = 0;
  private windowStart: number;

  constructor(
    private windowMs: number,
    private maxRequests: number
  ) {
    this.windowStart = Date.now();
  }

  /**
   * Check if request is allowed
   */
  async acquire(): Promise<boolean> {
    const now = Date.now();

    // Check if we're in a new window
    if (now - this.windowStart >= this.windowMs) {
      this.count = 0;
      this.windowStart = now;
    }

    if (this.count < this.maxRequests) {
      this.count++;
      return true;
    }

    return false;
  }

  /**
   * Get current request count
   */
  getCount(): number {
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      return 0;
    }
    return this.count;
  }

  /**
   * Get time until window resets
   */
  getTimeUntilReset(): number {
    const timeElapsed = Date.now() - this.windowStart;
    return Math.max(0, this.windowMs - timeElapsed);
  }

  /**
   * Get the max requests limit
   */
  getMaxRequests(): number {
    return this.maxRequests;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.count = 0;
    this.windowStart = Date.now();
  }
}

/**
 * Leaky bucket rate limiter
 */
export class LeakyBucketRateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(
    private capacity: number,
    private leakRate: number // requests per second
  ) {}

  /**
   * Add request to the bucket
   */
  async acquire(): Promise<boolean> {
    if (this.queue.length >= this.capacity) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      this.queue.push(() => resolve(true));
      this.processQueue();
    });
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get the bucket capacity
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.queue = [];
    this.processing = false;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const interval = 1000 / this.leakRate;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        request();
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    this.processing = false;
  }
}

/**
 * Multi-tier rate limiter (e.g., per-second and per-minute limits)
 */
export class MultiTierRateLimiter {
  private limiters: Array<{
    limiter:
      | TokenBucketRateLimiter
      | SlidingWindowRateLimiter
      | FixedWindowRateLimiter
      | LeakyBucketRateLimiter;
    name: string;
  }> = [];

  constructor(
    tiers: Array<{
      windowMs: number;
      maxRequests: number;
      name: string;
    }>
  ) {
    this.limiters = tiers.map((tier) => ({
      limiter: new SlidingWindowRateLimiter(tier.windowMs, tier.maxRequests),
      name: tier.name
    }));
  }

  /**
   * Check if request is allowed by all tiers
   */
  async acquire(): Promise<{ allowed: boolean; limitedBy?: string }> {
    for (const { limiter, name } of this.limiters) {
      if (!(await limiter.acquire())) {
        return { allowed: false, limitedBy: name };
      }
    }
    return { allowed: true };
  }

  /**
   * Get status of all tiers
   */
  getStatus(): Array<{ name: string; count: number; limit: number }> {
    return this.limiters.map(({ limiter, name }) => {
      let limit = 0;

      // Get limit based on limiter type
      if (limiter instanceof TokenBucketRateLimiter) {
        limit = limiter.getCapacity();
      } else if (limiter instanceof SlidingWindowRateLimiter) {
        limit = limiter.getMaxRequests();
      } else if (limiter instanceof FixedWindowRateLimiter) {
        limit = limiter.getMaxRequests();
      } else if (limiter instanceof LeakyBucketRateLimiter) {
        limit = limiter.getCapacity();
      }

      // Get count based on limiter type
      let count = 0;
      if ('getCount' in limiter && typeof limiter.getCount === 'function') {
        count = limiter.getCount();
      } else if (limiter instanceof TokenBucketRateLimiter) {
        count = limiter.getTokens();
      }

      return {
        name,
        count,
        limit
      };
    });
  }

  /**
   * Reset all rate limiters
   */
  reset(): void {
    this.limiters.forEach(({ limiter }) => limiter.reset());
  }
}

/**
 * Rate limiter with different limits per key (e.g., per user)
 */
export class KeyedRateLimiter<K = string> {
  private limiters = new Map<K, SlidingWindowRateLimiter>();

  constructor(
    private windowMs: number,
    private maxRequests: number,
    private maxKeys = 10000 // Prevent memory leak
  ) {}

  /**
   * Check if request is allowed for a specific key
   */
  async acquire(key: K): Promise<boolean> {
    let limiter = this.limiters.get(key);

    if (!limiter) {
      // Evict oldest if at capacity
      if (this.limiters.size >= this.maxKeys) {
        const firstKey = this.limiters.keys().next().value;
        if (firstKey !== undefined) {
          this.limiters.delete(firstKey);
        }
      }

      limiter = new SlidingWindowRateLimiter(this.windowMs, this.maxRequests);
      this.limiters.set(key, limiter);
    }

    return limiter.acquire();
  }

  /**
   * Get count for a specific key
   */
  getCount(key: K): number {
    const limiter = this.limiters.get(key);
    return limiter ? limiter.getCount() : 0;
  }

  /**
   * Reset limiter for a specific key
   */
  resetKey(key: K): void {
    const limiter = this.limiters.get(key);
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * Reset all limiters
   */
  reset(): void {
    this.limiters.clear();
  }
}

/**
 * Create a rate-limited wrapper for an async function
 */
export function rateLimitFunction<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: {
    requestsPerSecond: number;
    burst?: number;
  }
): (...args: Args) => Promise<Result> {
  const limiter = new TokenBucketRateLimiter(
    options.burst ?? options.requestsPerSecond,
    options.requestsPerSecond
  );

  return async (...args: Args): Promise<Result> => {
    await limiter.acquireOrWait();
    return fn(...args);
  };
}

/**
 * Create a debounced function that rate limits calls
 */
export function debounce<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  delayMs: number
): (...args: Args) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Args): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  };
}

/**
 * Create a throttled function that limits execution frequency
 */
export function throttle<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  limitMs: number
): (...args: Args) => Result | undefined {
  let lastCall = 0;

  return (...args: Args): Result | undefined => {
    const now = Date.now();

    if (now - lastCall >= limitMs) {
      lastCall = now;
      return fn(...args);
    }

    return undefined;
  };
}
