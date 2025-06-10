import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import debug from 'debug';
import { z } from 'zod';
import { BaseMCPError, ErrorConverter, ValidationError } from './errors.js';
import { ResponseBuilder } from './response-builder.js';
import { TaskExecutor } from './task-helpers.js';

export type ToolHandler<T = unknown> = (args: T) => Promise<CallToolResult>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: ToolHandler<unknown>;
}

export interface ToolHandlerConfig {
  /** Debug namespace */
  debugNamespace: string;

  /** Default timeout for operations */
  defaultTimeout?: number;

  /** Default retry configuration */
  defaultRetry?: {
    maxRetries: number;
    baseDelay: number;
  };

  /** Validation settings */
  validation?: {
    strict: boolean;
    allowUndefined: boolean;
  };

  /** Response formatting options */
  response?: {
    includeTimestamp: boolean;
    includeDuration: boolean;
    maxLength: number;
  };
}

export abstract class BaseToolHandler {
  protected readonly debug: debug.Debugger;
  protected readonly config: Required<ToolHandlerConfig>;

  constructor(config: string | ToolHandlerConfig) {
    if (typeof config === 'string') {
      this.config = this.normalizeConfig({ debugNamespace: config });
    } else {
      this.config = this.normalizeConfig(config);
    }

    this.debug = debug(this.config.debugNamespace);
    this.debug('Handler initialized with config:', this.config);
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: ToolHandlerConfig): Required<ToolHandlerConfig> {
    return {
      debugNamespace: config.debugNamespace,
      defaultTimeout: config.defaultTimeout ?? 30000,
      defaultRetry: {
        maxRetries: config.defaultRetry?.maxRetries ?? 3,
        baseDelay: config.defaultRetry?.baseDelay ?? 1000
      },
      validation: {
        strict: config.validation?.strict ?? true,
        allowUndefined: config.validation?.allowUndefined ?? false
      },
      response: {
        includeTimestamp: config.response?.includeTimestamp ?? false,
        includeDuration: config.response?.includeDuration ?? false,
        maxLength: config.response?.maxLength ?? 10000
      }
    };
  }

  protected createTool<T>(
    name: string,
    description: string,
    inputSchema: z.ZodSchema<T>,
    handler: (args: T) => Promise<CallToolResult>
  ): ToolDefinition {
    return {
      name,
      description,
      inputSchema: inputSchema as z.ZodSchema,
      handler: this.wrapHandler(name, inputSchema, handler)
    };
  }

  private wrapHandler<T>(
    toolName: string,
    schema: z.ZodSchema<T>,
    handler: ToolHandler<T>
  ): ToolHandler<unknown> {
    return async (args: unknown): Promise<CallToolResult> => {
      const startTime = Date.now();
      const operationId = `${toolName}-${Date.now()}`;

      try {
        this.debug(`[${operationId}] ${toolName} called with args:`, args);

        // Validate arguments
        const validationResult = schema.safeParse(args);
        if (!validationResult.success) {
          const validationError = new ValidationError(
            `Invalid arguments for ${toolName}: ${this.formatZodError(validationResult.error)}`
          );
          this.debug(`[${operationId}] Validation failed:`, validationError.message);
          return this.formatErrorResponse(validationError, startTime);
        }

        // Execute handler with timeout
        const result = await TaskExecutor.withTimeout(
          handler(validationResult.data),
          this.config.defaultTimeout,
          `Tool '${toolName}' timed out after ${this.config.defaultTimeout}ms`
        );

        const duration = Date.now() - startTime;
        this.debug(`[${operationId}] ${toolName} completed successfully in ${duration}ms`);

        return this.formatSuccessResponse(result, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        const mcpError = ErrorConverter.toMCPError(error);
        this.debug(`[${operationId}] ${toolName} error after ${duration}ms:`, mcpError.message);
        return this.formatErrorResponse(mcpError, startTime);
      }
    };
  }

  /**
   * Format error response with optional metadata
   */
  protected formatErrorResponse(error: BaseMCPError | Error, startTime?: number): CallToolResult {
    if (error instanceof BaseMCPError) {
      return this.enhanceResponse(error.toToolResponse(), startTime);
    }

    const message = error instanceof Error ? error.message : String(error);
    return this.enhanceResponse(ResponseBuilder.error(message), startTime);
  }

  /**
   * Legacy error response for backward compatibility
   */
  protected errorResponse(message: string): CallToolResult {
    return ResponseBuilder.error(message);
  }

  /**
   * Format success response with optional metadata
   */
  protected formatSuccessResponse(result: CallToolResult, duration?: number): CallToolResult {
    return this.enhanceResponse(result, undefined, duration);
  }

  /**
   * Legacy success response for backward compatibility
   */
  protected successResponse(message: string): CallToolResult {
    return ResponseBuilder.success(message);
  }

  protected jsonResponse(data: unknown, message?: string): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (message) {
      content.push({
        type: 'text',
        text: message
      });
    }

    content.push({
      type: 'text',
      text: '```json\n' + JSON.stringify(data, null, 2) + '\n```'
    });

    return { content };
  }

  protected formatZodError(error: z.ZodError): string {
    return error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ');
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.debug(`Retry ${i + 1}/${maxRetries} failed:`, lastError.message);

        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Enhanced response formatting with metadata
   */
  private enhanceResponse(
    response: CallToolResult,
    startTime?: number,
    duration?: number
  ): CallToolResult {
    if (!this.config.response.includeTimestamp && !this.config.response.includeDuration) {
      return response;
    }

    const metadata: string[] = [];

    if (this.config.response.includeTimestamp) {
      metadata.push(`Timestamp: ${new Date().toISOString()}`);
    }

    if (
      this.config.response.includeDuration &&
      (duration !== undefined || startTime !== undefined)
    ) {
      const actualDuration = duration ?? Date.now() - (startTime ?? Date.now());
      metadata.push(`Duration: ${actualDuration}ms`);
    }

    if (metadata.length === 0) {
      return response;
    }

    // Add metadata as a separate content block
    const metadataText = `\n---\n*${metadata.join(' | ')}*`;
    const lastContent = response.content[response.content.length - 1];

    if (lastContent?.type === 'text') {
      lastContent.text += metadataText;
    } else {
      response.content.push({
        type: 'text',
        text: metadataText
      });
    }

    return response;
  }

  /**
   * Get tool handler configuration
   */
  public getConfig(): Readonly<Required<ToolHandlerConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  protected updateConfig(updates: Partial<ToolHandlerConfig>): void {
    Object.assign(this.config, updates);
    this.debug('Configuration updated:', updates);
  }
}
