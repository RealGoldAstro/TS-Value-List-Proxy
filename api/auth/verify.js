// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/auth/verify.js

import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, getClientIP, formatWaitTime } from "../utils/rateLimiter.js";

// Debug warning: Authentication verification endpoint with 2-minute rate limit on failed attempts
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Rate limit config: 2 minutes (120000ms) cooldown after login attempt
const LOGIN_COOLDOWN_MS = 2 * 60 * 1000;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get client IP for rate limiting
  const clientIP = getClientIP(req);
  const rateLimitKey = `login_${clientIP}`;

  // Check rate limit (1 attempt per 2 minutes)
  const rateCheck = checkRateLimit(rateLimitKey, LOGIN_COOLDOWN_MS, 1);
  
  if (!rateCheck.allowed) {
    const waitTime = formatWaitTime(rateCheck.resetTime);
    console.log(`[Auth] Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({ 
      error: `Too many login attempts. Please try again in ${waitTime}.`,
      valid: false,
      retryAfter: Math.ceil((rateCheck.resetTime - Date.now()) / 1000)
    });
  }

  try {
    const { username, password } = req.body;

    console.log('[Auth] Verifying credentials for username:', username);

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required", valid: false });
    }

    // Query admin_users table with role info
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("id, username, is_active, password, role")
      .eq("username", username)
      .eq("is_active", true)
      .single();

    if (error) {
      console.log('[Auth] Database error:', error);
      return res.status(200).json({ valid: false, reason: 'User not found or not active' });
    }

    if (!admin) {
      console.log('[Auth] No admin found for username:', username);
      return res.status(200).json({ valid: false, reason: 'Invalid username' });
    }

    // Check password match
    if (admin.password !== password) {
      console.log('[Auth] Password mismatch for username:', username);
      return res.status(200).json({ valid: false, reason: 'Invalid password' });
    }

    // Debug warning: Successful login returns valid response
    console.log('[Auth] Credentials valid for:', username, 'Role:', admin.role || 'admin');
    return res.status(200).json({ 
      valid: true, 
      username: admin.username,
      role: admin.role || 'admin'
    });
  } catch (err) {
    console.error("[Auth Error]:", err);
    return res.status(500).json({ error: "Internal server error", valid: false });
  }
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/auth/verify.js
