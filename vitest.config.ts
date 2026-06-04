import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/types.ts",
        "**/*.d.ts",
      ],
    },
    include: [
      "artifacts/**/src/**/*.test.ts",
      "artifacts/**/src/**/*.spec.ts",
      "lib/**/src/**/*.test.ts",
      "lib/**/src/**/*.spec.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(__dirname, "./lib/db/src"),
      "@workspace/api-zod": path.resolve(__dirname, "./lib/api-zod/src"),
    },
  },
});
