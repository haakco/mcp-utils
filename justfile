# Just commands for MCP TypeScript project

# Show available recipes
default:
    @just --list

# Install dependencies
install:
    npm install

# Build the project
build:
    npm run build

# Build and watch for changes
dev:
    npm run dev

# Run tests
test:
    npm run test

# Run tests with watch mode
test-watch:
    npm run test:watch

# Run tests with coverage
test-coverage:
    npm run test:coverage

# Run linting
lint:
    npm run lint

# Fix linting issues
lint-fix:
    npm run lint:fix

# Format code
format:
    npm run format

# Check formatting
format-check:
    npm run format:check

# Run all checks (lint + format + test)
check:
    npm run check

# Start the MCP server
start:
    npm run start

# Clean build artifacts
clean:
    rm -rf dist/
    rm -rf coverage/
    rm -rf node_modules/.cache/

# Find TypeScript 'any' type usage
find-any:
    ./scripts/find-any-types.sh

# Full rebuild (clean + install + build)
rebuild: clean
    npm install
    npm run build

# Prepare for commit (format + lint + test)
pre-commit:
    npm run format
    npm run lint
    npm run test

# Development workflow (install + build + test)
setup: install build test
    @echo "✅ Project setup complete!"

# Production build and test
ci: install
    npm run build
    npm run check