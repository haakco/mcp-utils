import { describe, it, expect } from '@jest/globals';
import {
  formatDuration,
  formatDurationFromSeconds,
  formatAge,
  formatRelativeTime,
  parseDuration
} from '../src/datetime.js';

describe('DateTime utilities', () => {
  describe('Duration formatters', () => {
    it('should format duration from milliseconds', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(3600000)).toBe('1h 0m 0s');
      expect(formatDuration(86400000)).toBe('1d 0h 0m 0s');
      expect(formatDuration(90061000)).toBe('1d 1h 1m 1s');
    });

    it('should format duration from seconds', () => {
      expect(formatDurationFromSeconds(0)).toBe('0s');
      expect(formatDurationFromSeconds(60)).toBe('1m 0s');
      expect(formatDurationFromSeconds(3600)).toBe('1h 0m 0s');
      expect(formatDurationFromSeconds(86400)).toBe('1d 0h 0m 0s');
    });
  });

  describe('Age formatting', () => {
    it('should format age from timestamp', () => {
      const now = Date.now();
      expect(formatAge(now)).toBe('0s');
      expect(formatAge(now - 60000)).toBe('1m');
      expect(formatAge(now - 3600000)).toBe('1h');
      expect(formatAge(now - 86400000)).toBe('1d');
      expect(formatAge()).toBe('unknown');
    });
  });

  describe('Relative time formatting', () => {
    it('should format relative time', () => {
      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 60000))).toBe('1 minute ago');
      expect(formatRelativeTime(new Date(now + 60000))).toBe('in 1 minute');
      expect(formatRelativeTime(new Date(now - 3600000))).toBe('1 hour ago');
      expect(formatRelativeTime(new Date(now - 86400000))).toBe('1 day ago');
    });
  });

  describe('Duration parsing', () => {
    it('should parse duration strings', () => {
      expect(parseDuration('1s')).toBe(1000);
      expect(parseDuration('1m')).toBe(60000);
      expect(parseDuration('1h')).toBe(3600000);
      expect(parseDuration('1d')).toBe(86400000);
      expect(parseDuration('1h30m')).toBe(5400000);
      expect(parseDuration('invalid')).toBe(0);
    });
  });
});