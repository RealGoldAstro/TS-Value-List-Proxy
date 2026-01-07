// File type: Vercel Serverless Function (Node.js API route) - Supabase version
// Path: /api/pets.js

import { createClient } from "@supabase/supabase-js";

const THIRTY_MINUTES_SECONDS = 30 * 60;

// Debug warning: Supabase client uses anon key only (public reads).
// Initialize client with environment variables from .env.local or Vercel settings.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Debug warning: Only GET is enabled for now; other methods are blocked.
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed. Use GET." });
  }

  // Set strong CDN caching for Vercel's edge network (30 minutes)
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800"
  );

  try {
    // Debug warning: Query the 'pets' table (must be created in Supabase first).
    // Fetch all pets, ordered by value descending.
    const { data: pets, error } = await supabase
      .from("pets")
      .select("id, name, rarity, stats, value, image_url")
      .order("value", { ascending: false });

    if (error) {
      console.error("[Supabase Error]:", error);
      return res.status(500).json({ error: "Failed to fetch pets from database" });
    }

    // Return pets array (empty array if no pets exist yet)
    return res.status(200).json(pets || []);
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// File type: Vercel Serverless Function (Node.js API route) - Supabase version
// Path: /api/pets.js
