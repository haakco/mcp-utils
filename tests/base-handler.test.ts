import { BaseToolHandler } from '../src/base-handler.js';
import { z } from 'zod';

class TestHandler extends BaseToolHandler {
  constructor() {
    super('test:handler');
  }

  createTestTool() {
    return this.createTool(
      'test_tool',
      'Test tool',
      z.object({
        value: z.string(),
        optional: z.number().optional()
      }),
      async (args) => {
        if (args.value === 'error') {
          throw new Error('Test error');
        }
        return this.successResponse(`Value: ${args.value}`);
      }
    );
  }

  async testRetry() {
    let attempts = 0;
    return this.withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry test');
        }
        return 'Success';
      },
      3,
      10
    );
  }
}

describe('BaseToolHandler', () => {
  let handler: TestHandler;

  beforeEach(() => {
    handler = new TestHandler();
  });

  describe('createTool', () => {
    it('should create a tool with proper structure', () => {
      const tool = handler.createTestTool();
      
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('Test tool');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.handler).toBeDefined();
    });

    it('should validate arguments', async () => {
      const tool = handler.createTestTool();
      const result = await tool.handler({ invalid: 'field' });
      
      expect(result.content[0]?.text).toContain('Error: Invalid arguments');
    });

    it('should handle valid arguments', async () => {
      const tool = handler.createTestTool();
      const result = await tool.handler({ value: 'test' });
      
      expect(result.content[0]?.text).toBe('Value: test');
    });

    it('should catch and format errors', async () => {
      const tool = handler.createTestTool();
      const result = await tool.handler({ value: 'error' });
      
      // The enhanced handler converts errors to MCP errors with more details
      expect(result.content[0]?.text).toContain('Test error');
      expect(result.content[0]?.text).toContain('❌ Error:');
    });
  });

  describe('response methods', () => {
    it('should format error response', () => {
      const result = handler['errorResponse']('Test error');
      expect(result.content[0]?.text).toBe('Error: Test error');
    });

    it('should format success response', () => {
      const result = handler['successResponse']('Success!');
      expect(result.content[0]?.text).toBe('Success!');
    });

    it('should format JSON response', () => {
      const result = handler['jsonResponse']({ key: 'value' }, 'Test data');
      
      expect(result.content[0]?.text).toBe('Test data');
      expect(result.content[1]?.text).toContain('```json');
      expect(result.content[1]?.text).toContain('"key": "value"');
    });
  });

  describe('formatZodError', () => {
    it('should format Zod validation errors', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });
      
      const result = schema.safeParse({ name: 123, age: 'invalid' });
      if (!result.success) {
        const formatted = handler['formatZodError'](result.error);
        expect(formatted).toContain('name:');
        expect(formatted).toContain('age:');
      }
    });
  });

  describe('withRetry', () => {
    it('should retry on failure', async () => {
      const result = await handler.testRetry();
      expect(result).toBe('Success');
    });

    it('should throw after max retries', async () => {
      await expect(
        handler['withRetry'](
          async () => { throw new Error('Always fails'); },
          2,
          10
        )
      ).rejects.toThrow('Always fails');
    });
  });
});