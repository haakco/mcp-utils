/**
 * Common formatting utilities for MCP servers
 */

/**
 * Format success message with checkmark
 */
export function formatSuccess(message: string): string {
  return `✅ ${message}`;
}

/**
 * Format error message with X
 */
export function formatError(message: string): string {
  return `❌ Error: ${message}`;
}

/**
 * Format warning message with warning sign
 */
export function formatWarning(message: string): string {
  return `⚠️ Warning: ${message}`;
}

/**
 * Format info message with info sign
 */
export function formatInfo(message: string): string {
  return `ℹ️ ${message}`;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format bytes for Kubernetes (using Ki, Mi, Gi)
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))}${sizes[i]}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, total: number, decimals = 2): string {
  if (total === 0) return '0%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Format CPU usage as percentage
 */
export function formatCPU(usage: number): string {
  return `${(usage * 100).toFixed(2)}%`;
}

/**
 * Format JSON data with proper indentation
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Truncate text to specified length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength - 3)}...`;
}

/**
 * Format list of items with separator
 */
export function formatList(items: string[], separator = ', '): string {
  return items.filter(Boolean).join(separator);
}

/**
 * Format list as bullet points
 */
export function formatBulletList(items: string[]): string {
  return items.map((item) => `• ${item}`).join('\n');
}

/**
 * Sanitize value for table display
 */
export function sanitizeForTable(value: unknown): string {
  if (value === null || value === undefined) return '<none>';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Format resource status with emoji
 */
export function formatResourceStatus(status: string): string {
  const statusMap: Record<string, string> = {
    running: '🟢 Running',
    stopped: '🔴 Stopped',
    paused: '🟡 Paused',
    pending: '🟠 Pending',
    starting: '🔵 Starting',
    stopping: '🟣 Stopping',
    failed: '❌ Failed',
    completed: '✅ Completed',
    terminated: '⚫ Terminated',
    unknown: '❓ Unknown'
  };

  return statusMap[status.toLowerCase()] || `❔ ${status}`;
}

/**
 * Format key-value pairs for display
 */
export function formatKeyValue(key: string, value: unknown): string {
  return `${key}: ${sanitizeForTable(value)}`;
}

/**
 * Format array of objects as a table
 */
export function formatTable(data: Array<Record<string, unknown>>): string {
  if (data.length === 0) return 'No data';

  const firstItem = data[0];
  if (!firstItem) return 'No data';

  const headers = Object.keys(firstItem);
  const rows = data.map((item) => headers.map((header) => sanitizeForTable(item[header])));

  // Calculate column widths
  const columnWidths = headers.map((header, index) => {
    const headerWidth = header.length;
    const maxDataWidth = Math.max(...rows.map((row) => row[index]?.length ?? 0));
    return Math.max(headerWidth, maxDataWidth);
  });

  // Format header
  const headerRow = headers
    .map((header, index) => header.padEnd(columnWidths[index] ?? 0))
    .join(' | ');
  const separator = columnWidths.map((width) => '-'.repeat(width)).join('-|-');

  // Format data rows
  const dataRows = rows
    .map((row) => row.map((cell, index) => cell.padEnd(columnWidths[index] ?? 0)).join(' | '))
    .join('\n');

  return `${headerRow}\n${separator}\n${dataRows}`;
}

/**
 * Format a simple key-value table
 */
export function formatSimpleTable(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return 'No data';

  const maxKeyLength = Math.max(...entries.map(([key]) => key.length));

  return entries
    .map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      return `${paddedKey} : ${sanitizeForTable(value)}`;
    })
    .join('\n');
}
