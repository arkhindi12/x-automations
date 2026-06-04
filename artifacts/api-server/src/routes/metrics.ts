import { Router } from "express";
import { getPerformanceSummary, resetMetrics } from "../lib/performance-monitor";

const router = Router();

/**
 * GET /api/metrics
 * Get performance metrics
 */
router.get("/", (req, res) => {
  const summary = getPerformanceSummary();
  res.json(summary);
});

/**
 * POST /api/metrics/reset
 * Reset performance metrics
 */
router.post("/reset", (req, res) => {
  resetMetrics();
  res.json({ message: "Metrics reset successfully" });
});

export default router;
