# @haakco/mcp-utils

**Comprehensive shared utilities library for MCP (Model Context Protocol) servers**

Eliminates code duplication and provides standardized, production-ready utilities for building robust MCP servers.

[![Tests](https://img.shields.io/badge/tests-85%2F85%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/typescript-zero%20errors-blue)]()
[![Lint](https://img.shields.io/badge/lint-zero%20warnings-green)]()

## Installation

```bash
npm install @haakco/mcp-utils
```

## Quick Start

```typescript
import { 
  BaseToolHandler, 
  ResponseBuilder, 
  createTextResponse,
  formatSuccess,
  createLogger
} from '@haakco/mcp-utils';

class MyMCPServer extends BaseToolHandler {
  private logger = createLogger('my-server');

  async handleTool(args: unknown) {
    try {
      const result = await this.performOperation(args);
      this.logger.info('Operation completed successfully');
      return createTextResponse(formatSuccess(result));
    } catch (error) {
      this.logger.error('Operation failed:', error);
      return createErrorResponse(error);
    }
  }
}
```

## 🚀 Core Features

### 🏗️ **MCP Architecture Components**
- **BaseToolHandler** - Standardized tool execution patterns
- **ResponseBuilder** - Consistent MCP response formatting
- **InstanceManager** - Multi-instance server support
- **ToolRegistry** - Tool registration and management

### 🎨 **Formatting & Presentation**
- **Message Formatters** - ✅ ❌ ⚠️ ℹ️ status indicators
- **Size Formatters** - Bytes, storage units (KB, MB, GB, Ki, Mi, Gi)
- **Table Formatters** - Structured data presentation
- **JSON/Text Utilities** - Safe serialization and truncation

### 📅 **DateTime Operations**
- **Duration Formatting** - Human-readable time spans
- **Age Calculation** - "2 hours ago", "3 days old"
- **Relative Time** - "in 5 minutes", "1 week ago"
- **Duration Parsing** - "1h30m" → milliseconds

### 🧠 **Advanced Caching**
- **SimpleCache** - TTL-based caching
- **LRUCache** - Least Recently Used eviction
- **TTLCache** - Combined TTL + LRU strategies
- **DebouncedCache** - Batched operation caching
- **Memoization** - Function result caching

### 🚦 **Rate Limiting**
- **Token Bucket** - Burst capacity with refill
- **Sliding Window** - Rolling time-based limits
- **Fixed Window** - Period-based rate limiting
- **Leaky Bucket** - Smooth rate control
- **Multi-Tier** - Multiple simultaneous limits
- **Keyed Limiters** - Per-user/per-resource limits

### 🔌 **WebSocket Utilities**
- **ReconnectingWebSocket** - Auto-reconnection with backoff
- **Message Router** - Type-based message handling
- **RPC Client** - Request/response over WebSocket
- **Connection Pool** - Managed connection lifecycle

### 📊 **Logging & Monitoring**
- **Structured Logging** - Context-aware log entries
- **Performance Timing** - Operation duration tracking
- **Environment-based** - Debug/production configurations
- **Multiple Outputs** - Console, silent, custom loggers

## 📚 API Reference

### Core MCP Utilities

#### Response Creation
```typescript
import { createTextResponse, createErrorResponse, createSuccessResponse } from '@haakco/mcp-utils';

// Basic responses
createTextResponse('Operation completed');
createErrorResponse(new Error('Failed to connect'));
createSuccessResponse('User created successfully');

// Multi-part responses
createMultipartResponse(['Header', 'Content', 'Footer']);

// Progress indicators
createProgressResponse(75, 100, 'Processing data');
```

#### Argument Validation
```typescript
import { validateToolArgs, validateRequiredArgs, extractPagination } from '@haakco/mcp-utils';

// Schema validation
const args = validateToolArgs(input, (data) => userSchema.parse(data), 'create_user');

// Required field validation
const validated = validateRequiredArgs(input, ['name', 'email'], 'User creation');

// Pagination extraction
const { page, perPage, offset, limit } = extractPagination(args);
```

### Formatting Utilities

#### Message Formatting
```typescript
import { formatSuccess, formatError, formatWarning, formatInfo } from '@haakco/mcp-utils';

formatSuccess('Operation completed'); // ✅ Operation completed
formatError('Connection failed');     // ❌ Error: Connection failed
formatWarning('Low disk space');      // ⚠️ Warning: Low disk space
formatInfo('System status');          // ℹ️ System status
```

#### Size & Number Formatting
```typescript
import { formatBytes, formatStorageSize, formatPercentage, formatCPU } from '@haakco/mcp-utils';

formatBytes(1048576);          // 1 MB
formatStorageSize(1048576);    // 1Mi (Kubernetes format)
formatPercentage(75, 100);     // 75.00%
formatCPU(0.75);              // 75.00%
```

#### Table & List Formatting
```typescript
import { formatTable, formatSimpleTable, formatList, formatBulletList } from '@haakco/mcp-utils';

// Object array to table
const data = [
  { name: 'John', age: 30, city: 'NYC' },
  { name: 'Jane', age: 25, city: 'LA' }
];
formatTable(data);
// name | age | city
// -----|-----|-----
// John | 30  | NYC
// Jane | 25  | LA

// Key-value table
formatSimpleTable({ name: 'Server1', status: 'Running', cpu: '45%' });
// name   : Server1
// status : Running
// cpu    : 45%

// Lists
formatList(['item1', 'item2', 'item3'], ' | ');        // item1 | item2 | item3
formatBulletList(['item1', 'item2']);                   // • item1\n• item2
```

### DateTime Utilities

#### Duration Formatting
```typescript
import { formatDuration, formatDurationFromSeconds, formatAge } from '@haakco/mcp-utils';

formatDuration(90061000);           // 1d 1h 1m 1s
formatDurationFromSeconds(3661);    // 1h 1m 1s
formatAge(Date.now() - 3600000);    // 1h (age from timestamp)
```

#### Relative Time
```typescript
import { formatRelativeTime, parseDuration } from '@haakco/mcp-utils';

formatRelativeTime(new Date(Date.now() - 3600000)); // 1 hour ago
formatRelativeTime(new Date(Date.now() + 1800000)); // in 30 minutes

parseDuration('1h30m');     // 5400000 (milliseconds)
parseDuration('2d12h');     // 216000000
```

### Caching System

#### Simple TTL Cache
```typescript
import { SimpleCache } from '@haakco/mcp-utils';

const cache = new SimpleCache<string>(60000); // 1 minute TTL

cache.set('key1', 'value1');
cache.get('key1');          // 'value1'
cache.has('key1');          // true

// Custom TTL for specific items
cache.set('key2', 'value2', 30000); // 30 second TTL
```

#### LRU Cache
```typescript
import { LRUCache } from '@haakco/mcp-utils';

const cache = new LRUCache<string>(100); // Max 100 items

cache.set('key1', 'value1');
cache.get('key1');          // Marks as recently used
cache.size();               // Current cache size
```

#### Combined TTL + LRU Cache
```typescript
import { TTLCache } from '@haakco/mcp-utils';

const cache = new TTLCache<string>({
  ttl: 300000,      // 5 minutes
  maxSize: 1000,    // Max 1000 items
  onEvict: (key, value) => console.log(`Evicted ${key}`)
});

cache.set('key1', 'value1');
cache.cleanup();            // Manual cleanup of expired items
```

#### Function Memoization
```typescript
import { memoize } from '@haakco/mcp-utils';

const expensiveOperation = async (id: string) => {
  // Expensive API call or computation
  return await fetch(`/api/data/${id}`).then(r => r.json());
};

const memoized = memoize(expensiveOperation, {
  ttl: 300000,     // 5 minute cache
  keyGenerator: (id) => `data:${id}`
});

// First call - executes function
await memoized('user1');  

// Second call - returns cached result
await memoized('user1');  
```

### Rate Limiting

#### Token Bucket Rate Limiter
```typescript
import { TokenBucketRateLimiter } from '@haakco/mcp-utils';

const limiter = new TokenBucketRateLimiter(
  10,     // Bucket capacity (max burst)
  2       // Refill rate (tokens per second)
);

// Try to acquire tokens
if (await limiter.acquire(1)) {
  // Request allowed
  await processRequest();
}

// Wait until tokens available
await limiter.acquireOrWait(1);
```

#### Sliding Window Rate Limiter
```typescript
import { SlidingWindowRateLimiter } from '@haakco/mcp-utils';

const limiter = new SlidingWindowRateLimiter(
  60000,  // 1 minute window
  100     // Max 100 requests per window
);

if (await limiter.acquire()) {
  // Request allowed
} else {
  const waitTime = limiter.getTimeUntilNextRequest();
  console.log(`Rate limited. Wait ${waitTime}ms`);
}
```

#### Multi-Tier Rate Limiting
```typescript
import { MultiTierRateLimiter } from '@haakco/mcp-utils';

const limiter = new MultiTierRateLimiter([
  { windowMs: 1000, maxRequests: 10, name: 'per-second' },
  { windowMs: 60000, maxRequests: 100, name: 'per-minute' },
  { windowMs: 3600000, maxRequests: 1000, name: 'per-hour' }
]);

const result = await limiter.acquire();
if (!result.allowed) {
  console.log(`Limited by: ${result.limitedBy}`);
}
```

#### Rate-Limited Functions
```typescript
import { rateLimitFunction, debounce, throttle } from '@haakco/mcp-utils';

// Rate-limited function wrapper
const limitedAPI = rateLimitFunction(apiCall, {
  requestsPerSecond: 5,
  burst: 10
});

// Debounced function (delays execution)
const debouncedSave = debounce(saveData, 1000);

// Throttled function (limits execution frequency)
const throttledUpdate = throttle(updateUI, 100);
```

### WebSocket Utilities

#### Reconnecting WebSocket
```typescript
import { ReconnectingWebSocket } from '@haakco/mcp-utils';

const ws = new ReconnectingWebSocket({
  url: 'wss://api.example.com/ws',
  maxReconnectAttempts: 5,
  reconnectInterval: 5000,
  reconnectBackoff: 1.5,
  pingInterval: 30000
});

ws.on('open', () => console.log('Connected'));
ws.on('message', (data) => console.log('Received:', data));
ws.on('reconnecting', (attempt) => console.log(`Reconnecting... attempt ${attempt}`));

ws.send({ type: 'subscribe', channel: 'updates' });
```

#### Message Router
```typescript
import { WebSocketRouter } from '@haakco/mcp-utils';

const router = new WebSocketRouter<{ type: string; payload?: any }>();

router.on('user.created', async (message) => {
  console.log('New user:', message.payload);
});

router.on('notification', async (message) => {
  await showNotification(message.payload);
});

router.setDefaultHandler((message) => {
  console.log('Unhandled message:', message);
});

// Handle incoming messages
ws.on('message', (data) => router.handle(data));
```

#### WebSocket RPC
```typescript
import { WebSocketRPC } from '@haakco/mcp-utils';

const rpc = new WebSocketRPC(ws, {
  timeout: 30000,
  idGenerator: () => `req-${Date.now()}`
});

// Make RPC calls
const user = await rpc.call('getUser', { id: '123' });
const result = await rpc.call('updateProfile', { name: 'New Name' });
```

### Logging System

#### Basic Logger
```typescript
import { createLogger, createStructuredLogger } from '@haakco/mcp-utils';

const logger = createLogger('my-module');

logger.info('Application started');
logger.warn('Low memory warning');
logger.error('Database connection failed');
logger.debug('Debug information');
```

#### Structured Logger with Context
```typescript
const logger = createStructuredLogger('api', 'app', {
  service: 'user-service',
  version: '1.2.3'
});

logger.info('User login successful');
// Output: INFO: User login successful [{"service":"user-service","version":"1.2.3"}]

// Add context for child logger
const requestLogger = logger.child({ requestId: 'req-123', userId: 'user-456' });
requestLogger.info('Processing request');
```

#### Performance Logger
```typescript
import { createPerformanceLogger } from '@haakco/mcp-utils';

const perfLogger = createPerformanceLogger('performance');

// Manual timing
perfLogger.start('database-query');
await queryDatabase();
perfLogger.end('database-query', { query: 'SELECT * FROM users' });

// Automatic timing
const result = await perfLogger.measure(
  'api-call',
  () => fetch('/api/data').then(r => r.json()),
  { endpoint: '/api/data' }
);
```

#### Environment-based Logger
```typescript
import { createLoggerFromEnv, LogLevel, createLevelLogger } from '@haakco/mcp-utils';

// Automatically configures based on DEBUG and LOG_LEVEL env vars
const logger = createLoggerFromEnv('my-app');

// Or explicit level configuration
const logger = createLevelLogger('my-app', LogLevel.INFO);
```

## 🏗️ Advanced Usage

### Custom Tool Handler
```typescript
import { BaseToolHandler, createTextResponse, formatSuccess } from '@haakco/mcp-utils';
import { z } from 'zod';

class CustomToolHandler extends BaseToolHandler {
  constructor() {
    super('my-custom-server');
  }

  getTools() {
    return [
      this.createTool(
        'process_data',
        'Process data with validation and formatting',
        z.object({
          data: z.array(z.string()),
          format: z.enum(['json', 'table', 'list']).default('json')
        }),
        async (args) => {
          const processed = await this.processData(args.data);
          
          switch (args.format) {
            case 'table':
              return createTextResponse(formatTable(processed));
            case 'list':
              return createTextResponse(formatBulletList(processed.map(String)));
            default:
              return createTextResponse(formatSuccess(JSON.stringify(processed)));
          }
        }
      )
    ];
  }

  private async processData(data: string[]): Promise<any[]> {
    // Your custom processing logic
    return data.map(item => ({ original: item, processed: item.toUpperCase() }));
  }
}
```

### Batch Response Builder
```typescript
import { BatchResponseBuilder } from '@haakco/mcp-utils';

const response = new BatchResponseBuilder()
  .addSuccess('Connection established')
  .addInfo('Processing 150 items')
  .addSeparator()
  .add('Results:')
  .addSuccess('Created 145 items')
  .addWarning('Skipped 3 duplicates')
  .addError('Failed to create 2 items')
  .addEmptyLine()
  .addInfo('Operation completed in 2.3 seconds')
  .build();

return response; // Returns proper CallToolResult
```

### Resource Operation Mixin
```typescript
import { ResourceOperationMixin } from '@haakco/mcp-utils';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
  email: string;
}

class UserTools extends ResourceOperationMixin<User> {
  constructor(private userClient: UserClient) {
    super('user-management');
  }

  getTools() {
    return this.createResourceTools({
      resourceName: 'User',
      client: this.userClient,
      formatItem: (user) => `${user.name} <${user.email}>`,
      validateCreate: z.object({
        name: z.string().min(1),
        email: z.string().email()
      }),
      validateUpdate: z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional()
      })
    });
  }
}
```

## 📦 Integration Examples

### Express.js Integration
```typescript
import express from 'express';
import { createLogger, rateLimitFunction, SimpleCache } from '@haakco/mcp-utils';

const app = express();
const logger = createLogger('api-server');
const cache = new SimpleCache<any>(300000); // 5 minute cache

// Rate-limited endpoint
const rateLimitedHandler = rateLimitFunction(
  async (req, res) => {
    const data = await fetchData(req.params.id);
    res.json(data);
  },
  { requestsPerSecond: 10, burst: 20 }
);

app.get('/api/data/:id', async (req, res) => {
  const cached = cache.get(req.params.id);
  if (cached) {
    logger.info('Cache hit', { id: req.params.id });
    return res.json(cached);
  }

  await rateLimitedHandler(req, res);
});
```

### WebSocket Server Integration
```typescript
import WebSocket from 'ws';
import { WebSocketRouter, createLogger, TokenBucketRateLimiter } from '@haakco/mcp-utils';

const logger = createLogger('ws-server');
const rateLimiter = new TokenBucketRateLimiter(10, 1); // 10 burst, 1/sec refill

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  const router = new WebSocketRouter();
  
  router.on('message', async (data) => {
    if (await rateLimiter.acquire()) {
      await handleMessage(data);
    } else {
      ws.send(JSON.stringify({ error: 'Rate limit exceeded' }));
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      router.handle(message);
    } catch (error) {
      logger.error('Invalid message format', error);
    }
  });
});
```

## 🧪 Testing

The library includes comprehensive test coverage (85/85 tests passing):

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm test -- --testNamePattern="Cache"
npm test -- --testNamePattern="Rate.*Limiter"
```

### Test Structure
```
tests/
├── base-handler.test.ts      # Core MCP functionality
├── cache.test.ts            # All caching strategies
├── datetime.test.ts         # DateTime utilities
├── formatters.test.ts       # Formatting functions
├── response-builder.test.ts # Response building
├── task-helpers.test.ts     # Task execution
└── validators.test.ts       # Validation utilities
```

## 🚀 Development

```bash
# Install dependencies
npm install

# Run tests in watch mode
npm run test:watch

# Build the library
npm run build

# Lint and format code
npm run lint
npm run lint:fix

# Type checking
npm run type-check
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass and linting is clean
5. Submit a pull request

---

**Built with TypeScript, tested with Jest, and designed for production MCP servers.**