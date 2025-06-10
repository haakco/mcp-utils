/**
 * Multi-instance management utilities for MCP servers
 * Provides centralized management of multiple service instances with health checking and failover
 */

import debug from 'debug';
import {
  BaseMCPError,
  InstanceNotFoundError,
  InstanceConnectionError,
  ValidationError,
  ErrorConverter,
  RetryHelper
} from './errors.js';

export interface InstanceConfig {
  /** Unique instance identifier */
  name: string;

  /** Display name for the instance */
  displayName?: string;

  /** Base URL or connection string */
  url: string;

  /** Authentication configuration */
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';
    credentials: Record<string, string>;
  };

  /** Instance-specific configuration */
  config?: Record<string, unknown>;

  /** Health check configuration */
  healthCheck?: {
    enabled: boolean;
    endpoint?: string;
    interval?: number;
    timeout?: number;
    retries?: number;
  };

  /** Connection settings */
  connection?: {
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
  };

  /** Instance priority for load balancing */
  priority?: number;

  /** Instance tags for filtering */
  tags?: string[];

  /** Whether this instance is enabled */
  enabled?: boolean;
}

export interface InstanceStatus {
  /** Instance name */
  name: string;

  /** Current health status */
  health: 'healthy' | 'unhealthy' | 'unknown';

  /** Whether instance is currently available */
  available: boolean;

  /** Whether instance is enabled */
  enabled: boolean;

  /** Last health check timestamp */
  lastHealthCheck?: Date;

  /** Last successful operation timestamp */
  lastSuccess?: Date;

  /** Last error encountered */
  lastError?: {
    error: BaseMCPError;
    timestamp: Date;
  };

  /** Connection statistics */
  stats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    uptime: number;
  };

  /** Instance metadata */
  metadata?: Record<string, unknown>;
}

export interface InstanceManagerConfig {
  /** Debug namespace */
  debugNamespace?: string;

  /** Default instance to use when none specified */
  defaultInstance?: string | undefined;

  /** Global health check settings */
  healthCheck?: {
    interval: number;
    timeout: number;
    retries: number;
    enabled: boolean;
  };

  /** Load balancing strategy */
  loadBalancing?: {
    strategy: 'round-robin' | 'priority' | 'least-connections' | 'random';
    stickySession: boolean;
  };

  /** Failover configuration */
  failover?: {
    enabled: boolean;
    maxFailures: number;
    retryInterval: number;
    backupInstances?: string[];
  };

  /** Auto-discovery settings */
  autoDiscovery?: {
    enabled: boolean;
    providers: ('dns' | 'consul' | 'etcd')[];
    interval: number;
  };
}

export interface InstanceOperation<T> {
  /** Operation name for logging */
  name: string;

  /** Operation function */
  execute: (instance: ManagedInstance) => Promise<T>;

  /** Operation-specific retry configuration */
  retry?: {
    maxRetries: number;
    delay: number;
  };

  /** Operation timeout */
  timeout?: number;

  /** Whether to use failover instances on failure */
  useFailover?: boolean;
}

/**
 * Managed instance with runtime state
 */
export class ManagedInstance {
  public readonly config: InstanceConfig;
  public status: InstanceStatus;
  private readonly debug: debug.Debugger;
  private healthCheckTimer?: NodeJS.Timeout;
  // Service-specific connection pool would be managed by subclasses

  constructor(config: InstanceConfig, debugNamespace: string) {
    this.config = { ...config };
    this.debug = debug(`${debugNamespace}:instance:${config.name}`);

    this.status = {
      name: config.name,
      health: 'unknown',
      available: config.enabled !== false,
      enabled: config.enabled !== false,
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        uptime: Date.now()
      }
    };

    this.debug('Instance created: %s (%s)', config.name, config.url);
  }

  /**
   * Start health checking for this instance
   */
  public startHealthCheck(interval: number = 30000): void {
    if (!this.config.healthCheck?.enabled) {
      return;
    }

    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, interval);

    // Perform initial health check
    this.performHealthCheck().catch((error) => {
      this.debug('Initial health check failed: %s', error.message);
    });
  }

  /**
   * Stop health checking
   */
  public stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Perform health check
   */
  public async performHealthCheck(): Promise<boolean> {
    if (!this.config.healthCheck?.enabled) {
      this.status.health = 'unknown';
      return true;
    }

    const startTime = Date.now();

    try {
      // This would be implemented by specific instance types
      const healthy = await this.checkHealth();

      this.status.health = healthy ? 'healthy' : 'unhealthy';
      this.status.available = healthy && this.status.enabled;
      this.status.lastHealthCheck = new Date();

      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);

      if (healthy) {
        this.debug('Health check passed (%dms)', responseTime);
      } else {
        this.debug('Health check failed');
      }

      return healthy;
    } catch (error) {
      this.status.health = 'unhealthy';
      this.status.available = false;
      this.status.lastHealthCheck = new Date();
      this.status.lastError = {
        error: ErrorConverter.toMCPError(error),
        timestamp: new Date()
      };

      this.debug('Health check error: %s', (error as Error).message);
      return false;
    }
  }

  /**
   * Execute an operation against this instance
   */
  public async execute<T>(operation: InstanceOperation<T>): Promise<T> {
    if (!this.status.available) {
      throw new InstanceConnectionError(this.config.name, {
        reason: 'Instance not available',
        health: this.status.health
      });
    }

    const startTime = Date.now();
    this.status.stats.totalRequests++;

    try {
      const result = await RetryHelper.withRetry(
        () => operation.execute(this),
        operation.retry?.maxRetries ?? this.config.connection?.maxRetries ?? 3,
        operation.retry?.delay ?? this.config.connection?.retryDelay ?? 1000
      );

      this.status.stats.successfulRequests++;
      this.status.lastSuccess = new Date();

      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);

      this.debug('Operation %s completed (%dms)', operation.name, responseTime);
      return result;
    } catch (error) {
      this.status.stats.failedRequests++;
      const mcpError = ErrorConverter.toMCPError(error);

      this.status.lastError = {
        error: mcpError,
        timestamp: new Date()
      };

      this.debug('Operation %s failed: %s', operation.name, mcpError.message);
      throw mcpError;
    }
  }

  /**
   * Update instance configuration
   */
  public updateConfig(updates: Partial<InstanceConfig>): void {
    Object.assign(this.config, updates);

    if ('enabled' in updates) {
      this.status.enabled = updates.enabled!;
      this.status.available = updates.enabled! && this.status.health !== 'unhealthy';
    }

    this.debug('Configuration updated');
  }

  /**
   * Get instance connection information
   */
  public getConnectionInfo(): { url: string; auth?: InstanceConfig['auth'] } {
    return {
      url: this.config.url,
      auth: this.config.auth
    };
  }

  /**
   * Service-specific health check implementation
   * Override in subclasses
   */
  protected async checkHealth(): Promise<boolean> {
    // Default implementation - override in specific instance types
    return true;
  }

  /**
   * Update average response time
   */
  private updateResponseTime(responseTime: number): void {
    const stats = this.status.stats;
    const totalOperations = stats.successfulRequests + stats.failedRequests;

    if (totalOperations === 1) {
      stats.averageResponseTime = responseTime;
    } else {
      stats.averageResponseTime =
        (stats.averageResponseTime * (totalOperations - 1) + responseTime) / totalOperations;
    }
  }
}

/**
 * Multi-instance manager
 */
export class InstanceManager {
  private readonly instances = new Map<string, ManagedInstance>();
  private readonly config: InstanceManagerConfig & {
    debugNamespace: string;
    healthCheck: Required<NonNullable<InstanceManagerConfig['healthCheck']>>;
    loadBalancing: Required<NonNullable<InstanceManagerConfig['loadBalancing']>>;
    failover: Required<NonNullable<InstanceManagerConfig['failover']>>;
    autoDiscovery: Required<NonNullable<InstanceManagerConfig['autoDiscovery']>>;
  };
  private readonly debug: debug.Debugger;
  private currentInstance?: string;
  private loadBalanceIndex = 0;

  constructor(config: InstanceManagerConfig = {}) {
    this.config = this.normalizeConfig(config);
    this.debug = debug(this.config.debugNamespace);
    this.debug('Instance manager created');
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: InstanceManagerConfig): InstanceManagerConfig & {
    debugNamespace: string;
    healthCheck: Required<NonNullable<InstanceManagerConfig['healthCheck']>>;
    loadBalancing: Required<NonNullable<InstanceManagerConfig['loadBalancing']>>;
    failover: Required<NonNullable<InstanceManagerConfig['failover']>>;
    autoDiscovery: Required<NonNullable<InstanceManagerConfig['autoDiscovery']>>;
  } {
    return {
      debugNamespace: config.debugNamespace ?? 'mcp:instance-manager',
      defaultInstance: config.defaultInstance ?? undefined,
      healthCheck: {
        interval: config.healthCheck?.interval ?? 30000,
        timeout: config.healthCheck?.timeout ?? 5000,
        retries: config.healthCheck?.retries ?? 3,
        enabled: config.healthCheck?.enabled ?? true
      },
      loadBalancing: {
        strategy: config.loadBalancing?.strategy ?? 'round-robin',
        stickySession: config.loadBalancing?.stickySession ?? false
      },
      failover: {
        enabled: config.failover?.enabled ?? true,
        maxFailures: config.failover?.maxFailures ?? 3,
        retryInterval: config.failover?.retryInterval ?? 60000,
        backupInstances: config.failover?.backupInstances ?? []
      },
      autoDiscovery: {
        enabled: config.autoDiscovery?.enabled ?? false,
        providers: config.autoDiscovery?.providers ?? [],
        interval: config.autoDiscovery?.interval ?? 60000
      }
    };
  }

  /**
   * Add an instance to the manager
   */
  public addInstance(config: InstanceConfig): void {
    if (this.instances.has(config.name)) {
      throw new ValidationError(`Instance '${config.name}' already exists`);
    }

    const instance = new ManagedInstance(config, this.config.debugNamespace);
    this.instances.set(config.name, instance);

    // Start health checking if enabled
    if (this.config.healthCheck.enabled && config.healthCheck?.enabled !== false) {
      instance.startHealthCheck(this.config.healthCheck.interval);
    }

    // Set as default if it's the first instance or explicitly configured
    if (!this.currentInstance || config.name === this.config.defaultInstance) {
      this.currentInstance = config.name;
    }

    this.debug('Added instance: %s', config.name);
  }

  /**
   * Remove an instance
   */
  public removeInstance(name: string): void {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new InstanceNotFoundError(name);
    }

    instance.stopHealthCheck();
    this.instances.delete(name);

    // Update current instance if needed
    if (this.currentInstance === name) {
      const available = this.getAvailableInstances();
      this.currentInstance = available.length > 0 ? available[0]!.config.name : undefined;
    }

    this.debug('Removed instance: %s', name);
  }

  /**
   * Get instance by name
   */
  public getInstance(name: string): ManagedInstance {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new InstanceNotFoundError(name);
    }
    return instance;
  }

  /**
   * Get all instances
   */
  public getAllInstances(): ManagedInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get available (healthy and enabled) instances
   */
  public getAvailableInstances(): ManagedInstance[] {
    return this.getAllInstances().filter((instance) => instance.status.available);
  }

  /**
   * Switch to a specific instance
   */
  public switchInstance(name: string): void {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new InstanceNotFoundError(name);
    }

    this.currentInstance = name;
    this.debug('Switched to instance: %s', name);
  }

  /**
   * Get current instance
   */
  public getCurrentInstance(): ManagedInstance | undefined {
    if (!this.currentInstance) {
      return undefined;
    }
    return this.instances.get(this.currentInstance);
  }

  /**
   * Select an instance using load balancing strategy
   */
  public selectInstance(tags?: string[]): ManagedInstance {
    let candidates = this.getAvailableInstances();

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      candidates = candidates.filter((instance) =>
        tags.some((tag) => instance.config.tags?.includes(tag))
      );
    }

    if (candidates.length === 0) {
      throw new InstanceConnectionError('any', { reason: 'No available instances' });
    }

    switch (this.config.loadBalancing.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(candidates);
      case 'priority':
        return this.selectByPriority(candidates);
      case 'least-connections':
        return this.selectLeastConnections(candidates);
      case 'random':
        return this.selectRandom(candidates);
      default:
        return candidates[0]!;
    }
  }

  /**
   * Execute operation with automatic instance selection and failover
   */
  public async execute<T>(
    operation: InstanceOperation<T>,
    options: {
      instanceName?: string;
      tags?: string[];
      useFailover?: boolean;
    } = {}
  ): Promise<T> {
    let instance: ManagedInstance;

    // Select instance
    if (options.instanceName) {
      const foundInstance = this.instances.get(options.instanceName);
      if (!foundInstance) {
        throw new InstanceNotFoundError(options.instanceName);
      }
      instance = foundInstance;
    } else {
      instance = this.selectInstance(options.tags);
    }

    try {
      return await instance.execute(operation);
    } catch (error) {
      // Try failover if enabled and configured
      if (this.config.failover.enabled && (options.useFailover ?? operation.useFailover)) {
        return await this.executeWithFailover(operation, instance, options);
      }
      throw error;
    }
  }

  /**
   * Get instance statistics
   */
  public getStatistics(): InstanceManagerStatistics {
    const instances = this.getAllInstances();
    const available = this.getAvailableInstances();

    const totalRequests = instances.reduce((sum, i) => sum + i.status.stats.totalRequests, 0);
    const totalSuccessful = instances.reduce(
      (sum, i) => sum + i.status.stats.successfulRequests,
      0
    );
    const totalFailed = instances.reduce((sum, i) => sum + i.status.stats.failedRequests, 0);

    const avgResponseTime =
      instances.length > 0
        ? instances.reduce((sum, i) => sum + i.status.stats.averageResponseTime, 0) /
          instances.length
        : 0;

    return {
      totalInstances: instances.length,
      availableInstances: available.length,
      healthyInstances: instances.filter((i) => i.status.health === 'healthy').length,
      unhealthyInstances: instances.filter((i) => i.status.health === 'unhealthy').length,
      enabledInstances: instances.filter((i) => i.status.enabled).length,
      totalRequests,
      successfulRequests: totalSuccessful,
      failedRequests: totalFailed,
      successRate: totalRequests > 0 ? (totalSuccessful / totalRequests) * 100 : 0,
      averageResponseTime: avgResponseTime,
      currentInstance: this.currentInstance
    };
  }

  /**
   * Validate all instances
   */
  public async validateInstances(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const instance of this.instances.values()) {
      try {
        const healthy = await instance.performHealthCheck();
        results.push({
          instanceName: instance.config.name,
          valid: healthy,
          errors: healthy ? [] : ['Health check failed'],
          warnings: []
        });
      } catch (error) {
        results.push({
          instanceName: instance.config.name,
          valid: false,
          errors: [(error as Error).message],
          warnings: []
        });
      }
    }

    return results;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    for (const instance of this.instances.values()) {
      instance.stopHealthCheck();
    }
    this.instances.clear();
    this.debug('Cleanup completed');
  }

  /**
   * Execute with failover support
   */
  private async executeWithFailover<T>(
    operation: InstanceOperation<T>,
    failedInstance: ManagedInstance,
    _options: { tags?: string[] }
  ): Promise<T> {
    const backup = this.config.failover.backupInstances ?? [];
    const candidates = this.getAvailableInstances().filter(
      (i) => i.config.name !== failedInstance.config.name
    );

    // Try backup instances first
    for (const backupName of backup) {
      const backupInstance = this.instances.get(backupName);
      if (backupInstance && backupInstance.status.available) {
        try {
          this.debug('Trying backup instance: %s', backupName);
          return await backupInstance.execute(operation);
        } catch (error) {
          this.debug('Backup instance %s failed: %s', backupName, (error as Error).message);
        }
      }
    }

    // Try remaining available instances
    for (const candidate of candidates) {
      try {
        this.debug('Trying failover instance: %s', candidate.config.name);
        return await candidate.execute(operation);
      } catch (error) {
        this.debug(
          'Failover instance %s failed: %s',
          candidate.config.name,
          (error as Error).message
        );
      }
    }

    throw new InstanceConnectionError('failover', {
      reason: 'All instances failed',
      originalError: failedInstance.status.lastError?.error.message
    });
  }

  /**
   * Load balancing strategies
   */
  private selectRoundRobin(candidates: ManagedInstance[]): ManagedInstance {
    const instance = candidates[this.loadBalanceIndex % candidates.length];
    this.loadBalanceIndex++;
    return instance!;
  }

  private selectByPriority(candidates: ManagedInstance[]): ManagedInstance {
    const sorted = candidates.sort((a, b) => (b.config.priority ?? 0) - (a.config.priority ?? 0));
    return sorted[0]!;
  }

  private selectLeastConnections(candidates: ManagedInstance[]): ManagedInstance {
    const sorted = candidates.sort((a, b) => {
      const aConnections =
        a.status.stats.totalRequests -
        a.status.stats.successfulRequests -
        a.status.stats.failedRequests;
      const bConnections =
        b.status.stats.totalRequests -
        b.status.stats.successfulRequests -
        b.status.stats.failedRequests;
      return aConnections - bConnections;
    });
    return sorted[0]!;
  }

  private selectRandom(candidates: ManagedInstance[]): ManagedInstance {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index]!;
  }
}

export interface InstanceManagerStatistics {
  totalInstances: number;
  availableInstances: number;
  healthyInstances: number;
  unhealthyInstances: number;
  enabledInstances: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageResponseTime: number;
  currentInstance?: string;
}

export interface ValidationResult {
  instanceName: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Factory function to create an instance manager with common configuration
 */
export function createInstanceManager(
  config: Partial<InstanceManagerConfig> = {}
): InstanceManager {
  return new InstanceManager({
    healthCheck: { enabled: true, interval: 30000, timeout: 5000, retries: 3 },
    loadBalancing: { strategy: 'round-robin', stickySession: false },
    failover: { enabled: true, maxFailures: 3, retryInterval: 60000 },
    ...config
  });
}
