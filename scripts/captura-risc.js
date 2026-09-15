// Captura del risc: la foto de com estava tot en un moment concret.
//
// `risc_historic` té UNIQUE (data) i s'escriu a sobre: al final del dia només hi
// queda l'última foto i no es pot saber com hi ha arribat. Aquí es desa, tres
// vegades al dia, el risc d'avui i de demà amb el desglossament sencer, els
// factors que el formen, l'SMP Bombers i la fórmula amb què s'ha calculat.
//
// El càlcul **no és d'aquí**: surt de `formula-risc.js`, el mateix fitxer que
// carrega l'`index.html`. Si es tornés a escriure la fórmula en aquest script,
// el número desat deixaria de ser el que veu la gent a la pantalla, que és
// justament el que això vol evitar.
//
// Codis de sortida:
//   0  → captura feta
//   75 → Meteocat encara no ha actualitzat el butlletí (el workflow ha d'esperar
//        i tornar-hi). Amb FORCA_CAPTURA=true es captura igualment i es desa que
//        les dades no eren noves.

const crypto = require('crypto');
const { supabaseUpsert, supabaseSelect, readJSON, nomComarca } = require('./utils');
const F = require('../formula-risc.js');

const FORCA = process.env.FORCA_CAPTURA === 'true';
const FRANJA_FORCADA = process.env.FRANJA || '';

// ---------- Dia i franja, per l'hora real de Madrid ----------
// Les captures s'ancoren a les hores en què Meteocat actualitza (08:15, 12:30 i
// 20:30), però el cron pot arribar tard: la franja es decideix per l'hora que és
// de veritat, no per la que tocava. Les hores petites són encara del dia
// anterior, com a `risc-diari.js` (una captura que arriba a les 00:30 és la del
// vespre d'ahir, no la del matí d'avui).
function araMadrid() {
  const s = new Date().toLocaleString('sv', { timeZone: 'Europe/Madrid' });
  return { data: s.split(' ')[0], hora: parseInt(s.split(' ')[1].slice(0, 2), 10) };
}

function diaIFranja() {
  const { data, hora } = araMadrid();
  if (FRANJA_FORCADA) return { dia: data, franja: FRANJA_FORCADA };
  if (hora < 5) {                       // matinada: encara és el vespre d'ahir
    const ahir = new Date(new Date(data + 'T12:00:00Z').getTime() - 86400000);
    return { dia: ahir.toISOString().slice(0, 10), franja: 'vespre' };
  }
  if (hora < 11) return { dia: data, franja: 'mati' };
  if (hora < 18) return { dia: data, franja: 'migdia' };
  return { dia: data, franja: 'vespre' };
}

const diaMes = (dataStr, n) =>
  new Date(new Date(dataStr + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

const empremta = (x) => crypto.createHash('sha1').update(JSON.stringify(x ?? null)).digest('hex').slice(0, 16);

// ---------- Configuració: la mateixa que veu el navegador ----------
async function carregarConfig() {
  let row = null;
  try {
    const files = await supabaseSelect('taula_config_alertes_smp', { id: 1 });
    row = files && files[0];
  } catch (e) {
    console.warn('⚠️ No s\'ha pogut llegir la config de Supabase:', e.message);
  }
  const base = JSON.parse(JSON.stringify(F.RISC_PARAMS_DEFAULT));
  return {
    riscParams: row ? F.rowToRiscParams(row, base) : base,
    formula: (row && row.formula) || F.RISC_FORMULA_DEFAULT,
    formulaVersio: (row && row.formula_versio) || F.RISC_FORMULA_VERSIO,
    allausDesactivat: !!(row && row.allaus_desactivat),
    boletairesActiu: !!(row && row.boletaires_actiu),
    opConfig: (row && row.op_config) || F.OP_DEFAULT,
    teConfig: !!row
  };
}

// ---------- Afluència: calendari + edicions manuals ----------
async function carregarEdicionsAfluencia() {
  try {
    const files = await supabaseSelect('afluencia_edicions');
    const edicions = {};
    for (const f of files || []) edicions[f.data] = { nivell: f.nivell, motiu: f.motiu };
    return edicions;
  } catch (e) {
    console.warn('⚠️ Afluència: edicions no llegides:', e.message);
    return {};
  }
}

// ---------- Operativitat dels helicòpters ----------
// Els helis del dia; si no n'hi ha, els últims desats. El criteri de vol és el
// de `formula-risc.js`, el mateix que fa servir la pantalla.
async function carregarHelis(dataStr) {
  try {
    const exactes = await supabaseSelect('helicopters_historic', { data: dataStr });
    if (exactes && exactes.length) return exactes;
    const tots = await supabaseSelect('helicopters_historic');
    if (tots && tots.length) {
      const ultima = tots.map(h => h.data).sort().pop();
      return tots.filter(h => h.data === ultima);
    }
  } catch (e) {
    console.warn('⚠️ Helis no llegits:', e.message);
  }
  return [];
}

async function meteoDeBase(lat, lon) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const resp = await fetch(F.urlMeteoVol(lat, lon), { signal: ctrl.signal });
    return (await resp.json()).hourly;
  } catch (e) {
    return null;   // sense meteo no es penalitza: vegeu avaluarFinestraVol
  } finally {
    clearTimeout(t);
  }
}

async function operativitat(helis, dataStr, opConfig, cauMeteo) {
  const detall = await Promise.all(helis.map(async h => {
    const estat = (h.operativitat || 'Total').trim() || 'Total';
    let operatiu = true, motiu = '', estatOk = true;
    if (estat !== 'Total') {
      operatiu = false; estatOk = false; motiu = estat.toLowerCase();
    } else if (h.lat != null && h.lon != null) {
      const clau = `${(+h.lat).toFixed(2)},${(+h.lon).toFixed(2)}`;
      if (!cauMeteo[clau]) cauMeteo[clau] = await meteoDeBase(h.lat, h.lon);
      const m = F.avaluarFinestraVol(cauMeteo[clau], dataStr, opConfig);
      if (!m.ok) { operatiu = false; motiu = m.motiu; }
    }
    return {
      nom: h.recurs || h.base || '?', base: h.base || '',
      prov: F.provinciaDeBase(h.base) || F.provinciaDeCoords(parseFloat(h.lat), parseFloat(h.lon)),
      estat, obs: (h.observacions || '').trim(), operatiu, estatOk, motiu
    };
  }));
  return F.resumirOperativitat(detall);
}

// ---------- L'última captura, per saber si Meteocat ha canviat res ----------
// Es demana ordenada i amb límit 1: la taula creix sis files al dia i baixar-la
// sencera cada vegada seria absurd d'aquí a un any.
async function ultimaCaptura() {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/risc_captures` +
                `?select=fonts_estat,capturat_at&order=capturat_at.desc&limit=1`;
    const resp = await fetch(url, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY,
                 Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    if (!resp.ok) throw new Error(`${resp.status} ${await resp.text()}`);
    const files = await resp.json();
    return files[0] || null;
  } catch (e) {
    console.warn('⚠️ No s\'ha pogut llegir l\'última captura:', e.message);
    return null;
  }
}

// De la matriu sencera (comarca → dia → franja) en treu només el dia que toca,
// que és el que ha de quedar desat a la captura d'aquell horitzó.
function comarquesDelDia(matriu, dataStr) {
  const fora = {};
  for (const [codi, info] of Object.entries(matriu || {})) {
    const dies = info.dies && info.dies[dataStr];
    if (!dies) continue;
    fora[codi] = { nom: info.nom, franges: dies };
  }
  return fora;
}

async function main() {
  const { dia, franja } = diaIFranja();
  const avui = dia, dema = diaMes(dia, 1);
  console.log(`📸 Captura ${franja} del ${dia} (avui ${avui}, demà ${dema})`);

  const smp = readJSON('smp_latest.json');
  const bpa = readJSON('bpa_latest.json');
  const canvi = readJSON('canvi_temps_latest.json');
  const planspc = readJSON('planspc_latest.json');

  // Què hi ha i què falta. Un factor sense dades no pot semblar un factor a zero.
  const fontsEstat = {
    smp:     { hi_es: !!smp,     consulta: smp && smp.dataConsulta,     empremta: empremta(smp && smp.avisos) },
    bpa:     { hi_es: !!bpa,     consulta: bpa && bpa.actualitzat },
    canvi:   { hi_es: !!canvi,   consulta: canvi && canvi.actualitzat },
    planspc: { hi_es: !!planspc, consulta: planspc && planspc.actualitzat }
  };
  const completes = Object.values(fontsEstat).every(f => f.hi_es);

  // Meteocat publica a hores fixes però no sempre puntual. Si el butlletí és
  // idèntic al de l'última captura, encara no ha sortit el nou: val més esperar
  // i tornar-hi que desar dues vegades la mateixa foto amb hores diferents.
  const ultima = await ultimaCaptura();
  const empremtaVella = ultima && ultima.fonts_estat && ultima.fonts_estat.smp && ultima.fonts_estat.smp.empremta;
  if (!FORCA && empremtaVella && empremtaVella === fontsEstat.smp.empremta) {
    console.log('⏳ El butlletí SMP és el mateix de l\'última captura: encara no s\'ha actualitzat.');
    process.exit(75);
  }
  fontsEstat.smp.actualitzat = !(empremtaVella && empremtaVella === fontsEstat.smp.empremta);

  const config = await carregarConfig();
  const edicions = await carregarEdicionsAfluencia();
  const helis = await carregarHelis(avui);
  const cauMeteo = {};

  const smpBombers = F.resumSMPBombers((smp && smp.avisos) || [], [avui, dema], nomComarca);

  const files = [];
  for (const [horitzo, dataObjectiu] of [['avui', avui], ['dema', dema]]) {
    const factors = F.factorsDelDia(dataObjectiu, { smp, bpa, canvi, planspc }, {
      riscParams: config.riscParams,
      allausDesactivat: config.allausDesactivat,
      boletairesActiu: config.boletairesActiu
    });
    const afluencia = F.afluenciaDelCalendari(dataObjectiu, edicions);
    const op = await operativitat(helis, dataObjectiu, config.opConfig, cauMeteo);

    const dia = {
      ...factors,
      afluencia: afluencia.nivell,
      operativitatHelis: helis.length ? op.count : null
    };
    const det = F.detallarRisc(dia, config.formula);

    console.log(`   ${horitzo} (${dataObjectiu}): risc ${det.risc} · SMP ${factors.smp} · allaus ${factors.allaus} ` +
                `· afluència ${afluencia.nivell} (${afluencia.motiu}) · HC ${op.count}/${op.total} · canvi ${factors.canvi}`);

    files.push({
      franja, dia_captura: avui, horitzo, dia_objectiu: dataObjectiu,
      risc: det.risc, perill_base: det.base, dominant: det.dominant, suplement: det.suplement,
      smp: factors.smp, allaus: factors.allaus, afluencia: afluencia.nivell,
      operativitat: helis.length ? op.count : null, canvi: factors.canvi,
      boletaires: factors.boletaires, planspc: factors.planspc || 0,
      desglossament: { ...det, afluenciaMotiu: afluencia.motiu, notes: factors.notes },
      smp_detall: factors.smpDetall || [],
      allaus_detall: factors.allausDetall || null,
      operativitat_detall: op.detall,
      // Regions **i** comarques: amb les regions soles es pot fer la taula, però
      // no els mapes. Es desa el que cal per tornar-los a dibuixar tal com eren.
      smp_bombers: {
        regions: smpBombers.regions[dataObjectiu] || {},
        comarques: comarquesDelDia(smpBombers.comarques, dataObjectiu),
        periodes: F.PERIODES_SMP
      },
      formula_versio: config.formulaVersio,
      formula_config: config.formula,
      dades_completes: completes && helis.length > 0,
      fonts_estat: { ...fontsEstat, helis: { hi_es: helis.length > 0, dia: helis[0] && helis[0].data },
                     config_supabase: config.teConfig },
      font: 'auto_github'
    });
  }

  await supabaseUpsert('risc_captures', files, 'dia_captura,franja,horitzo');
  console.log(`✅ Captura ${franja} desada (${files.length} files)`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
