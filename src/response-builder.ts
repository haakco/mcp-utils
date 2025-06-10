import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ListItem {
  label: string;
  value?: string | number | boolean;
  nested?: ListItem[];
}

export class ResponseBuilder {
  static error(message: string, details?: unknown): CallToolResult {
    const content: CallToolResult['content'] = [
      {
        type: 'text',
        text: `Error: ${message}`
      }
    ];

    if (details) {
      content.push({
        type: 'text',
        text: `\nDetails:\n${JSON.stringify(details, null, 2)}`
      });
    }

    return { content };
  }

  static success(message: string): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: message
        }
      ]
    };
  }

  static json(data: unknown, title?: string): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (title) {
      content.push({
        type: 'text',
        text: title
      });
    }

    content.push({
      type: 'text',
      text: '```json\n' + JSON.stringify(data, null, 2) + '\n```'
    });

    return { content };
  }

  static yaml(data: unknown, title?: string): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (title) {
      content.push({
        type: 'text',
        text: title
      });
    }

    // Simple YAML serialization for common cases
    const yamlString = this.toSimpleYaml(data);

    content.push({
      type: 'text',
      text: '```yaml\n' + yamlString + '\n```'
    });

    return { content };
  }

  static table(data: TableData, title?: string): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (title) {
      content.push({
        type: 'text',
        text: title
      });
    }

    // Calculate column widths
    const widths = data.headers.map((header, i) => {
      const headerLen = header.length;
      const maxRowLen = Math.max(...data.rows.map((row) => String(row[i] || '').length));
      return Math.max(headerLen, maxRowLen);
    });

    // Build table
    const separator = widths.map((w) => '-'.repeat(w)).join(' | ');
    const headerRow = data.headers.map((h, i) => h.padEnd(widths[i]!)).join(' | ');

    let tableText = `${headerRow}\n${separator}`;

    for (const row of data.rows) {
      const rowText = row.map((cell, i) => String(cell || '').padEnd(widths[i]!)).join(' | ');
      tableText += `\n${rowText}`;
    }

    content.push({
      type: 'text',
      text: tableText
    });

    return { content };
  }

  static list(items: ListItem[], title?: string, numbered = false): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (title) {
      content.push({
        type: 'text',
        text: title
      });
    }

    const formatItems = (items: ListItem[], indent = 0, parentNumber = ''): string => {
      return items
        .map((item, i) => {
          const prefix = '  '.repeat(indent);
          const bullet = numbered ? `${parentNumber}${i + 1}.` : '-';
          let line = `${prefix}${bullet} ${item.label}`;

          if (item.value !== undefined) {
            line += `: ${item.value}`;
          }

          if (item.nested && item.nested.length > 0) {
            const nestedNumber = numbered ? `${parentNumber}${i + 1}.` : '';
            line += '\n' + formatItems(item.nested, indent + 1, nestedNumber);
          }

          return line;
        })
        .join('\n');
    };

    content.push({
      type: 'text',
      text: formatItems(items)
    });

    return { content };
  }

  static progress(
    percentage: number,
    message: string,
    details?: Record<string, unknown>
  ): CallToolResult;
  static progress(current: number, total: number, message: string): CallToolResult;
  static progress(
    arg1: number,
    arg2: number | string,
    arg3?: string | Record<string, unknown>
  ): CallToolResult {
    let percentage: number;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (typeof arg2 === 'string') {
      // progress(percentage, message, details) overload
      percentage = Math.max(0, Math.min(100, arg1));
      message = arg2;
      details = arg3 as Record<string, unknown> | undefined;
    } else {
      // progress(current, total, message) overload
      percentage = Math.round((arg1 / arg2) * 100);
      message = arg3 as string;
    }

    const filled = Math.floor(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    let text = `${message}\n[${bar}] ${percentage}%`;

    if (typeof arg2 === 'number' && typeof arg3 === 'string') {
      text += ` (${arg1}/${arg2})`;
    }

    if (details) {
      const detailsText = Object.entries(details)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      text += `\n${detailsText}`;
    }

    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }

  static multipart(
    parts: Array<{
      type: 'text' | 'json' | 'yaml' | 'table' | 'list';
      data: unknown;
      title?: string;
    }>
  ): CallToolResult {
    const content: CallToolResult['content'] = [];

    for (const part of parts) {
      switch (part.type) {
        case 'text':
          content.push({
            type: 'text',
            text: String(part.data)
          });
          break;

        case 'json': {
          const jsonResult = this.json(part.data, part.title);
          content.push(...jsonResult.content);
          break;
        }

        case 'yaml': {
          const yamlResult = this.yaml(part.data, part.title);
          content.push(...yamlResult.content);
          break;
        }

        case 'table': {
          const tableResult = this.table(part.data as TableData, part.title);
          content.push(...tableResult.content);
          break;
        }

        case 'list': {
          const listResult = this.list(part.data as ListItem[], part.title);
          content.push(...listResult.content);
          break;
        }
      }
    }

    return { content };
  }

  private static toSimpleYaml(data: unknown, indent = 0): string {
    const prefix = '  '.repeat(indent);

    if (data === null || data === undefined) {
      return 'null';
    }

    if (typeof data === 'string') {
      return data.includes('\n') || data.includes(':') || data.includes('"')
        ? `"${data.replace(/"/g, '\\"')}"`
        : data;
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return String(data);
    }

    if (Array.isArray(data)) {
      return data
        .map((item) => {
          const value = this.toSimpleYaml(item, indent + 1);
          return `${prefix}- ${value}`;
        })
        .join('\n');
    }

    if (typeof data === 'object') {
      return Object.entries(data as Record<string, unknown>)
        .map(([key, value]) => {
          if (value === null || value === undefined) {
            return `${prefix}${key}: null`;
          }

          if (typeof value === 'object' && !Array.isArray(value)) {
            return `${prefix}${key}:\n${this.toSimpleYaml(value, indent + 1)}`;
          }

          if (Array.isArray(value)) {
            return `${prefix}${key}:\n${this.toSimpleYaml(value, indent + 1)}`;
          }

          return `${prefix}${key}: ${this.toSimpleYaml(value, indent)}`;
        })
        .join('\n');
    }

    return String(data);
  }

  /**
   * Format data as a table from array of objects
   */
  static tableFromObjects(data: Record<string, unknown>[], headers?: string[]): CallToolResult {
    if (data.length === 0) {
      return this.success('No data available');
    }

    const allKeys = Array.from(new Set(data.flatMap((obj) => Object.keys(obj))));
    const tableHeaders = headers || allKeys;

    const tableData: TableData = {
      headers: tableHeaders,
      rows: data.map((obj) =>
        tableHeaders.map((header) => {
          const value = obj[header];
          if (value === null || value === undefined) {
            return '';
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        })
      )
    };

    return this.table(tableData);
  }

  /**
   * Create a formatted status response
   */
  static status(
    status: 'success' | 'warning' | 'error' | 'info',
    message: string,
    details?: Record<string, unknown>
  ): CallToolResult {
    const icons = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️'
    };

    let text = `${icons[status]} ${message}`;

    if (details) {
      const detailsText = Object.entries(details)
        .map(([key, value]) => `  ${key}: ${value}`)
        .join('\n');
      text += `\n${detailsText}`;
    }

    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }

  /**
   * Create a diff-style response
   */
  static diff(before: string, after: string, title?: string): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (title) {
      content.push({
        type: 'text',
        text: title
      });
    }

    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    let diffText = '```diff\n';

    // Simple line-by-line diff
    const maxLines = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < maxLines; i++) {
      const beforeLine = beforeLines[i] || '';
      const afterLine = afterLines[i] || '';

      if (beforeLine !== afterLine) {
        if (beforeLine) {
          diffText += `- ${beforeLine}\n`;
        }
        if (afterLine) {
          diffText += `+ ${afterLine}\n`;
        }
      } else {
        diffText += `  ${beforeLine}\n`;
      }
    }

    diffText += '```';

    content.push({
      type: 'text',
      text: diffText
    });

    return { content };
  }

  /**
   * Create a code block with syntax highlighting
   */
  static code(code: string, language = '', title?: string): CallToolResult {
    const content: CallToolResult['content'] = [];

    if (title) {
      content.push({
        type: 'text',
        text: title
      });
    }

    content.push({
      type: 'text',
      text: `\`\`\`${language}\n${code}\n\`\`\``
    });

    return { content };
  }

  /**
   * Create a collapsible section
   */
  static collapsible(title: string, content: string, expanded = false): CallToolResult {
    const marker = expanded ? '▼' : '▶';
    const text = expanded
      ? `${marker} ${title}\n${content}`
      : `${marker} ${title} (click to expand)`;

    return {
      content: [
        {
          type: 'text',
          text
        }
      ]
    };
  }

  /**
   * Create a warning response
   */
  static warning(message: string, details?: string): CallToolResult {
    return this.status('warning', message, details ? { details } : undefined);
  }

  /**
   * Create an info response
   */
  static info(message: string, details?: Record<string, unknown>): CallToolResult {
    return this.status('info', message, details);
  }

  /**
   * Create a summary response with multiple sections
   */
  static summary(
    sections: Array<{
      title: string;
      content: string;
      type?: 'success' | 'warning' | 'error' | 'info';
    }>
  ): CallToolResult {
    const content: CallToolResult['content'] = [];

    for (const section of sections) {
      const icon = section.type
        ? {
            success: '✅',
            warning: '⚠️',
            error: '❌',
            info: 'ℹ️'
          }[section.type]
        : '';

      content.push({
        type: 'text',
        text: `${icon ? `${icon} ` : ''}**${section.title}**\n${section.content}\n`
      });
    }

    return { content };
  }
}
