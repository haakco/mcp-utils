import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  SimpleCache,
  LRUCache,
  TTLCache
} from '../src/cache.js';

describe('Cache utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('SimpleCache', () => {
    it('should store and retrieve values', () => {
      const cache = new SimpleCache<string>(1000);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should expire values after TTL', () => {
      const cache = new SimpleCache<string>(1000);
      cache.set('key1', 'value1');
      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle has() correctly', () => {
      const cache = new SimpleCache<string>(1000);
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      jest.advanceTimersByTime(1001);
      expect(cache.has('key1')).toBe(false);
    });

    it('should delete values', () => {
      const cache = new SimpleCache<string>(1000);
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should clear all values', () => {
      const cache = new SimpleCache<string>(1000);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('LRUCache', () => {
    it('should evict least recently used items', () => {
      const cache = new LRUCache<string>(2);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Should evict key1
      
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should update LRU order on get', () => {
      const cache = new LRUCache<string>(2);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1'); // Makes key1 most recently used
      cache.set('key3', 'value3'); // Should evict key2
      
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('TTLCache', () => {
    it('should combine TTL and LRU eviction', () => {
      const cache = new TTLCache<string>({ maxSize: 2, ttl: 1000 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // TTL expiration
      jest.advanceTimersByTime(1001);
      expect(cache.get('key1')).toBeUndefined();
      
      // LRU eviction
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5'); // Should evict oldest
      
      expect(cache.size()).toBe(2);
    });
  });
});