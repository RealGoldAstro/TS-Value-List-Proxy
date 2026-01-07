// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets.js

import { createClient } from "@supabase/supabase-js";

const THIRTY_MINUTES_SECONDS = 30 * 60;

// Debug warning: Supabase client for database operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Simple auth check (basic protection)
function isAuthorized(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  
  // Debug warning: Basic auth check, can be enhanced with JWT later
  const token = authHeader.replace('Bearer ', '');
  return token === 'tsadmin'; // Matches hardcoded frontend username
}

export default async function handler(req, res) {
  // CORS headers for cross-origin requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Route to appropriate handler
  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "POST":
      return handlePost(req, res);
    case "PUT":
      return handlePut(req, res);
    case "DELETE":
      return handleDelete(req, res);
    default:
      res.setHeader("Allow", "GET, POST, PUT, DELETE, OPTIONS");
      return res.status(405).json({ error: "Method not allowed" });
  }
}

// GET: Fetch all pets
async function handleGet(req, res) {
  // Set CDN caching
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800"
  );

  try {
    const { data: pets, error } = await supabase
      .from("pets")
      .select("id, name, rarity, tap_stats, gem_stats, value, image_url, updated_at")
      .order("value", { ascending: false });

    if (error) {
      console.error("[Supabase Error]:", error);
      return res.status(500).json({ error: "Failed to fetch pets" });
    }

    return res.status(200).json(pets || []);
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// POST: Create new pet
async function handlePost(req, res) {
  // Check authorization
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { name, rarity, tap_stats, gem_stats, value, image_url } = req.body;

    // Validate required fields
    if (!name || !rarity) {
      return res.status(400).json({ error: "Name and rarity are required" });
    }

    // Insert into database
    const { data: newPet, error } = await supabase
      .from("pets")
      .insert([
        {
          name,
          rarity,
          tap_stats: tap_stats || 0,
          gem_stats: gem_stats || 0,
          value: value || 0,
          image_url: image_url || null,
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("[Supabase Error]:", error);
      return res.status(500).json({ error: "Failed to create pet" });
    }

    return res.status(201).json(newPet);
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// PUT: Update existing pet
async function handlePut(req, res) {
  // Check authorization
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Extract pet ID from URL query (e.g., /api/pets?id=123 or /api/pets/123)
    const petId = req.query.id || req.url.split('/').pop();

    if (!petId || petId === 'pets') {
      return res.status(400).json({ error: "Pet ID is required" });
    }

    const { name, rarity, tap_stats, gem_stats, value, image_url } = req.body;

    // Validate required fields
    if (!name || !rarity) {
      return res.status(400).json({ error: "Name and rarity are required" });
    }

    // Update in database
    const { data: updatedPet, error } = await supabase
      .from("pets")
      .update({
        name,
        rarity,
        tap_stats: tap_stats || 0,
        gem_stats: gem_stats || 0,
        value: value || 0,
        image_url: image_url || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", petId)
      .select()
      .single();

    if (error) {
      console.error("[Supabase Error]:", error);
      return res.status(500).json({ error: "Failed to update pet" });
    }

    if (!updatedPet) {
      return res.status(404).json({ error: "Pet not found" });
    }

    return res.status(200).json(updatedPet);
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// DELETE: Remove pet
async function handleDelete(req, res) {
  // Check authorization
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Extract pet ID from URL query
    const petId = req.query.id || req.url.split('/').pop();

    if (!petId || petId === 'pets') {
      return res.status(400).json({ error: "Pet ID is required" });
    }

    // Delete from database
    const { error } = await supabase
      .from("pets")
      .delete()
      .eq("id", petId);

    if (error) {
      console.error("[Supabase Error]:", error);
      return res.status(500).json({ error: "Failed to delete pet" });
    }

    return res.status(200).json({ success: true, message: "Pet deleted" });
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets.js
