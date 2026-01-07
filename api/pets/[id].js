// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets/[id].js

import { createClient } from "@supabase/supabase-js";

// Debug warning: Check if service role key exists on startup
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[FATAL] SUPABASE_SERVICE_ROLE_KEY environment variable is not set!');
}

// Regular client for authentication checks
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client with service role key (bypasses RLS)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Verify admin credentials against database
async function verifyAdmin(username, password) {
  if (!username || !password) return false;

  try {
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("id, username, is_active")
      .eq("username", username)
      .eq("password", password)
      .eq("is_active", true)
      .single();

    return !error && admin;
  } catch (err) {
    console.error("[Auth Error]:", err);
    return false;
  }
}

// Log action to audit_log table
async function logAudit(username, actionType, petId, petName, changes) {
  if (!supabaseAdmin) {
    console.warn("[Audit Warning] Service role key not configured, skipping audit log");
    return;
  }
  
  try {
    await supabaseAdmin
      .from("audit_log")
      .insert([
        {
          username,
          action_type: actionType,
          pet_id: petId,
          pet_name: petName,
          changes: changes || {}
        }
      ]);
  } catch (err) {
    console.error("[Audit Log Error]:", err);
  }
}

export default async function handler(req, res) {
  // Set CORS headers for cross-origin requests
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Username, X-Admin-Password");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Check if admin client is available
  if (!supabaseAdmin) {
    console.error('[Backend] SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).json({ 
      error: "Server configuration error", 
      details: "Service role key not configured - contact administrator" 
    });
  }

  // Get pet ID from URL parameter
  const { id } = req.query;
  const petId = parseInt(id);

  console.log('[Backend] Method:', req.method, 'Pet ID:', petId);

  // Validate pet ID is a number
  if (isNaN(petId)) {
    return res.status(400).json({ error: "Invalid pet ID" });
  }

  // PUT: Update existing pet
  if (req.method === "PUT") {
    try {
      const username = req.headers['x-admin-username'];
      const password = req.headers['x-admin-password'];

      console.log('[Backend PUT] Username:', username, 'Pet ID:', petId);

      // Check credentials provided
      if (!username || !password) {
        console.log('[Backend PUT] Missing credentials');
        return res.status(401).json({ error: "Missing credentials" });
      }

      // Verify admin credentials
      const isValid = await verifyAdmin(username, password);
      if (!isValid) {
        console.log('[Backend PUT] Auth failed');
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Debug warning: Extract all fields including new stats_type field
      const { name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow, image_url } = req.body;

      console.log('[Backend PUT] Updating pet with data:', { name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow });

      // Validate required fields
      if (!name || !rarity) {
        console.log('[Backend PUT] Missing required fields');
        return res.status(400).json({ error: "Name and rarity are required" });
      }

      // Get old pet data using admin client for audit comparison
      const { data: existingPets, error: checkError } = await supabaseAdmin
        .from("pets")
        .select("*")
        .eq("id", petId);

      if (checkError) {
        console.error("[Backend PUT] Error checking pet existence:", checkError);
        return res.status(500).json({ error: "Database error", details: checkError.message });
      }

      if (!existingPets || existingPets.length === 0) {
        console.log('[Backend PUT] Pet not found:', petId);
        return res.status(404).json({ error: "Pet not found" });
      }

      const oldPet = existingPets[0];
      console.log('[Backend PUT] Found existing pet:', oldPet.name);

      // Perform update using admin client (bypasses RLS)
      const { data: updatedPets, error } = await supabaseAdmin
        .from("pets")
        .update({
          name,
          rarity,
          stats: stats || '0',
          stats_type: stats_type || 'value',
          value_normal: value_normal || '0',
          value_golden: value_golden || '0',
          value_rainbow: value_rainbow || '0',
          image_url: image_url || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", petId)
        .select();

      if (error) {
        console.error("[Backend PUT] Supabase update error:", error);
        return res.status(500).json({ error: "Failed to update pet", details: error.message });
      }

      if (!updatedPets || updatedPets.length === 0) {
        console.error("[Backend PUT] Update returned no rows");
        return res.status(500).json({ error: "Update failed - no rows affected" });
      }

      const updatedPet = updatedPets[0];

      // Calculate what changed for audit log
      const changes = {};
      if (oldPet.name !== name) changes.name = { from: oldPet.name, to: name };
      if (oldPet.rarity !== rarity) changes.rarity = { from: oldPet.rarity, to: rarity };
      if (oldPet.stats !== stats) changes.stats = { from: oldPet.stats, to: stats };
      if (oldPet.stats_type !== stats_type) changes.stats_type = { from: oldPet.stats_type, to: stats_type };
      if (oldPet.value_normal !== value_normal) changes.value_normal = { from: oldPet.value_normal, to: value_normal };
      if (oldPet.value_golden !== value_golden) changes.value_golden = { from: oldPet.value_golden, to: value_golden };
      if (oldPet.value_rainbow !== value_rainbow) changes.value_rainbow = { from: oldPet.value_rainbow, to: value_rainbow };
      if (oldPet.image_url !== image_url) changes.image_url = { from: oldPet.image_url ? 'changed' : 'none', to: image_url ? 'changed' : 'none' };

      // Log to audit_log table
      await logAudit(username, 'EDIT', updatedPet.id, updatedPet.name, changes);

      console.log('[Backend PUT] Success - updated pet:', updatedPet.id);
      return res.status(200).json(updatedPet);
    } catch (err) {
      console.error("[Backend PUT] Unexpected error:", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
  }

  // DELETE: Remove pet from database
  if (req.method === "DELETE") {
    try {
      const username = req.headers['x-admin-username'];
      const password = req.headers['x-admin-password'];

      console.log('[Backend DELETE] Username:', username, 'Pet ID:', petId);

      // Check credentials provided
      if (!username || !password) {
        console.log('[Backend DELETE] Missing credentials');
        return res.status(401).json({ error: "Missing credentials" });
      }

      // Verify admin credentials
      const isValid = await verifyAdmin(username, password);
      if (!isValid) {
        console.log('[Backend DELETE] Auth failed');
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get pet data before deletion using admin client for audit log
      const { data: pets } = await supabaseAdmin
        .from("pets")
        .select("*")
        .eq("id", petId);

      const pet = pets && pets.length > 0 ? pets[0] : null;

      // Delete using admin client (bypasses RLS)
      const { error } = await supabaseAdmin
        .from("pets")
        .delete()
        .eq("id", petId);

      if (error) {
        console.error("[Backend DELETE] Supabase error:", error);
        return res.status(500).json({ error: "Failed to delete pet", details: error.message });
      }

      // Log deleted pet data to audit_log
      if (pet) {
        await logAudit(username, 'DELETE', pet.id, pet.name, {
          deleted_pet: {
            name: pet.name,
            rarity: pet.rarity,
            stats: pet.stats,
            stats_type: pet.stats_type,
            value_normal: pet.value_normal,
            value_golden: pet.value_golden,
            value_rainbow: pet.value_rainbow
          }
        });
      }

      console.log('[Backend DELETE] Success:', petId);
      return res.status(200).json({ success: true, message: "Pet deleted" });
    } catch (err) {
      console.error("[Backend DELETE] Unexpected error:", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: "Method not allowed" });
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets/[id].js
