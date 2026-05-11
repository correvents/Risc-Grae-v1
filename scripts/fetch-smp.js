const { supabaseInsert, readJSON, writeJSON } = require('./utils');

const API_KEY = process.env.METEOCAT_API_KEY;
const FORCE = process.env.FORCE === 'true';

const ZONES = {
  "Pirineu Occidental":         [39, 5, 26, 4],
  "Pirineu Central":            [15, 25, 23, 35],
  "Pirineu Oriental":           [31, 19, 24],
  "Prepirineu":                 [14, 42],
  "Empordà":                    [2, 10],
  "Gironès i Pla de l'Estany": [20, 28],
  "Plana de Lleida":            [33, 27, 38, 18],
  "Catalunya Central":          [7, 6, 32, 43],
  "Litoral Nord":               [21, 34],
  "Litoral Central":            [13, 11, 17],
  "Penedès":                    [3, 12],
  "Camp de Tarragona":          [36, 8, 1],
  "Serres de Prades i Montsant":[16, 29],
  "Terres de l'Ebre":           [9, 22, 30, 37],
  "Vallès":                     [40, 41]
};

const COMARCA_A_ZONA = {};
for (const [zona, comarques] of Object.entries(ZONES))
  for (const codi of comarques) COMARCA_A_ZONA[codi] = zona;

const NIVELLS = { 1: "Groc", 2: "Taronja", 3: "Vermell" };
const PROBABILITATS = { 1: "Poc probable", 2: "Probable", 3: "Molt probable", 4: "Segur" };

function afegirAfectacio(diesMap, diaISO, afectacio, nomPeriode) {
  const zona = COMARCA_A_ZONA[afectacio.idComarca] || `Comarca ${afectacio.idComarca}`;
  const existent = diesMap[diaISO].find(a =>
    a.zona === zona && a.nivell === NIVELLS[afectacio.nivell] && a.llindar === afectacio.llindar
  );
  const periodes = nomPeriode ? [nomPeriode] : ['00-06', '06-12', '12-18', '18-00'];
  if (existent) {
    periodes.forEach(p => { if (!existent.periodes.includes(p)) existent.periodes.push(p); });
    const probActual = parseInt(Object.keys(PROBABILITATS).find(k => PROBABILITATS[k] === existent.probabilitat) || 0);
    if (afectacio.perill > probActual) existent.probabilitat = PROBABILITATS[afectacio.perill];
  } else {
    diesMap[diaISO].push({
      zona,
      nivell:       NIVELLS[afectacio.nivell]       || `Nivell ${afectacio.nivell}`,
      probabilitat: PROBABILITATS[afectacio.perill] || `Prob ${afectacio.perill}`,
      llindar:      afectacio.llindar,
      periodes
    });
  }
}

function processarSMP(dades) {
  const resultat = { dataConsulta: new Date().toISOString(), avisos: [] };
  if (!dades || dades.length === 0) return resultat;
  for (const episodi of dades) {
    const meteor = episodi.meteor?.nom || "Desconegut";
    if (!episodi.avisos) continue;
    for (const avis of episodi.avisos) {
      if (avis.estat !== "Vigent" && avis.estat !== "Ampliat") continue;
      const avisS = {
        meteor, estat: avis.estat,
        dataInici: avis.dataInici || null, dataFi: avis.dataFi || null,
        comentari: avis.comentari ? avis.comentari.replace(/\n/g, ' ') : "",
        dies: []
      };
      const diesMap = {};
      if (avis.evolucions) {
        for (const ev of avis.evolucions) {
          if (ev.comentari && !avisS.comentari) avisS.comentari = ev.comentari.replace(/\n/g, ' ');
          const diaISO = ev.dia ? ev.dia.split('T')[0] : null;
          if (!diaISO) continue;
          if (!diesMap[diaISO]) diesMap[diaISO] = [];
          if (ev.periodes) for (const p of ev.periodes)
            if (p.afectacions) for (const af of p.afectacions) afegirAfectacio(diesMap, diaISO, af, p.nom);
        }
      } else if (avis.afectacions) {
        const diaISO = avis.dataInici ? avis.dataInici.split('T')[0] : null;
        if (diaISO) {
          if (!diesMap[diaISO]) diesMap[diaISO] = [];
          for (const af of avis.afectacions) afegirAfectacio(diesMap, diaISO, af, null);
        }
      }
      for (const dia of Object.keys(diesMap).sort()) {
        const afs = diesMap[dia];
        if (afs.length > 0) {
          afs.sort((a, b) => a.zona.localeCompare(b.zona));
          avisS.dies.push({ dia, afectacions: afs });
        }
      }
      if (avisS.dies.length > 0) resultat.avisos.push(avisS);
    }
  }
  return resultat;
}

function hasChanged(nou, anterior) {
  if (!anterior) return true;
  const key = d => JSON.stringify((d.avisos || []).map(a => ({ meteor: a.meteor, estat: a.estat, dies: a.dies })));
  return key(nou) !== key(anterior);
}

function toRows(dades) {
  const rows = [];
  for (const avis of dades.avisos)
    for (const diaObj of avis.dies)
      for (const af of diaObj.afectacions)
        rows.push({
          data_consulta: dades.dataConsulta,
          data_inici: avis.dataInici || null, data_fi: avis.dataFi || null,
          meteor: avis.meteor, estat: avis.estat, comentari: avis.comentari || '',
          dia: diaObj.dia, zona: af.zona, nivell: af.nivell,
          llindar: af.llindar || '', periodes: af.periodes || [],
          probabilitat: af.probabilitat || '', canvi: 'NOU'
        });
  return rows;
}

async function main() {
  const resp = await fetch('https://api.meteo.cat/pronostic/v1/smp/episodis-oberts', {
    headers: { 'X-Api-Key': API_KEY }
  });
  if (!resp.ok) throw new Error(`Meteocat SMP ${resp.status}: ${await resp.text()}`);
  const dades = processarSMP(await resp.json());
  const anterior = readJSON('smp_latest.json');
  const changed = hasChanged(dades, anterior);
  writeJSON('smp_latest.json', dades);
  if (FORCE || changed) {
    const rows = toRows(dades);
    if (rows.length > 0) await supabaseInsert('smp_historic', rows);
    else console.log('SMP: cap avís actiu');
    console.log(changed ? '🔄 Canvis SMP' : '💪 Forçat');
  } else {
    console.log('⏭️ SMP: sense canvis');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
