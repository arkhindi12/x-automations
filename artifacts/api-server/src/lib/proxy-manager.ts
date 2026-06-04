/**
 * Enhanced Proxy Manager
 * Better proxy rotation and health checking
 */

import { logger } from "./logger";

interface ProxyConfig {
  url: string;
  lastUsed: Date;
  failCount: number;
  successCount: number;
  avgResponseTime: number;
  isHealthy: boolean;
}

const proxyPool = new Map<string, ProxyConfig>();
let currentProxyIndex = 0;

/**
 * Add proxy to pool
 */
export function addProxy(url: string) {
  if (!proxyPool.has(url)) {
    proxyPool.set(url, {
      url,
      lastUsed: new Date(0),
      failCount: 0,
      successCount: 0,
      avgResponseTime: 0,
      isHealthy: true,
    });
  }
}

/**
 * Get next healthy proxy
 */
export function getNextProxy(): string | null {
  const healthyProxies = Array.from(proxyPool.values())
    .filter(p => p.isHealthy)
    .sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());

  if (healthyProxies.length === 0) {
    // No healthy proxies, try to recover
    recoverProxies();
    return null;
  }

  const proxy = healthyProxies[0];
  proxy.lastUsed = new Date();
  return proxy.url;
}

/**
 * Get best performing proxy
 */
export function getBestProxy(): string | null {
  const healthyProxies = Array.from(proxyPool.values())
    .filter(p => p.isHealthy && p.successCount > 0)
    .sort((a, b) => {
      // Sort by success rate and response time
      const aScore = (a.successCount / (a.successCount + a.failCount)) / (a.avgResponseTime || 1000);
      const bScore = (b.successCount / (b.successCount + b.failCount)) / (b.avgResponseTime || 1000);
      return bScore - aScore;
    });

  if (healthyProxies.length === 0) {
    return getNextProxy();
  }

  const proxy = healthyProxies[0];
  proxy.lastUsed = new Date();
  return proxy.url;
}

/**
 * Report proxy success
 */
export function reportProxySuccess(url: string, responseTime: number) {
  const proxy = proxyPool.get(url);
  if (!proxy) return;

  proxy.successCount++;
  proxy.failCount = Math.max(0, proxy.failCount - 1); // Reduce fail count on success
  
  // Update average response time
  if (proxy.avgResponseTime === 0) {
    proxy.avgResponseTime = responseTime;
  } else {
    proxy.avgResponseTime = (proxy.avgResponseTime * 0.8) + (responseTime * 0.2);
  }

  proxy.isHealthy = true;
}

/**
 * Report proxy failure
 */
export function reportProxyFailure(url: string, error: string) {
  const proxy = proxyPool.get(url);
  if (!proxy) return;

  proxy.failCount++;

  logger.warn({
    proxyUrl: url.substring(0, 50),
    failCount: proxy.failCount,
    error,
  }, "Proxy failure reported");

  // Mark as unhealthy if too many failures
  if (proxy.failCount > 3) {
    proxy.isHealthy = false;
    logger.error({
      proxyUrl: url.substring(0, 50),
      failCount: proxy.failCount,
    }, "Proxy marked as unhealthy");
  }
}

/**
 * Recover unhealthy proxies
 */
function recoverProxies() {
  let recovered = 0;
  for (const proxy of proxyPool.values()) {
    if (!proxy.isHealthy && proxy.failCount < 10) {
      proxy.isHealthy = true;
      proxy.failCount = Math.floor(proxy.failCount / 2);
      recovered++;
    }
  }

  if (recovered > 0) {
    logger.info({ recovered }, "Recovered unhealthy proxies");
  }
}

/**
 * Get proxy statistics
 */
export function getProxyStats() {
  const stats = {
    total: proxyPool.size,
    healthy: 0,
    unhealthy: 0,
    proxies: [] as Array<{
      url: string;
      isHealthy: boolean;
      successRate: number;
      avgResponseTime: number;
      lastUsed: string;
    }>,
  };

  for (const proxy of proxyPool.values()) {
    if (proxy.isHealthy) {
      stats.healthy++;
    } else {
      stats.unhealthy++;
    }

    const total = proxy.successCount + proxy.failCount;
    const successRate = total > 0 ? (proxy.successCount / total) * 100 : 0;

    stats.proxies.push({
      url: proxy.url.substring(0, 50) + "...",
      isHealthy: proxy.isHealthy,
      successRate: Math.round(successRate),
      avgResponseTime: Math.round(proxy.avgResponseTime),
      lastUsed: proxy.lastUsed.toISOString(),
    });
  }

  return stats;
}

/**
 * Remove proxy from pool
 */
export function removeProxy(url: string) {
  proxyPool.delete(url);
  logger.info({ proxyUrl: url.substring(0, 50) }, "Proxy removed from pool");
}

/**
 * Clear all proxies
 */
export function clearProxyPool() {
  proxyPool.clear();
  logger.info("Proxy pool cleared");
}

/**
 * Reset proxy statistics
 */
export function resetProxyStats() {
  for (const proxy of proxyPool.values()) {
    proxy.failCount = 0;
    proxy.successCount = 0;
    proxy.avgResponseTime = 0;
    proxy.isHealthy = true;
  }
  logger.info("Proxy statistics reset");
}
