const { supabaseUpsert, readJSON, writeJSON } = require('./utils');

const FORCE = process.env.FORCE === 'true';
const GIST_TOKEN = process.env.GIST_TOKEN;
const GIST_ID = 'bf2beb9bca2a338f7b06180b14ab139f';

const PERILL_NOM = { 1: 'FEBLE', 2: 'MODERAT', 3: 'MARCAT', 4: 'FORT', 5: 'MOLT FORT' };

async function getBPA() {
  for (let i = 0; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    try {
      const resp = await fetch(`https://bpa.icgc.cat/api/apiext/butlletiglobal?id=512&values=${date};1`);
      if (!resp.ok) continue;
      const zones = await resp.json();
      if (Array.isArray(zones) && zones.length > 0) return { date, zones };
    } catch {}
  }
  throw new Error('No BPA disponible en els últims 7 dies');
}

async function main() {
  const { date, zones } = await getBPA();

  const zonesF = zones.map(z => ({
    nom:               z.nom_zona,
    perill:            z.perill_numeric ? `${PERILL_NOM[z.perill_numeric] || '?'} (${z.perill_numeric})` : '',
    perill_numeric:    z.perill_numeric || 0,
    cota_critica:      z.cota_critica || '',
    situacio_primaria: z.problems?.find(p => p.priority == 1)?.tipus_situacio || '',
    situacio_secundaria: z.problems?.find(p => p.priority == 2)?.tipus_situacio || '',
    distribucio_mantell: z.text_distribucio || '',
    tendencia:         z.text_tendencia || '',
    problems:          z.problems || []
  }));

  const maxPerill = Math.max(0, ...zonesF.map(z => z.perill_numeric));
  const bpa = {
    data: date,
    actualitzat: new Date().toISOString(),
    font: 'ICGC - Institut Cartogràfic i Geològic de Catalunya',
    url_pdf: `https://bpa.icgc.cat/butlletigenerator/bpadoc/bpa_${date}_cat.pdf`,
    zones: zonesF,
    resum: {
      perill_maxim:         PERILL_NOM[maxPerill] || 'Desconegut',
      perill_maxim_numeric: maxPerill,
      zones_alt_perill:     zonesF.filter(z => z.perill_numeric >= 3).map(z => z.nom),
      recomanacio: maxPerill >= 3
        ? 'Es recomana molta prudència. Evitar terreny allavós.'
        : 'Precaució en zones exposades.'
    }
  };

  const anterior = readJSON('bpa_latest.json');
  const changed = !anterior || anterior.data !== date ||
    JSON.stringify(anterior.zones?.map(z => z.perill_numeric)) !==
    JSON.stringify(zonesF.map(z => z.perill_numeric));

  writeJSON('bpa_latest.json', bpa);

  // Actualitzar Gist
  if (GIST_TOKEN) {
    const gr = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { 'bpa_latest.json': { content: JSON.stringify(bpa) } } })
    });
    if (gr.ok) console.log('✅ Gist actualitzat');
    else console.warn('⚠️ Gist error:', gr.status);
  }

  if (FORCE || changed) {
    await supabaseUpsert('bpa_historic', zonesF.map(z => ({
      data: date, zona: z.nom, perill: z.perill_numeric || null,
      cota_critica: z.cota_critica || null,
      situacio_prim: z.situacio_primaria || null,
      situacio_sec: z.situacio_secundaria || null,
      problems: z.problems?.length ? z.problems : null
    })));
    console.log(changed ? `🔄 Nou BPA: ${date}` : '💪 Forçat');
  } else {
    console.log('⏭️ BPA: sense canvis');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
