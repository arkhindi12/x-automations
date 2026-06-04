import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || "9d51666c6afdf90b";

/**
 * Shared Redis connection config for BullMQ.
 * BullMQ requires ioredis — we create one connection per usage (queue, worker, scheduler).
 */
export function createRedisConnection() {
  return new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });
}

export const redisConnectionOpts = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};
