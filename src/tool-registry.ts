/**
 * Enhanced tool registration and management utilities for MCP servers
 * Provides automatic tool discovery, validation, documentation generation, and unified registration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import debug from 'debug';
import { BaseMCPError, ValidationError, OperationError, ErrorConverter } from './errors.js';
import { BaseToolHandler, type ToolHandler, type ToolDefinition } from './base-handler.js';

export interface ToolMetadata {
  /** Tool name (must be unique) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Category for organization */
  category?: string;

  /** Tags for filtering and search */
  tags?: string[];

  /** Version of the tool */
  version?: string;

  /** Whether this tool is experimental */
  experimental?: boolean;

  /** Whether this tool requires special permissions */
  requiresAuth?: boolean;

  /** Examples of tool usage */
  examples?: ToolExample[];

  /** Related tools */
  relatedTools?: string[];

  /** Deprecation information */
  deprecated?: {
    since: string;
    reason: string;
    replacement?: string;
  };
}

export interface ToolExample {
  /** Description of what this example demonstrates */
  description: string;

  /** Example input parameters */
  input: Record<string, unknown>;

  /** Expected output or description */
  output?: string;

  /** Notes about this example */
  notes?: string;
}

export interface ToolGroup {
  /** Group name */
  name: string;

  /** Group description */
  description: string;

  /** Tools in this group */
  tools: string[];

  /** Group-level configuration */
  config?: Record<string, unknown>;
}

export interface ToolRegistrationOptions {
  /** Override tool name */
  name?: string;

  /** Override description */
  description?: string;

  /** Additional metadata */
  metadata?: Partial<ToolMetadata>;

  /** Validation middleware */
  validate?: (args: unknown) => Promise<unknown>;

  /** Pre-execution middleware */
  beforeExecute?: (args: unknown) => Promise<void>;

  /** Post-execution middleware */
  afterExecute?: (result: CallToolResult, args: unknown) => Promise<CallToolResult>;

  /** Error handling middleware */
  onError?: (error: BaseMCPError, args: unknown) => Promise<CallToolResult>;

  /** Enable/disable this tool */
  enabled?: boolean;
}

export interface RegistryConfig {
  /** Debug namespace */
  debugNamespace?: string;

  /** Auto-discovery patterns */
  autoDiscovery?: {
    enabled: boolean;
    directories?: string[];
    patterns?: string[];
  };

  /** Validation settings */
  validation?: {
    strict: boolean;
    allowUndefined: boolean;
  };

  /** Documentation generation */
  documentation?: {
    enabled: boolean;
    format: 'markdown' | 'json' | 'yaml';
    outputPath?: string;
    includeExamples: boolean;
  };

  /** Feature flags */
  features?: {
    enableGroups: boolean;
    enableVersioning: boolean;
    enableAnalytics: boolean;
  };
}

/**
 * Advanced tool registry for MCP servers
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly groups = new Map<string, ToolGroup>();
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly debug: debug.Debugger;
  private readonly config: Required<RegistryConfig>;
  private server?: Server;

  constructor(config: RegistryConfig = {}) {
    this.config = this.normalizeConfig(config);
    this.debug = debug(this.config.debugNamespace);
    this.debug('Tool registry initialized');
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: RegistryConfig): Required<RegistryConfig> {
    return {
      debugNamespace: config.debugNamespace ?? 'mcp:tool-registry',
      autoDiscovery: {
        enabled: config.autoDiscovery?.enabled ?? false,
        directories: config.autoDiscovery?.directories ?? [],
        patterns: config.autoDiscovery?.patterns ?? ['**/*.tools.js', '**/*.tools.ts']
      },
      validation: {
        strict: config.validation?.strict ?? true,
        allowUndefined: config.validation?.allowUndefined ?? false
      },
      documentation: {
        enabled: config.documentation?.enabled ?? false,
        format: config.documentation?.format ?? 'markdown',
        outputPath: config.documentation?.outputPath,
        includeExamples: config.documentation?.includeExamples ?? true
      },
      features: {
        enableGroups: config.features?.enableGroups ?? true,
        enableVersioning: config.features?.enableVersioning ?? false,
        enableAnalytics: config.features?.enableAnalytics ?? false
      }
    };
  }

  /**
   * Attach registry to MCP server
   */
  public attachToServer(server: Server): void {
    this.server = server;
    this.debug('Attached to MCP server');
  }

  /**
   * Register a tool with the registry
   */
  public registerTool(toolDef: ToolDefinition, options: ToolRegistrationOptions = {}): void {
    const name = options.name ?? toolDef.name;

    if (this.tools.has(name)) {
      throw new ValidationError(`Tool '${name}' is already registered`);
    }

    // Build metadata
    const metadata: ToolMetadata = {
      name,
      description: options.description ?? toolDef.description,
      category: options.metadata?.category,
      tags: options.metadata?.tags ?? [],
      version: options.metadata?.version ?? '1.0.0',
      experimental: options.metadata?.experimental ?? false,
      requiresAuth: options.metadata?.requiresAuth ?? false,
      examples: options.metadata?.examples ?? [],
      relatedTools: options.metadata?.relatedTools ?? [],
      deprecated: options.metadata?.deprecated
    };

    // Create wrapped handler with middleware
    const wrappedHandler = this.createWrappedHandler(toolDef.handler, options);

    // Create registered tool
    const registeredTool: RegisteredTool = {
      definition: toolDef,
      metadata,
      options,
      handler: wrappedHandler,
      registeredAt: new Date(),
      enabled: options.enabled ?? true,
      callCount: 0,
      lastCall: undefined,
      errors: []
    };

    this.tools.set(name, registeredTool);
    this.handlers.set(name, wrappedHandler);

    // Register with MCP server if attached
    if (this.server) {
      // Note: Actual server registration would need to be implemented based on SDK version
      // this.server.tool(name, toolDef.inputSchema, wrappedHandler);
    }

    this.debug('Registered tool: %s', name);
  }

  /**
   * Register multiple tools from a tool handler class
   */
  public registerToolHandler(handler: BaseToolHandler): void {
    // Use reflection to find tool methods
    const prototype = Object.getPrototypeOf(handler);
    const methods = Object.getOwnPropertyNames(prototype);

    for (const method of methods) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (method.startsWith('tool') && typeof (handler as any)[method] === 'function') {
        // Convert method name to tool name (e.g., toolGetUsers -> get_users)
        this.convertMethodNameToToolName(method);

        try {
          // Try to get tool definition from the handler
          const toolDefinition = this.extractToolDefinition(handler, method);
          if (toolDefinition) {
            this.registerTool(toolDefinition);
          } else {
            this.debug('No tool definition found for method: %s', method);
          }
        } catch (error) {
          this.debug(
            'Failed to register tool from method %s: %s',
            method,
            (error as Error).message
          );
        }
      }
    }
  }

  /**
   * Register tools from a directory
   */
  public async registerFromDirectory(
    directory: string,
    pattern = '**/*.tools.{js,ts}'
  ): Promise<void> {
    if (!this.config.autoDiscovery.enabled) {
      throw new OperationError('Auto-discovery', 'Auto-discovery is disabled');
    }

    // Implementation would use glob patterns to find and import tool files
    this.debug('Auto-discovery from directory: %s (pattern: %s)', directory, pattern);
    // TODO: Implement file discovery and dynamic imports
  }

  /**
   * Create a tool group
   */
  public createGroup(group: ToolGroup): void {
    if (!this.config.features.enableGroups) {
      throw new OperationError('Create group', 'Groups feature is disabled');
    }

    if (this.groups.has(group.name)) {
      throw new ValidationError(`Group '${group.name}' already exists`);
    }

    // Validate that all tools in the group exist
    for (const toolName of group.tools) {
      if (!this.tools.has(toolName)) {
        throw new ValidationError(`Tool '${toolName}' in group '${group.name}' does not exist`);
      }
    }

    this.groups.set(group.name, group);
    this.debug('Created group: %s with %d tools', group.name, group.tools.length);
  }

  /**
   * Enable or disable a tool
   */
  public setToolEnabled(name: string, enabled: boolean): void {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ValidationError(`Tool '${name}' not found`);
    }

    tool.enabled = enabled;
    this.debug('Tool %s %s', name, enabled ? 'enabled' : 'disabled');
  }

  /**
   * Get tool by name
   */
  public getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  public getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  public getToolsByCategory(category: string): RegisteredTool[] {
    return this.getAllTools().filter((tool) => tool.metadata.category === category);
  }

  /**
   * Get tools by tag
   */
  public getToolsByTag(tag: string): RegisteredTool[] {
    return this.getAllTools().filter((tool) => tool.metadata.tags?.includes(tag));
  }

  /**
   * Search tools
   */
  public searchTools(query: string): RegisteredTool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTools().filter(
      (tool) =>
        tool.metadata.name.toLowerCase().includes(lowerQuery) ||
        tool.metadata.description.toLowerCase().includes(lowerQuery) ||
        tool.metadata.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Get tool statistics
   */
  public getStatistics(): ToolRegistryStatistics {
    const tools = this.getAllTools();
    const enabled = tools.filter((t) => t.enabled);
    const disabled = tools.filter((t) => !t.enabled);
    const experimental = tools.filter((t) => t.metadata.experimental);
    const deprecated = tools.filter((t) => t.metadata.deprecated);

    const categories = new Set(tools.map((t) => t.metadata.category).filter(Boolean));
    const tags = new Set(tools.flatMap((t) => t.metadata.tags ?? []));

    const totalCalls = tools.reduce((sum, t) => sum + t.callCount, 0);
    const errors = tools.reduce((sum, t) => sum + t.errors.length, 0);

    return {
      totalTools: tools.length,
      enabledTools: enabled.length,
      disabledTools: disabled.length,
      experimentalTools: experimental.length,
      deprecatedTools: deprecated.length,
      categories: categories.size,
      tags: tags.size,
      groups: this.groups.size,
      totalCalls,
      totalErrors: errors,
      averageCallsPerTool: tools.length > 0 ? totalCalls / tools.length : 0
    };
  }

  /**
   * Generate documentation
   */
  public generateDocumentation(): string {
    if (!this.config.documentation.enabled) {
      throw new OperationError('Generate documentation', 'Documentation generation is disabled');
    }

    const tools = this.getAllTools();
    const format = this.config.documentation.format;

    switch (format) {
      case 'markdown':
        return this.generateMarkdownDocs(tools);
      case 'json':
        return JSON.stringify(this.generateJsonDocs(tools), null, 2);
      case 'yaml':
        // Would need yaml dependency
        throw new OperationError('Generate documentation', 'YAML format not implemented');
      default:
        throw new ValidationError(`Unsupported documentation format: ${format}`);
    }
  }

  /**
   * Validate registry state
   */
  public validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for duplicate tool names
    const names = new Set<string>();
    for (const tool of this.tools.values()) {
      if (names.has(tool.metadata.name)) {
        errors.push(`Duplicate tool name: ${tool.metadata.name}`);
      }
      names.add(tool.metadata.name);
    }

    // Check for deprecated tools
    for (const tool of this.tools.values()) {
      if (tool.metadata.deprecated) {
        warnings.push(
          `Tool '${tool.metadata.name}' is deprecated: ${tool.metadata.deprecated.reason}`
        );
      }
    }

    // Check group consistency
    for (const group of this.groups.values()) {
      for (const toolName of group.tools) {
        if (!this.tools.has(toolName)) {
          errors.push(`Group '${group.name}' references non-existent tool: ${toolName}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create wrapped handler with middleware support
   */
  private createWrappedHandler<T>(
    originalHandler: ToolHandler<T>,
    options: ToolRegistrationOptions
  ): ToolHandler<unknown> {
    return async (args: unknown): Promise<CallToolResult> => {
      const toolName = options.name ?? 'unknown';
      const tool = this.tools.get(toolName);

      try {
        // Check if tool is enabled
        if (tool && !tool.enabled) {
          return {
            content: [
              {
                type: 'text',
                text: `Tool '${toolName}' is currently disabled`
              }
            ]
          };
        }

        // Pre-validation
        let validatedArgs = args;
        if (options.validate) {
          validatedArgs = await options.validate(args);
        }

        // Before execute middleware
        if (options.beforeExecute) {
          await options.beforeExecute(validatedArgs);
        }

        // Execute original handler
        let result = await originalHandler(validatedArgs as T);

        // After execute middleware
        if (options.afterExecute) {
          result = await options.afterExecute(result, validatedArgs);
        }

        // Update statistics
        if (tool) {
          tool.callCount++;
          tool.lastCall = new Date();
        }

        return result;
      } catch (error) {
        const mcpError = ErrorConverter.toMCPError(error);

        // Update error statistics
        if (tool) {
          tool.errors.push({
            error: mcpError,
            timestamp: new Date(),
            args
          });
        }

        // Error handling middleware
        if (options.onError) {
          return await options.onError(mcpError, args);
        }

        // Default error handling
        return mcpError.toToolResponse();
      }
    };
  }

  /**
   * Convert method name to tool name
   */
  private convertMethodNameToToolName(methodName: string): string {
    // Remove 'tool' prefix and convert camelCase to snake_case
    const withoutPrefix = methodName.replace(/^tool/, '');
    return withoutPrefix
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * Extract tool definition from handler method
   */
  private extractToolDefinition(_handler: unknown, _methodName: string): ToolDefinition | null {
    // This would use reflection/metadata to extract tool definitions
    // For now, return null as this requires additional metadata support
    return null;
  }

  /**
   * Generate markdown documentation
   */
  private generateMarkdownDocs(tools: RegisteredTool[]): string {
    const lines: string[] = [];

    lines.push('# Tool Documentation\\n');
    lines.push(`Generated on ${new Date().toISOString()}\\n`);

    // Statistics
    const stats = this.getStatistics();
    lines.push('## Statistics\\n');
    lines.push(`- **Total Tools**: ${stats.totalTools}`);
    lines.push(`- **Enabled**: ${stats.enabledTools}`);
    lines.push(`- **Categories**: ${stats.categories}`);
    lines.push(`- **Groups**: ${stats.groups}`);
    lines.push('');

    // Tools by category
    const categories = new Set(tools.map((t) => t.metadata.category).filter(Boolean));
    const uncategorized = tools.filter((t) => !t.metadata.category);

    for (const category of categories) {
      lines.push(`## ${category}\\n`);
      const categoryTools = this.getToolsByCategory(category!);

      for (const tool of categoryTools) {
        lines.push(this.generateToolMarkdown(tool));
      }
    }

    if (uncategorized.length > 0) {
      lines.push('## Uncategorized\\n');
      for (const tool of uncategorized) {
        lines.push(this.generateToolMarkdown(tool));
      }
    }

    return lines.join('\\n');
  }

  /**
   * Generate markdown for a single tool
   */
  private generateToolMarkdown(tool: RegisteredTool): string {
    const lines: string[] = [];

    lines.push(`### ${tool.metadata.name}`);
    lines.push('');
    lines.push(tool.metadata.description);
    lines.push('');

    if (tool.metadata.experimental) {
      lines.push('> **⚠️ Experimental**: This tool is experimental and may change.');
      lines.push('');
    }

    if (tool.metadata.deprecated) {
      lines.push(`> **🚫 Deprecated**: ${tool.metadata.deprecated.reason}`);
      if (tool.metadata.deprecated.replacement) {
        lines.push(`> Use \`${tool.metadata.deprecated.replacement}\` instead.`);
      }
      lines.push('');
    }

    if (tool.metadata.tags && tool.metadata.tags.length > 0) {
      lines.push(`**Tags**: ${tool.metadata.tags.map((tag) => `\`${tag}\``).join(', ')}`);
      lines.push('');
    }

    // Examples
    if (this.config.documentation.includeExamples && tool.metadata.examples) {
      for (const example of tool.metadata.examples) {
        lines.push(`**Example**: ${example.description}`);
        lines.push('```json');
        lines.push(JSON.stringify(example.input, null, 2));
        lines.push('```');
        if (example.notes) {
          lines.push(`*${example.notes}*`);
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');

    return lines.join('\\n');
  }

  /**
   * Generate JSON documentation
   */
  private generateJsonDocs(tools: RegisteredTool[]): Record<string, unknown> {
    return {
      metadata: {
        generated: new Date().toISOString(),
        version: '1.0.0',
        statistics: this.getStatistics()
      },
      tools: tools.map((tool) => ({
        name: tool.metadata.name,
        description: tool.metadata.description,
        category: tool.metadata.category,
        tags: tool.metadata.tags,
        version: tool.metadata.version,
        experimental: tool.metadata.experimental,
        deprecated: tool.metadata.deprecated,
        enabled: tool.enabled,
        schema: tool.definition.inputSchema,
        examples: tool.metadata.examples,
        statistics: {
          callCount: tool.callCount,
          lastCall: tool.lastCall,
          errorCount: tool.errors.length
        }
      })),
      groups: Array.from(this.groups.values())
    };
  }
}

/**
 * Registered tool with metadata and runtime information
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  metadata: ToolMetadata;
  options: ToolRegistrationOptions;
  handler: ToolHandler;
  registeredAt: Date;
  enabled: boolean;
  callCount: number;
  lastCall?: Date;
  errors: ToolError[];
}

export interface ToolError {
  error: BaseMCPError;
  timestamp: Date;
  args: unknown;
}

export interface ToolRegistryStatistics {
  totalTools: number;
  enabledTools: number;
  disabledTools: number;
  experimentalTools: number;
  deprecatedTools: number;
  categories: number;
  tags: number;
  groups: number;
  totalCalls: number;
  totalErrors: number;
  averageCallsPerTool: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Decorator for tool registration (for future TypeScript decorator support)
 */
export function tool(metadata: Partial<ToolMetadata>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // Store metadata for later registration
    if (!target.constructor.prototype._toolMetadata) {
      target.constructor.prototype._toolMetadata = new Map();
    }
    target.constructor.prototype._toolMetadata.set(propertyKey, metadata);
    return descriptor;
  };
}

/**
 * Helper function to create a tool registry with common configuration
 */
export function createToolRegistry(config: Partial<RegistryConfig> = {}): ToolRegistry {
  return new ToolRegistry({
    validation: { strict: true, allowUndefined: false },
    documentation: { enabled: true, format: 'markdown', includeExamples: true },
    features: { enableGroups: true, enableVersioning: false, enableAnalytics: false },
    ...config
  });
}
