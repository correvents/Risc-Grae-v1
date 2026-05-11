const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseInsert(table, rows) {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    if (!resp.ok) throw new Error(`Supabase ${table} insert error ${resp.status}: ${await resp.text()}`);
  }
  console.log(`✅ Supabase ${table}: ${rows.length} files`);
}

async function supabaseUpsert(table, rows) {
  const data = Array.isArray(rows) ? rows : [rows];
  if (data.length === 0) return;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(data)
  });
  if (!resp.ok) throw new Error(`Supabase ${table} upsert error ${resp.status}: ${await resp.text()}`);
  console.log(`✅ Supabase ${table}: ${data.length} files`);
}

async function supabaseSelect(table, filters = {}) {
  const params = new URLSearchParams({ select: '*' });
  for (const [k, v] of Object.entries(filters)) params.append(k, `eq.${v}`);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!resp.ok) throw new Error(`Supabase ${table} select error ${resp.status}`);
  return resp.json();
}

function readJSON(filename) {
  const filepath = path.join('data', filename);
  if (!fs.existsSync(filepath)) return null;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')); } catch { return null; }
}

function writeJSON(filename, data) {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(path.join('data', filename), JSON.stringify(data, null, 2));
  console.log(`📁 Escrit data/${filename}`);
}

function avuiMadrid() {
  return new Date().toLocaleString('sv', { timeZone: 'Europe/Madrid' }).split(' ')[0];
}

module.exports = { supabaseInsert, supabaseUpsert, supabaseSelect, readJSON, writeJSON, avuiMadrid };
