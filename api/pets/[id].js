// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets/[id].js

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Verify admin credentials
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

// Log action to audit_log
async function logAudit(username, actionType, petId, petName, changes) {
  try {
    await supabase
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
  // Set CORS headers first
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Username, X-Admin-Password");

  // Handle OPTIONS immediately
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const { id } = req.query;
  const petId = id;

  // PUT: Update pet
  if (req.method === "PUT") {
    const username = req.headers['x-admin-username'];
    const password = req.headers['x-admin-password'];

    console.log('[Backend PUT] Username:', username, 'Pet ID:', petId);

    const isValid = await verifyAdmin(username, password);
    if (!isValid) {
      console.log('[Backend PUT] Auth failed');
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { data: oldPet } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      const { name, rarity, tap_stats, gem_stats, value, image_url } = req.body;

      if (!name || !rarity) {
        return res.status(400).json({ error: "Name and rarity are required" });
      }

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

      const changes = {};
      if (oldPet) {
        if (oldPet.name !== name) changes.name = { from: oldPet.name, to: name };
        if (oldPet.rarity !== rarity) changes.rarity = { from: oldPet.rarity, to: rarity };
        if (oldPet.tap_stats !== tap_stats) changes.tap_stats = { from: oldPet.tap_stats, to: tap_stats };
        if (oldPet.gem_stats !== gem_stats) changes.gem_stats = { from: oldPet.gem_stats, to: gem_stats };
        if (oldPet.value !== value) changes.value = { from: oldPet.value, to: value };
      }

      await logAudit(username, 'EDIT', updatedPet.id, updatedPet.name, changes);

      console.log('[Backend PUT] Success:', updatedPet.id);
      return res.status(200).json(updatedPet);
    } catch (err) {
      console.error("[API Error]:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // DELETE: Remove pet
  if (req.method === "DELETE") {
    const username = req.headers['x-admin-username'];
    const password = req.headers['x-admin-password'];

    console.log('[Backend DELETE] Username:', username, 'Pet ID:', petId);

    const isValid = await verifyAdmin(username, password);
    if (!isValid) {
      console.log('[Backend DELETE] Auth failed');
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const { data: pet } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      const { error } = await supabase
        .from("pets")
        .delete()
        .eq("id", petId);

      if (error) {
        console.error("[Supabase Error]:", error);
        return res.status(500).json({ error: "Failed to delete pet" });
      }

      if (pet) {
        await logAudit(username, 'DELETE', pet.id, pet.name, {
          deleted_pet: {
            name: pet.name,
            rarity: pet.rarity,
            tap_stats: pet.tap_stats,
            gem_stats: pet.gem_stats,
            value: pet.value
          }
        });
      }

      console.log('[Backend DELETE] Success:', petId);
      return res.status(200).json({ success: true, message: "Pet deleted" });
    } catch (err) {
      console.error("[API Error]:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets/[id].js
