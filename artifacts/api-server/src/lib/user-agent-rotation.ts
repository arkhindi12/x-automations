/**
 * User Agent Rotation System
 * Prevents detection by rotating user agents
 */

const USER_AGENTS = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  
  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  
  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  
  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  
  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

let currentIndex = 0;

/**
 * Get next user agent in rotation
 */
export function getNextUserAgent(): string {
  const userAgent = USER_AGENTS[currentIndex];
  currentIndex = (currentIndex + 1) % USER_AGENTS.length;
  return userAgent;
}

/**
 * Get random user agent
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get user agent for specific account (consistent per account)
 */
export function getUserAgentForAccount(accountId: number): string {
  const index = accountId % USER_AGENTS.length;
  return USER_AGENTS[index];
}

/**
 * Check if user agent is outdated (older than 6 months)
 */
export function isUserAgentOutdated(userAgent: string): boolean {
  // Extract Chrome version
  const chromeMatch = userAgent.match(/Chrome\/(\d+)\./);
  if (chromeMatch) {
    const version = parseInt(chromeMatch[1]);
    const latestVersion = 122; // Update this periodically
    return version < latestVersion - 5; // Consider outdated if 5+ versions behind
  }

  // Extract Firefox version
  const firefoxMatch = userAgent.match(/Firefox\/(\d+)\./);
  if (firefoxMatch) {
    const version = parseInt(firefoxMatch[1]);
    const latestVersion = 122;
    return version < latestVersion - 5;
  }

  return false;
}

/**
 * Get browser headers that match user agent
 */
export function getBrowserHeaders(userAgent: string): Record<string, string> {
  const isChrome = userAgent.includes("Chrome");
  const isFirefox = userAgent.includes("Firefox");
  const isSafari = userAgent.includes("Safari") && !userAgent.includes("Chrome");

  const baseHeaders: Record<string, string> = {
    "User-Agent": userAgent,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };

  if (isChrome) {
    return {
      ...baseHeaders,
      "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
  }

  if (isFirefox) {
    return {
      ...baseHeaders,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
  }

  if (isSafari) {
    return {
      ...baseHeaders,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
  }

  return baseHeaders;
}
