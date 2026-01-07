// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets.js

// Debug warning (top): This function currently returns static sample data only.
// When Supabase is wired, replace SAMPLE_PETS with a real database query.

const THIRTY_MINUTES_SECONDS = 30 * 60;

// Simple sample data so the frontend has something to render during early setup.
// Later this will come from Supabase.
const SAMPLE_PETS = [
  {
    id: 1,
    name: "Starter Dog",
    rarity: "Common",
    stats: "HP: 50, Speed: 20",
    value: 10,
    imageUrl: ""
  },
  {
    id: 2,
    name: "Lucky Cat",
    rarity: "Rare",
    stats: "HP: 80, Speed: 40",
    value: 120,
    imageUrl: ""
  }
];

// Vercel Node.js serverless handler
export default async function handler(req, res) {
  // Debug warning: Only GET is enabled for now; other methods are blocked.
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed. Use GET." });
  }

  // Set strong CDN caching for Vercel's edge network:
  // - s-maxage=1800 means cache at CDN for 30 minutes.
  // - stale-while-revalidate allows background refresh while serving stale data.
  // Note: Keeping max-age=0 ensures browsers still follow our localStorage logic.
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800"
  );

  // Basic JSON response
  // In the future, this will read data from Supabase instead of static SAMPLE_PETS.
  return res.status(200).json(SAMPLE_PETS);
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets.js
