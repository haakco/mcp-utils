import { describe, it, expect } from '@jest/globals';
import {
  formatSuccess,
  formatError,
  formatWarning,
  formatInfo,
  formatBytes,
  formatStorageSize,
  formatPercentage,
  formatCPU,
  formatJson,
  truncate,
  formatList,
  formatBulletList,
  formatResourceStatus,
  formatKeyValue,
  formatTable,
  formatSimpleTable
} from '../src/formatters.js';

describe('Formatters', () => {
  describe('Message formatters', () => {
    it('should format success message', () => {
      expect(formatSuccess('Operation completed')).toBe('✅ Operation completed');
    });

    it('should format error message', () => {
      expect(formatError('Something went wrong')).toBe('❌ Error: Something went wrong');
    });

    it('should format warning message', () => {
      expect(formatWarning('Be careful')).toBe('⚠️ Warning: Be careful');
    });

    it('should format info message', () => {
      expect(formatInfo('FYI')).toBe('ℹ️ FYI');
    });
  });

  describe('Size formatters', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should format storage size for Kubernetes', () => {
      expect(formatStorageSize(0)).toBe('0 B');
      expect(formatStorageSize(1024)).toBe('1Ki');
      expect(formatStorageSize(1048576)).toBe('1Mi');
      expect(formatStorageSize(1073741824)).toBe('1Gi');
    });
  });

  describe('Number formatters', () => {
    it('should format percentage', () => {
      expect(formatPercentage(25, 100)).toBe('25.00%');
      expect(formatPercentage(0, 0)).toBe('0%');
      expect(formatPercentage(1, 3, 1)).toBe('33.3%');
    });

    it('should format CPU usage', () => {
      expect(formatCPU(0.5)).toBe('50.00%');
      expect(formatCPU(1)).toBe('100.00%');
      expect(formatCPU(0.123)).toBe('12.30%');
    });
  });

  describe('Text formatters', () => {
    it('should format JSON', () => {
      const obj = { a: 1, b: 'test' };
      expect(formatJson(obj)).toBe('{\n  "a": 1,\n  "b": "test"\n}');
    });

    it('should truncate text', () => {
      expect(truncate('short', 10)).toBe('short');
      expect(truncate('this is a long text', 10)).toBe('this is...');
    });

    it('should format list', () => {
      expect(formatList(['a', 'b', 'c'])).toBe('a, b, c');
      expect(formatList(['a', '', 'c'])).toBe('a, c');
      expect(formatList(['x', 'y'], ' | ')).toBe('x | y');
    });

    it('should format bullet list', () => {
      expect(formatBulletList(['item1', 'item2'])).toBe('• item1\n• item2');
    });
  });

  describe('Resource formatters', () => {
    it('should format resource status', () => {
      expect(formatResourceStatus('running')).toBe('🟢 Running');
      expect(formatResourceStatus('stopped')).toBe('🔴 Stopped');
      expect(formatResourceStatus('UNKNOWN_STATUS')).toBe('❔ UNKNOWN_STATUS');
    });

    it('should format key-value pairs', () => {
      expect(formatKeyValue('name', 'test')).toBe('name: test');
      expect(formatKeyValue('enabled', true)).toBe('enabled: True');
      expect(formatKeyValue('value', null)).toBe('value: <none>');
    });
  });

  describe('Table formatters', () => {
    it('should format table from array of objects', () => {
      const data = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 }
      ];
      const result = formatTable(data);
      expect(result).toContain('name | age');
      expect(result).toContain('John | 30');
      expect(result).toContain('Jane | 25');
    });

    it('should handle empty table', () => {
      expect(formatTable([])).toBe('No data');
    });

    it('should format simple key-value table', () => {
      const data = { name: 'test', value: 123 };
      const result = formatSimpleTable(data);
      expect(result).toContain('name  : test');
      expect(result).toContain('value : 123');
    });
  });
});