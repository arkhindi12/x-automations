/**
 * Unit Tests for Environment Validator
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "./env-validator";

describe("Environment Validator", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("validateEnv", () => {
    it("should validate correct environment variables", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      process.env.PORT = "3000";
      process.env.NODE_ENV = "production";

      const result = validateEnv();

      expect(result.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
      expect(result.PORT).toBe(3000);
      expect(result.NODE_ENV).toBe("production");
    });

    it("should throw error when DATABASE_URL is missing", () => {
      delete process.env.DATABASE_URL;
      process.env.PORT = "3000";
      process.env.NODE_ENV = "production";

      expect(() => validateEnv()).toThrow("DATABASE_URL");
    });

    it("should throw error when DATABASE_URL has invalid format", () => {
      process.env.DATABASE_URL = "invalid-url";
      process.env.PORT = "3000";
      process.env.NODE_ENV = "production";

      expect(() => validateEnv()).toThrow("PostgreSQL connection string");
    });

    it("should throw error when PORT is missing", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      delete process.env.PORT;
      process.env.NODE_ENV = "production";

      expect(() => validateEnv()).toThrow("PORT");
    });

    it("should throw error when PORT is invalid", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      process.env.PORT = "invalid";
      process.env.NODE_ENV = "production";

      expect(() => validateEnv()).toThrow("Invalid PORT");
    });

    it("should throw error when PORT is out of range", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      process.env.PORT = "99999";
      process.env.NODE_ENV = "production";

      expect(() => validateEnv()).toThrow("Invalid PORT");
    });

    it("should default NODE_ENV to development", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      process.env.PORT = "3000";
      delete process.env.NODE_ENV;

      const result = validateEnv();

      expect(result.NODE_ENV).toBe("development");
    });

    it("should throw error when NODE_ENV is invalid", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      process.env.PORT = "3000";
      process.env.NODE_ENV = "invalid";

      expect(() => validateEnv()).toThrow("Invalid NODE_ENV");
    });

    it("should accept optional environment variables", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      process.env.PORT = "3000";
      process.env.NODE_ENV = "production";
      process.env.LOG_LEVEL = "debug";
      process.env.NINEPROXY_API_KEY = "test-key";

      const result = validateEnv();

      expect(result.LOG_LEVEL).toBe("debug");
      expect(result.NINEPROXY_API_KEY).toBe("test-key");
    });

    it("should collect multiple validation errors", () => {
      delete process.env.DATABASE_URL;
      delete process.env.PORT;
      process.env.NODE_ENV = "invalid";

      expect(() => validateEnv()).toThrow("Environment validation failed");
    });
  });
});
