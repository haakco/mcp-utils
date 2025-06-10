import { z } from 'zod';
import { BaseToolHandler, type ToolDefinition } from './base-handler.js';
import { ResponseBuilder } from './response-builder.js';
import { nonEmptyString } from './validators.js';

export interface ResourceClient<T> {
  list(options?: Record<string, unknown>): Promise<T[]>;
  get(id: string): Promise<T>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface ResourceOperationOptions<T> {
  resourceName: string;
  resourceNamePlural?: string;
  client: ResourceClient<T>;
  formatItem: (item: T) => string;
  validateCreate?: z.ZodSchema;
  validateUpdate?: z.ZodSchema;
}

export abstract class ResourceOperationMixin<T> extends BaseToolHandler {
  protected createResourceTools(options: ResourceOperationOptions<T>): ToolDefinition[] {
    const {
      resourceName,
      resourceNamePlural = `${resourceName}s`,
      client,
      formatItem,
      validateCreate,
      validateUpdate
    } = options;

    const tools: ToolDefinition[] = [];

    // List operation
    tools.push(
      this.createTool(
        `list_${resourceNamePlural.toLowerCase()}`,
        `List all ${resourceNamePlural}`,
        z.object({
          filter: z.record(z.string()).optional()
        }),
        async (args) => {
          const items = await client.list(args.filter);

          if (items.length === 0) {
            return ResponseBuilder.success(`No ${resourceNamePlural} found`);
          }

          return ResponseBuilder.list(
            items.map((item) => ({
              label: formatItem(item)
            })),
            `${resourceNamePlural} (${items.length} found):`
          );
        }
      )
    );

    // Get operation
    tools.push(
      this.createTool(
        `get_${resourceName.toLowerCase()}`,
        `Get details of a specific ${resourceName}`,
        z.object({
          id: nonEmptyString.describe(`${resourceName} ID`)
        }),
        async (args) => {
          const item = await client.get(args.id);
          return ResponseBuilder.json(item, `${resourceName} details:`);
        }
      )
    );

    // Create operation
    if (validateCreate) {
      tools.push(
        this.createTool(
          `create_${resourceName.toLowerCase()}`,
          `Create a new ${resourceName}`,
          validateCreate,
          async (args) => {
            const created = await client.create(args as Partial<T>);
            return ResponseBuilder.success(
              `${resourceName} created successfully:\n${formatItem(created)}`
            );
          }
        )
      );
    }

    // Update operation
    if (validateUpdate) {
      tools.push(
        this.createTool(
          `update_${resourceName.toLowerCase()}`,
          `Update an existing ${resourceName}`,
          z.object({
            id: nonEmptyString.describe(`${resourceName} ID`),
            data: validateUpdate
          }),
          async (args) => {
            const updated = await client.update(args.id, args.data as Partial<T>);
            return ResponseBuilder.success(
              `${resourceName} updated successfully:\n${formatItem(updated)}`
            );
          }
        )
      );
    }

    // Delete operation
    tools.push(
      this.createTool(
        `delete_${resourceName.toLowerCase()}`,
        `Delete a ${resourceName}`,
        z.object({
          id: nonEmptyString.describe(`${resourceName} ID`),
          force: z.boolean().optional().describe('Force deletion')
        }),
        async (args) => {
          await client.delete(args.id);
          return ResponseBuilder.success(`${resourceName} deleted successfully`);
        }
      )
    );

    return tools;
  }

  protected createBulkOperationTools<T>(
    options: ResourceOperationOptions<T> & {
      bulkCreate?: (items: Partial<T>[]) => Promise<T[]>;
      bulkUpdate?: (updates: Array<{ id: string; data: Partial<T> }>) => Promise<T[]>;
      bulkDelete?: (ids: string[]) => Promise<void>;
    }
  ): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    const { resourceName, resourceNamePlural = `${resourceName}s`, formatItem } = options;

    if (options.bulkCreate && options.validateCreate) {
      tools.push(
        this.createTool(
          `bulk_create_${resourceNamePlural.toLowerCase()}`,
          `Create multiple ${resourceNamePlural} at once`,
          z.object({
            items: z.array(options.validateCreate)
          }),
          async (args) => {
            const created = await options.bulkCreate!(args.items as Partial<T>[]);
            return ResponseBuilder.multipart([
              {
                type: 'text',
                data: `Created ${created.length} ${resourceNamePlural} successfully:`
              },
              {
                type: 'list',
                data: created.map((item) => ({
                  label: formatItem(item)
                }))
              }
            ]);
          }
        )
      );
    }

    if (options.bulkDelete) {
      tools.push(
        this.createTool(
          `bulk_delete_${resourceNamePlural.toLowerCase()}`,
          `Delete multiple ${resourceNamePlural} at once`,
          z.object({
            ids: z.array(nonEmptyString).min(1)
          }),
          async (args) => {
            await options.bulkDelete!(args.ids);
            return ResponseBuilder.success(
              `Deleted ${args.ids.length} ${resourceNamePlural} successfully`
            );
          }
        )
      );
    }

    return tools;
  }

  protected createSearchTool<T>(
    resourceName: string,
    searchFn: (query: string) => Promise<T[]>,
    formatItem: (item: T) => string
  ): ToolDefinition {
    return this.createTool(
      `search_${resourceName.toLowerCase()}`,
      `Search for ${resourceName} by query`,
      z.object({
        query: nonEmptyString.describe('Search query'),
        limit: z.number().positive().max(100).optional()
      }),
      async (args) => {
        const results = await searchFn(args.query);
        const limited = args.limit ? results.slice(0, args.limit) : results;

        if (limited.length === 0) {
          return ResponseBuilder.success(`No ${resourceName} found matching "${args.query}"`);
        }

        return ResponseBuilder.list(
          limited.map((item) => ({
            label: formatItem(item)
          })),
          `Found ${limited.length} ${resourceName}:`
        );
      }
    );
  }
}
