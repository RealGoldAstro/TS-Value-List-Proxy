// File type: Node.js Module (Utility)
// Path: /api/utils/rateLimiter.js

// Debug warning: Rate limiting utility for protecting backend endpoints from abuse
// Tracks IP addresses and enforces time-based cooldowns

// In-memory store for rate limiting (resets on cold start)
const rateLimitStore = new Map();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Rate limiter configuration
 * @param {string} identifier - Usually IP address or IP+endpoint combo
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxAttempts - Max attempts allowed in window
 * @returns {Object} { allowed: boolean, resetTime: number, attemptsLeft: number }
 */
function checkRateLimit(identifier, windowMs, maxAttempts = 1) {
  const now = Date.now();
  
  if (!rateLimitStore.has(identifier)) {
    // First request - allow and initialize
    rateLimitStore.set(identifier, {
      attempts: 1,
      resetTime: now + windowMs,
      firstAttempt: now
    });
    
    return {
      allowed: true,
      resetTime: now + windowMs,
      attemptsLeft: maxAttempts - 1
    };
  }
  
  const record = rateLimitStore.get(identifier);
  
  // Check if window expired - reset counter
  if (now >= record.resetTime) {
    rateLimitStore.set(identifier, {
      attempts: 1,
      resetTime: now + windowMs,
      firstAttempt: now
    });
    
    return {
      allowed: true,
      resetTime: now + windowMs,
      attemptsLeft: maxAttempts - 1
    };
  }
  
  // Within window - check if under limit
  if (record.attempts < maxAttempts) {
    record.attempts++;
    return {
      allowed: true,
      resetTime: record.resetTime,
      attemptsLeft: maxAttempts - record.attempts
    };
  }
  
  // Rate limit exceeded
  return {
    allowed: false,
    resetTime: record.resetTime,
    attemptsLeft: 0
  };
}

/**
 * Get client IP from request
 * @param {Object} req - Vercel request object
 * @returns {string} IP address
 */
function getClientIP(req) {
  // Vercel provides IP in headers
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.connection?.remoteAddress 
    || 'unknown';
}

/**
 * Format remaining time for user-friendly messages
 * @param {number} resetTime - Timestamp when limit resets
 * @returns {string} Human-readable time
 */
function formatWaitTime(resetTime) {
  const seconds = Math.ceil((resetTime - Date.now()) / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

// Export functions
export { checkRateLimit, getClientIP, formatWaitTime };

// File type: Node.js Module (Utility)
// Path: /api/utils/rateLimiter.js
