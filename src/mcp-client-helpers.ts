// path: mcp-servers/mcp-utils/src/mcp-client-helpers.ts

import { ResponseBuilder } from './response-builder.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Client experience enhancement utilities
// These help create consistent, user-friendly responses across all MCP servers

/**
 * Create a resilient operation wrapper that handles common client issues
 * Provides consistent error handling, retry logic, and progress feedback
 */
export interface OperationOptions {
  // Progress reporting
  showProgress?: boolean;
  progressTitle?: string;

  // Error handling
  retryAttempts?: number;
  gracefulFailure?: boolean;

  // User feedback
  successMessage?: string;
  includeMetadata?: boolean;
}

/**
 * Result type that provides structured data for client tools
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    operation: string;
    timestamp: string;
    duration?: number;
    retryCount?: number;
  };
}

/**
 * Wrap any operation with client-friendly error handling and feedback
 */
export async function withClientProtection<T>(
  operation: () => Promise<T>,
  options: OperationOptions & { operationName: string }
): Promise<CallToolResult> {
  const startTime = Date.now();
  let retryCount = 0;
  let lastError: Error | undefined;

  // Show initial progress if requested
  if (options.showProgress) {
    ResponseBuilder.progress(0, options.progressTitle || `Starting ${options.operationName}...`);
    // In a real implementation, this would be sent as an intermediate response
  }

  // Retry loop
  const maxRetries = options.retryAttempts || 0;
  while (retryCount <= maxRetries) {
    try {
      // Show progress for retries
      if (options.showProgress && retryCount > 0) {
        ResponseBuilder.progress(
          50,
          `${options.progressTitle || options.operationName} (attempt ${retryCount + 1}/${maxRetries + 1})...`
        );
      }

      // Execute the operation
      const result = await operation();
      const duration = Date.now() - startTime;

      // Success - format response
      const operationResult: OperationResult<T> = {
        success: true,
        data: result,
        ...(options.includeMetadata && {
          metadata: {
            operation: options.operationName,
            timestamp: new Date().toISOString(),
            duration,
            ...(retryCount > 0 && { retryCount })
          }
        })
      };

      // Create success response
      if (options.successMessage) {
        return ResponseBuilder.multipart([
          {
            type: 'text',
            data: options.successMessage
          },
          {
            type: 'json',
            data: operationResult,
            title: 'Operation Details:'
          }
        ]);
      }

      return ResponseBuilder.json(operationResult);
    } catch (error) {
      lastError = error as Error;
      retryCount++;

      // If this was the last attempt or graceful failure is disabled
      if (retryCount > maxRetries || !options.gracefulFailure) {
        break;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Operation failed - create error response
  const duration = Date.now() - startTime;
  const operationResult: OperationResult = {
    success: false,
    error: lastError?.message || 'Unknown error',
    ...(options.includeMetadata && {
      metadata: {
        operation: options.operationName,
        timestamp: new Date().toISOString(),
        duration,
        retryCount: retryCount - 1
      }
    })
  };

  return ResponseBuilder.multipart([
    {
      type: 'text',
      data: `❌ ${options.operationName} failed: ${lastError?.message || 'Unknown error'}`
    },
    ...(options.includeMetadata
      ? [
          {
            type: 'json' as const,
            data: operationResult.metadata,
            title: 'Error Details:'
          }
        ]
      : [])
  ]);
}

/**
 * Batch operation helper for processing multiple items with client feedback
 */
export async function processBatch<TInput, TOutput>(
  items: TInput[],
  processor: (item: TInput, index: number) => Promise<TOutput>,
  options: {
    batchName: string;
    showProgress?: boolean;
    continueOnError?: boolean;
    maxConcurrency?: number;
  }
): Promise<CallToolResult> {
  const startTime = Date.now();
  const results: Array<{ success: boolean; data?: TOutput; error?: string; index: number }> = [];

  // Process items with concurrency control
  const maxConcurrency = options.maxConcurrency || 5;
  const semaphore = new Array(maxConcurrency).fill(null);

  let completed = 0;
  const totalItems = items.length;

  // Process function with progress tracking
  const processWithProgress = async (item: TInput, index: number): Promise<void> => {
    try {
      const result = await processor(item, index);
      results[index] = { success: true, data: result, index };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results[index] = { success: false, error: errorMessage, index };

      if (!options.continueOnError) {
        throw error;
      }
    } finally {
      completed++;

      // Show progress
      if (options.showProgress) {
        const percentage = Math.round((completed / totalItems) * 100);
        ResponseBuilder.progress(percentage, `Processing ${options.batchName}`, {
          completed,
          total: totalItems
        });
      }
    }
  };

  try {
    // Process all items with concurrency control
    await Promise.all(
      items.map(async (item, index) => {
        // Wait for available slot
        await Promise.race(semaphore);
        return processWithProgress(item, index);
      })
    );

    // Calculate statistics
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const errors = results.filter((r) => !r.success).map((r) => r.error || 'Unknown error');

    const duration = Date.now() - startTime;

    // Create comprehensive result
    const batchResult = {
      success: failed === 0,
      summary: {
        total: totalItems,
        succeeded,
        failed,
        successRate: `${((succeeded / totalItems) * 100).toFixed(1)}%`,
        duration: `${duration}ms`
      },
      results: results.map((r) => ({
        index: r.index,
        success: r.success,
        ...(r.error && { error: r.error })
      })),
      ...(errors.length > 0 && { errors })
    };

    return ResponseBuilder.multipart([
      {
        type: 'text',
        data: `📊 Batch ${options.batchName} completed: ${succeeded}/${totalItems} succeeded`
      },
      {
        type: 'json',
        data: batchResult,
        title: 'Batch Results:'
      }
    ]);
  } catch (error) {
    // Batch failed completely
    return ResponseBuilder.error(
      `Batch ${options.batchName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { completed, total: totalItems }
    );
  }
}

/**
 * ID resolution helper that works transparently with names or UUIDs
 */
export interface IdResolver<T> {
  findById: (id: string) => Promise<T | undefined>;
  findByName: (name: string) => Promise<T | undefined>;
  getIdentifier: (item: T) => string;
  getName: (item: T) => string;
}

export async function resolveIdentifier<T>(
  identifier: string,
  resolver: IdResolver<T>,
  itemType: string
): Promise<{ success: true; item: T } | { success: false; error: string }> {
  // Try by ID first (more reliable)
  const byId = await resolver.findById(identifier);
  if (byId) {
    return { success: true, item: byId };
  }

  // Try by name
  const byName = await resolver.findByName(identifier);
  if (byName) {
    return { success: true, item: byName };
  }

  // Not found
  return {
    success: false,
    error: `${itemType} with identifier '${identifier}' not found. Please check the ${itemType} name or ID.`
  };
}

/**
 * Helper for creating consistent list responses with metadata
 */
export function createListResponse<T>(
  items: T[],
  formatter: (item: T) => string,
  options: {
    title?: string;
    includeCount?: boolean;
    includeStats?: boolean;
    groupBy?: (item: T) => string;
    sortBy?: (a: T, b: T) => number;
  } = {}
): CallToolResult {
  const processedItems = [...items];

  // Apply sorting if provided
  if (options.sortBy) {
    processedItems.sort(options.sortBy);
  }

  // Group items if requested
  if (options.groupBy) {
    const grouped = processedItems.reduce(
      (groups, item) => {
        const key = options.groupBy!(item);
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return groups;
      },
      {} as Record<string, T[]>
    );

    const groupedList = Object.entries(grouped).map(([groupName, groupItems]) => ({
      label: `📁 ${groupName} (${groupItems.length})`,
      nested: groupItems.map((item) => ({ label: formatter(item) }))
    }));

    return ResponseBuilder.list(
      groupedList,
      options.title || `Items (${items.length} total)`,
      false
    );
  }

  // Simple list
  const listItems = processedItems.map((item) => ({ label: formatter(item) }));

  const title = options.title || (options.includeCount ? `Items (${items.length} found)` : 'Items');

  return ResponseBuilder.list(listItems, title);
}

/**
 * Validation helper that provides user-friendly error messages
 */
export function validateInput<T>(
  input: unknown,
  schema: { parse: (input: unknown) => T },
  fieldName = 'input'
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    // Extract user-friendly error message
    let errorMessage = `Invalid ${fieldName}`;

    if (error && typeof error === 'object' && 'issues' in error) {
      const issues = (error as any).issues;
      if (Array.isArray(issues) && issues.length > 0) {
        errorMessage = issues
          .map((issue: any) => `${issue.path?.join('.') || fieldName}: ${issue.message}`)
          .join('; ');
      }
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Cache helper for expensive operations
 */
export class OperationCache<T> {
  private cache = new Map<string, { data: T; timestamp: number; ttl: number }>();

  constructor(private defaultTTL = 300000) {} // 5 minutes default

  async get<TArgs extends any[]>(
    key: string,
    operation: (...args: TArgs) => Promise<T>,
    args: TArgs,
    ttl = this.defaultTTL
  ): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    // Check if cached value is still valid
    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // Execute operation and cache result
    const result = await operation(...args);
    this.cache.set(key, { data: result, timestamp: now, ttl });

    return result;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const ClientHelpers = {
  withClientProtection,
  processBatch,
  resolveIdentifier,
  createListResponse,
  validateInput,
  OperationCache
};
