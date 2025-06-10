# Changelog

All notable changes to @haakco/mcp-utils will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial library preparation for GitHub extraction
- Comprehensive CI/CD workflows
- Enhanced package.json for public distribution

## [1.0.0] - 2025-01-09

### Added
- **Core MCP Components**
  - BaseToolHandler for standardized tool execution
  - ResponseBuilder for consistent MCP response formatting
  - ToolRegistry for tool registration and management
  - InstanceManager for multi-instance server support

- **Formatting & Presentation**
  - Message formatters with status indicators (✅ ❌ ⚠️ ℹ️)
  - Size formatters for bytes and storage units
  - Table formatters for structured data presentation
  - JSON/Text utilities with safe serialization

- **DateTime Operations**
  - Duration formatting with human-readable time spans
  - Age calculation ("2 hours ago", "3 days old")
  - Relative time formatting ("in 5 minutes", "1 week ago")
  - Duration parsing ("1h30m" → milliseconds)

- **Advanced Caching System**
  - SimpleCache with TTL-based caching
  - LRUCache with Least Recently Used eviction
  - TTLCache combining TTL + LRU strategies
  - DebouncedCache for batched operation caching
  - Function memoization with configurable options

- **Rate Limiting**
  - Token Bucket algorithm with burst capacity
  - Sliding Window for rolling time-based limits
  - Fixed Window for period-based rate limiting
  - Leaky Bucket for smooth rate control
  - Multi-Tier limiting with multiple simultaneous limits
  - Keyed limiters for per-user/per-resource limits

- **WebSocket Utilities**
  - ReconnectingWebSocket with auto-reconnection and backoff
  - Message Router for type-based message handling
  - RPC Client for request/response over WebSocket
  - Connection Pool for managed connection lifecycle

- **Logging & Monitoring**
  - Structured logging with context-aware log entries
  - Performance timing for operation duration tracking
  - Environment-based configuration
  - Multiple output formats (console, silent, custom)

- **Validation & Error Handling**
  - Comprehensive input validation utilities
  - Schema validation with Zod integration
  - Standardized error response patterns
  - Argument validation helpers

- **HTTP & API Utilities**
  - Enhanced HTTP client with retry logic
  - Configurable timeout and error handling
  - Request/response interceptors
  - Automatic retries with exponential backoff

### Technical Details
- **TypeScript**: Full TypeScript support with strict typing
- **Testing**: 85/85 tests passing with comprehensive coverage
- **ES Modules**: Modern ES module support
- **Node.js**: Compatible with Node.js 18+
- **Dependencies**: Minimal external dependencies
- **Performance**: Optimized for production workloads

### Documentation
- Complete API reference with examples
- Integration guides for Express.js and WebSocket servers
- Advanced usage patterns and best practices
- Comprehensive test coverage documentation