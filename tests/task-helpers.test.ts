import { TaskExecutor, ProxmoxTaskHelper } from '../src/task-helpers.js';

describe('TaskExecutor', () => {
  describe('sleep', () => {
    it('should delay for specified time', async () => {
      const start = Date.now();
      await TaskExecutor.sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('withTimeout', () => {
    it('should resolve when promise completes in time', async () => {
      const result = await TaskExecutor.withTimeout(
        Promise.resolve('success'),
        100
      );
      expect(result).toBe('success');
    });

    it('should reject when timeout exceeded', async () => {
      await expect(
        TaskExecutor.withTimeout(
          TaskExecutor.sleep(200),
          50,
          'Custom timeout message'
        )
      ).rejects.toThrow('Custom timeout message');
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first try', async () => {
      const result = await TaskExecutor.executeWithRetry(
        async () => 'success'
      );
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const result = await TaskExecutor.executeWithRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Retry test');
          }
          return 'success';
        },
        { maxRetries: 3 }
      );
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const result = await TaskExecutor.executeWithRetry(
        async () => { throw new Error('Always fails'); },
        { maxRetries: 2 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Always fails');
    });
  });

  describe('waitForCondition', () => {
    it('should return when condition is met', async () => {
      let calls = 0;
      const result = await TaskExecutor.waitForCondition(
        async () => {
          calls++;
          return calls >= 3 ? 'done' : null;
        },
        { pollInterval: 10, timeout: 1000 }
      );
      
      expect(result).toBe('done');
      expect(calls).toBe(3);
    });

    it('should timeout when condition not met', async () => {
      await expect(
        TaskExecutor.waitForCondition(
          async () => null,
          { timeout: 50, pollInterval: 10 }
        )
      ).rejects.toThrow('Timeout');
    });
  });

  describe('runParallel', () => {
    it('should run tasks concurrently', async () => {
      const tasks = Array(5).fill(null).map((_, i) => 
        () => Promise.resolve(i)
      );
      
      const results = await TaskExecutor.runParallel(tasks, { concurrency: 2 });
      
      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
      expect(results.map(r => r.data)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('batch', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batches: number[][] = [];
      
      const results = await TaskExecutor.batch(
        items,
        async (batch) => {
          batches.push(batch);
          return batch.map(n => n * 2);
        },
        3
      );
      
      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
    });
  });
});

describe('ProxmoxTaskHelper', () => {
  describe('parseTaskId', () => {
    it('should parse valid task ID', () => {
      const result = ProxmoxTaskHelper.parseTaskId('UPID:node1:1234:5678:task');
      expect(result.node).toBe('node1');
      expect(result.upid).toBe('UPID:node1:1234:5678:task');
    });

    it('should throw on invalid format', () => {
      expect(() => ProxmoxTaskHelper.parseTaskId('invalid'))
        .toThrow('Invalid task ID format');
    });
  });
});