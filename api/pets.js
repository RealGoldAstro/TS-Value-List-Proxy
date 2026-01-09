// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets.js

import { createClient } from "@supabase/supabase-js";

const THIRTY_MINUTES_SECONDS = 30 * 60;

// Debug warning: Supabase client for database operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client with service role key (bypasses RLS)
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Verify admin credentials against database and return role
async function verifyAdmin(username, password) {
  if (!username || !password) return null;

  try {
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("id, username, is_active, role")
      .eq("username", username)
      .eq("password", password)
      .eq("is_active", true)
      .single();

    return !error && admin ? admin : null;
  } catch (err) {
    console.error("[Auth Error]:", err);
    return null;
  }
}

// Log action to audit_log table with role info
async function logAudit(username, actionType, petId, petName, changes, adminRole) {
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
          changes: changes || {},
          admin_role: adminRole || 'admin'
        }
      ]);
  } catch (err) {
    console.error("[Audit Log Error]:", err);
  }
}

// Debug warning: Fetch webhook URL from database (only via service role)
async function getWebhookUrl() {
  if (!supabaseAdmin) return null;
  
  try {
    const { data, error } = await supabaseAdmin
      .from("webhook_config")
      .select("webhook_url")
      .eq("webhook_type", "miniadmin_edits")
      .eq("is_active", true)
      .single();
    
    if (error || !data) {
      console.warn("[Webhook] No active webhook found");
      return null;
    }
    
    return data.webhook_url;
  } catch (err) {
    console.error("[Webhook Error]:", err);
    return null;
  }
}

// Debug warning: Send webhook notification for miniadmin edits
async function sendWebhookNotification(username, petName, changes) {
  try {
    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) return;
    
    // Build embed message with changes
    const fields = [];
    if (changes.value_normal) {
      fields.push({
        name: "Normal Value",
        value: `${changes.value_normal.from} → ${changes.value_normal.to}`,
        inline: true
      });
    }
    if (changes.value_golden) {
      fields.push({
        name: "Golden Value",
        value: `${changes.value_golden.from} → ${changes.value_golden.to}`,
        inline: true
      });
    }
    if (changes.value_rainbow) {
      fields.push({
        name: "Rainbow Value",
        value: `${changes.value_rainbow.from} → ${changes.value_rainbow.to}`,
        inline: true
      });
    }
    if (changes.value_void) {
      fields.push({
        name: "Void Value",
        value: `${changes.value_void.from} → ${changes.value_void.to}`,
        inline: true
      });
    }
    
    const payload = {
      embeds: [{
        title: "🔧 Mini-Admin Pet Value Update",
        description: `**${username}** edited **${petName}**`,
        color: 0x3b82f6,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: {
          text: "Mini-Admin Edit Log"
        }
      }]
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log('[Webhook] Notification sent for:', petName);
  } catch (err) {
    console.error("[Webhook Send Error]:", err);
  }
}

// Set CORS headers for cross-origin requests
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Username, X-Admin-Password");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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

// GET: Fetch all pets from database (includes how_to_get field)
async function handleGet(req, res) {
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800"
  );

  try {
    // Debug warning: Now includes how_to_get field
    const { data: pets, error } = await supabase
      .from("pets")
      .select("id, name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow, value_void, image_url, how_to_get, updated_at")
      .order("id", { ascending: false });

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

// POST: Create new pet (admin only, miniadmin cannot create)
async function handlePost(req, res) {
  const username = req.headers['x-admin-username'];
  const password = req.headers['x-admin-password'];

  console.log('[Backend] POST request - Username:', username);

  if (!supabaseAdmin) {
    console.error('[Backend] Service role key not configured');
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Verify admin credentials and get role
  const admin = await verifyAdmin(username, password);
  if (!admin) {
    console.log('[Backend] Authentication failed');
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // Debug warning: Miniadmin cannot create pets
  if (admin.role === 'miniadmin') {
    console.log('[Backend] Miniadmin attempted to create pet - blocked');
    return res.status(403).json({ error: "Insufficient permissions. Only admins can create pets." });
  }

  try {
    const { name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow, value_void, image_url, how_to_get } = req.body;

    if (!name || !rarity) {
      return res.status(400).json({ error: "Name and rarity are required" });
    }

    const { data: newPet, error } = await supabaseAdmin
      .from("pets")
      .insert([
        {
          name,
          rarity,
          stats: stats || '0',
          stats_type: stats_type || 'value',
          value_normal: value_normal || '0',
          value_golden: value_golden || '0',
          value_rainbow: value_rainbow || '0',
          value_void: value_void || '1',
          image_url: image_url || null,
          how_to_get: how_to_get || null,
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("[Supabase Error]:", error);
      return res.status(500).json({ error: "Failed to create pet" });
    }

    await logAudit(username, 'ADD', newPet.id, newPet.name, {
      name,
      rarity,
      stats: stats || '0',
      stats_type: stats_type || 'value',
      value_normal: value_normal || '0',
      value_golden: value_golden || '0',
      value_rainbow: value_rainbow || '0',
      value_void: value_void || '1',
      how_to_get: how_to_get || null
    }, admin.role);

    console.log('[Backend] Pet created successfully:', newPet.id);
    return res.status(201).json(newPet);
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// PUT: Update existing pet
async function handlePut(req, res) {
  const username = req.headers['x-admin-username'];
  const password = req.headers['x-admin-password'];

  console.log('[Backend] PUT request - Username:', username);

  if (!supabaseAdmin) {
    console.error('[Backend] Service role key not configured');
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Verify admin credentials and get role
  const admin = await verifyAdmin(username, password);
  if (!admin) {
    console.log('[Backend] Authentication failed');
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const urlParts = req.url.split('/');
    const petId = urlParts[urlParts.length - 1];

    console.log('[Backend] Updating pet ID:', petId);

    if (!petId || petId === 'pets' || isNaN(petId)) {
      return res.status(400).json({ error: "Pet ID is required" });
    }

    // Get current pet data
    const { data: oldPet } = await supabaseAdmin
      .from("pets")
      .select("*")
      .eq("id", petId)
      .single();

    const { name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow, value_void, image_url, how_to_get } = req.body;

    if (!name || !rarity) {
      return res.status(400).json({ error: "Name and rarity are required" });
    }
    
    // Debug warning: Miniadmin can only edit the 4 values
    let updateData = {};
    if (admin.role === 'miniadmin') {
      console.log('[Backend] Miniadmin edit - restricting to values only');
      updateData = {
        value_normal: value_normal || '0',
        value_golden: value_golden || '0',
        value_rainbow: value_rainbow || '0',
        value_void: value_void || '1',
        updated_at: new Date().toISOString()
      };
    } else {
      // Full admin can edit everything
      updateData = {
        name,
        rarity,
        stats: stats || '0',
        stats_type: stats_type || 'value',
        value_normal: value_normal || '0',
        value_golden: value_golden || '0',
        value_rainbow: value_rainbow || '0',
        value_void: value_void || '1',
        image_url: image_url || null,
        how_to_get: how_to_get || null,
        updated_at: new Date().toISOString()
      };
    }

    const { data: updatedPet, error } = await supabaseAdmin
      .from("pets")
      .update(updateData)
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

    // Calculate what changed for audit log
    const changes = {};
    if (oldPet) {
      if (admin.role !== 'miniadmin') {
        if (oldPet.name !== name) changes.name = { from: oldPet.name, to: name };
        if (oldPet.rarity !== rarity) changes.rarity = { from: oldPet.rarity, to: rarity };
        if (oldPet.stats !== stats) changes.stats = { from: oldPet.stats, to: stats };
        if (oldPet.stats_type !== stats_type) changes.stats_type = { from: oldPet.stats_type, to: stats_type };
        if (oldPet.image_url !== image_url) changes.image_url = { from: oldPet.image_url ? 'changed' : 'none', to: image_url ? 'changed' : 'none' };
        if (oldPet.how_to_get !== how_to_get) changes.how_to_get = { from: oldPet.how_to_get ? 'changed' : 'none', to: how_to_get ? 'changed' : 'none' };
      }
      // Track value changes for both admin types
      if (oldPet.value_normal !== value_normal) changes.value_normal = { from: oldPet.value_normal, to: value_normal };
      if (oldPet.value_golden !== value_golden) changes.value_golden = { from: oldPet.value_golden, to: value_golden };
      if (oldPet.value_rainbow !== value_rainbow) changes.value_rainbow = { from: oldPet.value_rainbow, to: value_rainbow };
      if (oldPet.value_void !== value_void) changes.value_void = { from: oldPet.value_void, to: value_void };
    }

    // Log to audit_log
    await logAudit(username, 'EDIT', updatedPet.id, updatedPet.name, changes, admin.role);
    
    // Debug warning: Send webhook notification ONLY for miniadmin edits
    if (admin.role === 'miniadmin' && Object.keys(changes).length > 0) {
      await sendWebhookNotification(username, updatedPet.name, changes);
    }

    console.log('[Backend] Pet updated successfully:', updatedPet.id);
    return res.status(200).json(updatedPet);
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// DELETE: Remove pet from database (admin only, miniadmin cannot delete)
async function handleDelete(req, res) {
  const username = req.headers['x-admin-username'];
  const password = req.headers['x-admin-password'];

  console.log('[Backend] DELETE request - Username:', username);

  if (!supabaseAdmin) {
    console.error('[Backend] Service role key not configured');
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Verify admin credentials and get role
  const admin = await verifyAdmin(username, password);
  if (!admin) {
    console.log('[Backend] Authentication failed');
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // Debug warning: Miniadmin cannot delete pets
  if (admin.role === 'miniadmin') {
    console.log('[Backend] Miniadmin attempted to delete pet - blocked');
    return res.status(403).json({ error: "Insufficient permissions. Only admins can delete pets." });
  }

  try {
    const urlParts = req.url.split('/');
    const petId = urlParts[urlParts.length - 1];

    console.log('[Backend] Deleting pet ID:', petId);

    if (!petId || petId === 'pets' || isNaN(petId)) {
      return res.status(400).json({ error: "Pet ID is required" });
    }

    const { data: pet } = await supabaseAdmin
      .from("pets")
      .select("*")
      .eq("id", petId)
      .single();

    const { error } = await supabaseAdmin
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
          stats: pet.stats,
          stats_type: pet.stats_type,
          value_normal: pet.value_normal,
          value_golden: pet.value_golden,
          value_rainbow: pet.value_rainbow,
          value_void: pet.value_void,
          how_to_get: pet.how_to_get
        }
      }, admin.role);
    }

    console.log('[Backend] Pet deleted successfully:', petId);
    return res.status(200).json({ success: true, message: "Pet deleted" });
  } catch (err) {
    console.error("[API Error]:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets.js
