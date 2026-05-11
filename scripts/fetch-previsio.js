const { supabaseUpsert, readJSON, writeJSON } = require('./utils');

const API_KEY = process.env.METEOCAT_API_KEY;
const FORCE = process.env.FORCE === 'true';

async function fetchDia(date) {
  const [y, m, d] = date.split('-');
  const resp = await fetch(`https://api.meteo.cat/pronostic/v1/catalunya/${y}/${m}/${d}`, {
    headers: { 'X-Api-Key': API_KEY }
  });
  if (!resp.ok) throw new Error(`Meteocat previsió ${date} error ${resp.status}`);
  const data = await resp.json();
  return { data: date, variables: data.variables };
}

async function main() {
  const now = new Date();
  const toDate = d => d.toISOString().split('T')[0];
  const avuiDate = toDate(now);
  const dema = new Date(now); dema.setDate(dema.getDate() + 1);
  const demaDate = toDate(dema);

  const [avui, demaData] = await Promise.all([fetchDia(avuiDate), fetchDia(demaDate)]);
  const nova = { dataConsulta: now.toISOString(), avui, dema: demaData };

  const anterior = readJSON('previsio_latest.json');
  const changed = !anterior ||
    JSON.stringify(anterior.avui?.variables) !== JSON.stringify(avui.variables) ||
    JSON.stringify(anterior.dema?.variables) !== JSON.stringify(demaData.variables);

  writeJSON('previsio_latest.json', nova);

  if (FORCE || changed) {
    await supabaseUpsert('previsio_historic', {
      data_consulta:  nova.dataConsulta,
      avui_data:      avuiDate,
      avui_variables: avui.variables,
      dema_data:      demaDate,
      dema_variables: demaData.variables
    });
    console.log(changed ? '🔄 Canvis previsió' : '💪 Forçat');
  } else {
    console.log('⏭️ Previsió: sense canvis');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
