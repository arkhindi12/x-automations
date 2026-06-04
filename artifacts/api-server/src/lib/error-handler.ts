/**
 * Global Error Handler Middleware
 * Catches and formats all errors in a consistent way
 */

import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { apiLogger } from "./structured-logger";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(400, message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
    this.name = "UnauthorizedError";
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message);
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = "ConflictError";
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError) {
  const errors = error.errors.map((err) => ({
    field: err.path.join("."),
    message: err.message,
  }));

  return {
    message: "Validation failed",
    errors,
  };
}

/**
 * Global error handler middleware
 * Must be registered after all routes
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // Zod validation errors
  if (err instanceof ZodError) {
    const formatted = formatZodError(err);
    apiLogger.validationError(req.path, formatted.errors);
    return res.status(400).json(formatted);
  }

  // Application errors
  if (err instanceof AppError) {
    apiLogger.requestError(req.method, req.path, err.statusCode, err.message);
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err instanceof ValidationError && err.details ? { details: err.details } : {}),
    });
  }

  // Unknown errors
  apiLogger.requestError(req.method, req.path, 500, err.message);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === "development";
  
  return res.status(500).json({
    error: isDevelopment ? err.message : "Internal server error",
    ...(isDevelopment && err.stack ? { stack: err.stack } : {}),
  });
}

/**
 * Async handler wrapper
 * Catches async errors and passes them to error handler
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response) {
  apiLogger.requestError(req.method, req.path, 404, "Route not found");
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
}
