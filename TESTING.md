# Testing Guide

## Overview

This project uses [Vitest](https://vitest.dev/) for unit testing. Tests are written in TypeScript and run in Node.js environment.

## Running Tests

### Run all tests
```bash
pnpm test
```

### Watch mode (auto-rerun on changes)
```bash
pnpm test:watch
```

### Coverage report
```bash
pnpm test:coverage
```

Coverage reports are generated in `coverage/` directory.

## Writing Tests

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.spec.ts`
- Place tests next to the code they test

Example:
```
src/
  lib/
    rate-limiter.ts
    rate-limiter.test.ts
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Feature Name", () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe("specific function", () => {
    it("should do something", () => {
      // Arrange
      const input = "test";

      // Act
      const result = someFunction(input);

      // Assert
      expect(result).toBe("expected");
    });

    it("should handle edge cases", () => {
      expect(() => someFunction(null)).toThrow();
    });
  });
});
```

### Mocking

#### Mock functions
```typescript
import { vi } from "vitest";

const mockFn = vi.fn();
mockFn.mockReturnValue("mocked value");
mockFn.mockResolvedValue("async value");
```

#### Mock modules
```typescript
vi.mock("./module", () => ({
  someFunction: vi.fn(),
}));
```

#### Mock environment variables
```typescript
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.TEST_VAR = "test";
});

afterEach(() => {
  process.env = originalEnv;
});
```

### Async Testing

```typescript
it("should handle async operations", async () => {
  const result = await asyncFunction();
  expect(result).toBe("expected");
});
```

### Testing Express Middleware

```typescript
import type { Request, Response, NextFunction } from "express";

it("should call next middleware", () => {
  const mockReq = { path: "/test" } as Request;
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const mockNext = vi.fn() as NextFunction;

  middleware(mockReq, mockRes, mockNext);

  expect(mockNext).toHaveBeenCalled();
});
```

## Test Coverage Goals

- **Minimum**: 70% overall coverage
- **Target**: 80%+ coverage
- **Critical paths**: 90%+ coverage

### What to Test

✅ **High Priority:**
- Business logic
- Error handling
- Input validation
- Security features
- Data transformations

✅ **Medium Priority:**
- API endpoints
- Database operations
- Utility functions

⚠️ **Low Priority:**
- UI components (use E2E tests)
- Configuration files
- Type definitions

### What NOT to Test

❌ Don't test:
- Third-party libraries
- Framework internals
- Simple getters/setters
- Trivial functions

## Best Practices

### 1. Test Behavior, Not Implementation

❌ Bad:
```typescript
it("should call internal method", () => {
  const spy = vi.spyOn(obj, "internalMethod");
  obj.publicMethod();
  expect(spy).toHaveBeenCalled();
});
```

✅ Good:
```typescript
it("should return correct result", () => {
  const result = obj.publicMethod();
  expect(result).toBe("expected");
});
```

### 2. Use Descriptive Test Names

❌ Bad:
```typescript
it("works", () => { ... });
```

✅ Good:
```typescript
it("should return 404 when user not found", () => { ... });
```

### 3. One Assertion Per Test (when possible)

❌ Bad:
```typescript
it("should validate user", () => {
  expect(user.name).toBe("John");
  expect(user.age).toBe(30);
  expect(user.email).toBe("john@example.com");
});
```

✅ Good:
```typescript
it("should have correct name", () => {
  expect(user.name).toBe("John");
});

it("should have correct age", () => {
  expect(user.age).toBe(30);
});
```

### 4. Arrange-Act-Assert Pattern

```typescript
it("should calculate total", () => {
  // Arrange
  const items = [1, 2, 3];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(6);
});
```

### 5. Test Edge Cases

```typescript
describe("divide", () => {
  it("should divide two numbers", () => {
    expect(divide(10, 2)).toBe(5);
  });

  it("should handle division by zero", () => {
    expect(() => divide(10, 0)).toThrow("Division by zero");
  });

  it("should handle negative numbers", () => {
    expect(divide(-10, 2)).toBe(-5);
  });

  it("should handle decimals", () => {
    expect(divide(10, 3)).toBeCloseTo(3.33, 2);
  });
});
```

## Continuous Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Pull requests
- Before deployment

### Pre-commit Hook

```bash
# .husky/pre-commit
pnpm test
```

## Debugging Tests

### Run specific test file
```bash
pnpm vitest run path/to/test.test.ts
```

### Run tests matching pattern
```bash
pnpm vitest run -t "should validate"
```

### Debug in VS Code

Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test:watch"],
  "console": "integratedTerminal"
}
```

## Common Patterns

### Testing Database Operations

```typescript
import { db } from "@workspace/db";

// Mock database
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

it("should fetch user from database", async () => {
  vi.mocked(db.select).mockResolvedValue([{ id: 1, name: "John" }]);

  const user = await getUser(1);

  expect(user).toEqual({ id: 1, name: "John" });
});
```

### Testing API Endpoints

```typescript
import request from "supertest";
import app from "./app";

it("should return 200 for health check", async () => {
  const response = await request(app).get("/api/health");

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: "ok" });
});
```

### Testing Error Scenarios

```typescript
it("should handle network errors", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

  await expect(fetchData()).rejects.toThrow("Network error");
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Jest Matchers (compatible with Vitest)](https://jestjs.io/docs/expect)
