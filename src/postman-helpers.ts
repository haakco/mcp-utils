// path: mcp-servers/mcp-utils/src/postman-helpers.ts

import { z } from 'zod';
import { nonEmptyString, uuid } from './validators.js';

// Postman-specific validators for consistent validation across tools
export const postmanValidators = {
  // Collection and folder identifiers - accept both UUID and names
  identifier: z.string().min(1).describe('UUID or name identifier'),

  // Postman collection ID format (UUID)
  collectionId: uuid.describe('Postman collection UUID'),

  // Postman environment ID format (UUID)
  environmentId: uuid.describe('Postman environment UUID'),

  // Folder name validation - no special characters that break API
  folderName: z
    .string()
    .min(1, 'Folder name cannot be empty')
    .max(100, 'Folder name too long')
    .regex(/^[^/\\<>:"|?*]+$/, 'Folder name contains invalid characters'),

  // Request name validation
  requestName: z.string().min(1, 'Request name cannot be empty').max(200, 'Request name too long'),

  // HTTP method validation
  httpMethod: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'])
    .describe('HTTP method'),

  // URL validation for requests
  requestUrl: z
    .string()
    .min(1, 'URL cannot be empty')
    .refine((url) => {
      // Allow Postman variables like {{baseUrl}}
      if (url.includes('{{') && url.includes('}}')) return true;
      // Allow relative URLs starting with /
      if (url.startsWith('/')) return true;
      // Validate full URLs
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid URL format'),

  // Script content validation
  scriptContent: z
    .string()
    .min(1, 'Script content cannot be empty')
    .max(10000, 'Script content too long'),

  // Variable key validation
  variableKey: z
    .string()
    .min(1, 'Variable key cannot be empty')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Variable key must be alphanumeric with underscores'),

  // Auth type validation
  authType: z
    .enum([
      'noauth',
      'apikey',
      'bearer',
      'basic',
      'digest',
      'oauth1',
      'oauth2',
      'awsv4',
      'ntlm',
      'hawk'
    ])
    .describe('Authentication type'),

  // Bulk operation limit
  bulkLimit: z.number().int().min(1).max(100).describe('Bulk operation limit (1-100)')
};

// Postman-specific formatters
export const postmanFormatters = {
  /**
   * Format a Postman identifier with metadata
   */
  formatIdentifier: (id: string, name?: string, type = 'item'): string => {
    if (name && name !== id) {
      return `${name} (${type}: ${id})`;
    }
    return `${type}: ${id}`;
  },

  /**
   * Format folder hierarchy path
   */
  formatFolderPath: (path: string): string => {
    return path
      .split('/')
      .map((segment) => `📁 ${segment}`)
      .join(' / ');
  },

  /**
   * Format request method with emoji
   */
  formatHttpMethod: (method: string): string => {
    const methodEmojis: Record<string, string> = {
      GET: '🔍',
      POST: '➕',
      PUT: '🔄',
      PATCH: '✏️',
      DELETE: '🗑️',
      HEAD: '👤',
      OPTIONS: '⚙️'
    };

    const emoji = methodEmojis[method.toUpperCase()] || '📡';
    return `${emoji} ${method}`;
  },

  /**
   * Format authentication type with emoji
   */
  formatAuthType: (authType: string): string => {
    const authEmojis: Record<string, string> = {
      noauth: '🔓',
      bearer: '🎫',
      basic: '🔐',
      apikey: '🗝️',
      oauth2: '🛡️',
      oauth1: '🔒'
    };

    const emoji = authEmojis[authType.toLowerCase()] || '🔑';
    return `${emoji} ${authType}`;
  },

  /**
   * Format variable with type indication
   */
  formatVariable: (key: string, value: string, isSecret = false): string => {
    const icon = isSecret ? '🔐' : '📝';
    const displayValue = isSecret ? '[HIDDEN]' : value;
    return `${icon} ${key}: ${displayValue}`;
  },

  /**
   * Format request summary
   */
  formatRequestSummary: (name: string, method: string, url: string): string => {
    const methodFormatted = postmanFormatters.formatHttpMethod(method);
    return `${methodFormatted} ${name} → ${url}`;
  },

  /**
   * Format collection statistics
   */
  formatCollectionStats: (stats: {
    totalRequests: number;
    totalFolders: number;
    maxDepth: number;
  }): string => {
    return [
      `📊 Collection Statistics:`,
      `  📁 Folders: ${stats.totalFolders}`,
      `  📡 Requests: ${stats.totalRequests}`,
      `  📏 Max Depth: ${stats.maxDepth} levels`
    ].join('\n');
  }
};

// Common response patterns for Postman operations
export const postmanResponsePatterns = {
  /**
   * Create success response with ID
   */
  createSuccess: (
    itemType: string,
    name: string,
    id: string
  ): {
    success: true;
    message: string;
    data: { id: string; name: string; type: string };
  } => ({
    success: true,
    message: `${itemType} '${name}' created successfully`,
    data: { id, name, type: itemType.toLowerCase() }
  }),

  /**
   * Update success response
   */
  updateSuccess: (
    itemType: string,
    name: string,
    id: string
  ): {
    success: true;
    message: string;
    data: { id: string; name: string; type: string };
  } => ({
    success: true,
    message: `${itemType} '${name}' updated successfully`,
    data: { id, name, type: itemType.toLowerCase() }
  }),

  /**
   * Delete success response
   */
  deleteSuccess: (
    itemType: string,
    name: string
  ): {
    success: true;
    message: string;
  } => ({
    success: true,
    message: `${itemType} '${name}' deleted successfully`
  }),

  /**
   * Bulk operation summary
   */
  bulkOperationSummary: (
    operation: string,
    succeeded: number,
    failed: number,
    errors: string[] = []
  ): {
    success: boolean;
    message: string;
    summary: {
      succeeded: number;
      failed: number;
      total: number;
      successRate: string;
    };
    errors?: string[];
  } => ({
    success: failed === 0,
    message: `Bulk ${operation} completed: ${succeeded} succeeded, ${failed} failed`,
    summary: {
      succeeded,
      failed,
      total: succeeded + failed,
      successRate: `${((succeeded / (succeeded + failed)) * 100).toFixed(1)}%`
    },
    ...(errors.length > 0 && { errors })
  })
};

// Postman-specific error types
export const postmanErrorTypes = {
  IDENTIFIER_NOT_FOUND: 'IDENTIFIER_NOT_FOUND',
  INVALID_COLLECTION_STRUCTURE: 'INVALID_COLLECTION_STRUCTURE',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  SCRIPT_SYNTAX_ERROR: 'SCRIPT_SYNTAX_ERROR',
  AUTH_CONFIG_INVALID: 'AUTH_CONFIG_INVALID',
  BULK_OPERATION_FAILED: 'BULK_OPERATION_FAILED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
} as const;

// Common Postman operation schemas
export const postmanSchemas = {
  // Basic CRUD operations
  createFolder: z.object({
    collection_id: postmanValidators.collectionId,
    name: postmanValidators.folderName,
    description: z.string().optional(),
    parent_folder_id: postmanValidators.identifier.optional()
  }),

  createRequest: z.object({
    collection_id: postmanValidators.collectionId,
    folder_id: postmanValidators.identifier.optional(),
    name: postmanValidators.requestName,
    method: postmanValidators.httpMethod,
    url: postmanValidators.requestUrl,
    description: z.string().optional()
  }),

  addScript: z.object({
    collection_id: postmanValidators.collectionId,
    request_id: postmanValidators.identifier,
    script_type: z.enum(['test', 'prerequest']),
    script: postmanValidators.scriptContent
  }),

  setVariable: z.object({
    collection_id: postmanValidators.collectionId,
    key: postmanValidators.variableKey,
    value: z.string(),
    description: z.string().optional(),
    scope: z.enum(['collection', 'environment']).default('collection')
  }),

  // Bulk operations
  bulkCreateRequests: z.object({
    collection_id: postmanValidators.collectionId,
    requests: z
      .array(
        z.object({
          folder_id: postmanValidators.identifier.optional(),
          name: postmanValidators.requestName,
          method: postmanValidators.httpMethod,
          url: postmanValidators.requestUrl,
          description: z.string().optional()
        })
      )
      .max(100, 'Maximum 100 requests per bulk operation')
  }),

  // Search and filter
  searchRequests: z.object({
    collection_id: postmanValidators.collectionId,
    query: nonEmptyString.describe('Search query'),
    method: postmanValidators.httpMethod.optional(),
    folder_id: postmanValidators.identifier.optional(),
    limit: z.number().int().min(1).max(100).default(20)
  })
};

// Helper functions for common Postman operations
export const postmanHelpers = {
  /**
   * Extract ID from identifier (handles both UUIDs and names)
   */
  extractId: (identifier: string, lookup: Map<string, { id: string }>): string | undefined => {
    // First check if it's already an ID in the lookup
    if (lookup.has(identifier)) {
      return lookup.get(identifier)?.id;
    }

    // Check if it looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(identifier)) {
      return identifier;
    }

    return undefined;
  },

  /**
   * Validate script syntax (basic JavaScript validation)
   */
  validateScript: (script: string): { valid: boolean; error?: string } => {
    try {
      // Basic syntax check using Function constructor
      new Function(script);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Script syntax error'
      };
    }
  },

  /**
   * Generate deterministic ID for new items
   */
  generateId: (type: 'folder' | 'request', name: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const nameHash = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substr(0, 8);
    return `${type}_${nameHash}_${timestamp}_${random}`;
  },

  /**
   * Normalize folder path (remove extra slashes, etc.)
   */
  normalizePath: (path: string): string => {
    return path.split('/').filter(Boolean).join('/');
  },

  /**
   * Check if URL contains Postman variables
   */
  containsVariables: (url: string): boolean => {
    return /\{\{[^}]+\}\}/.test(url);
  },

  /**
   * Extract variable names from text
   */
  extractVariables: (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];

    return matches.map((match) => match.slice(2, -2).trim());
  }
};

// Export consolidated object for easy importing
export const PostmanUtils = {
  validators: postmanValidators,
  formatters: postmanFormatters,
  responsePatterns: postmanResponsePatterns,
  errorTypes: postmanErrorTypes,
  schemas: postmanSchemas,
  helpers: postmanHelpers
};
