const { supabaseUpsert, readJSON, writeJSON } = require('./utils');

const FORCE = process.env.FORCE === 'true';
const URL_API = 'https://analisi.transparenciacatalunya.cat/resource/wj9c-j6vf.json';

function clauPlans(llista) {
  return JSON.stringify(
    llista.map(p => ({
      pla: p.plaacronim, fase: p.plafase, activat: p.plaactivat,
      datahora: p.fasedatahora, descripcio: p.descripcio
    })).sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1)
  );
}

async function main() {
  const resp = await fetch(URL_API);
  if (!resp.ok) throw new Error(`Plans PC error ${resp.status}`);
  const plans = await resp.json();
  const now = new Date().toISOString();
  const nova = { actualitzat: now, plans };

  const anterior = readJSON('planspc_latest.json');
  const hiHaCanvis = clauPlans(plans) !== clauPlans(anterior?.plans || []);
  const hiHaPlans = plans.length > 0;

  writeJSON('planspc_latest.json', nova);

  if ((FORCE || hiHaCanvis) && hiHaPlans) {
    await supabaseUpsert('planspc_historic', { timestamp: now, plans });
    console.log(hiHaCanvis ? '🔄 Canvis plans PC' : '💪 Forçat');
  } else if (!hiHaPlans) {
    console.log('⏭️ Plans PC: cap pla actiu');
  } else {
    console.log('⏭️ Plans PC: sense canvis');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
