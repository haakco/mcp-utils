/**
 * Configuration management utilities for MCP servers
 * Provides environment-based configuration with validation and type safety
 */

import { z } from 'zod';
import debug from 'debug';
import { ValidationError, ConfigurationError, MissingConfigurationError } from './errors.js';

export interface ConfigSchema {
  [key: string]: {
    schema: z.ZodSchema;
    required: boolean;
    description: string;
    default?: unknown;
    sensitive?: boolean;
  };
}

export interface ConfigManagerOptions {
  /** Debug namespace */
  debugNamespace?: string;

  /** Environment prefix for variables */
  envPrefix?: string;

  /** Whether to throw on missing required config */
  strict?: boolean;

  /** Whether to load from .env files */
  loadDotEnv?: boolean;

  /** Custom environment source */
  envSource?: Record<string, string | undefined>;
}

export class ConfigManager<T extends Record<string, unknown>> {
  private readonly debug: debug.Debugger;
  private readonly options: Required<ConfigManagerOptions>;
  private readonly schema: ConfigSchema;
  private config: T | undefined;

  constructor(schema: ConfigSchema, options: ConfigManagerOptions = {}) {
    this.schema = schema;
    this.options = {
      debugNamespace: options.debugNamespace ?? 'mcp:config',
      envPrefix: options.envPrefix ?? '',
      strict: options.strict ?? true,
      loadDotEnv: options.loadDotEnv ?? true,
      envSource: options.envSource ?? process.env
    };

    this.debug = debug(this.options.debugNamespace);
    this.debug('ConfigManager initialized with schema:', Object.keys(schema));
  }

  /**
   * Load and validate configuration
   */
  public load(): T {
    if (this.config) {
      return this.config;
    }

    try {
      const rawConfig: Record<string, unknown> = {};
      const validatedConfig: Record<string, unknown> = {};

      // Load configuration values
      for (const [key, definition] of Object.entries(this.schema)) {
        const envKey = this.getEnvKey(key);
        const envValue = this.options.envSource[envKey];

        if (envValue !== undefined) {
          rawConfig[key] = this.parseEnvValue(envValue, definition.schema);
          this.debug(`Loaded ${key} from environment (${envKey})`);
        } else if (definition.default !== undefined) {
          rawConfig[key] = definition.default;
          this.debug(`Using default value for ${key}`);
        } else if (definition.required) {
          if (this.options.strict) {
            throw new MissingConfigurationError(envKey);
          }
          this.debug(`Missing required config: ${key} (${envKey})`);
        }
      }

      // Validate each configuration value
      for (const [key, definition] of Object.entries(this.schema)) {
        const value = rawConfig[key];

        if (value === undefined) {
          if (definition.required && this.options.strict) {
            throw new MissingConfigurationError(this.getEnvKey(key));
          }
          continue;
        }

        try {
          validatedConfig[key] = definition.schema.parse(value);
        } catch (error) {
          const envKey = this.getEnvKey(key);
          if (error instanceof z.ZodError) {
            throw new ValidationError(
              `Invalid configuration for ${envKey}: ${this.formatZodError(error)}`
            );
          }
          throw new ConfigurationError(
            `Failed to validate configuration for ${envKey}: ${(error as Error).message}`
          );
        }
      }

      this.config = validatedConfig as T;
      this.debug('Configuration loaded successfully');

      // Log non-sensitive config for debugging
      this.logConfig();

      return this.config;
    } catch (error) {
      this.debug('Configuration loading failed:', error);
      throw error;
    }
  }

  /**
   * Get configuration value by key
   */
  public get<K extends keyof T>(key: K): T[K] {
    if (!this.config) {
      this.load();
    }
    return this.config![key];
  }

  /**
   * Get all configuration
   */
  public getAll(): T {
    if (!this.config) {
      this.load();
    }
    return { ...this.config! };
  }

  /**
   * Check if a configuration key has a value
   */
  public has(key: keyof T): boolean {
    if (!this.config) {
      this.load();
    }
    return this.config![key] !== undefined;
  }

  /**
   * Validate current configuration
   */
  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      this.load();
    } catch (error) {
      errors.push((error as Error).message);
    }

    // Check for missing required values
    for (const [key, definition] of Object.entries(this.schema)) {
      if (definition.required && !this.has(key as keyof T)) {
        errors.push(`Missing required configuration: ${this.getEnvKey(key)}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration documentation
   */
  public getDocumentation(): string {
    const lines: string[] = [];
    lines.push('# Configuration Documentation\n');

    for (const [key, definition] of Object.entries(this.schema)) {
      const envKey = this.getEnvKey(key);
      const status = definition.required ? 'Required' : 'Optional';
      const hasDefault = definition.default !== undefined;

      lines.push(`## ${envKey}`);
      lines.push(`- **Status**: ${status}`);
      lines.push(`- **Description**: ${definition.description}`);

      if (hasDefault) {
        const defaultValue = definition.sensitive ? '[REDACTED]' : String(definition.default);
        lines.push(`- **Default**: ${defaultValue}`);
      }

      lines.push(`- **Type**: ${this.getSchemaDescription(definition.schema)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export configuration as environment variables
   */
  public toEnvFormat(): string {
    if (!this.config) {
      this.load();
    }

    const lines: string[] = [];

    for (const [key, definition] of Object.entries(this.schema)) {
      const envKey = this.getEnvKey(key);
      const value = this.config![key as keyof T];

      if (value !== undefined) {
        const valueStr = definition.sensitive ? '[REDACTED]' : this.formatEnvValue(value);
        lines.push(`${envKey}=${valueStr}`);
      } else {
        lines.push(`# ${envKey}=`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset configuration (force reload on next access)
   */
  public reset(): void {
    this.config = undefined;
    this.debug('Configuration reset');
  }

  private getEnvKey(key: string): string {
    const upperKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return this.options.envPrefix ? `${this.options.envPrefix}_${upperKey}` : upperKey;
  }

  private parseEnvValue(value: string, _schema: z.ZodSchema): unknown {
    // Try to parse as JSON first for complex types
    if (
      value.startsWith('{') ||
      value.startsWith('[') ||
      value === 'true' ||
      value === 'false' ||
      value === 'null'
    ) {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to string parsing
      }
    }

    // Handle numbers
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // Handle booleans
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Handle arrays (comma-separated)
    if (value.includes(',')) {
      return value.split(',').map((item) => item.trim());
    }

    return value;
  }

  private formatEnvValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.join(',');
    }
    return JSON.stringify(value);
  }

  private formatZodError(error: z.ZodError): string {
    return error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ');
  }

  private getSchemaDescription(schema: z.ZodSchema): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) return 'array';
    if (schema instanceof z.ZodObject) return 'object';
    if (schema instanceof z.ZodOptional)
      return `optional ${this.getSchemaDescription(schema._def.innerType)}`;
    if (schema instanceof z.ZodEnum) return `enum(${schema.options.join('|')})`;
    return 'unknown';
  }

  private logConfig(): void {
    if (!this.config) return;

    const safeConfig: Record<string, unknown> = {};

    for (const [key, definition] of Object.entries(this.schema)) {
      const value = this.config[key as keyof T];
      if (value !== undefined) {
        safeConfig[key] = definition.sensitive ? '[REDACTED]' : value;
      }
    }

    this.debug('Configuration loaded:', safeConfig);
  }
}

/**
 * Helper function to create common configuration schemas
 */
export class ConfigSchemaBuilder {
  private schema: ConfigSchema = {};

  string(
    key: string,
    description: string,
    options: {
      required?: boolean;
      default?: string;
      sensitive?: boolean;
      pattern?: RegExp;
    } = {}
  ): this {
    let zodSchema = z.string();

    if (options.pattern) {
      zodSchema = zodSchema.regex(options.pattern);
    }

    this.schema[key] = {
      schema: zodSchema,
      required: options.required ?? false,
      description,
      default: options.default,
      sensitive: options.sensitive ?? false
    };

    return this;
  }

  number(
    key: string,
    description: string,
    options: {
      required?: boolean;
      default?: number;
      min?: number;
      max?: number;
      int?: boolean;
    } = {}
  ): this {
    let zodSchema = z.number();

    if (options.min !== undefined) {
      zodSchema = zodSchema.min(options.min);
    }
    if (options.max !== undefined) {
      zodSchema = zodSchema.max(options.max);
    }
    if (options.int) {
      zodSchema = zodSchema.int();
    }

    this.schema[key] = {
      schema: zodSchema,
      required: options.required ?? false,
      description,
      default: options.default
    };

    return this;
  }

  boolean(
    key: string,
    description: string,
    options: {
      required?: boolean;
      default?: boolean;
    } = {}
  ): this {
    this.schema[key] = {
      schema: z.boolean(),
      required: options.required ?? false,
      description,
      default: options.default
    };

    return this;
  }

  enum<T extends readonly [string, ...string[]]>(
    key: string,
    description: string,
    values: T,
    options: {
      required?: boolean;
      default?: T[number];
    } = {}
  ): this {
    this.schema[key] = {
      schema: z.enum(values),
      required: options.required ?? false,
      description,
      default: options.default
    };

    return this;
  }

  array(
    key: string,
    description: string,
    itemSchema: z.ZodSchema,
    options: {
      required?: boolean;
      default?: unknown[];
      minLength?: number;
      maxLength?: number;
    } = {}
  ): this {
    let zodSchema = z.array(itemSchema);

    if (options.minLength !== undefined) {
      zodSchema = zodSchema.min(options.minLength);
    }
    if (options.maxLength !== undefined) {
      zodSchema = zodSchema.max(options.maxLength);
    }

    this.schema[key] = {
      schema: zodSchema,
      required: options.required ?? false,
      description,
      default: options.default
    };

    return this;
  }

  url(
    key: string,
    description: string,
    options: {
      required?: boolean;
      default?: string;
      sensitive?: boolean;
    } = {}
  ): this {
    this.schema[key] = {
      schema: z.string().url(),
      required: options.required ?? false,
      description,
      default: options.default,
      sensitive: options.sensitive ?? false
    };

    return this;
  }

  custom<T>(
    key: string,
    description: string,
    schema: z.ZodSchema<T>,
    options: {
      required?: boolean;
      default?: T;
      sensitive?: boolean;
    } = {}
  ): this {
    this.schema[key] = {
      schema,
      required: options.required ?? false,
      description,
      default: options.default,
      sensitive: options.sensitive ?? false
    };

    return this;
  }

  build(): ConfigSchema {
    return { ...this.schema };
  }
}

/**
 * Factory function to create a configuration manager
 */
export function createConfigManager<T extends Record<string, unknown>>(
  schema: ConfigSchema,
  options: ConfigManagerOptions = {}
): ConfigManager<T> {
  return new ConfigManager<T>(schema, options);
}
