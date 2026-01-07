// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/online.js

// Debug warning (top): This is a simple fake counter for now.
// Later, it will query Supabase for real online user count.

const THIRTY_MINUTES_SECONDS = 30 * 60;

// Simple fake counter for early testing.
// Later, this will come from Supabase (e.g. active sessions).
const FAKE_ONLINE_COUNT = 42;

// Vercel Node.js serverless handler
export default async function handler(req, res) {
  // Debug warning: Only GET is enabled for now; other methods are blocked.
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed. Use GET." });
  }

  // Same CDN caching strategy as /api/pets:
  // - s-maxage=1800 caches at Vercel edge for 30 minutes.
  // - max-age=0 lets frontend handle its own cache.
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800"
  );

  // Return simple JSON response.
  // In the future, this will query Supabase instead of static FAKE_ONLINE_COUNT.
  return res.status(200).json({ count: FAKE_ONLINE_COUNT });
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/online.js
