// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets/[id].js
// Debug warning: Pet update/delete endpoint with miniadmin role restrictions and validation fixes

import { createClient } from '@supabase/supabase-js';

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
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

// Verify admin credentials against database and return role
async function verifyAdmin(username, password) {
  if (!username || !password) return null;

  try {
    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('id, username, is_active, role')
      .eq('username', username)
      .eq('password', password)
      .eq('is_active', true)
      .single();

    return !error && admin ? admin : null;
  } catch (err) {
    console.error('[Auth Error]', err);
    return null;
  }
}

// Log action to audit_log table with role info
async function logAudit(username, actionType, petId, petName, changes, adminRole) {
  if (!supabaseAdmin) {
    console.warn('[Audit Warning] Service role key not configured, skipping audit log');
    return;
  }

  try {
    await supabaseAdmin
      .from('audit_log')
      .insert({
        username,
        action_type: actionType,
        pet_id: petId,
        pet_name: petName,
        changes: changes || {},
        admin_role: adminRole || 'admin'
      });
  } catch (err) {
    console.error('[Audit Log Error]', err);
  }
}

// Debug warning: Fetch webhook URL from database only via service role
async function getWebhookUrl() {
  if (!supabaseAdmin) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('webhook_config')
      .select('webhook_url')
      .eq('webhook_type', 'miniadmin_edits')
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.warn('[Webhook] No active webhook found');
      return null;
    }

    return data.webhook_url;
  } catch (err) {
    console.error('[Webhook Error]', err);
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
    if (changes.value_normal) fields.push({ name: 'Normal Value', value: `${changes.value_normal.from} → ${changes.value_normal.to}`, inline: true });
    if (changes.value_golden) fields.push({ name: 'Golden Value', value: `${changes.value_golden.from} → ${changes.value_golden.to}`, inline: true });
    if (changes.value_rainbow) fields.push({ name: 'Rainbow Value', value: `${changes.value_rainbow.from} → ${changes.value_rainbow.to}`, inline: true });
    if (changes.value_void) fields.push({ name: 'Void Value', value: `${changes.value_void.from} → ${changes.value_void.to}`, inline: true });

    const payload = {
      embeds: [{
        title: '🔧 Mini-Admin Pet Value Update',
        description: `**${username}** edited **${petName}**`,
        color: 0x3b82f6,
        fields: fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'Mini-Admin Edit Log' }
      }]
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('[Webhook] Notification sent for', petName);
  } catch (err) {
    console.error('[Webhook Send Error]', err);
  }
}

export default async function handler(req, res) {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Username, X-Admin-Password');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check if admin client is available
  if (!supabaseAdmin) {
    console.error('[Backend] SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error', details: 'Service role key not configured - contact administrator' });
  }

  // Get pet ID from URL parameter
  const { id } = req.query;
  const petId = parseInt(id);

  console.log('[Backend] Method:', req.method, 'Pet ID:', petId);

  // Validate pet ID is a number
  if (isNaN(petId)) {
    return res.status(400).json({ error: 'Invalid pet ID' });
  }

  // PUT: Update existing pet
  if (req.method === 'PUT') {
    try {
      const username = req.headers['x-admin-username'];
      const password = req.headers['x-admin-password'];

      console.log('[Backend] PUT Username:', username, 'Pet ID:', petId);

      // Check credentials provided
      if (!username || !password) {
        console.log('[Backend] PUT Missing credentials');
        return res.status(401).json({ error: 'Missing credentials' });
      }

      // Verify admin credentials and get role
      const admin = await verifyAdmin(username, password);
      if (!admin) {
        console.log('[Backend] PUT Auth failed');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Debug warning: Extract all fields including how_to_get
      const { name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow, value_void, image_url, how_to_get } = req.body;

      console.log('[Backend] PUT Role:', admin.role, 'Received data:', { name, rarity, stats, stats_type, value_normal, value_golden, value_rainbow, value_void });

      // Get old pet data using admin client for audit comparison
      const { data: existingPets, error: checkError } = await supabaseAdmin
        .from('pets')
        .select('*')
        .eq('id', petId);

      if (checkError) {
        console.error('[Backend] PUT Error checking pet existence:', checkError);
        return res.status(500).json({ error: 'Database error', details: checkError.message });
      }

      if (!existingPets || existingPets.length === 0) {
        console.log('[Backend] PUT Pet not found:', petId);
        return res.status(404).json({ error: 'Pet not found' });
      }

      const oldPet = existingPets[0];
      console.log('[Backend] PUT Found existing pet:', oldPet.name);

      // Debug warning: Miniadmin can only edit the 4 values - NO name/rarity validation needed
      let updateData;
      if (admin.role === 'miniadmin') {
        console.log('[Backend] PUT Miniadmin edit - restricting to values only');
        updateData = {
          value_normal: value_normal || '0',
          value_golden: value_golden || '0',
          value_rainbow: value_rainbow || '0',
          value_void: value_void || '0',
          updated_at: new Date().toISOString()
        };
      } else {
        // Debug warning: Full admin validation - name and rarity required
        if (!name || !rarity) {
          console.log('[Backend] PUT Missing required fields for admin');
          return res.status(400).json({ error: 'Name and rarity are required' });
        }

        // Full admin can edit everything
        updateData = {
          name,
          rarity,
          stats: stats || '0',
          stats_type: stats_type || 'value',
          value_normal: value_normal || '0',
          value_golden: value_golden || '0',
          value_rainbow: value_rainbow || '0',
          value_void: value_void || '0',
          image_url: image_url || null,
          how_to_get: how_to_get || null,
          updated_at: new Date().toISOString()
        };
      }

      // Perform update using admin client (bypasses RLS)
      const { data: updatedPets, error } = await supabaseAdmin
        .from('pets')
        .update(updateData)
        .eq('id', petId)
        .select();

      if (error) {
        console.error('[Backend] PUT Supabase update error:', error);
        return res.status(500).json({ error: 'Failed to update pet', details: error.message });
      }

      if (!updatedPets || updatedPets.length === 0) {
        console.error('[Backend] PUT Update returned no rows');
        return res.status(500).json({ error: 'Update failed - no rows affected' });
      }

      const updatedPet = updatedPets[0];

      // Calculate what changed for audit log
      const changes = {};

      if (admin.role !== 'miniadmin') {
        // Track all changes for full admins
        if (oldPet.name !== name) changes.name = { from: oldPet.name, to: name };
        if (oldPet.rarity !== rarity) changes.rarity = { from: oldPet.rarity, to: rarity };
        if (oldPet.stats !== stats) changes.stats = { from: oldPet.stats, to: stats };
        if (oldPet.stats_type !== stats_type) changes.stats_type = { from: oldPet.stats_type, to: stats_type };
        if (oldPet.image_url !== image_url) changes.image_url = { from: oldPet.image_url || '(none)', to: image_url || '(none)' };
        if (oldPet.how_to_get !== how_to_get) changes.how_to_get = { from: oldPet.how_to_get || '(none)', to: how_to_get || '(none)' };
      }

      // Track value changes for both admin types
      if (oldPet.value_normal !== value_normal) changes.value_normal = { from: oldPet.value_normal, to: value_normal };
      if (oldPet.value_golden !== value_golden) changes.value_golden = { from: oldPet.value_golden, to: value_golden };
      if (oldPet.value_rainbow !== value_rainbow) changes.value_rainbow = { from: oldPet.value_rainbow, to: value_rainbow };
      if (oldPet.value_void !== value_void) changes.value_void = { from: oldPet.value_void, to: value_void };

      // Log to audit_log table
      await logAudit(username, 'EDIT', updatedPet.id, updatedPet.name, changes, admin.role);

      // Debug warning: Send webhook notification ONLY for miniadmin edits
      if (admin.role === 'miniadmin' && Object.keys(changes).length > 0) {
        await sendWebhookNotification(username, updatedPet.name, changes);
      }

      console.log('[Backend] PUT Success - updated pet:', updatedPet.id);
      return res.status(200).json(updatedPet);

    } catch (err) {
      console.error('[Backend] PUT Unexpected error:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  // DELETE: Remove pet from database (admin only, miniadmin cannot delete)
  if (req.method === 'DELETE') {
    try {
      const username = req.headers['x-admin-username'];
      const password = req.headers['x-admin-password'];

      console.log('[Backend] DELETE Username:', username, 'Pet ID:', petId);

      // Check credentials provided
      if (!username || !password) {
        console.log('[Backend] DELETE Missing credentials');
        return res.status(401).json({ error: 'Missing credentials' });
      }

      // Verify admin credentials and get role
      const admin = await verifyAdmin(username, password);
      if (!admin) {
        console.log('[Backend] DELETE Auth failed');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Debug warning: Miniadmin cannot delete pets
      if (admin.role === 'miniadmin') {
        console.log('[Backend] DELETE Miniadmin attempted to delete pet - blocked');
        return res.status(403).json({ error: 'Insufficient permissions. Only admins can delete pets.' });
      }

      // Get pet data before deletion using admin client for audit log
      const { data: pets } = await supabaseAdmin
        .from('pets')
        .select('*')
        .eq('id', petId);

      const pet = pets && pets.length > 0 ? pets[0] : null;

      // Delete using admin client (bypasses RLS)
      const { error } = await supabaseAdmin
        .from('pets')
        .delete()
        .eq('id', petId);

      if (error) {
        console.error('[Backend] DELETE Supabase error:', error);
        return res.status(500).json({ error: 'Failed to delete pet', details: error.message });
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
            value_rainbow: pet.value_rainbow,
            value_void: pet.value_void,
            how_to_get: pet.how_to_get
          }
        }, admin.role);
      }

      console.log('[Backend] DELETE Success:', petId);
      return res.status(200).json({ success: true, message: 'Pet deleted' });

    } catch (err) {
      console.error('[Backend] DELETE Unexpected error:', err);
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
}

// File type: Vercel Serverless Function (Node.js API route)
// Path: /api/pets/[id].js
