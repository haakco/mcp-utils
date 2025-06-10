/**
 * Logger utilities for MCP servers
 */

import debug from 'debug';

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

export interface StructuredLogger extends Logger {
  child(context: Record<string, unknown>): StructuredLogger;
  withContext(context: Record<string, unknown>): void;
}

/**
 * Create a debug logger with namespacing
 */
export function createLogger(namespace: string, prefix = 'mcp'): Logger {
  const logger = debug(`${prefix}:${namespace}`);

  return {
    info: (message: string, ...args: unknown[]) => logger(`INFO: ${message}`, ...args),
    warn: (message: string, ...args: unknown[]) => logger(`WARN: ${message}`, ...args),
    error: (message: string, ...args: unknown[]) => logger(`ERROR: ${message}`, ...args),
    debug: (message: string, ...args: unknown[]) => logger(`DEBUG: ${message}`, ...args)
  };
}

/**
 * Create a structured logger that includes context
 */
export function createStructuredLogger(
  namespace: string,
  prefix = 'mcp',
  initialContext: Record<string, unknown> = {}
): StructuredLogger {
  const baseLogger = debug(`${prefix}:${namespace}`);
  let context = { ...initialContext };

  const formatMessage = (level: string, message: string, ...args: unknown[]): void => {
    const contextStr = Object.keys(context).length > 0 ? ` [${JSON.stringify(context)}]` : '';
    baseLogger(`${level}: ${message}${contextStr}`, ...args);
  };

  const logger: StructuredLogger = {
    info: (message: string, ...args: unknown[]) => formatMessage('INFO', message, ...args),
    warn: (message: string, ...args: unknown[]) => formatMessage('WARN', message, ...args),
    error: (message: string, ...args: unknown[]) => formatMessage('ERROR', message, ...args),
    debug: (message: string, ...args: unknown[]) => formatMessage('DEBUG', message, ...args),

    child(childContext: Record<string, unknown>): StructuredLogger {
      return createStructuredLogger(namespace, prefix, { ...context, ...childContext });
    },

    withContext(newContext: Record<string, unknown>): void {
      context = { ...context, ...newContext };
    }
  };

  return logger;
}

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Create a logger with configurable log level
 */
export function createLevelLogger(
  namespace: string,
  level: LogLevel = LogLevel.INFO,
  prefix = 'mcp'
): Logger {
  const logger = createLogger(namespace, prefix);

  return {
    info: level >= LogLevel.INFO ? logger.info : () => {},
    warn: level >= LogLevel.WARN ? logger.warn : () => {},
    error: level >= LogLevel.ERROR ? logger.error : () => {},
    debug: level >= LogLevel.DEBUG ? logger.debug : () => {}
  };
}

/**
 * Create a console logger (for testing or fallback)
 */
export function createConsoleLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;

  return {
    info: (message: string, ...args: unknown[]) => console.log(`${prefix} INFO:`, message, ...args),
    warn: (message: string, ...args: unknown[]) =>
      console.warn(`${prefix} WARN:`, message, ...args),
    error: (message: string, ...args: unknown[]) =>
      console.error(`${prefix} ERROR:`, message, ...args),
    debug: (message: string, ...args: unknown[]) =>
      console.debug(`${prefix} DEBUG:`, message, ...args)
  };
}

/**
 * Create a silent logger (no output)
 */
export function createSilentLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  };
}

/**
 * Logger factory with environment-based configuration
 */
export function createLoggerFromEnv(namespace: string): Logger {
  const debugEnv = process.env['DEBUG'];
  const logLevel = process.env['LOG_LEVEL'];

  // If DEBUG env is set, use debug logger
  if (debugEnv) {
    return createLogger(namespace);
  }

  // If LOG_LEVEL is set, use level logger
  if (logLevel) {
    const level = LogLevel[logLevel.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;
    return createLevelLogger(namespace, level);
  }

  // Default to console logger in development, silent in production
  return process.env['NODE_ENV'] === 'production'
    ? createSilentLogger()
    : createConsoleLogger(namespace);
}

/**
 * Performance logger for timing operations
 */
export class PerformanceLogger {
  private timers = new Map<string, number>();

  constructor(private logger: Logger) {}

  start(operation: string): void {
    this.timers.set(operation, Date.now());
    this.logger.debug(`Starting operation: ${operation}`);
  }

  end(operation: string, metadata?: Record<string, unknown>): void {
    const startTime = this.timers.get(operation);
    if (!startTime) {
      this.logger.warn(`No start time found for operation: ${operation}`);
      return;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operation);

    const metadataStr = metadata ? `, metadata: ${JSON.stringify(metadata)}` : '';

    this.logger.info(`Operation completed: ${operation}, duration: ${duration}ms${metadataStr}`);
  }

  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    this.start(operation);
    try {
      const result = await fn();
      this.end(operation, { ...metadata, status: 'success' });
      return result;
    } catch (error) {
      this.end(operation, { ...metadata, status: 'error', error: String(error) });
      throw error;
    }
  }
}

/**
 * Create a performance logger
 */
export function createPerformanceLogger(namespace: string): PerformanceLogger {
  return new PerformanceLogger(createLogger(namespace));
}
