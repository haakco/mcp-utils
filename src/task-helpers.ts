import debug from 'debug';

const taskDebug = debug('mcp:task-helpers');

export interface TaskOptions {
  timeout?: number;
  pollInterval?: number;
  maxRetries?: number;
  onProgress?: (progress: TaskProgress) => void;
}

export interface TaskProgress {
  status: string;
  percentage?: number;
  message?: string;
}

export interface TaskResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
}

export class TaskExecutor {
  static async waitForCondition<T>(
    checkFn: () => Promise<T | null>,
    options: TaskOptions = {}
  ): Promise<T> {
    const {
      timeout = 300000, // 5 minutes
      pollInterval = 5000, // 5 seconds
      onProgress
    } = options;

    const startTime = Date.now();
    // const lastStatus = '';

    while (Date.now() - startTime < timeout) {
      try {
        const result = await checkFn();

        if (result !== null) {
          taskDebug('Condition met, returning result');
          return result;
        }

        const elapsed = Date.now() - startTime;
        const progress = Math.min(Math.round((elapsed / timeout) * 100), 99);

        if (onProgress) {
          onProgress({
            status: 'waiting',
            percentage: progress,
            message: `Waiting... ${Math.round(elapsed / 1000)}s elapsed`
          });
        }

        await this.sleep(pollInterval);
      } catch (error) {
        taskDebug('Error during condition check:', error);
        // Continue polling on transient errors
      }
    }

    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: TaskOptions = {}
  ): Promise<TaskResult<T>> {
    const { maxRetries = 3, onProgress } = options;

    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (onProgress) {
          onProgress({
            status: 'executing',
            percentage: Math.round((attempt / maxRetries) * 100),
            message: `Attempt ${attempt} of ${maxRetries}`
          });
        }

        const data = await operation();

        return {
          success: true,
          data,
          duration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        taskDebug(`Attempt ${attempt} failed:`, lastError.message);

        if (attempt < maxRetries) {
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Operation failed',
      duration: Date.now() - startTime
    };
  }

  static async runParallel<T>(
    tasks: Array<() => Promise<T>>,
    options: { concurrency?: number } = {}
  ): Promise<TaskResult<T>[]> {
    const { concurrency = 5 } = options;
    const results: TaskResult<T>[] = [];
    const queue = [...tasks];

    const workers = Array(concurrency)
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const task = queue.shift();
          if (!task) break;

          const startTime = Date.now();
          try {
            const data = await task();
            results.push({
              success: true,
              data,
              duration: Date.now() - startTime
            });
          } catch (error) {
            results.push({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              duration: Date.now() - startTime
            });
          }
        }
      });

    await Promise.all(workers);
    return results;
  }

  static async batch<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchSize = 10
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processor(batch);
      results.push(...batchResults);
    }

    return results;
  }

  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage = 'Operation timed out'
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }
}

// Proxmox-specific task helpers
export class ProxmoxTaskHelper {
  static parseTaskId(taskId: string): { node: string; upid: string } {
    // Format: UPID:node:...
    const parts = taskId.split(':');
    if (parts.length < 2) {
      throw new Error('Invalid task ID format');
    }

    return {
      node: parts[1]!,
      upid: taskId
    };
  }

  static async waitForTask(
    checkStatus: (node: string, upid: string) => Promise<{ status: string; exitstatus?: string }>,
    taskId: string,
    options: TaskOptions = {}
  ): Promise<void> {
    const { node, upid } = this.parseTaskId(taskId);

    const result = await TaskExecutor.waitForCondition(async () => {
      const status = await checkStatus(node, upid);

      if (status.status === 'stopped') {
        if (status.exitstatus === 'OK') {
          return true;
        }
        throw new Error(`Task failed: ${status.exitstatus}`);
      }

      return null;
    }, options);

    if (!result) {
      throw new Error('Task did not complete successfully');
    }
  }
}

// Kubernetes-specific task helpers
export class K8sTaskHelper {
  static async waitForPodReady(
    checkPod: (name: string, namespace: string) => Promise<{ ready: boolean; phase: string }>,
    name: string,
    namespace: string,
    options: TaskOptions = {}
  ): Promise<void> {
    await TaskExecutor.waitForCondition(async () => {
      const pod = await checkPod(name, namespace);

      if (pod.phase === 'Failed' || pod.phase === 'Unknown') {
        throw new Error(`Pod entered ${pod.phase} state`);
      }

      return pod.ready ? true : null;
    }, options);
  }

  static async waitForDeploymentReady(
    checkDeployment: (
      name: string,
      namespace: string
    ) => Promise<{ ready: boolean; replicas: number; readyReplicas: number }>,
    name: string,
    namespace: string,
    options: TaskOptions = {}
  ): Promise<void> {
    await TaskExecutor.waitForCondition(async () => {
      const deployment = await checkDeployment(name, namespace);
      return deployment.ready ? true : null;
    }, options);
  }
}
