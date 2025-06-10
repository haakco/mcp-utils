# Contributing to @haakco/mcp-utils

Thank you for your interest in contributing to @haakco/mcp-utils! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Development Standards](#development-standards)


## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-utils.git
   cd mcp-utils
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Tests**
   ```bash
   npm test
   npm run test:coverage
   ```

4. **Build the Project**
   ```bash
   npm run build
   ```

5. **Start Development**
   ```bash
   npm run dev  # Builds in watch mode
   ```

## Contributing Guidelines

### Types of Contributions

We welcome several types of contributions:

- **🐛 Bug Fixes**: Fix issues in existing functionality
- **✨ New Features**: Add new utilities or improve existing ones
- **📚 Documentation**: Improve or add documentation
- **🧪 Tests**: Add or improve test coverage
- **⚡ Performance**: Optimize existing code
- **♻️ Refactoring**: Improve code structure without changing functionality

### Before You Start

1. **Check Existing Issues**: Look for existing issues or discussions
2. **Create an Issue**: For significant changes, create an issue first
3. **Discuss Approach**: Get feedback on your proposed solution
4. **Fork Repository**: Create your own fork to work in

## Development Standards

### Code Quality Requirements

All contributions must meet these standards:

#### 1. **TypeScript Standards**
- Use strict TypeScript with no `any` types in business logic
- Provide proper type definitions for all exports
- Use generics appropriately for reusable components

```typescript
// ✅ Good
interface CacheOptions<T> {
  ttl: number;
  maxSize?: number;
  onEvict?: (key: string, value: T) => void;
}

// ❌ Bad
interface CacheOptions {
  ttl: any;
  maxSize?: any;
  onEvict?: any;
}
```

#### 2. **Function Design**
- Keep functions small (ideally 10-20 lines)
- Single responsibility principle
- Pure functions where possible
- Descriptive naming

```typescript
// ✅ Good
function formatBytesToHumanReadable(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${sizes[index]}`;
}

// ❌ Bad
function format(data: any): any {
  // Large, complex function doing multiple things
}
```

#### 3. **Testing Requirements**
- All new features must include tests
- Aim for 90%+ test coverage on new code
- Test both success and error cases
- Use descriptive test names

```typescript
describe('SimpleCache', () => {
  describe('set and get operations', () => {
    it('should store and retrieve values correctly', () => {
      const cache = new SimpleCache<string>(1000);
      cache.set('key1', 'value1');
      
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      const cache = new SimpleCache<string>(1000);
      
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should expire items after TTL', async () => {
      const cache = new SimpleCache<string>(100);
      cache.set('key1', 'value1');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('key1')).toBeUndefined();
    });
  });
});
```

#### 4. **Documentation Standards**
- All public functions must have JSDoc comments
- Include parameter descriptions and return types
- Provide usage examples for complex functions

```typescript
/**
 * Creates a rate limiter using the token bucket algorithm.
 * 
 * @param capacity - Maximum number of tokens in the bucket
 * @param refillRate - Number of tokens added per second
 * @returns A configured rate limiter instance
 * 
 * @example
 * ```typescript
 * const limiter = createTokenBucketLimiter(10, 2);
 * 
 * if (await limiter.acquire(1)) {
 *   // Request allowed
 *   await processRequest();
 * }
 * ```
 */
export function createTokenBucketLimiter(
  capacity: number, 
  refillRate: number
): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(capacity, refillRate);
}
```

### File Organization

#### Directory Structure
```
src/
├── index.ts                 # Main exports
├── base-handler.ts         # Core MCP functionality
├── response-builder.ts     # Response formatting
├── formatters.ts          # Data formatting utilities
├── cache.ts               # Caching implementations
├── rate-limiter.ts        # Rate limiting utilities
├── datetime.ts            # Date/time utilities
├── validators.ts          # Validation utilities
├── logger.ts              # Logging utilities
├── websocket.ts           # WebSocket utilities
├── http-client.ts         # HTTP utilities
└── types/                 # Type definitions
    ├── cache.ts
    ├── rate-limiter.ts
    └── common.ts
```

#### Naming Conventions
- **Files**: kebab-case (`rate-limiter.ts`)
- **Classes**: PascalCase (`TokenBucketRateLimiter`)
- **Functions**: camelCase (`formatDuration`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TTL`)
- **Interfaces**: PascalCase (`CacheOptions`)

### Performance Guidelines

- **Memory Efficiency**: Clean up resources, avoid memory leaks
- **Async Operations**: Use Promise-based APIs
- **Error Handling**: Always handle errors gracefully
- **Resource Cleanup**: Implement proper cleanup in classes

```typescript
class ResourceManager {
  private cleanup: Array<() => void> = [];

  public addResource(resource: Resource): void {
    this.cleanup.push(() => resource.dispose());
  }

  public dispose(): void {
    this.cleanup.forEach(fn => fn());
    this.cleanup.length = 0;
  }
}
```

## Pull Request Process

### 1. **Prepare Your Changes**
```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes
# Add tests
# Update documentation

# Run quality checks
npm run lint
npm run test
npm run build
```

### 2. **Quality Checklist**
Before submitting, ensure:

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code builds successfully (`npm run build`)
- [ ] Test coverage is maintained or improved
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated (for significant changes)

### 3. **Commit Messages**
Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(cache): add TTL cache with LRU eviction
fix(rate-limiter): handle edge case in token bucket
docs(readme): add examples for WebSocket utilities
test(formatters): improve coverage for edge cases
```

### 4. **Pull Request Template**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring

## Testing
- [ ] Added tests for new functionality
- [ ] All existing tests pass
- [ ] Manual testing performed

## Documentation
- [ ] Updated README if needed
- [ ] Added JSDoc comments
- [ ] Updated CHANGELOG.md

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] No breaking changes (or documented)
```

## Issue Reporting

### Bug Reports
Use the bug report template and include:

- **Description**: Clear description of the issue
- **Reproduction**: Minimal code to reproduce
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: Node.js version, OS, etc.

### Feature Requests
Use the feature request template and include:

- **Use Case**: Why is this feature needed?
- **Proposed Solution**: How should it work?
- **Alternatives**: Other approaches considered
- **Examples**: Code examples of desired usage

## Development Commands

```bash
# Quality checks
npm run lint              # ESLint check
npm run lint:fix          # Auto-fix linting issues
npm run format           # Prettier formatting
npm run type-check       # TypeScript type checking

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report

# Building
npm run build            # Production build
npm run dev              # Development build (watch mode)
npm run clean            # Clean build artifacts

# Release preparation
npm run prepublishOnly   # Full quality check + build
```

## Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Email**: [support@haakco.com](mailto:support@haakco.com)

## Recognition

Contributors will be recognized in:
- CHANGELOG.md for significant contributions
- README.md contributors section
- GitHub releases notes

Thank you for contributing to @haakco/mcp-utils! 🚀