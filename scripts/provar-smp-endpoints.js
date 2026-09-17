// Sonda: quin endpoint de l'SMP dona els avisos de DEMÀ.
//
// No forma part de cap passada automàtica. Es corre a mà (Actions → «Provar
// endpoints SMP») quan cal comprovar què dona cada camí de l'API, i no escriu
// res: ni a `data/`, ni a Supabase.
//
// **El problema que ve a resoldre.** Baixem l'SMP de
// `/pronostic/v1/smp/episodis-oberts`, que —com diu el nom— només torna els
// episodis **ja oberts**. El 15-09 i el 17-09-2026 va respondre `[]` mentre el
// web de Meteocat ja tenia avisos formals per a l'endemà: un avís publicat avui
// per a demà pertany a un episodi que encara no ha començat, i per aquest camí
// no se'l veu. Vegeu la trampa 11 bis del CLAUDE.md.
//
// Hi ha una **v2 del mateix recurs que accepta una data**. Aquesta sonda demana
// els quatre camins alhora i n'ensenya el contingut perquè es pugui comparar
// amb el que diu el web de Meteocat en aquell mateix moment. Si la v2 amb
// `?data=<demà>` torna els avisos que la v1 no dona, ja sabem què s'ha de
// canviar a `fetch-smp.js`.
//
// La clau no surt mai al log: va només a la capçalera.

const API_KEY = (process.env.METEOCAT_API_KEY || '').replace(/\s+/g, '');

const avuiMadrid = () => new Date().toLocaleString('sv', { timeZone: 'Europe/Madrid' }).slice(0, 10);
const diaMes = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000)
  .toISOString().slice(0, 10);

async function provar(etiqueta, url) {
  try {
    const resp = await fetch(url, { headers: { 'X-Api-Key': API_KEY } });
    const text = await resp.text();
    if (!resp.ok) {
      console.log(`\n❌ ${etiqueta}\n   ${url}\n   → ${resp.status} ${text.slice(0, 300)}`);
      return null;
    }
    let dades;
    try { dades = JSON.parse(text); }
    catch (e) { console.log(`\n⚠️ ${etiqueta}: resposta que no és JSON (${text.slice(0, 200)})`); return null; }
    console.log(`\n✅ ${etiqueta}\n   ${url}\n   → ${resp.status}, ${Array.isArray(dades) ? dades.length + ' elements' : 'objecte'}`);
    return dades;
  } catch (e) {
    console.log(`\n❌ ${etiqueta}: ${e.message}`);
    return null;
  }
}

// Què hi ha a dins, en una línia per dia i comarca. És el que es compara amb el
// web: si el web diu «Barcelonès, demà» i aquí no hi surt, aquell camí no val.
function resumir(dades) {
  if (!Array.isArray(dades) || !dades.length) { console.log('      (buit)'); return; }
  for (const ep of dades) {
    const estat = (ep.estat && (ep.estat.nom || ep.estat)) || '?';
    console.log(`      episodi ${ep.meteor || '?'} · estat ${JSON.stringify(estat)} · ${(ep.avisos || []).length} avisos`);
    for (const avis of (ep.avisos || [])) {
      console.log(`        avís ${avis.estat || '?'} · emès ${avis.dataEmisio || avis.dataEmissio || '—'}`);
      for (const dia of (avis.dies || [])) {
        const com = (dia.afectacions || [])
          .map(af => `${af.comarca ?? af.zona ?? '?'}${af.comarcaNom ? '=' + af.comarcaNom : ''} ${af.nivell || ''}${af.perill != null ? ' p' + af.perill : ''}`);
        console.log(`          ${dia.dia}: ${com.join(' | ') || '(cap afectació)'}`);
      }
    }
  }
}

async function main() {
  if (!API_KEY) throw new Error('Falta METEOCAT_API_KEY');
  const avui = avuiMadrid();
  const dema = diaMes(avui, 1);
  console.log(`🔎 Sonda dels endpoints de l'SMP · avui ${avui} · demà ${dema} (hora de Madrid)`);
  console.log('   Compara-ho amb el que digui https://www.meteo.cat/ en aquest mateix moment.');

  const v1 = await provar('v1 episodis-oberts (el que fem servir ara)',
    'https://api.meteo.cat/pronostic/v1/smp/episodis-oberts');
  resumir(v1);

  for (const d of [avui, dema]) {
    const v2 = await provar(`v2 episodis-oberts amb data=${d}`,
      `https://api.meteo.cat/pronostic/v2/smp/episodis-oberts?data=${d}Z`);
    resumir(v2);
    // La v2 no té per què tornar la mateixa forma que la v1, i `processarSMP`
    // llegeix camps concrets (`avisos[].dies[].afectacions[]`). Abans de tocar
    // res cal veure el JSON tal com ve.
    if (Array.isArray(v2) && v2.length) {
      console.log('      --- JSON cru ---');
      console.log(JSON.stringify(v2, null, 1).slice(0, 6000));
      console.log('      --- fi ---');
    }
  }

  const pre = await provar('v1 episodis-oberts/preavisos',
    'https://api.meteo.cat/pronostic/v1/smp/episodis-oberts/preavisos');
  if (pre) console.log('      ' + JSON.stringify(pre).slice(0, 600));

  // La quota ha estat sempre una incògnita, i és el que decideix si es pot
  // consultar cada hora quan hi ha episodis oberts.
  const quota = await provar('quota del pla', 'https://api.meteo.cat/quotes/v1/consum-actual');
  if (quota) console.log('      ' + JSON.stringify(quota).slice(0, 800));
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
