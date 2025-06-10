/**
 * Date and time utilities for MCP servers
 */

/**
 * Format duration in human readable format
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format duration from seconds
 */
export function formatDurationFromSeconds(seconds: number): string {
  return formatDuration(seconds * 1000);
}

/**
 * Format age from creation timestamp
 */
export function formatAge(creationTimestamp?: string | Date | number): string {
  if (!creationTimestamp) return 'unknown';

  const created =
    typeof creationTimestamp === 'number'
      ? new Date(creationTimestamp)
      : creationTimestamp instanceof Date
        ? creationTimestamp
        : new Date(creationTimestamp);

  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(date: string | Date | number): string {
  const timestamp =
    typeof date === 'number'
      ? date
      : date instanceof Date
        ? date.getTime()
        : new Date(date).getTime();

  const now = Date.now();
  const diffMs = now - timestamp;
  const absDiff = Math.abs(diffMs);

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let result: string;

  if (days > 0) {
    result = days === 1 ? '1 day' : `${days} days`;
  } else if (hours > 0) {
    result = hours === 1 ? '1 hour' : `${hours} hours`;
  } else if (minutes > 0) {
    result = minutes === 1 ? '1 minute' : `${minutes} minutes`;
  } else {
    result = seconds === 1 ? '1 second' : `${seconds} seconds`;
  }

  return diffMs < 0 ? `in ${result}` : `${result} ago`;
}

/**
 * Format uptime from seconds
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
  } else if (hours > 0) {
    parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
  } else {
    parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);
  }

  return parts.join(' ');
}

/**
 * Format timestamp to ISO string
 */
export function formatTimestamp(timestamp: number | string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toISOString();
}

/**
 * Format timestamp to local date/time string
 */
export function formatLocalDateTime(timestamp: number | string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Format date only (no time)
 */
export function formatDate(date: number | string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString();
}

/**
 * Format time only (no date)
 */
export function formatTime(date: number | string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString();
}

/**
 * Parse duration string (e.g., "1h30m", "2d", "45s") to milliseconds
 */
export function parseDuration(duration: string): number {
  const regex = /(\d+)\s*(y|mo|w|d|h|m|s|ms)/g;
  let totalMs = 0;
  let match;

  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
  };

  while ((match = regex.exec(duration)) !== null) {
    const value = parseInt(match[1]!, 10);
    const unit = match[2]!.toLowerCase();
    totalMs += value * (units[unit] || 0);
  }

  return totalMs;
}

/**
 * Get time until a future date
 */
export function getTimeUntil(futureDate: string | Date | number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const future = futureDate instanceof Date ? futureDate : new Date(futureDate);

  const now = new Date();
  const diffMs = future.getTime() - now.getTime();

  if (diffMs < 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);

  return { days, hours, minutes, seconds, totalMs: diffMs };
}

/**
 * Check if a date is expired
 */
export function isExpired(date: string | Date | number): boolean {
  const d = date instanceof Date ? date : new Date(date);
  return d.getTime() < Date.now();
}

/**
 * Add duration to a date
 */
export function addDuration(date: Date, duration: string): Date {
  const ms = parseDuration(duration);
  return new Date(date.getTime() + ms);
}

/**
 * Format date range
 */
export function formatDateRange(
  start: Date | string | number,
  end: Date | string | number
): string {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);

  const startStr = formatLocalDateTime(startDate);
  const endStr = formatLocalDateTime(endDate);

  return `${startStr} - ${endStr}`;
}

/**
 * Get human-readable time of day
 */
export function getTimeOfDay(date?: Date): string {
  const d = date || new Date();
  const hours = d.getHours();

  if (hours < 6) return 'night';
  if (hours < 12) return 'morning';
  if (hours < 18) return 'afternoon';
  return 'evening';
}
