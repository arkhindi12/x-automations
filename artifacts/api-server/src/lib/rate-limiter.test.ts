/**
 * Unit Tests for Rate Limiter
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { rateLimit, resetRateLimitStore } from "./rate-limiter";

describe("Rate Limiter", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    resetRateLimitStore();
    mockReq = {
      ip: "127.0.0.1",
      path: "/api/test",
      method: "GET",
    };

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  it("should allow requests within limit", () => {
    const limiter = rateLimit({
      windowMs: 60000,
      max: 5,
    });

    // First request
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "5");
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "4");
  });

  it("should block requests exceeding limit", () => {
    const limiter = rateLimit({
      windowMs: 60000,
      max: 2,
    });

    // First request - OK
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Second request - OK
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // Third request - BLOCKED
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        retryAfter: expect.any(Number),
      })
    );
  });

  it("should use custom key generator", () => {
    const limiter = rateLimit({
      windowMs: 60000,
      max: 5,
      keyGenerator: (req) => req.path || "default",
    });

    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should skip requests when skip function returns true", () => {
    const limiter = rateLimit({
      windowMs: 60000,
      max: 1,
      skip: () => true,
    });

    // Should skip rate limiting
    limiter(mockReq as Request, mockRes as Response, mockNext);
    limiter(mockReq as Request, mockRes as Response, mockNext);
    limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(3);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("should use custom error handler", () => {
    const customHandler = vi.fn();
    const limiter = rateLimit({
      windowMs: 60000,
      max: 1,
      handler: customHandler,
    });

    // First request - OK
    limiter(mockReq as Request, mockRes as Response, mockNext);

    // Second request - should use custom handler
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(customHandler).toHaveBeenCalled();
  });

  it("should reset count after window expires", async () => {
    const limiter = rateLimit({
      windowMs: 100, // 100ms window
      max: 2,
    });

    // First request
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Second request
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Third request - should be allowed after reset
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(3);
  });

  it("should handle different IPs separately", () => {
    const limiter = rateLimit({
      windowMs: 60000,
      max: 1,
    });

    // Request from IP 1
    mockReq = { ...mockReq, ip: "192.168.1.1" };
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Request from IP 2
    mockReq = { ...mockReq, ip: "192.168.1.2" };
    limiter(mockReq as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    // Both IPs should have their own limits
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
