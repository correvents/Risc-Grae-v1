const { supabaseUpsert, readJSON, writeJSON, avuiMadrid } = require('./utils');

const FORCE = process.env.FORCE === 'true';

const CANVI_PUNTS = [
  { nom: 'Boí Taüll',     lat: 42.490, lon: 0.837, alt: 2500 },
  { nom: 'Tavascan',      lat: 42.658, lon: 1.215, alt: 1800 },
  { nom: 'Port Bonaigua', lat: 42.534, lon: 1.014, alt: 2072 },
  { nom: 'Espot Esquí',   lat: 42.570, lon: 1.090, alt: 2200 },
  { nom: 'La Molina',     lat: 42.337, lon: 1.942, alt: 2050 },
  { nom: 'Vall de Núria', lat: 42.394, lon: 2.148, alt: 1967 },
  { nom: 'Vallter 2000',  lat: 42.393, lon: 2.345, alt: 2000 }
];

function esVentPerillos(graus) {
  const d = ((graus % 360) + 360) % 360;
  return d >= 292.5 || d <= 67.5;
}

function calcularRiscDia(prev, dataStr, avg30d, punt) {
  const idx = (hIni, hFi) => prev.hourly.time.reduce((acc, t, i) => {
    const [d, h] = t.split('T'); const hr = parseInt(h);
    if (d === dataStr && hr >= hIni && hr < hFi) acc.push(i);
    return acc;
  }, []);
  const idxMati  = idx(6, 12);
  const idxTarda = idx(12, 19);
  if (!idxTarda.length) return null;

  const gM = arr => idxMati.map(i => arr[i]);
  const gT = arr => idxTarda.map(i => arr[i]);

  const tempsMati   = gM(prev.hourly.temperature_2m);
  const precMati    = gM(prev.hourly.precipitation).reduce((a,b)=>a+b,0);
  const ventVMati   = gM(prev.hourly.windspeed_10m);
  const wmoMati     = idxMati.length ? Math.max(...gM(prev.hourly.weathercode)) : 0;
  const tmaxMati    = tempsMati.length ? Math.max(...tempsMati) : null;
  const ventMaxMati = ventVMati.length ? Math.max(...ventVMati) : 0;

  const tempsTarda      = gT(prev.hourly.temperature_2m);
  const precTarda       = gT(prev.hourly.precipitation).reduce((a,b)=>a+b,0);
  const neuTarda        = gT(prev.hourly.snowfall).reduce((a,b)=>a+b,0);
  const ventVTarda      = gT(prev.hourly.windspeed_10m);
  const ventDTarda      = gT(prev.hourly.winddirection_10m);
  const wmoTarda        = Math.max(...gT(prev.hourly.weathercode));
  const tminTarda       = tempsTarda.length ? Math.min(...tempsTarda) : null;
  const tmaxTarda       = tempsTarda.length ? Math.max(...tempsTarda) : null;
  const ventMaxTarda    = ventVTarda.length ? Math.max(...ventVTarda) : 0;
  const ventMaxDirTarda = ventDTarda[ventVTarda.indexOf(ventMaxTarda)] ?? 0;

  let nivellBase = 0;
  const factors = [];

  if (tmaxMati !== null && tminTarda !== null) {
    const drop = tmaxMati - tminTarda;
    if (drop >= 15)      { nivellBase = Math.max(nivellBase, 2); factors.push(`Descens ${drop.toFixed(0)}°C`); }
    else if (drop >= 10) { nivellBase = Math.max(nivellBase, 1); factors.push(`Descens ${drop.toFixed(0)}°C`); }
  }
  if (avg30d !== null && tmaxTarda !== null && (avg30d - tmaxTarda) >= 15) {
    nivellBase = Math.max(nivellBase, 1);
    factors.push(`Anomalia tèrmica −${(avg30d - tmaxTarda).toFixed(0)}°C vs 30d`);
  }
  if (neuTarda >= 2) {
    const nv = punt.alt >= 2400 ? 1 : 2;
    nivellBase = Math.max(nivellBase, nv);
    factors.push(`Neu a ${punt.alt}m`);
  }
  if (precTarda >= 15)     { nivellBase = Math.max(nivellBase, 2); factors.push(`Pluja ${precTarda.toFixed(1)}mm tarda`); }
  else if (precTarda >= 7) { nivellBase = Math.max(nivellBase, 1); factors.push(`Pluja ${precTarda.toFixed(1)}mm tarda`); }
  if (wmoTarda >= 95) {
    nivellBase = Math.max(nivellBase, 2);
    factors.push(`Tempesta (WMO ${wmoTarda})`);
  }

  let bonusVent = 0;
  if (esVentPerillos(ventMaxDirTarda)) {
    if (ventMaxTarda >= 60)      { bonusVent = 2; factors.push(`Vent N/NE/NW ${ventMaxTarda.toFixed(0)} km/h`); }
    else if (ventMaxTarda >= 40) { bonusVent = 1; factors.push(`Vent N/NE/NW ${ventMaxTarda.toFixed(0)} km/h`); }
  }

  return {
    nivell: Math.min(2, nivellBase + bonusVent),
    factors,
    dades: { tmaxMati, precMati, ventMaxMati, wmoMati, tminTarda, tmaxTarda, precTarda, neuTarda, ventMaxTarda, ventMaxDirTarda, wmoTarda, avg30d }
  };
}

async function fetchPunt(punt, avuiStr, demaStr, fa30Str) {
  const p = `latitude=${punt.lat}&longitude=${punt.lon}&elevation=${punt.alt}&timezone=Europe%2FMadrid`;
  const [prevResp, histResp] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${p}&hourly=temperature_2m,precipitation,snowfall,windspeed_10m,winddirection_10m,weathercode&forecast_days=2`),
    fetch(`https://archive-api.open-meteo.com/v1/archive?${p}&daily=temperature_2m_max&start_date=${fa30Str}&end_date=${avuiStr}`)
  ]);
  if (!prevResp.ok) throw new Error(`Forecast ${punt.nom}: ${prevResp.status}`);
  if (!histResp.ok) throw new Error(`Archive ${punt.nom}: ${histResp.status}`);
  const prev = await prevResp.json();
  const hist = await histResp.json();
  const histMaxs = (hist.daily?.temperature_2m_max || []).filter(v => v !== null);
  const avg30d = histMaxs.length ? histMaxs.reduce((a,b)=>a+b,0)/histMaxs.length : null;
  return {
    punt,
    avui: calcularRiscDia(prev, avuiStr, avg30d, punt),
    dema: calcularRiscDia(prev, demaStr, avg30d, punt)
  };
}

function toRows(resultats, dataStr, tipusDia) {
  return resultats
    .map(r => {
      const dia = r[tipusDia];
      if (!dia) return null;
      return {
        data: dataStr,
        tipus_dia: tipusDia,
        punt: r.punt.nom,
        lat: r.punt.lat,
        lon: r.punt.lon,
        alt: r.punt.alt,
        nivell: dia.nivell,
        factors: dia.factors,
        tmax_mati:     dia.dades?.tmaxMati       ?? null,
        tmin_tarda:    dia.dades?.tminTarda      ?? null,
        prec_mati:     dia.dades?.precMati       ?? null,
        prec_tarda:    dia.dades?.precTarda      ?? null,
        neu_tarda:     dia.dades?.neuTarda       ?? null,
        vent_max_mati: dia.dades?.ventMaxMati    ?? null,
        vent_max_tarda:dia.dades?.ventMaxTarda   ?? null,
        vent_dir_tarda:dia.dades?.ventMaxDirTarda?? null,
        wmo_mati:      dia.dades?.wmoMati        ?? null,
        wmo_tarda:     dia.dades?.wmoTarda       ?? null,
        avg_30d:       dia.dades?.avg30d         ?? null,
        actualitzat:   new Date().toISOString()
      };
    })
    .filter(Boolean);
}

async function main() {
  const avui = new Date();
  const dema = new Date(avui); dema.setDate(dema.getDate() + 1);
  const avuiStr = avuiMadrid();
  const demaStr = dema.toLocaleString('sv', { timeZone: 'Europe/Madrid' }).split(' ')[0];
  const fa30 = new Date(avui); fa30.setDate(fa30.getDate() - 31);
  const fa30Str = fa30.toISOString().split('T')[0];

  console.log(`📅 Canvi Temps: ${avuiStr} / ${demaStr}`);

  const resultats = await Promise.all(
    CANVI_PUNTS.map(p => fetchPunt(p, avuiStr, demaStr, fa30Str)
      .catch(e => { console.warn(`⚠️ ${p.nom}: ${e.message}`); return { punt: p, avui: null, dema: null }; }))
  );

  const anterior = readJSON('canvi_temps_latest.json');
  const nou = { data: avuiStr, actualitzat: new Date().toISOString(), resultats: resultats.map(r => ({ punt: r.punt, avui: r.avui, dema: r.dema })) };

  const changed = !anterior || anterior.data !== avuiStr ||
    JSON.stringify(anterior.resultats?.map(r => r.avui?.nivell)) !==
    JSON.stringify(nou.resultats.map(r => r.avui?.nivell));

  writeJSON('canvi_temps_latest.json', nou);

  if (FORCE || changed) {
    const rowsAvui = toRows(resultats, avuiStr, 'avui');
    const rowsDema = toRows(resultats, demaStr, 'dema');
    const rows = [...rowsAvui, ...rowsDema];
    if (rows.length > 0) await supabaseUpsert('canvi_temps_historic', rows);
    console.log(changed ? `🔄 Canvi Temps actualitzat` : '💪 Forçat');
  } else {
    console.log('⏭️ Canvi Temps: sense canvis');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
