/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

import type { Request, Response, NextFunction } from "express";
import { securityLogger } from "./structured-logger";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function resetRateLimitStore() {
  for (const key in store) {
    delete store[key];
  }
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response) => void;
}

/**
 * Create a rate limiter middleware
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = "Too many requests, please try again later.",
    keyGenerator = (req) => req.ip || "unknown",
    skip = () => false,
    handler,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const record = store[key];

    if (!record || record.resetTime < now) {
      // Create new record
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      res.setHeader("X-RateLimit-Limit", max.toString());
      res.setHeader("X-RateLimit-Remaining", (max - 1).toString());
      res.setHeader("X-RateLimit-Reset", new Date(now + windowMs).toISOString());
      return next();
    }

    // Increment count
    record.count++;

    res.setHeader("X-RateLimit-Limit", max.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - record.count).toString());
    res.setHeader("X-RateLimit-Reset", new Date(record.resetTime).toISOString());

    if (record.count > max) {
      // Rate limit exceeded
      securityLogger.rateLimitHit(0, key, req.path);

      if (handler) {
        return handler(req, res);
      }

      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    next();
  };
}

/**
 * Predefined rate limiters for common use cases
 */

function isLocalRequest(req: Request): boolean {
  const ip = req.ip || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

// General API rate limiter: 100 requests per 15 minutes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many API requests from this IP, please try again after 15 minutes.",
  skip: isLocalRequest,
});

// Strict rate limiter for sensitive account operations: 30 requests per 15 minutes
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many requests for this operation, please try again after 15 minutes.",
});

// Job edit/run limiter: more relaxed because saving job forms can trigger retries during local admin usage
export const jobActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: "Too many job actions, please try again in a few minutes.",
});

// Authentication rate limiter: 20 attempts per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again after 15 minutes.",
});

// Job creation rate limiter: 20 jobs per hour
export const jobCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many jobs created, please try again after 1 hour.",
});

// Media upload rate limiter: 50 uploads per hour
export const mediaUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: "Too many media uploads, please try again after 1 hour.",
});

// Post creation rate limiter: 30 posts per hour
export const postCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Too many posts created, please try again after 1 hour.",
});

/**
 * Account-based rate limiter
 * Uses account ID instead of IP address
 */
export function accountRateLimit(options: Omit<RateLimitOptions, "keyGenerator">) {
  return rateLimit({
    ...options,
    keyGenerator: (req) => {
      // Try to get account ID from request body or params
      const accountId = req.body?.accountId || req.params?.accountId || req.query?.accountId;
      return accountId ? `account:${accountId}` : `ip:${req.ip || "unknown"}`;
    },
  });
}
