import {
  nonEmptyString,
  positiveInt,
  port,
  ipAddress,
  hostname,
  k8sName,
  memorySize,
  cpuSize,
  diskSize,
  uuid,
  email,
  base64,
  createPaginationSchema,
  isRecord,
  isStringArray,
  hasProperty
} from '../src/validators.js';

describe('Validators', () => {
  describe('string validators', () => {
    it('should validate non-empty strings', () => {
      expect(nonEmptyString.parse('test')).toBe('test');
      expect(() => nonEmptyString.parse('')).toThrow();
    });
  });

  describe('numeric validators', () => {
    it('should validate positive integers', () => {
      expect(positiveInt.parse(5)).toBe(5);
      expect(() => positiveInt.parse(0)).toThrow();
      expect(() => positiveInt.parse(-1)).toThrow();
      expect(() => positiveInt.parse(1.5)).toThrow();
    });

    it('should validate port numbers', () => {
      expect(port.parse(80)).toBe(80);
      expect(port.parse(65535)).toBe(65535);
      expect(() => port.parse(0)).toThrow();
      expect(() => port.parse(65536)).toThrow();
    });
  });

  describe('network validators', () => {
    it('should validate IP addresses', () => {
      expect(ipAddress.parse('192.168.1.1')).toBe('192.168.1.1');
      expect(ipAddress.parse('10.0.0.0')).toBe('10.0.0.0');
      expect(() => ipAddress.parse('256.1.1.1')).toThrow();
      expect(() => ipAddress.parse('not.an.ip')).toThrow();
    });

    it('should validate hostnames', () => {
      expect(hostname.parse('example.com')).toBe('example.com');
      expect(hostname.parse('sub.example.com')).toBe('sub.example.com');
      expect(hostname.parse('test-123')).toBe('test-123');
      expect(() => hostname.parse('-invalid')).toThrow();
      expect(() => hostname.parse('invalid-')).toThrow();
    });
  });

  describe('Kubernetes validators', () => {
    it('should validate k8s names', () => {
      expect(k8sName.parse('my-app')).toBe('my-app');
      expect(k8sName.parse('app123')).toBe('app123');
      expect(() => k8sName.parse('My-App')).toThrow(); // uppercase
      expect(() => k8sName.parse('-app')).toThrow(); // starts with hyphen
      expect(() => k8sName.parse('app-')).toThrow(); // ends with hyphen
    });
  });

  describe('resource validators', () => {
    it('should validate memory sizes', () => {
      expect(memorySize.parse('512Mi')).toBe('512Mi');
      expect(memorySize.parse('2Gi')).toBe('2Gi');
      expect(memorySize.parse('1024Ki')).toBe('1024Ki');
      expect(() => memorySize.parse('invalid')).toThrow();
    });

    it('should validate CPU sizes', () => {
      expect(cpuSize.parse('100m')).toBe('100m');
      expect(cpuSize.parse('0.5')).toBe('0.5');
      expect(cpuSize.parse('2')).toBe('2');
      expect(() => cpuSize.parse('invalid')).toThrow();
    });

    it('should validate disk sizes', () => {
      expect(diskSize.parse('10G')).toBe('10G');
      expect(diskSize.parse('500M')).toBe('500M');
      expect(diskSize.parse('1T')).toBe('1T');
      expect(() => diskSize.parse('invalid')).toThrow();
    });
  });

  describe('common patterns', () => {
    it('should validate UUIDs', () => {
      expect(uuid.parse('550e8400-e29b-41d4-a716-446655440000'))
        .toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(() => uuid.parse('not-a-uuid')).toThrow();
    });

    it('should validate emails', () => {
      expect(email.parse('test@example.com')).toBe('test@example.com');
      expect(() => email.parse('invalid-email')).toThrow();
    });

    it('should validate base64 strings', () => {
      expect(base64.parse('SGVsbG8gV29ybGQ=')).toBe('SGVsbG8gV29ybGQ=');
      expect(() => base64.parse('!@#$')).toThrow();
    });
  });

  describe('helper functions', () => {
    it('should create pagination schema', () => {
      const schema = createPaginationSchema(50);
      const result = schema.parse({ page: 2, perPage: 25 });
      
      expect(result.page).toBe(2);
      expect(result.perPage).toBe(25);
      expect(result.sortOrder).toBe('asc');
      
      expect(() => schema.parse({ page: 1, perPage: 100 })).toThrow();
    });
  });

  describe('type guards', () => {
    it('should check if value is record', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: 'value' })).toBe(true);
      expect(isRecord(null)).toBe(false);
      expect(isRecord([])).toBe(false);
      expect(isRecord('string')).toBe(false);
    });

    it('should check if value is string array', () => {
      expect(isStringArray(['a', 'b'])).toBe(true);
      expect(isStringArray([])).toBe(true);
      expect(isStringArray(['a', 1])).toBe(false);
      expect(isStringArray('not array')).toBe(false);
    });

    it('should check if object has property', () => {
      const obj = { name: 'test', value: 42 };
      
      expect(hasProperty(obj, 'name')).toBe(true);
      expect(hasProperty(obj, 'value')).toBe(true);
      expect(hasProperty(obj, 'missing')).toBe(false);
      expect(hasProperty(null, 'name')).toBe(false);
    });
  });
});