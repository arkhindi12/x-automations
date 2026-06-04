import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import embedPlayerRouter from "./routes/embed-player";
import { logger } from "./lib/logger";
import { apiLimiter } from "./lib/rate-limiter";
import { errorHandler, notFoundHandler } from "./lib/error-handler";
import { performanceMonitor } from "./lib/performance-monitor";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Performance monitoring
app.use(performanceMonitor);

// Apply rate limiting to all API routes
app.use("/api", apiLimiter);

// Serve static frontend build
const frontendDistPath = path.resolve(__dirname, "../../x-automation/dist/public");
app.use(express.static(frontendDistPath));

// Serve uploaded files (payment proofs)
const uploadsPath = path.resolve(process.cwd(), "uploads");
app.use("/uploads", express.static(uploadsPath));

// Embed player pages and redirect URLs served at root (not under /api)
app.use(embedPlayerRouter);

// API routes
app.use("/api", router);

// Serve index.html for all non-API routes (SPA fallback)
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/e/") || req.path.startsWith("/r/")) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
