/**
 * HTTP client base class for MCP servers
 * Provides consistent HTTP handling, retry logic, and error conversion across all API-based MCP implementations
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig
} from 'axios';
import debug from 'debug';
import {
  BaseMCPError,
  APIError,
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  RateLimitError,
  ResourceNotFoundError,
  ServiceUnavailableError,
  TimeoutError,
  ValidationError,
  ErrorConverter,
  RetryHelper
} from './errors.js';

export interface HttpClientConfig {
  /** Base URL for API requests */
  baseURL: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Default headers to include with all requests */
  headers?: Record<string, string>;

  /** Authentication configuration */
  auth?: {
    type: 'bearer' | 'basic' | 'api-key';
    credentials: {
      token?: string;
      username?: string;
      password?: string;
      apiKey?: string;
      apiKeyHeader?: string;
    };
  };

  /** Retry configuration */
  retry?: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    retryableStatusCodes?: number[];
  };

  /** Rate limiting configuration */
  rateLimit?: {
    requestsPerSecond?: number;
    burstLimit?: number;
  };

  /** Custom debug namespace */
  debugNamespace?: string;

  /** Custom user agent */
  userAgent?: string;

  /** SSL/TLS configuration */
  ssl?: {
    rejectUnauthorized?: boolean;
    cert?: string;
    key?: string;
    ca?: string;
  };

  /** Request/response interceptors */
  interceptors?: {
    request?: (
      config: InternalAxiosRequestConfig
    ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
    response?: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
    responseError?: (error: AxiosError) => Promise<AxiosError>;
  };
}

export interface RequestOptions {
  /** Override timeout for this request */
  timeout?: number;

  /** Additional headers for this request */
  headers?: Record<string, string>;

  /** Disable retry for this request */
  noRetry?: boolean;

  /** Custom retry configuration for this request */
  retry?: {
    maxRetries?: number;
    baseDelay?: number;
  };

  /** Response type */
  responseType?: 'json' | 'text' | 'blob' | 'stream';

  /** Request validation */
  validateStatus?: (status: number) => boolean;

  /** Track request for debugging */
  requestId?: string;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: AxiosRequestConfig;
  request?: unknown;
}

/**
 * Rate limiter for HTTP requests
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(requestsPerSecond: number, burstLimit: number = requestsPerSecond * 2) {
    this.maxTokens = burstLimit;
    this.tokens = burstLimit;
    this.refillRate = requestsPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate delay needed for next token
    const delay = Math.ceil(1 / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.waitForToken();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Base HTTP client for MCP servers
 */
export abstract class BaseHttpClient {
  protected readonly axios: AxiosInstance;
  protected readonly debug: debug.Debugger;
  protected readonly config: HttpClientConfig & {
    timeout: number;
    headers: Record<string, string>;
    retry: Required<NonNullable<HttpClientConfig['retry']>>;
    rateLimit: Required<NonNullable<HttpClientConfig['rateLimit']>>;
    debugNamespace: string;
    userAgent: string;
  };
  private readonly rateLimiter?: RateLimiter;

  constructor(config: HttpClientConfig) {
    this.config = this.normalizeConfig(config);
    this.debug = debug(this.config.debugNamespace);

    // Create axios instance
    this.axios = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: this.buildDefaultHeaders(),
      validateStatus: () => true, // We'll handle status validation ourselves
      maxRedirects: 5,
      ...(this.config.ssl
        ? {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            httpsAgent: new (require('https').Agent)({
              rejectUnauthorized: this.config.ssl.rejectUnauthorized,
              cert: this.config.ssl.cert,
              key: this.config.ssl.key,
              ca: this.config.ssl.ca
            })
          }
        : {})
    });

    // Setup rate limiter
    if (this.config.rateLimit.requestsPerSecond > 0) {
      this.rateLimiter = new RateLimiter(
        this.config.rateLimit.requestsPerSecond,
        this.config.rateLimit.burstLimit ?? this.config.rateLimit.requestsPerSecond * 2
      );
    }

    this.setupInterceptors();
    this.debug('HTTP client initialized with baseURL: %s', this.config.baseURL);
  }

  /**
   * Normalize and validate configuration
   */
  private normalizeConfig(config: HttpClientConfig): HttpClientConfig & {
    timeout: number;
    headers: Record<string, string>;
    retry: Required<NonNullable<HttpClientConfig['retry']>>;
    rateLimit: Required<NonNullable<HttpClientConfig['rateLimit']>>;
    debugNamespace: string;
    userAgent: string;
  } {
    return {
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      headers: config.headers ?? {},
      auth: config.auth ?? undefined,
      retry: {
        maxRetries: config.retry?.maxRetries ?? 3,
        baseDelay: config.retry?.baseDelay ?? 1000,
        maxDelay: config.retry?.maxDelay ?? 30000,
        retryableStatusCodes: config.retry?.retryableStatusCodes ?? [408, 429, 500, 502, 503, 504]
      },
      rateLimit: {
        requestsPerSecond: config.rateLimit?.requestsPerSecond ?? 0,
        burstLimit: config.rateLimit?.burstLimit ?? 0
      },
      debugNamespace: config.debugNamespace ?? 'mcp:http-client',
      userAgent: config.userAgent ?? 'MCP-Server/1.0',
      ssl: config.ssl ?? undefined,
      interceptors: config.interceptors ?? undefined
    };
  }

  /**
   * Build default headers for all requests
   */
  private buildDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.config.headers
    };

    // Add authentication headers
    if (this.config.auth) {
      switch (this.config.auth.type) {
        case 'bearer':
          if (this.config.auth.credentials.token) {
            headers['Authorization'] = `Bearer ${this.config.auth.credentials.token}`;
          }
          break;
        case 'basic':
          if (this.config.auth.credentials.username && this.config.auth.credentials.password) {
            const credentials = Buffer.from(
              `${this.config.auth.credentials.username}:${this.config.auth.credentials.password}`
            ).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
          }
          break;
        case 'api-key':
          if (this.config.auth.credentials.apiKey) {
            const headerName = this.config.auth.credentials.apiKeyHeader ?? 'X-API-Key';
            headers[headerName] = this.config.auth.credentials.apiKey;
          }
          break;
      }
    }

    return headers;
  }

  /**
   * Setup axios interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      async (config) => {
        // Apply rate limiting
        if (this.rateLimiter) {
          await this.rateLimiter.waitForToken();
        }

        this.debug('Request: %s %s', config.method?.toUpperCase(), config.url);

        // Apply custom request interceptor
        if (this.config.interceptors?.request) {
          return await this.config.interceptors.request(config);
        }

        return config;
      },
      (error) => {
        this.debug('Request interceptor error: %s', error.message);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      async (response) => {
        this.debug(
          'Response: %s %s -> %d',
          response.config.method?.toUpperCase(),
          response.config.url,
          response.status
        );

        // Apply custom response interceptor
        if (this.config.interceptors?.response) {
          return await this.config.interceptors.response(response);
        }

        return response;
      },
      async (error: AxiosError) => {
        this.debug('Response error: %s', error.message);

        // Apply custom error interceptor
        if (this.config.interceptors?.responseError) {
          return await this.config.interceptors.responseError(error);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute HTTP request with retry logic and error handling
   */
  protected async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    options: RequestOptions & {
      data?: unknown;
      params?: Record<string, unknown>;
    } = {}
  ): Promise<ApiResponse<T>> {
    const requestConfig: AxiosRequestConfig = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: method.toLowerCase() as any,
      url,
      timeout: options.timeout ?? this.config.timeout,
      headers: { ...options.headers },
      data: options.data,
      params: options.params,
      responseType: options.responseType ?? 'json',
      validateStatus: options.validateStatus ?? ((status) => status >= 200 && status < 300)
    };

    const maxRetries = options.noRetry
      ? 0
      : (options.retry?.maxRetries ?? this.config.retry.maxRetries);
    const baseDelay = options.retry?.baseDelay ?? this.config.retry.baseDelay;

    return RetryHelper.withRetry(
      async () => {
        try {
          const response = await this.axios.request(requestConfig);

          // Validate response status
          if (!this.isSuccessStatus(response.status)) {
            throw this.createErrorFromResponse(response);
          }

          return {
            data: response.data,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers as Record<string, string>,
            config: response.config,
            request: response.request
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw this.convertAxiosError(error);
          }
          throw ErrorConverter.toMCPError(error);
        }
      },
      maxRetries,
      baseDelay,
      (error, attempt) => {
        this.debug(
          'Retrying request (attempt %d/%d): %s',
          attempt,
          (maxRetries ?? 0) + 1,
          error.message
        );
      }
    );
  }

  /**
   * GET request
   */
  protected async get<T = unknown>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', url, options);
  }

  /**
   * POST request
   */
  protected async post<T = unknown>(
    url: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', url, { ...options, data });
  }

  /**
   * PUT request
   */
  protected async put<T = unknown>(
    url: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', url, { ...options, data });
  }

  /**
   * PATCH request
   */
  protected async patch<T = unknown>(
    url: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', url, { ...options, data });
  }

  /**
   * DELETE request
   */
  protected async delete<T = unknown>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', url, options);
  }

  /**
   * Check if status code indicates success
   */
  private isSuccessStatus(status: number): boolean {
    return status >= 200 && status < 300;
  }

  /**
   * Convert axios error to MCP error
   */
  private convertAxiosError(error: AxiosError): BaseMCPError {
    const response = error.response;
    const request = error.request;
    const message = error.message;

    // Network/connection errors
    if (!response && request) {
      if (message.includes('timeout')) {
        return new TimeoutError('HTTP Request', this.config.timeout);
      }
      return new ConnectionError(`Network error: ${message}`);
    }

    // HTTP response errors
    if (response) {
      return this.createErrorFromResponse(response);
    }

    // Request setup errors
    return new APIError(`Request error: ${message}`, 500);
  }

  /**
   * Create error from HTTP response
   */
  private createErrorFromResponse(response: AxiosResponse): BaseMCPError {
    const status = response.status;
    const statusText = response.statusText;
    const data = response.data;

    // Extract error message from response body
    let message = statusText;
    if (data && typeof data === 'object') {
      message = data.message || data.error || data.detail || statusText;
    } else if (typeof data === 'string') {
      message = data;
    }

    const details = {
      status,
      statusText,
      data,
      headers: response.headers
    };

    // Map status codes to specific error types
    switch (status) {
      case 400:
        return new ValidationError(message, details);
      case 401:
        return new AuthenticationError(message, details);
      case 403:
        return new AuthorizationError(message, details);
      case 404:
        return new ResourceNotFoundError('Resource', message);
      case 408:
        return new TimeoutError('HTTP Request', this.config.timeout);
      case 429: {
        const retryAfterHeader = response.headers['retry-after'];
        const retryAfter = retryAfterHeader
          ? parseInt(String(retryAfterHeader), 10) * 1000
          : undefined;
        return new RateLimitError(message, retryAfter);
      }
      case 503:
        return new ServiceUnavailableError('API', details);
      default: {
        const isRetryable = this.config.retry.retryableStatusCodes.includes(status);
        return new APIError(message, status, data, isRetryable);
      }
    }
  }

  /**
   * Update authentication credentials
   */
  public updateAuth(auth: HttpClientConfig['auth']): void {
    if (auth) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.config as any).auth = auth;
      const headers = this.buildDefaultHeaders();
      Object.assign(this.axios.defaults.headers.common ?? {}, headers);
      this.debug('Authentication updated');
    }
  }

  /**
   * Update base URL
   */
  public updateBaseURL(baseURL: string): void {
    this.config.baseURL = baseURL;
    this.axios.defaults.baseURL = baseURL;
    this.debug('Base URL updated to: %s', baseURL);
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<HttpClientConfig> {
    return { ...this.config };
  }

  /**
   * Test connection to the API
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.get('/', { timeout: 5000, noRetry: true });
      return true;
    } catch (error) {
      this.debug('Connection test failed: %s', (error as Error).message);
      return false;
    }
  }

  /**
   * Get health/status information
   * Override in subclasses to implement service-specific health checks
   */
  public async getHealth(): Promise<{ status: string; details?: Record<string, unknown> }> {
    try {
      const response = await this.get('/health', { timeout: 5000, noRetry: true });
      return {
        status: 'healthy',
        details: response.data as Record<string, unknown>
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: (error as Error).message }
      };
    }
  }
}

/**
 * Factory for creating HTTP clients with common configurations
 */
export class RestHttpClient extends BaseHttpClient {
  async apiGet<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.request<T>('GET', endpoint, { params });
    return response.data;
  }

  async apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await this.post<T>(endpoint, data);
    return response.data;
  }

  async apiPut<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await this.put<T>(endpoint, data);
    return response.data;
  }

  async apiPatch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await this.patch<T>(endpoint, data);
    return response.data;
  }

  async apiDelete<T>(endpoint: string): Promise<T> {
    const response = await this.delete<T>(endpoint);
    return response.data;
  }
}

export class GraphQLHttpClient extends BaseHttpClient {
  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string
  ): Promise<T> {
    const response = await this.post<{ data: T; errors?: unknown[] }>('/graphql', {
      query,
      variables,
      operationName
    });

    if (response.data.errors && response.data.errors.length > 0) {
      throw new APIError('GraphQL errors', 400, response.data.errors);
    }

    return response.data.data;
  }

  async mutation<T>(
    mutation: string,
    variables?: Record<string, unknown>,
    operationName?: string
  ): Promise<T> {
    return this.query<T>(mutation, variables, operationName);
  }
}

export class HttpClientFactory {
  /**
   * Create a client for REST APIs
   */
  static createRestClient(config: HttpClientConfig): RestHttpClient {
    return new RestHttpClient(config);
  }

  /**
   * Create a client for GraphQL APIs
   */
  static createGraphQLClient(config: HttpClientConfig): GraphQLHttpClient {
    return new GraphQLHttpClient(config);
  }
}
