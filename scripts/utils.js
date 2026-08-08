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

// Comarques de Catalunya per codi oficial. Els `idComarca` que retorna l'API SMP
// de Meteocat són aquests mateixos codis, per això el mapatge és directe.
// L'SMP també fa servir els codis 88-99 per a zones marítimes, que no hi són.
const COMARQUES = {
  1: 'Alt Camp',        2: 'Alt Empordà',    3: 'Alt Penedès',    4: 'Alt Urgell',
  5: 'Alta Ribagorça',  6: 'Anoia',          7: 'Bages',          8: 'Baix Camp',
  9: 'Baix Ebre',      10: 'Baix Empordà',  11: 'Baix Llobregat',12: 'Baix Penedès',
 13: 'Barcelonès',     14: 'Berguedà',      15: 'Cerdanya',      16: 'Conca de Barberà',
 17: 'Garraf',         18: 'Garrigues',     19: 'Garrotxa',      20: 'Gironès',
 21: 'Maresme',        22: 'Montsià',       23: 'Noguera',       24: 'Osona',
 25: 'Pallars Jussà',  26: 'Pallars Sobirà',27: "Pla d'Urgell",  28: "Pla de l'Estany",
 29: 'Priorat',        30: "Ribera d'Ebre", 31: 'Ripollès',      32: 'Segarra',
 33: 'Segrià',         34: 'Selva',         35: 'Solsonès',      36: 'Tarragonès',
 37: 'Terra Alta',     38: 'Urgell',        39: 'Aran',          40: 'Vallès Occidental',
 41: 'Vallès Oriental',42: 'Moianès',       43: 'Lluçanès'
};

function nomComarca(id) {
  return COMARQUES[id] || `Comarca ${id}`;
}

module.exports = {
  supabaseInsert, supabaseUpsert, supabaseSelect,
  readJSON, writeJSON, avuiMadrid,
  COMARQUES, nomComarca
};
