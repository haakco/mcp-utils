/**
 * Universal error handling utilities for MCP servers
 * Provides consistent error types and handling patterns across all MCP implementations
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Base class for all MCP-related errors
 * Provides consistent error structure and metadata support
 */
export abstract class BaseMCPError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>,
    retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.retryable = retryable;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to MCP tool response format
   */
  toToolResponse(): CallToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Error: ${this.message}${this.code ? ` (${this.code})` : ''}`
        }
      ]
    };
  }

  /**
   * Convert error to JSON for logging/debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
      stack: this.stack
    };
  }

  /**
   * Check if error indicates a temporary failure
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Check if error is a client error (4xx)
   */
  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Check if error is a server error (5xx)
   */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthenticationError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, details, false);
  }
}

export class AuthorizationError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, details, false);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details, false);
  }
}

export class InvalidArgumentError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'INVALID_ARGUMENT', 400, details, false);
  }
}

/**
 * Resource errors
 */
export class ResourceNotFoundError extends BaseMCPError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'RESOURCE_NOT_FOUND', 404, { resource, identifier }, false);
  }
}

export class ResourceConflictError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'RESOURCE_CONFLICT', 409, details, false);
  }
}

export class ResourceQuotaError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'RESOURCE_QUOTA_EXCEEDED', 429, details, true);
  }
}

/**
 * Network/Connection errors
 */
export class ConnectionError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', 503, details, true);
  }
}

export class TimeoutError extends BaseMCPError {
  constructor(operation: string, timeout: number) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT_ERROR',
      408,
      { operation, timeout },
      true
    );
  }
}

export class RateLimitError extends BaseMCPError {
  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter }, true);
  }
}

/**
 * API-specific errors
 */
export class APIError extends BaseMCPError {
  constructor(
    message: string,
    statusCode: number = 500,
    apiResponse?: unknown,
    retryable: boolean = false
  ) {
    super(message, 'API_ERROR', statusCode, { apiResponse }, retryable);
  }
}

export class ServiceUnavailableError extends BaseMCPError {
  constructor(service: string, details?: Record<string, unknown>) {
    super(
      `Service '${service}' is currently unavailable`,
      'SERVICE_UNAVAILABLE',
      503,
      { service, ...details },
      true
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends BaseMCPError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, details, false);
  }
}

export class MissingConfigurationError extends BaseMCPError {
  constructor(configKey: string) {
    super(
      `Required configuration '${configKey}' is missing`,
      'MISSING_CONFIGURATION',
      500,
      { configKey },
      false
    );
  }
}

/**
 * Operation errors
 */
export class OperationError extends BaseMCPError {
  constructor(operation: string, reason: string, details?: Record<string, unknown>) {
    super(
      `Operation '${operation}' failed: ${reason}`,
      'OPERATION_ERROR',
      500,
      { operation, reason, ...details },
      false
    );
  }
}

export class UnsupportedOperationError extends BaseMCPError {
  constructor(operation: string, details?: Record<string, unknown>) {
    super(
      `Operation '${operation}' is not supported`,
      'UNSUPPORTED_OPERATION',
      501,
      { operation, ...details },
      false
    );
  }
}

/**
 * Instance management errors
 */
export class InstanceError extends BaseMCPError {
  constructor(message: string, instanceName?: string, details?: Record<string, unknown>) {
    super(message, 'INSTANCE_ERROR', 500, { instanceName, ...details }, false);
  }
}

export class InstanceNotFoundError extends BaseMCPError {
  constructor(instanceName: string) {
    super(
      `Instance '${instanceName}' not found`,
      'INSTANCE_NOT_FOUND',
      404,
      { instanceName },
      false
    );
  }
}

export class InstanceConnectionError extends BaseMCPError {
  constructor(instanceName: string, details?: Record<string, unknown>) {
    super(
      `Failed to connect to instance '${instanceName}'`,
      'INSTANCE_CONNECTION_ERROR',
      503,
      { instanceName, ...details },
      true
    );
  }
}

/**
 * Error conversion utilities
 */
export class ErrorConverter {
  /**
   * Convert unknown error to BaseMCPError
   */
  static toMCPError(error: unknown): BaseMCPError {
    if (error instanceof BaseMCPError) {
      return error;
    }

    if (error instanceof Error) {
      // Try to determine error type from common error patterns
      const message = error.message.toLowerCase();

      if (message.includes('timeout')) {
        return new TimeoutError('Operation', 30000);
      }

      if (message.includes('not found') || message.includes('404')) {
        return new ResourceNotFoundError('Resource');
      }

      if (message.includes('unauthorized') || message.includes('401')) {
        return new AuthenticationError(error.message);
      }

      if (message.includes('forbidden') || message.includes('403')) {
        return new AuthorizationError(error.message);
      }

      if (message.includes('validation') || message.includes('invalid')) {
        return new ValidationError(error.message);
      }

      if (message.includes('connection') || message.includes('network')) {
        return new ConnectionError(error.message);
      }

      if (message.includes('rate limit') || message.includes('429')) {
        return new RateLimitError(error.message);
      }

      // Generic operation error for other Error instances
      return new OperationError('Unknown', error.message, { originalError: error.name });
    }

    // Handle string errors
    if (typeof error === 'string') {
      return new OperationError('Unknown', error);
    }

    // Handle everything else
    return new OperationError('Unknown', 'An unknown error occurred', { originalError: error });
  }

  /**
   * Convert HTTP status code to appropriate MCP error
   */
  static fromHttpStatus(
    statusCode: number,
    message?: string,
    details?: Record<string, unknown>
  ): BaseMCPError {
    const defaultMessage = message ?? `HTTP ${statusCode} error`;

    switch (statusCode) {
      case 400:
        return new ValidationError(defaultMessage, details);
      case 401:
        return new AuthenticationError(defaultMessage, details);
      case 403:
        return new AuthorizationError(defaultMessage, details);
      case 404:
        return new ResourceNotFoundError('Resource', details?.['identifier'] as string);
      case 408:
        return new TimeoutError('HTTP Request', 30000);
      case 409:
        return new ResourceConflictError(defaultMessage, details);
      case 429:
        return new RateLimitError(defaultMessage, details?.['retryAfter'] as number);
      case 503:
        return new ServiceUnavailableError('API', details);
      default:
        return new APIError(defaultMessage, statusCode, details, statusCode >= 500);
    }
  }

  /**
   * Extract retryable errors from a list of errors
   */
  static getRetryableErrors(errors: BaseMCPError[]): BaseMCPError[] {
    return errors.filter((error) => error.isRetryable());
  }

  /**
   * Group errors by type
   */
  static groupByType(errors: BaseMCPError[]): Record<string, BaseMCPError[]> {
    return errors.reduce(
      (groups, error) => {
        const type = error.constructor.name;
        if (!groups[type]) {
          groups[type] = [];
        }
        groups[type].push(error);
        return groups;
      },
      {} as Record<string, BaseMCPError[]>
    );
  }
}

/**
 * Error handling utilities for retry logic
 */
export class RetryHelper {
  /**
   * Determine if an error should trigger a retry
   */
  static shouldRetry(error: unknown, attemptNumber: number, maxRetries: number): boolean {
    if (attemptNumber >= maxRetries) {
      return false;
    }

    const mcpError = ErrorConverter.toMCPError(error);
    return mcpError.isRetryable();
  }

  /**
   * Calculate exponential backoff delay
   */
  static calculateBackoffDelay(
    attemptNumber: number,
    baseDelay: number = 1000,
    maxDelay: number = 30000,
    jitter: boolean = true
  ): number {
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay);

    if (jitter) {
      // Add up to 10% jitter to prevent thundering herd
      const jitterAmount = exponentialDelay * 0.1;
      return exponentialDelay + Math.random() * jitterAmount;
    }

    return exponentialDelay;
  }

  /**
   * Execute operation with retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    onRetry?: (error: BaseMCPError, attempt: number) => void
  ): Promise<T> {
    let lastError: BaseMCPError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = ErrorConverter.toMCPError(error);

        if (!this.shouldRetry(error, attempt, maxRetries)) {
          throw lastError;
        }

        if (onRetry) {
          onRetry(lastError, attempt + 1);
        }

        if (attempt < maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, baseDelay);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError ?? new OperationError('Unknown', 'Operation failed after retries');
  }
}

/**
 * Type guards for error checking
 */
export function isMCPError(error: unknown): error is BaseMCPError {
  return error instanceof BaseMCPError;
}

export function isRetryableError(error: unknown): boolean {
  return isMCPError(error) && error.isRetryable();
}

export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isResourceNotFoundError(error: unknown): error is ResourceNotFoundError {
  return error instanceof ResourceNotFoundError;
}

export function isConnectionError(error: unknown): error is ConnectionError {
  return error instanceof ConnectionError;
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isInstanceError(error: unknown): error is InstanceError {
  return error instanceof InstanceError;
}

/**
 * Error aggregation for batch operations
 */
export class ErrorAggregator {
  private errors: BaseMCPError[] = [];

  /**
   * Add an error to the collection
   */
  add(error: unknown): void {
    this.errors.push(ErrorConverter.toMCPError(error));
  }

  /**
   * Check if any errors have been collected
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get all collected errors
   */
  getErrors(): BaseMCPError[] {
    return [...this.errors];
  }

  /**
   * Get errors grouped by type
   */
  getGroupedErrors(): Record<string, BaseMCPError[]> {
    return ErrorConverter.groupByType(this.errors);
  }

  /**
   * Get only retryable errors
   */
  getRetryableErrors(): BaseMCPError[] {
    return ErrorConverter.getRetryableErrors(this.errors);
  }

  /**
   * Create a summary error from all collected errors
   */
  createSummaryError(): BaseMCPError | null {
    if (this.errors.length === 0) {
      return null;
    }

    if (this.errors.length === 1) {
      return this.errors[0] ?? null;
    }

    const grouped = this.getGroupedErrors();
    const errorTypes = Object.keys(grouped);
    const totalErrors = this.errors.length;
    const retryableCount = this.getRetryableErrors().length;

    return new OperationError('Batch', `Multiple errors occurred: ${errorTypes.join(', ')}`, {
      totalErrors,
      retryableCount,
      errorsByType: Object.fromEntries(
        Object.entries(grouped).map(([type, errors]) => [type, errors.length])
      )
    });
  }

  /**
   * Clear all collected errors
   */
  clear(): void {
    this.errors = [];
  }
}
