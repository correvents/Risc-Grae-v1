const { supabaseInsert, readJSON, writeJSON, nomComarca, COMARQUES } = require('./utils');

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

// Ordre numèric d'una probabilitat ja formatada, per poder-ne agafar la més alta.
function ordreProbabilitat(text) {
  const clau = Object.keys(PROBABILITATS).find(k => PROBABILITATS[k] === text);
  return clau ? parseInt(clau) : 0;
}

// Cada afectació es guarda **per comarca**, no per zona Meteocat. La zona hi
// continua sent perquè la pestanya Alertes hi agrupa, però si es col·lapsés
// aquí la comarca es perdria i el risc per regions d'emergència no es podria
// calcular: dues comarques d'una mateixa zona poden tenir franges diferents.
function afegirAfectacio(diesMap, diaISO, afectacio, nomPeriode) {
  const idComarca = afectacio.idComarca;
  const zona = COMARCA_A_ZONA[idComarca] || `Comarca ${idComarca}`;
  const existent = diesMap[diaISO].find(a =>
    a.comarca === idComarca && a.nivell === NIVELLS[afectacio.nivell] && a.llindar === afectacio.llindar
  );
  const periodes = nomPeriode ? [nomPeriode] : ['00-06', '06-12', '12-18', '18-00'];
  if (existent) {
    periodes.forEach(p => { if (!existent.periodes.includes(p)) existent.periodes.push(p); });
    if (afectacio.perill > (existent.grauPerill || 0)) {
      existent.grauPerill   = afectacio.perill;
      existent.probabilitat = PROBABILITATS[afectacio.perill] || `Prob ${afectacio.perill}`;
    }
  } else {
    diesMap[diaISO].push({
      zona,
      comarca:      idComarca,
      comarcaNom:   nomComarca(idComarca),
      nivell:       NIVELLS[afectacio.nivell]       || `Nivell ${afectacio.nivell}`,
      // `perill` és el grau de perill de l'SMP (1-6) que Meteocat dona per
      // comarca i franja de 6 h. Es desa cru perquè el risc de Bombers el faci
      // servir tal com ve, en comptes de deduir-lo del color.
      grauPerill:   afectacio.perill,
      probabilitat: PROBABILITATS[afectacio.perill] || `Prob ${afectacio.perill}`,
      llindar:      afectacio.llindar,
      periodes
    });
  }
}

// Les files d'`smp_historic` són una per zona+nivell+llindar, i han de continuar
// sent-ho: els dos webs dedupeixen per zona a `smpDesDeSupabase()`, i si aquí
// sortissin files per comarca el fallback ensenyaria les dades d'una comarca com
// si fossin de tota la zona.
//
// El que sí que canvia és que la comarca ja no es llença: cada fila se'n porta el
// detall a `comarques`, perquè el risc per regions d'emergència es pugui calcular
// també cap enrere. Abans es perdia aquí, tot i que `afegirAfectacio` s'havia
// molestat a capturar-la (vegeu el comentari de més amunt).
function agruparPerZona(afectacions) {
  const perClau = new Map();
  const detallComarca = af => ({
    comarca:    af.comarca,
    nom:        af.comarcaNom,
    grauPerill: af.grauPerill,
    periodes:   [...af.periodes]
  });
  for (const af of afectacions) {
    const clau = `${af.zona}|${af.nivell}|${af.llindar}`;
    const existent = perClau.get(clau);
    if (!existent) {
      perClau.set(clau, { ...af, periodes: [...af.periodes], comarques: [detallComarca(af)] });
      continue;
    }
    af.periodes.forEach(p => { if (!existent.periodes.includes(p)) existent.periodes.push(p); });
    if (ordreProbabilitat(af.probabilitat) > ordreProbabilitat(existent.probabilitat)) {
      existent.probabilitat = af.probabilitat;
    }
    if ((af.grauPerill || 0) > (existent.grauPerill || 0)) existent.grauPerill = af.grauPerill;
    const jaHiEs = existent.comarques.find(c => c.comarca === af.comarca);
    if (jaHiEs) {
      af.periodes.forEach(p => { if (!jaHiEs.periodes.includes(p)) jaHiEs.periodes.push(p); });
      if ((af.grauPerill || 0) > (jaHiEs.grauPerill || 0)) jaHiEs.grauPerill = af.grauPerill;
    } else {
      existent.comarques.push(detallComarca(af));
    }
  }
  return [...perClau.values()];
}

// Els codis de comarca que no són cap de les 43 (l'SMP també avisa per zones
// marítimes) es registren crus al log del workflow. Encara no sabem quins codis
// fa servir ni si porten camps que aquí s'ignoren: la primera alerta d'onatge
// que passi per aquí ens ho dirà.
function registrarCodisDesconeguts(dades) {
  const vistos = new Map();
  for (const avis of dades.avisos)
    for (const dia of avis.dies)
      for (const af of dia.afectacions)
        if (!COMARQUES[af.comarca] && !vistos.has(af.comarca)) vistos.set(af.comarca, af);
  if (vistos.size === 0) return;
  console.log('⚠️ Codis de comarca desconeguts (probablement zones marítimes):');
  for (const [codi, af] of vistos) console.log(`   ${codi} → ${JSON.stringify(af)}`);
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
          afs.sort((a, b) =>
            a.zona.localeCompare(b.zona) || (a.comarcaNom || '').localeCompare(b.comarcaNom || '')
          );
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
      for (const af of agruparPerZona(diaObj.afectacions))
        rows.push({
          data_consulta: dades.dataConsulta,
          data_inici: avis.dataInici || null, data_fi: avis.dataFi || null,
          meteor: avis.meteor, estat: avis.estat, comentari: avis.comentari || '',
          dia: diaObj.dia, zona: af.zona, nivell: af.nivell,
          llindar: af.llindar || '', periodes: af.periodes || [],
          probabilitat: af.probabilitat || '', canvi: 'NOU',
          // El grau el dona Meteocat; la probabilitat n'és només l'etiqueta.
          grau_perill: af.grauPerill ?? null,
          comarques: af.comarques || null
        });
  return rows;
}

async function main() {
  const resp = await fetch('https://api.meteo.cat/pronostic/v1/smp/episodis-oberts', {
    headers: { 'X-Api-Key': API_KEY }
  });
  if (!resp.ok) throw new Error(`Meteocat SMP ${resp.status}: ${await resp.text()}`);
  const dades = processarSMP(await resp.json());
  registrarCodisDesconeguts(dades);
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

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { processarSMP, agruparPerZona, toRows, registrarCodisDesconeguts, ZONES };
