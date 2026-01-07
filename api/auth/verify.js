// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/auth/verify.js

import { createClient } from "@supabase/supabase-js";

// Debug warning: Authentication verification endpoint
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required", valid: false });
    }

    // Query admin_users table
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("id, username, is_active")
      .eq("username", username)
      .eq("password", password)
      .eq("is_active", true)
      .single();

    if (error || !admin) {
      return res.status(200).json({ valid: false });
    }

    // Credentials are valid and user is active
    return res.status(200).json({ valid: true, username: admin.username });
  } catch (err) {
    console.error("[Auth Error]:", err);
    return res.status(500).json({ error: "Internal server error", valid: false });
  }
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/auth/verify.js
