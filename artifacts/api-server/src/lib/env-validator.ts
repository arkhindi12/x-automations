/**
 * Environment variable validation
 * Validates all required environment variables at startup
 */

interface EnvConfig {
  DATABASE_URL: string;
  PORT: number;
  NODE_ENV: "development" | "production" | "test";
  LOG_LEVEL?: string;
  NINEPROXY_API_KEY?: string;
  NINEPROXY_GATEWAY?: string;
  NINEPROXY_BASE_URL?: string;
}

class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

function validatePort(value: string | undefined, name: string): number {
  if (!value) {
    throw new EnvValidationError(`${name} environment variable is required but was not provided.`);
  }

  const port = Number(value);

  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new EnvValidationError(`Invalid ${name} value: "${value}". Must be a number between 1 and 65535.`);
  }

  return port;
}

function validateDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new EnvValidationError(
      "DATABASE_URL environment variable is required but was not provided. " +
      "Did you forget to provision a database?"
    );
  }

  // Basic validation for PostgreSQL connection string
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
    throw new EnvValidationError(
      `Invalid DATABASE_URL format. Expected PostgreSQL connection string starting with "postgresql://" or "postgres://"`
    );
  }

  return value;
}

function validateNodeEnv(value: string | undefined): "development" | "production" | "test" {
  const env = value || "development";
  
  if (env !== "development" && env !== "production" && env !== "test") {
    throw new EnvValidationError(
      `Invalid NODE_ENV value: "${env}". Must be one of: development, production, test`
    );
  }

  return env;
}

/**
 * Validates and returns typed environment configuration
 * Throws EnvValidationError if validation fails
 */
export function validateEnv(): EnvConfig {
  const errors: string[] = [];

  let DATABASE_URL: string;
  let PORT: number;
  let NODE_ENV: "development" | "production" | "test";

  try {
    DATABASE_URL = validateDatabaseUrl(process.env.DATABASE_URL);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    DATABASE_URL = ""; // Placeholder to continue validation
  }

  try {
    PORT = validatePort(process.env.PORT, "PORT");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    PORT = 0; // Placeholder
  }

  try {
    NODE_ENV = validateNodeEnv(process.env.NODE_ENV);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    NODE_ENV = "development"; // Placeholder
  }

  // If there are any errors, throw with all messages
  if (errors.length > 0) {
    throw new EnvValidationError(
      "Environment validation failed:\n" + errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")
    );
  }

  return {
    DATABASE_URL,
    PORT,
    NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NINEPROXY_API_KEY: process.env.NINEPROXY_API_KEY,
    NINEPROXY_GATEWAY: process.env.NINEPROXY_GATEWAY,
    NINEPROXY_BASE_URL: process.env.NINEPROXY_BASE_URL,
  };
}

/**
 * Get validated environment config
 * Call this after validateEnv() has been called
 */
export function getEnv(): EnvConfig {
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    PORT: Number(process.env.PORT),
    NODE_ENV: (process.env.NODE_ENV || "development") as "development" | "production" | "test",
    LOG_LEVEL: process.env.LOG_LEVEL,
    NINEPROXY_API_KEY: process.env.NINEPROXY_API_KEY,
    NINEPROXY_GATEWAY: process.env.NINEPROXY_GATEWAY,
    NINEPROXY_BASE_URL: process.env.NINEPROXY_BASE_URL,
  };
}
