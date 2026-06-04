/**
 * Unit Tests for Error Messages
 */

import { describe, it, expect } from "vitest";
import { ERROR_MESSAGES, getErrorMessage, createError } from "./error-messages";

describe("Error Messages", () => {
  describe("ERROR_MESSAGES", () => {
    it("should have all required error messages", () => {
      expect(ERROR_MESSAGES.UNKNOWN_ERROR).toBeDefined();
      expect(ERROR_MESSAGES.NETWORK_ERROR).toBeDefined();
      expect(ERROR_MESSAGES.AUTH_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.SAVE_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.UPDATE_FAILED).toBeDefined();
      expect(ERROR_MESSAGES.DELETE_FAILED).toBeDefined();
    });

    it("should have consistent error message format", () => {
      Object.values(ERROR_MESSAGES).forEach((message) => {
        expect(typeof message).toBe("string");
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });

  describe("getErrorMessage", () => {
    it("should extract message from Error object", () => {
      const error = new Error("Test error");
      const result = getErrorMessage(error);
      expect(result).toBe("Test error");
    });

    it("should return string error as-is", () => {
      const result = getErrorMessage("String error");
      expect(result).toBe("String error");
    });

    it("should extract error property from object", () => {
      const error = { error: "Object error" };
      const result = getErrorMessage(error);
      expect(result).toBe("Object error");
    });

    it("should return fallback for unknown error types", () => {
      const result = getErrorMessage(null);
      expect(result).toBe(ERROR_MESSAGES.UNKNOWN_ERROR);
    });

    it("should use custom fallback", () => {
      const customFallback = "Custom fallback";
      const result = getErrorMessage(null, customFallback);
      expect(result).toBe(customFallback);
    });

    it("should handle undefined error", () => {
      const result = getErrorMessage(undefined);
      expect(result).toBe(ERROR_MESSAGES.UNKNOWN_ERROR);
    });

    it("should handle number error", () => {
      const result = getErrorMessage(404);
      expect(result).toBe(ERROR_MESSAGES.UNKNOWN_ERROR);
    });
  });

  describe("createError", () => {
    it("should create Error with message", () => {
      const error = createError("Test error");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error");
    });

    it("should create Error with details", () => {
      const details = { field: "username", value: "test" };
      const error = createError("Validation error", details);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Validation error");
    });

    it("should not throw when creating error", () => {
      expect(() => createError("Test")).not.toThrow();
    });
  });
});
