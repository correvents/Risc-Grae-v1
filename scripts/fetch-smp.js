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

// Què ha arribat de Meteocat i què se n'ha descartat, abans de filtrar res.
//
// `processarSMP` només es queda els avisos amb estat "Vigent" o "Ampliat" i
// salta la resta **en silenci**: si Meteocat en publica un amb un estat que no
// coneixem, desapareix del càlcul i la pantalla ensenya un 0 igual de tranquil
// que un dia sense avisos. És el mateix forat de la trampa 11, però per estat
// en comptes de per zona, i no es pot diagnosticar sense veure el cru.
//
// Per això es registra sempre: quants episodis i avisos han vingut, i quants
// se'n descarten per cada estat. Un dia que el log digui
// `descartats per estat: Obert × 7`, ja se sap on mirar.
const ESTATS_QUE_COMPTEN = ['Vigent', 'Ampliat'];

// Què més ens dona l'API que no mirem mai.
//
// `processarSMP` llegeix set camps (meteor, estat, dataInici, dataFi,
// comentari, evolucions, afectacions) i llença la resta sense mirar-la. Entre
// el que es llença hi podria haver **l'hora d'emissió del butlletí**, que és la
// peça que falta per saber cada quant s'actualitza de veritat: amb l'emissió a
// la mà, cada consulta ens diu quan es va publicar el que estem llegint, i no
// cal punxar l'API més sovint per esbrinar-ho. `risc_captures.meteocat_emissio`
// existeix i és buida des del primer dia precisament perquè no sabem d'on
// treure-la.
//
// Es registra el **nom** dels camps, no el contingut, i el valor només dels que
// semblen dates. Surt de la resposta que ja baixem: cap petició de més.
const CAMPS_QUE_USEM = {
  episodi: ['meteor', 'avisos'],
  avis: ['estat', 'dataInici', 'dataFi', 'comentari', 'evolucions', 'afectacions']
};
const semblaData = (k) => /data|hora|time|emiss|actualitz|updat|publica/i.test(k);

function registrarCampsNoUsats(dades) {
  const episodis = Array.isArray(dades) ? dades : [];
  if (!episodis.length) return;
  const nous = { episodi: new Map(), avis: new Map() };
  const apuntar = (nivell, obj) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (CAMPS_QUE_USEM[nivell].includes(k)) continue;
      if (nous[nivell].has(k)) continue;
      // Del valor només se'n guarda una mostra si el nom sembla una data; de la
      // resta, prou de saber que existeix i de quin tipus és.
      nous[nivell].set(k, semblaData(k) ? JSON.stringify(v) : `<${Array.isArray(v) ? 'array' : typeof v}>`);
    }
  };
  for (const ep of episodis) {
    apuntar('episodi', ep);
    for (const av of (ep.avisos || [])) apuntar('avis', av);
  }
  for (const nivell of ['episodi', 'avis']) {
    if (!nous[nivell].size) continue;
    const llista = [...nous[nivell]].map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🔎 Camps de l'${nivell} que no fem servir: ${llista}`);
  }
}

function registrarEstatsRebuts(dades) {
  const episodis = Array.isArray(dades) ? dades : [];
  const compte = new Map();
  let totalAvisos = 0;
  for (const episodi of episodis)
    for (const avis of (episodi.avisos || [])) {
      totalAvisos++;
      const estat = avis.estat || '(sense estat)';
      if (ESTATS_QUE_COMPTEN.includes(estat)) continue;
      compte.set(estat, (compte.get(estat) || 0) + 1);
    }
  console.log(`📥 Meteocat SMP: ${episodis.length} episodis, ${totalAvisos} avisos.`);
  if (compte.size === 0) return;
  const detall = [...compte].map(([estat, n]) => `${estat} × ${n}`).join(', ');
  console.log(`⚠️ Avisos descartats per estat: ${detall}. ` +
              `Només compten ${ESTATS_QUE_COMPTEN.join(' i ')} — si algun d'aquests ` +
              `hauria de comptar, cal afegir-lo a ESTATS_QUE_COMPTEN.`);
}

// ---------- D'on es baixa: tres consultes, no una ----------
//
// **El forat que això tanca.** `/pronostic/v1/smp/episodis-oberts` torna només
// els episodis **ja oberts**, i un avís que Meteocat publica avui per a demà
// pertany a un episodi que encara no ha començat: per aquest camí no se'l veu.
// El 17-09-2026, a les 15:28 de Madrid, la v1 tornava `[]` mentre el web de
// Meteocat ja tenia avisos per al Barcelonès de l'endemà — emesos a les 09:44
// d'aquell mateix matí. Va passar igual el 15-09, dues vegades. Era la pregunta
// oberta de la trampa 11 bis, i la resposta és aquesta.
//
// La **v2 accepta una data** (`?data=<dia>Z`) i llavors sí que dona l'episodi
// d'aquell dia encara que no hagi començat. El format de la resposta és el
// mateix: `processarSMP` ja la sap llegir sense tocar res.
//
// **Es demanen els tres.** La v1 es manté perquè no està demostrat que la v2
// amb data d'avui en sigui un superconjunt —el dia que es va comprovar totes
// dues tornaven buit, o sigui que la comparació no deia res— i perdre els
// avisos d'avui per guanyar els de demà seria un mal canvi. Costa dues
// consultes més per passada: **vuit al dia contra una quota de 20.000 al mes**
// (`quotes/v1/consum-actual`), que és el que fa que això no sigui cap problema.
const URL_V1 = 'https://api.meteo.cat/pronostic/v1/smp/episodis-oberts';
const urlV2 = (dia) => `https://api.meteo.cat/pronostic/v2/smp/episodis-oberts?data=${dia}Z`;

const avuiMadrid = () => new Date().toLocaleString('sv', { timeZone: 'Europe/Madrid' }).slice(0, 10);
const diaMes = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000)
  .toISOString().slice(0, 10);

// Una consulta, amb un reintent. Passar d'una crida a tres triplica les
// possibilitats que una fallada passatgera s'emporti tota la passada, i això
// seria un mal negoci: el reintent costa un segon i una consulta de la quota.
//
// Si després del reintent continua fallant, **peta**. No es desa mitja foto:
// una passada incompleta desada com si fos bona és el forat que la trampa 12
// vol tancar, i el workflow ja sap dir quina font ha caigut.
async function demanar(etiqueta, url) {
  for (let intent = 1; intent <= 2; intent++) {
    try {
      const resp = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
      if (!resp.ok) throw new Error(`${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      return await resp.json();
    } catch (e) {
      if (intent === 2) throw new Error(`Meteocat SMP ${etiqueta} — ${e.message}`);
      console.log(`⏳ ${etiqueta} ha fallat (${e.message}). Hi torno un cop.`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function baixarEpisodis() {
  const avui = avuiMadrid();
  const fonts = [
    ['v1', URL_V1],
    [`v2 avui (${avui})`, urlV2(avui)],
    [`v2 demà (${diaMes(avui, 1)})`, urlV2(diaMes(avui, 1))]
  ];
  const episodis = [];
  const vistos = new Set();
  const resum = [];
  for (const [etiqueta, url] of fonts) {
    const cru = await demanar(etiqueta, url);
    const llista = Array.isArray(cru) ? cru : [];
    let nous = 0;
    for (const ep of llista) {
      // Un episodi que dura dos dies surt a més d'una resposta. Es compara el
      // JSON sencer: si és idèntic, és el mateix i no cal duplicar-lo; si no ho
      // és (cada resposta pot portar només les evolucions del dia demanat),
      // entra i després `fusionarAvisos` ajunta els dies.
      const clau = JSON.stringify(ep);
      if (vistos.has(clau)) continue;
      vistos.add(clau);
      episodis.push(ep);
      nous++;
    }
    resum.push(`${etiqueta}: ${llista.length}${nous !== llista.length ? ` (${nous} nous)` : ''}`);
  }
  console.log(`🌐 Episodis per font → ${resum.join(' · ')}`);
  return episodis;
}

// Demanar tres camins vol dir que el mateix avís pot arribar dues vegades, un
// cop per dia. Sense ajuntar-los, `toRows` escriuria les files repetides a
// `smp_historic`. Es fusionen per identitat de l'avís i se n'uneixen els dies.
function fusionarAvisos(resultat) {
  const perClau = new Map();
  for (const avis of resultat.avisos) {
    const clau = [avis.meteor, avis.estat, avis.dataInici, avis.dataFi, avis.dataEmisio].join('|');
    const jaHiEs = perClau.get(clau);
    if (!jaHiEs) { perClau.set(clau, avis); continue; }
    for (const dia of avis.dies)
      if (!jaHiEs.dies.some(d => d.dia === dia.dia)) jaHiEs.dies.push(dia);
    jaHiEs.dies.sort((a, b) => a.dia.localeCompare(b.dia));
  }
  resultat.avisos = [...perClau.values()];
  return resultat;
}

function processarSMP(dades) {
  const resultat = { dataConsulta: new Date().toISOString(), avisos: [] };
  if (!dades || dades.length === 0) return resultat;
  for (const episodi of dades) {
    const meteor = episodi.meteor?.nom || "Desconegut";
    if (!episodi.avisos) continue;
    for (const avis of episodi.avisos) {
      if (!ESTATS_QUE_COMPTEN.includes(avis.estat)) continue;
      const avisS = {
        meteor, estat: avis.estat,
        dataInici: avis.dataInici || null, dataFi: avis.dataFi || null,
        // **Quan Meteocat va publicar aquest avís.** És la peça que permet
        // saber cada quant s'actualitza de veritat sense haver de punxar l'API
        // més sovint: cada consulta ja porta l'hora del que estem llegint.
        // Meteocat ho escriu amb una sola `s` (`dataEmisio`); s'accepten les
        // dues grafies per si algun dia ho corregeixen.
        dataEmisio: avis.dataEmisio || avis.dataEmissio || null,
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

// L'emissió compta com a canvi, a posta. Meteocat pot tornar a publicar el
// mateix contingut amb una hora d'emissió nova, i abans això passava de llarg:
// la fila no s'escrivia i la republicació no quedava enlloc. Com que el que
// volem saber és **cada quant publiquen**, una emissió nova és precisament
// l'esdeveniment que interessa, encara que els avisos diguin el mateix.
// Costa alguna fila de més a `smp_historic`; recuperar el que no s'ha desat no
// es pot.
function hasChanged(nou, anterior) {
  if (!anterior) return true;
  const key = d => JSON.stringify((d.avisos || []).map(a =>
    ({ meteor: a.meteor, estat: a.estat, dataEmisio: a.dataEmisio, dies: a.dies })));
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
          data_emisio: avis.dataEmisio || null,
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
  const cru = await baixarEpisodis();
  registrarEstatsRebuts(cru);
  registrarCampsNoUsats(cru);
  const dades = fusionarAvisos(processarSMP(cru));
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

module.exports = { processarSMP, agruparPerZona, toRows, registrarCodisDesconeguts, registrarCampsNoUsats,
                   registrarEstatsRebuts, ESTATS_QUE_COMPTEN, ZONES };
