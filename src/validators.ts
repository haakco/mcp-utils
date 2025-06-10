import { z } from 'zod';

// Common string validators
export const nonEmptyString = z.string().min(1, 'Cannot be empty');
export const optionalString = z.string().optional();
export const nullableString = z.string().nullable();

// Numeric validators
export const positiveInt = z.number().int().positive();
export const nonNegativeInt = z.number().int().nonnegative();
export const port = z.number().int().min(1).max(65535);

// Network validators
export const ipAddress = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    'Invalid IP address'
  );

export const hostname = z
  .string()
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    'Invalid hostname'
  );

export const hostOrIp = z.union([ipAddress, hostname]);

export const url = z.string().url();

// Kubernetes validators
export const k8sName = z
  .string()
  .regex(
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
    'Must be lowercase alphanumeric and hyphens, starting and ending with alphanumeric'
  );

export const k8sLabel = z
  .string()
  .regex(/^[a-zA-Z0-9]([-a-zA-Z0-9_.]*[a-zA-Z0-9])?$/, 'Invalid label format');

// Resource validators
export const memorySize = z
  .string()
  .regex(/^\d+([KMGT]i?)?$/, 'Invalid memory size (e.g., 512Mi, 2Gi)');

export const cpuSize = z.string().regex(/^\d+(\.\d+)?m?$/, 'Invalid CPU size (e.g., 100m, 0.5, 2)');

export const diskSize = z.string().regex(/^\d+([KMGT])?$/, 'Invalid disk size (e.g., 10G, 500M)');

// Common patterns
export const uuid = z.string().uuid();
export const email = z.string().email();
export const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Invalid base64 string');

// Object validators
export const stringRecord = z.record(z.string());
export const labels = z.record(z.string(), z.string());
export const annotations = z.record(z.string(), z.string());

// Array validators
export const stringArray = z.array(z.string());
export const nonEmptyStringArray = z.array(z.string()).min(1);

// Helper functions
export function createPaginationSchema(maxPerPage = 100) {
  return z.object({
    page: z.number().int().positive().default(1),
    perPage: z.number().int().positive().max(maxPerPage).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc')
  });
}

export function createFilterSchema<T extends z.ZodRawShape>(shape: T) {
  const baseShape = { ...shape };
  return z.object(baseShape);
}

export function validateOneOf<T>(value: T | undefined, options: T[], fieldName: string): void {
  if (value !== undefined && !options.includes(value)) {
    throw new Error(`Invalid ${fieldName}. Must be one of: ${options.join(', ')}`);
  }
}

// Validation decorators (for future use with TypeScript decorators)
export function validate<T>(schema: z.ZodSchema<T>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (_target: any, _propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = async function (...args: any[]) {
      const [input] = args;
      const validationResult = schema.safeParse(input);

      if (!validationResult.success) {
        throw new Error(`Validation failed: ${validationResult.error.message}`);
      }

      return method.apply(this, [validationResult.data, ...args.slice(1)]);
    };
  };
}

// Common validation schemas
export const commonToolArgs = {
  timeout: z.number().positive().optional(),
  retries: z.number().int().nonnegative().optional()
};

export const resourceIdentifier = z.object({
  name: nonEmptyString,
  namespace: z.string().optional()
});

export const paginatedRequest = z.object({
  ...commonToolArgs,
  page: z.number().int().positive().default(1),
  perPage: z.number().int().positive().max(100).default(20)
});

// Additional common validators
export const booleanString = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((val) => val === true || val === 'true');

export const dateString = z.string().datetime();
export const timestamp = z
  .union([z.number(), z.string(), z.date()])
  .transform((val) => new Date(val));

// Pagination validators
export const paginationParams = z.object({
  max: z.number().int().min(1).max(1000).default(100),
  first: z.number().int().min(0).default(0),
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().max(100).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional()
});

// Type guards
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isRecord(obj) && key in obj;
}

// Validation helpers
export function validateUrl(url: unknown, field = 'url'): string {
  if (typeof url !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  try {
    new URL(url);
    return url;
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }
}

export function validateEmail(email: unknown, field = 'email'): string {
  if (typeof email !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`${field} must be a valid email address`);
  }

  return email;
}

export function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }

  throw new Error(`${field} must be a boolean value`);
}

export function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }

  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`All items in ${field} must be strings`);
    }
  }

  return value;
}

export function validatePagination(max?: unknown, first?: unknown): { max: number; first: number } {
  const maxVal = max !== undefined ? Number(max) : 100;
  const firstVal = first !== undefined ? Number(first) : 0;

  if (isNaN(maxVal) || maxVal < 1 || maxVal > 1000) {
    throw new Error('max must be a number between 1 and 1000');
  }

  if (isNaN(firstVal) || firstVal < 0) {
    throw new Error('first must be a non-negative number');
  }

  return { max: maxVal, first: firstVal };
}
