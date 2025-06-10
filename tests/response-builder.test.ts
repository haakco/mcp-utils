import { ResponseBuilder } from '../src/response-builder.js';

describe('ResponseBuilder', () => {
  describe('error', () => {
    it('should format error message', () => {
      const result = ResponseBuilder.error('Something went wrong');
      expect(result.content[0]?.text).toBe('Error: Something went wrong');
    });

    it('should include details when provided', () => {
      const result = ResponseBuilder.error('Failed', { code: 500 });
      expect(result.content[1]?.text).toContain('"code": 500');
    });
  });

  describe('success', () => {
    it('should format success message', () => {
      const result = ResponseBuilder.success('Operation completed');
      expect(result.content[0]?.text).toBe('Operation completed');
    });
  });

  describe('json', () => {
    it('should format JSON data', () => {
      const result = ResponseBuilder.json({ test: true });
      expect(result.content[0]?.text).toContain('```json');
      expect(result.content[0]?.text).toContain('"test": true');
    });

    it('should include title when provided', () => {
      const result = ResponseBuilder.json({ test: true }, 'Test Data');
      expect(result.content[0]?.text).toBe('Test Data');
      expect(result.content[1]?.text).toContain('```json');
    });
  });

  describe('yaml', () => {
    it('should format simple YAML', () => {
      const result = ResponseBuilder.yaml({ name: 'test', value: 123 });
      expect(result.content[0]?.text).toContain('```yaml');
      expect(result.content[0]?.text).toContain('name: test');
      expect(result.content[0]?.text).toContain('value: 123');
    });

    it('should handle nested objects', () => {
      const result = ResponseBuilder.yaml({
        parent: {
          child: 'value'
        }
      });
      expect(result.content[0]?.text).toContain('parent:\n  child: value');
    });

    it('should handle arrays', () => {
      const result = ResponseBuilder.yaml({
        items: ['one', 'two']
      });
      expect(result.content[0]?.text).toContain('items:\n  - one\n  - two');
    });
  });

  describe('table', () => {
    it('should format table data', () => {
      const result = ResponseBuilder.table({
        headers: ['Name', 'Age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25']
        ]
      });
      
      const text = result.content[0]?.text!;
      expect(text).toContain('Name  | Age');
      expect(text).toContain('----- | ---');
      expect(text).toContain('Alice | 30');
      expect(text).toContain('Bob   | 25');
    });

    it('should handle varying column widths', () => {
      const result = ResponseBuilder.table({
        headers: ['ID', 'Description'],
        rows: [
          ['1', 'A very long description'],
          ['123', 'Short']
        ]
      });
      
      const text = result.content[0]?.text!;
      expect(text).toContain('ID  | Description');
    });
  });

  describe('list', () => {
    it('should format bullet list', () => {
      const result = ResponseBuilder.list([
        { label: 'Item 1' },
        { label: 'Item 2' }
      ]);
      
      const text = result.content[0]?.text!;
      expect(text).toContain('- Item 1');
      expect(text).toContain('- Item 2');
    });

    it('should format numbered list', () => {
      const result = ResponseBuilder.list([
        { label: 'First' },
        { label: 'Second' }
      ], 'Steps:', true);
      
      expect(result.content[0]?.text).toBe('Steps:');
      const text = result.content[1]?.text!;
      expect(text).toContain('1. First');
      expect(text).toContain('2. Second');
    });

    it('should handle values', () => {
      const result = ResponseBuilder.list([
        { label: 'Name', value: 'Test' },
        { label: 'Count', value: 42 }
      ]);
      
      const text = result.content[0]?.text!;
      expect(text).toContain('- Name: Test');
      expect(text).toContain('- Count: 42');
    });

    it('should handle nested lists', () => {
      const result = ResponseBuilder.list([
        { 
          label: 'Parent',
          nested: [
            { label: 'Child 1' },
            { label: 'Child 2' }
          ]
        }
      ]);
      
      const text = result.content[0]?.text!;
      expect(text).toContain('- Parent');
      expect(text).toContain('  - Child 1');
      expect(text).toContain('  - Child 2');
    });
  });

  describe('progress', () => {
    it('should format progress bar', () => {
      const result = ResponseBuilder.progress(50, 100, 'Processing...');
      const text = result.content[0]?.text!;
      
      expect(text).toContain('Processing...');
      expect(text).toContain('[██████████░░░░░░░░░░] 50% (50/100)');
    });

    it('should handle different percentages', () => {
      const result = ResponseBuilder.progress(25, 100, 'Loading');
      const text = result.content[0]?.text!;
      
      expect(text).toContain('[█████░░░░░░░░░░░░░░░] 25% (25/100)');
    });
  });

  describe('multipart', () => {
    it('should combine multiple parts', () => {
      const result = ResponseBuilder.multipart([
        { type: 'text', data: 'Header' },
        { type: 'json', data: { key: 'value' }, title: 'Data' },
        { type: 'list', data: [{ label: 'Item' }] }
      ]);
      
      expect(result.content[0]?.text).toBe('Header');
      expect(result.content[1]?.text).toBe('Data');
      expect(result.content[2]?.text).toContain('```json');
      expect(result.content[3]?.text).toContain('- Item');
    });
  });
});