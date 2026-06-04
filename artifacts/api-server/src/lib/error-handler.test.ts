/**
 * Unit Tests for Error Handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { ZodError, z } from "zod";
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  errorHandler,
  asyncHandler,
} from "./error-handler";

describe("Error Handler", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: "GET",
      path: "/api/test",
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  describe("Custom Error Classes", () => {
    it("should create AppError with status code", () => {
      const error = new AppError(400, "Bad request");
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Bad request");
      expect(error.isOperational).toBe(true);
    });

    it("should create ValidationError", () => {
      const error = new ValidationError("Invalid input");
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Invalid input");
    });

    it("should create NotFoundError", () => {
      const error = new NotFoundError("User");
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("User not found");
    });

    it("should create UnauthorizedError", () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
    });

    it("should create ForbiddenError", () => {
      const error = new ForbiddenError();
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
    });

    it("should create ConflictError", () => {
      const error = new ConflictError("Resource already exists");
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(409);
    });
  });

  describe("errorHandler", () => {
    it("should handle ZodError", () => {
      const schema = z.object({ name: z.string() });
      let zodError: ZodError;

      try {
        schema.parse({ name: 123 });
      } catch (error) {
        zodError = error as ZodError;
      }

      errorHandler(zodError!, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Validation failed",
          errors: expect.any(Array),
        })
      );
    });

    it("should handle AppError", () => {
      const error = new AppError(400, "Bad request");

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Bad request",
      });
    });

    it("should handle ValidationError with details", () => {
      const error = new ValidationError("Invalid input", { field: "email" });

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid input",
        details: { field: "email" },
      });
    });

    it("should handle generic Error in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const error = new Error("Internal error");

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Internal server error",
      });

      process.env.NODE_ENV = originalEnv;
    });

    it("should include error details in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const error = new Error("Internal error");

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Internal error",
          stack: expect.any(String),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("asyncHandler", () => {
    it("should handle successful async function", async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json({ success: true });
      });

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should catch async errors and pass to next", async () => {
      const error = new Error("Async error");
      const handler = asyncHandler(async () => {
        throw error;
      });

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it("should handle rejected promises", async () => {
      const error = new Error("Promise rejected");
      const handler = asyncHandler(async () => {
        return Promise.reject(error);
      });

      await handler(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
