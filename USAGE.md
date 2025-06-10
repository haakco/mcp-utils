# Usage Guide: @haakco/mcp-utils

This guide provides practical examples and patterns for using mcp-utils in your MCP servers.

## Table of Contents

1. [Basic MCP Server Setup](#basic-mcp-server-setup)
2. [Tool Creation Patterns](#tool-creation-patterns)
3. [Error Handling](#error-handling)
4. [Response Formatting](#response-formatting)
5. [Caching Strategies](#caching-strategies)
6. [Rate Limiting](#rate-limiting)
7. [WebSocket Integration](#websocket-integration)
8. [Logging Best Practices](#logging-best-practices)
9. [Performance Optimization](#performance-optimization)
10. [Testing Your Tools](#testing-your-tools)

## Basic MCP Server Setup

### Simple MCP Server

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  BaseToolHandler,
  createTextResponse,
  createErrorResponse,
  formatSuccess,
  createLogger
} from '@haakco/mcp-utils';
import { z } from 'zod';

class ExampleMCPServer extends BaseToolHandler {
  private logger = createLogger('example-server');

  constructor() {
    super('example-mcp-server');
  }

  getTools() {
    return [
      this.createTool(
        'echo',
        'Echo back the input message',
        z.object({
          message: z.string().describe('Message to echo back')
        }),
        async (args) => {
          this.logger.info('Echo tool called', { message: args.message });
          return createTextResponse(formatSuccess(`Echo: ${args.message}`));
        }
      )
    ];
  }
}

// Server setup
const server = new McpServer({
  name: 'example-server',
  version: '1.0.0'
});

const toolHandler = new ExampleMCPServer();
const tools = toolHandler.getTools();

// Register tools
tools.forEach(tool => {
  server.tool(tool.name, tool.schema, tool.handler);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
```

### Multi-Instance Server

```typescript
import {
  InstanceManager,
  createInstanceManager,
  BaseToolHandler,
  createTextResponse,
  validateRequiredArgs
} from '@haakco/mcp-utils';

interface ServiceConfig {
  name: string;
  url: string;
  apiKey: string;
}

class MultiServiceServer extends BaseToolHandler {
  private instanceManager: InstanceManager<ServiceConfig>;

  constructor() {
    super('multi-service-server');
    this.instanceManager = createInstanceManager<ServiceConfig>({
      validateConfig: (config) => {
        // Validate configuration
        if (!config.name || !config.url || !config.apiKey) {
          throw new Error('Missing required configuration fields');
        }
        return config;
      }
    });
  }

  getTools() {
    return [
      this.createTool(
        'add_instance',
        'Add a new service instance',
        z.object({
          name: z.string(),
          url: z.string().url(),
          apiKey: z.string()
        }),
        async (args) => {
          await this.instanceManager.addInstance(args.name, args);
          return createTextResponse(formatSuccess(`Instance '${args.name}' added successfully`));
        }
      ),

      this.createTool(
        'list_instances',
        'List all configured instances',
        z.object({}),
        async () => {
          const instances = this.instanceManager.listInstances();
          const list = instances.map(name => `• ${name}`).join('\n');
          return createTextResponse(`Configured instances:\n${list}`);
        }
      ),

      this.createTool(
        'use_instance',
        'Switch to a specific instance',
        z.object({
          name: z.string().describe('Instance name to switch to')
        }),
        async (args) => {
          this.instanceManager.switchInstance(args.name);
          return createTextResponse(formatSuccess(`Switched to instance '${args.name}'`));
        }
      )
    ];
  }
}
```

## Tool Creation Patterns

### Data Processing Tool

```typescript
import {
  BaseToolHandler,
  createTextResponse,
  createErrorResponse,
  formatSuccess,
  formatTable,
  validateToolArgs,
  SimpleCache
} from '@haakco/mcp-utils';

class DataProcessorServer extends BaseToolHandler {
  private cache = new SimpleCache<any>(300000); // 5 minute cache

  constructor() {
    super('data-processor');
  }

  getTools() {
    return [
      this.createTool(
        'process_csv_data',
        'Process CSV data and return formatted results',
        z.object({
          data: z.string().describe('CSV data to process'),
          operation: z.enum(['count', 'sum', 'average', 'group']).describe('Operation to perform'),
          column: z.string().optional().describe('Column to operate on (for sum/average)'),
          groupBy: z.string().optional().describe('Column to group by (for group operation)')
        }),
        async (args) => {
          try {
            // Check cache first
            const cacheKey = `csv:${Buffer.from(args.data).toString('base64')}:${args.operation}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
              return createTextResponse(`${formatSuccess('Data processed (cached)')}\n\n${formatTable(cached)}`);
            }

            // Process data
            const rows = this.parseCSV(args.data);
            let result;

            switch (args.operation) {
              case 'count':
                result = [{ metric: 'Total Rows', value: rows.length }];
                break;
              
              case 'sum':
                if (!args.column) throw new Error('Column required for sum operation');
                const sum = rows.reduce((acc, row) => acc + (Number(row[args.column!]) || 0), 0);
                result = [{ metric: `Sum of ${args.column}`, value: sum }];
                break;
              
              case 'average':
                if (!args.column) throw new Error('Column required for average operation');
                const values = rows.map(row => Number(row[args.column!]) || 0);
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                result = [{ metric: `Average of ${args.column}`, value: avg.toFixed(2) }];
                break;
              
              case 'group':
                if (!args.groupBy) throw new Error('GroupBy column required for group operation');
                const grouped = rows.reduce((acc, row) => {
                  const key = row[args.groupBy!] || 'Unknown';
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);
                result = Object.entries(grouped).map(([group, count]) => ({ group, count }));
                break;
            }

            // Cache result
            this.cache.set(cacheKey, result);

            return createTextResponse(`${formatSuccess('Data processed successfully')}\n\n${formatTable(result)}`);
          } catch (error) {
            return createErrorResponse(error);
          }
        }
      )
    ];
  }

  private parseCSV(data: string): Record<string, string>[] {
    const lines = data.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {} as Record<string, string>);
    });
  }
}
```

### API Integration Tool

```typescript
import {
  BaseToolHandler,
  createTextResponse,
  createErrorResponse,
  formatSuccess,
  formatTable,
  formatList,
  TokenBucketRateLimiter,
  createLogger,
  LRUCache
} from '@haakco/mcp-utils';

class APIIntegrationServer extends BaseToolHandler {
  private rateLimiter = new TokenBucketRateLimiter(10, 2); // 10 burst, 2/sec refill
  private cache = new LRUCache<any>(100);
  private logger = createLogger('api-integration');

  constructor() {
    super('api-integration');
  }

  getTools() {
    return [
      this.createTool(
        'fetch_user_data',
        'Fetch user data from external API',
        z.object({
          userId: z.string().describe('User ID to fetch'),
          includeDetails: z.boolean().default(false).describe('Include detailed information')
        }),
        async (args) => {
          try {
            // Rate limiting
            if (!(await this.rateLimiter.acquire())) {
              return createErrorResponse('Rate limit exceeded. Please try again later.');
            }

            // Check cache
            const cacheKey = `user:${args.userId}:${args.includeDetails}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
              this.logger.info('Cache hit', { userId: args.userId });
              return createTextResponse(`${formatSuccess('User data (cached)')}\n\n${formatTable([cached])}`);
            }

            // Fetch from API
            this.logger.info('Fetching user data', { userId: args.userId });
            const userData = await this.fetchUserFromAPI(args.userId, args.includeDetails);

            // Cache result
            this.cache.set(cacheKey, userData);

            return createTextResponse(`${formatSuccess('User data fetched')}\n\n${formatTable([userData])}`);
          } catch (error) {
            this.logger.error('Failed to fetch user data', { userId: args.userId, error });
            return createErrorResponse(error);
          }
        }
      ),

      this.createTool(
        'search_users',
        'Search for users by criteria',
        z.object({
          query: z.string().describe('Search query'),
          limit: z.number().min(1).max(50).default(10).describe('Maximum results to return')
        }),
        async (args) => {
          try {
            if (!(await this.rateLimiter.acquire(2))) { // Search requires 2 tokens
              return createErrorResponse('Rate limit exceeded. Please try again later.');
            }

            const results = await this.searchUsersAPI(args.query, args.limit);
            
            if (results.length === 0) {
              return createTextResponse(`No users found for query: "${args.query}"`);
            }

            const userList = results.map(user => `${user.name} (${user.email}) - ID: ${user.id}`);
            return createTextResponse(`${formatSuccess(`Found ${results.length} users`)}\n\n${formatList(userList)}`);
          } catch (error) {
            this.logger.error('Search failed', { query: args.query, error });
            return createErrorResponse(error);
          }
        }
      )
    ];
  }

  private async fetchUserFromAPI(userId: string, includeDetails: boolean): Promise<any> {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const user = {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`,
      status: 'active'
    };

    if (includeDetails) {
      Object.assign(user, {
        lastLogin: new Date().toISOString(),
        profileComplete: true,
        preferences: { theme: 'dark', notifications: true }
      });
    }

    return user;
  }

  private async searchUsersAPI(query: string, limit: number): Promise<any[]> {
    // Simulate API search
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `search-${i + 1}`,
      name: `${query} User ${i + 1}`,
      email: `${query.toLowerCase()}user${i + 1}@example.com`
    }));
  }
}
```

## Error Handling

### Comprehensive Error Handling

```typescript
import {
  BaseToolHandler,
  createTextResponse,
  createErrorResponse,
  createWarningResponse,
  formatError,
  ValidationError,
  ConnectionError,
  RateLimitError,
  executeToolSafely
} from '@haakco/mcp-utils';

class RobustServer extends BaseToolHandler {
  constructor() {
    super('robust-server');
  }

  getTools() {
    return [
      this.createTool(
        'safe_operation',
        'Demonstrates comprehensive error handling',
        z.object({
          operation: z.enum(['success', 'validation_error', 'connection_error', 'rate_limit', 'unknown_error']),
          data: z.string().optional()
        }),
        async (args) => {
          return executeToolSafely(
            async () => {
              switch (args.operation) {
                case 'success':
                  return createTextResponse(formatSuccess('Operation completed successfully'));
                
                case 'validation_error':
                  throw new ValidationError('Invalid data provided', { field: 'data', value: args.data });
                
                case 'connection_error':
                  throw new ConnectionError('Failed to connect to external service', { service: 'example-api' });
                
                case 'rate_limit':
                  throw new RateLimitError('Rate limit exceeded', { retryAfter: 60 });
                
                case 'unknown_error':
                  throw new Error('Something unexpected happened');
                
                default:
                  return createTextResponse('Unknown operation');
              }
            },
            'safe_operation'
          );
        }
      ),

      this.createTool(
        'validate_and_process',
        'Validates input and processes data with proper error handling',
        z.object({
          email: z.string().email().describe('Email address to validate'),
          age: z.number().min(0).max(150).describe('Age in years'),
          preferences: z.record(z.any()).optional().describe('User preferences')
        }),
        async (args) => {
          try {
            // Additional validation beyond schema
            if (args.email.endsWith('@test.com')) {
              return createWarningResponse('Test email domains are not recommended for production');
            }

            if (args.age < 13) {
              throw new ValidationError('Users must be at least 13 years old', { 
                field: 'age', 
                value: args.age,
                minimum: 13 
              });
            }

            // Process the validated data
            const result = {
              status: 'validated',
              email: args.email,
              ageGroup: this.getAgeGroup(args.age),
              preferences: args.preferences || {}
            };

            return createTextResponse(`${formatSuccess('Validation passed')}\n\n${JSON.stringify(result, null, 2)}`);
          } catch (error) {
            if (error instanceof ValidationError) {
              return createErrorResponse(`Validation failed: ${error.message}`);
            }
            return createErrorResponse(`Unexpected error: ${error.message}`);
          }
        }
      )
    ];
  }

  private getAgeGroup(age: number): string {
    if (age < 18) return 'minor';
    if (age < 65) return 'adult';
    return 'senior';
  }
}
```

## Response Formatting

### Rich Response Formatting

```typescript
import {
  BaseToolHandler,
  createTextResponse,
  formatSuccess,
  formatWarning,
  formatInfo,
  formatTable,
  formatSimpleTable,
  formatBulletList,
  formatBytes,
  formatPercentage,
  BatchResponseBuilder
} from '@haakco/mcp-utils';

class FormattingServer extends BaseToolHandler {
  constructor() {
    super('formatting-server');
  }

  getTools() {
    return [
      this.createTool(
        'system_status',
        'Get comprehensive system status with rich formatting',
        z.object({}),
        async () => {
          const systemData = await this.getSystemData();

          const response = new BatchResponseBuilder()
            .addSuccess('System Status Report Generated')
            .addEmptyLine()
            .addInfo('System Overview')
            .add(formatSimpleTable({
              'Hostname': systemData.hostname,
              'Uptime': systemData.uptime,
              'Load Average': systemData.loadAvg,
              'Memory Usage': systemData.memoryUsage
            }))
            .addEmptyLine()
            .addInfo('Service Status')
            .add(formatTable(systemData.services))
            .addEmptyLine()
            .addInfo('Recent Alerts')
            .add(formatBulletList(systemData.alerts))
            .build();

          return response;
        }
      ),

      this.createTool(
        'storage_report',
        'Generate detailed storage usage report',
        z.object({
          includeDetails: z.boolean().default(false).describe('Include detailed breakdown')
        }),
        async (args) => {
          const storageData = await this.getStorageData();

          let content = formatSuccess('Storage Report Generated') + '\n\n';

          // Overview table
          content += 'Storage Overview:\n';
          const overview = storageData.volumes.map(vol => ({
            'Volume': vol.name,
            'Size': formatBytes(vol.total),
            'Used': formatBytes(vol.used),
            'Available': formatBytes(vol.available),
            'Usage': formatPercentage(vol.used, vol.total)
          }));
          content += formatTable(overview) + '\n\n';

          if (args.includeDetails) {
            content += formatInfo('Detailed Breakdown') + '\n';
            storageData.volumes.forEach(vol => {
              content += `\n${vol.name}:\n`;
              content += formatSimpleTable({
                'Total Space': formatBytes(vol.total),
                'Used Space': formatBytes(vol.used),
                'Free Space': formatBytes(vol.available),
                'Usage Percentage': formatPercentage(vol.used, vol.total),
                'Mount Point': vol.mountPoint,
                'File System': vol.fileSystem
              }) + '\n';
            });
          }

          // Warnings for high usage
          const highUsage = storageData.volumes.filter(vol => (vol.used / vol.total) > 0.8);
          if (highUsage.length > 0) {
            content += '\n' + formatWarning('High Usage Alert') + '\n';
            const warnings = highUsage.map(vol => 
              `${vol.name}: ${formatPercentage(vol.used, vol.total)} usage`
            );
            content += formatBulletList(warnings);
          }

          return createTextResponse(content);
        }
      )
    ];
  }

  private async getSystemData() {
    // Simulate system data gathering
    return {
      hostname: 'server-01',
      uptime: '15 days, 4 hours',
      loadAvg: '0.45, 0.52, 0.48',
      memoryUsage: '4.2GB / 8GB (52%)',
      services: [
        { name: 'nginx', status: 'Running', port: 80, cpu: '0.1%', memory: '24MB' },
        { name: 'postgresql', status: 'Running', port: 5432, cpu: '0.5%', memory: '156MB' },
        { name: 'redis', status: 'Running', port: 6379, cpu: '0.1%', memory: '12MB' },
        { name: 'backup-service', status: 'Stopped', port: '-', cpu: '0%', memory: '0MB' }
      ],
      alerts: [
        'Disk usage on /var/log reached 85%',
        'SSL certificate expires in 30 days',
        'Backup service stopped unexpectedly'
      ]
    };
  }

  private async getStorageData() {
    return {
      volumes: [
        {
          name: '/dev/sda1',
          mountPoint: '/',
          fileSystem: 'ext4',
          total: 107374182400, // 100GB
          used: 53687091200,   // 50GB
          available: 53687091200 // 50GB
        },
        {
          name: '/dev/sdb1',
          mountPoint: '/var',
          fileSystem: 'ext4',
          total: 53687091200,  // 50GB
          used: 45964395264,   // 42.8GB (85% usage)
          available: 7722696936 // 7.2GB
        }
      ]
    };
  }
}
```

## Local Development Setup

To use mcp-utils in other MCP servers within this repository:

### 1. Update the consumer's package.json

In your MCP server (e.g., kubernetes-mcp), add the dependency:

```json
{
  "dependencies": {
    "@haakco/mcp-utils": "file:../mcp-utils"
  }
}
```

### 2. Install dependencies

```bash
cd mcp-servers/your-server
npm install
```

### 3. Import and use the utilities

```typescript
import { 
  BaseToolHandler, 
  ResponseBuilder, 
  TaskExecutor,
  nonEmptyString 
} from '@haakco/mcp-utils';
```

## Example Refactoring

Here's how to refactor a tool handler to use mcp-utils:

### Before (with duplicate code):
```typescript
export async function handleListPods(args: unknown): Promise<CallToolResult> {
  try {
    const parsed = listPodsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        content: [{
          type: 'text',
          text: `Error: Invalid arguments - ${parsed.error.message}`
        }]
      };
    }
    
    const pods = await k8sClient.listPods(parsed.data);
    return {
      content: [{
        type: 'text',
        text: formatPodList(pods)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }]
    };
  }
}
```

### After (using mcp-utils):
```typescript
import { BaseToolHandler, ResponseBuilder } from '@haakco/mcp-utils';

class PodTools extends BaseToolHandler {
  constructor(private k8sClient: K8sClient) {
    super('mcp:k8s:pods');
  }

  getTools() {
    return [
      this.createTool(
        'list_pods',
        'List pods in a namespace',
        listPodsSchema,
        async (args) => {
          const pods = await this.k8sClient.listPods(args);
          return ResponseBuilder.table({
            headers: ['Name', 'Status', 'Ready', 'Age'],
            rows: pods.map(pod => [
              pod.name,
              pod.status,
              pod.ready,
              pod.age
            ])
          }, `Pods in ${args.namespace}:`);
        }
      )
    ];
  }
}
```

## Benefits

1. **Automatic error handling** - No need for try/catch blocks
2. **Automatic validation** - Arguments validated before handler runs
3. **Consistent responses** - Use ResponseBuilder for formatted output
4. **Debug logging** - Built-in debug logging with namespaces
5. **Retry logic** - Built-in retry support with withRetry()

## Publishing (Future)

When ready to publish to npm:

1. Update version in package.json
2. Build: `npm run build`
3. Publish: `npm publish --access public`

Then update consumers to use the npm package instead of file reference.