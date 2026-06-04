/**
 * Performance Monitoring Middleware
 * Tracks API response times and slow requests
 */

import type { Request, Response, NextFunction } from "express";
import { apiLogger } from "./structured-logger";

interface PerformanceMetrics {
  totalRequests: number;
  slowRequests: number;
  averageResponseTime: number;
  requestsByEndpoint: Map<string, {
    count: number;
    totalTime: number;
    avgTime: number;
  }>;
}

const metrics: PerformanceMetrics = {
  totalRequests: 0,
  slowRequests: 0,
  averageResponseTime: 0,
  requestsByEndpoint: new Map(),
};

const SLOW_REQUEST_THRESHOLD = 1000; // 1 second

/**
 * Performance monitoring middleware
 */
export function performanceMonitor(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const endpoint = `${req.method} ${req.path}`;

  // Capture response finish
  res.on("finish", () => {
    const duration = Date.now() - startTime;

    // Update metrics
    metrics.totalRequests++;
    
    // Track by endpoint
    const endpointMetrics = metrics.requestsByEndpoint.get(endpoint) || {
      count: 0,
      totalTime: 0,
      avgTime: 0,
    };
    
    endpointMetrics.count++;
    endpointMetrics.totalTime += duration;
    endpointMetrics.avgTime = endpointMetrics.totalTime / endpointMetrics.count;
    
    metrics.requestsByEndpoint.set(endpoint, endpointMetrics);

    // Update average response time
    const totalTime = Array.from(metrics.requestsByEndpoint.values())
      .reduce((sum, m) => sum + m.totalTime, 0);
    metrics.averageResponseTime = totalTime / metrics.totalRequests;

    // Log slow requests
    if (duration > SLOW_REQUEST_THRESHOLD) {
      metrics.slowRequests++;
      apiLogger.slowRequest(req.method, req.path, duration);
    }
  });

  next();
}

/**
 * Get current performance metrics
 */
export function getMetrics(): PerformanceMetrics {
  return {
    ...metrics,
    requestsByEndpoint: new Map(metrics.requestsByEndpoint),
  };
}

/**
 * Get top slowest endpoints
 */
export function getSlowestEndpoints(limit = 10) {
  return Array.from(metrics.requestsByEndpoint.entries())
    .sort((a, b) => b[1].avgTime - a[1].avgTime)
    .slice(0, limit)
    .map(([endpoint, data]) => ({
      endpoint,
      avgTime: Math.round(data.avgTime),
      count: data.count,
    }));
}

/**
 * Get most requested endpoints
 */
export function getMostRequestedEndpoints(limit = 10) {
  return Array.from(metrics.requestsByEndpoint.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([endpoint, data]) => ({
      endpoint,
      count: data.count,
      avgTime: Math.round(data.avgTime),
    }));
}

/**
 * Reset metrics
 */
export function resetMetrics() {
  metrics.totalRequests = 0;
  metrics.slowRequests = 0;
  metrics.averageResponseTime = 0;
  metrics.requestsByEndpoint.clear();
}

/**
 * Get performance summary
 */
export function getPerformanceSummary() {
  return {
    totalRequests: metrics.totalRequests,
    slowRequests: metrics.slowRequests,
    slowRequestPercentage: metrics.totalRequests > 0
      ? ((metrics.slowRequests / metrics.totalRequests) * 100).toFixed(2)
      : "0.00",
    averageResponseTime: Math.round(metrics.averageResponseTime),
    slowestEndpoints: getSlowestEndpoints(5),
    mostRequestedEndpoints: getMostRequestedEndpoints(5),
  };
}
