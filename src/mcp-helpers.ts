/**
 * MCP-specific helper utilities
 */

import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create a standard MCP text response
 */
export function createTextResponse(text: string): CallToolResult {
  return {
    content: [
      {
        type: 'text' as const,
        text
      }
    ]
  };
}

/**
 * Create an MCP error response
 */
export function createErrorResponse(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${message}`
      }
    ]
  };
}

/**
 * Create a formatted success response
 */
export function createSuccessResponse(message: string): CallToolResult {
  return createTextResponse(`✅ ${message}`);
}

/**
 * Create a formatted warning response
 */
export function createWarningResponse(message: string): CallToolResult {
  return createTextResponse(`⚠️ Warning: ${message}`);
}

/**
 * Create a formatted info response
 */
export function createInfoResponse(message: string): CallToolResult {
  return createTextResponse(`ℹ️ ${message}`);
}

/**
 * Create a multi-part response
 */
export function createMultipartResponse(parts: string[]): CallToolResult {
  return {
    content: parts.map((text) => ({
      type: 'text' as const,
      text
    }))
  };
}

/**
 * Helper to validate MCP tool arguments
 */
export function validateToolArgs<T>(
  args: unknown,
  validator: (data: unknown) => T,
  toolName: string
): T {
  if (!args || typeof args !== 'object') {
    throw new Error(`Invalid arguments for ${toolName}: expected object, got ${typeof args}`);
  }

  try {
    return validator(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed';
    throw new Error(`Invalid arguments for ${toolName}: ${message}`);
  }
}

/**
 * Helper to validate required arguments are present
 */
export function validateRequiredArgs(
  args: unknown,
  requiredFields: string[],
  context?: string
): Record<string, unknown> {
  if (!args || typeof args !== 'object') {
    throw new Error(`${context ? `${context}: ` : ''}Arguments object is required`);
  }

  const argsObj = args as Record<string, unknown>;
  const missing = requiredFields.filter(
    (field) => !(field in argsObj) || argsObj[field] === undefined || argsObj[field] === null
  );

  if (missing.length > 0) {
    throw new Error(
      `${context ? `${context}: ` : ''}Missing required fields: ${missing.join(', ')}`
    );
  }

  return argsObj;
}

/**
 * Create a batch response helper
 */
export class BatchResponseBuilder {
  private parts: string[] = [];

  add(text: string): this {
    this.parts.push(text);
    return this;
  }

  addSuccess(message: string): this {
    this.parts.push(`✅ ${message}`);
    return this;
  }

  addError(message: string): this {
    this.parts.push(`❌ Error: ${message}`);
    return this;
  }

  addWarning(message: string): this {
    this.parts.push(`⚠️ Warning: ${message}`);
    return this;
  }

  addInfo(message: string): this {
    this.parts.push(`ℹ️ ${message}`);
    return this;
  }

  addSeparator(): this {
    this.parts.push('---');
    return this;
  }

  addEmptyLine(): this {
    this.parts.push('');
    return this;
  }

  build(): CallToolResult {
    return createMultipartResponse(this.parts);
  }
}

/**
 * Parse MCP tool arguments with defaults
 */
export function parseToolArgs<T extends Record<string, unknown>>(
  args: unknown,
  defaults: Partial<T>
): T {
  if (!args || typeof args !== 'object') {
    return { ...defaults } as T;
  }

  return { ...defaults, ...args } as T;
}

/**
 * Extract pagination parameters from arguments
 */
export interface PaginationParams {
  page: number;
  perPage: number;
  offset: number;
  limit: number;
}

export function extractPagination(
  args: Record<string, unknown>,
  defaults = { page: 1, perPage: 20 }
): PaginationParams {
  const page = Number(args['page'] ?? defaults.page);
  const perPage = Number(args['perPage'] ?? args['limit'] ?? defaults.perPage);

  if (isNaN(page) || page < 1) {
    throw new Error('Page must be a positive number');
  }

  if (isNaN(perPage) || perPage < 1 || perPage > 100) {
    throw new Error('Per page must be between 1 and 100');
  }

  const offset = (page - 1) * perPage;

  return { page, perPage, offset, limit: perPage };
}

/**
 * Format pagination info for response
 */
export function formatPaginationInfo(total: number, page: number, perPage: number): string {
  const totalPages = Math.ceil(total / perPage);
  const startItem = (page - 1) * perPage + 1;
  const endItem = Math.min(page * perPage, total);

  return `Showing ${startItem}-${endItem} of ${total} (Page ${page}/${totalPages})`;
}

/**
 * Safe JSON stringify for MCP responses
 */
export function safeStringify(data: unknown, indent = 2): string {
  try {
    return JSON.stringify(data, null, indent);
  } catch {
    // Handle circular references
    const seen = new WeakSet();
    return JSON.stringify(
      data,
      (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      },
      indent
    );
  }
}

/**
 * Create a progress response
 */
export function createProgressResponse(
  current: number,
  total: number,
  message: string
): CallToolResult {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.floor(percentage / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return createTextResponse(`${message}\n[${bar}] ${percentage}% (${current}/${total})`);
}

/**
 * Handle async tool execution with error handling
 */
export async function executeToolSafely<T>(
  fn: () => Promise<T>,
  toolName: string
): Promise<CallToolResult> {
  try {
    const result = await fn();

    // If result is already a CallToolResult, return it
    if (result && typeof result === 'object' && 'content' in result) {
      return result as CallToolResult;
    }

    // Otherwise, convert to text response
    if (typeof result === 'string') {
      return createTextResponse(result);
    }

    return createTextResponse(safeStringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`${toolName} failed: ${message}`);
  }
}
