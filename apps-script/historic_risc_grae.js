// ============================================================================
// CÒPIA DEL GOOGLE APPS SCRIPT "historic_risc_grae"
// ============================================================================
//
// Aquest fitxer NO s'executa des del repositori. És una còpia del codi que corre
// a Google Apps Script i que, des del 7 d'agost de 2026, és l'únic que desa el
// risc diari a `risc_historic` (font `auto_gas`).
//
//   Projecte: https://script.google.com/d/1dCXy1nki400bsy9CLx-X4sSQVyyMS2147Mxfyfnl7HhZT1i7tRoku1Va/edit
//   Trigger:  diari, ~09:08 UTC (11:08 Madrid) → guardarRiscDiari()
//   Baixat:   2026-08-26
//
// Es guarda aquí perquè fins ara no es podia auditar què calculava, i la regla
// d'or del projecte diu que el repositori és la memòria. Si es toca a Google,
// cal tornar-lo a baixar aquí.
//
// Vegeu EVOLUCIO-PREDICCIONS.md per a l'anàlisi: què fa diferent de
// scripts/risc-diari.js i què cal per poder-lo apagar.
//
// ATENCIÓ: la constant s'anomena SUPABASE_SERVICE_KEY però el valor és una clau
// `sb_publishable_` (pública), no la `service_role`. Escriu a risc_historic amb
// una clau pública.
// ============================================================================

// ===== CONFIGURACIÓ =====
const CARPETA_ID = '1wYk22B5M05A8beqNCXMD0ei_v7qGTECo';
const NOM_FITXER  = 'risc_grae_historic.json';

const URL_BPA_LATEST     = 'https://gist.githubusercontent.com/correvents/bf2beb9bca2a338f7b06180b14ab139f/raw/bpa_latest.json';
const URL_PLANSPC_LATEST = 'https://script.google.com/macros/s/AKfycby5xfG3ZLmJ7dnRZjG15S9S9aVhmFuaF93di3sFcRjhsTjcE0zDv3QCFEu9mFIz8rD5/exec';
const URL_SMP_LATEST     = 'https://script.google.com/macros/s/AKfycbwlMCAzHyqKkGjV-YjbMETVZ6uWu31rtTlykT2vh72YDr17JCi8js_f2Al91XxU8-kMhg/exec';
const URL_AFLUENCIA      = 'https://script.google.com/macros/s/AKfycbwWPFLzgRppSM0AmR_rAphGIRzh9EOJcV3zmbW5CivQJ1RGwm7Ar_t4hvvxBo6o84urTA/exec';

// ===== SUPABASE =====
const SUPABASE_URL         = 'https://rxfjwklbvqkwgzmpzwae.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_publishable_1c8JKagZduom1Vz07Cpu-w_JHycdtpJ';

function guardarRiscASupabase(dataStr, risc, factors, font) {
  const payload = {
    data: dataStr,
    risc: risc,
    planspc:    factors.planspc    || 0,
    smp:        factors.smp        || 0,
    allaus:     factors.allaus     || 0,
    afluencia:  factors.afluencia  || 0,
    hc:         factors.hc         || 0,
    canvi:      factors.canvi      || 0,
    boletaires: factors.boletaires || 0,
    font:       font || 'auto_gas'
  };

  const opcions = {
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Prefer': 'resolution=merge-duplicates'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/risc_historic', opcions);
    const codi = resp.getResponseCode();
    if (codi >= 200 && codi < 300) {
      Logger.log('✅ Supabase: registre guardat per ' + dataStr);
    } else {
      Logger.log('❌ Supabase error ' + codi + ': ' + resp.getContentText());
    }
  } catch (e) {
    Logger.log('❌ Supabase excepció: ' + e.message);
  }
}

// ===== WEB APP =====
function doGet(e) {
  const accio = e.parameter.accio || '';

  if (accio === 'getDia') {
    const data = e.parameter.data || '';
    if (!data) return jsonResponse({ error: 'Cal passar el paràmetre data (YYYY-MM-DD)' });
    const entrada = buscarEntrada(data) || { data: data, risc: null, factors: null, edicions: [], font: null };
    entrada.context = getDiaContext(data);
    const teContext = entrada.context && (
      (entrada.context.smp && entrada.context.smp.length > 0) ||
      entrada.context.bpa || entrada.context.planspc || entrada.context.previsio
    );
    if (!entrada.risc && !teContext) return jsonResponse({ error: 'No hi ha dades per aquesta data' });
    return jsonResponse(entrada);
  }

  if (accio === 'getLlista') {
    const historic = llegirHistoric();
    const llista = historic.map(e => ({ data: e.data, risc: e.risc }));
    return jsonResponse(llista);
  }

  return jsonResponse({ error: 'Acció no vàlida. Usa: getDia, getLlista' });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const accio = payload.accio || '';

    if (accio === 'guardarRisc') {
      const data = payload.data;
      if (!data) return jsonResponse({ error: 'Cal el camp data' });

      const entrada = {
        data: data,
        dataRegistre: new Date().toISOString(),
        risc: payload.risc,
        factors: payload.factors || null,
        edicions: payload.edicions || [],
        font: 'manual_web'
      };

      guardarEntrada(entrada);

      // També guardar a Supabase
      if (payload.factors) {
        guardarRiscASupabase(data, payload.risc, payload.factors, 'manual_web');
      }

      return jsonResponse({ ok: true, data: data });
    }

    return jsonResponse({ error: 'Acció no vàlida' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ===== FUNCIÓ PRINCIPAL (trigger diari) =====
function guardarRiscDiari() {
  const avui = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  const existent = buscarEntrada(avui);
  const factors  = calcularFactorsAvui(avui);
  const risc     = calcularRiscTotal(factors);

  const entrada = {
    data: avui,
    dataRegistre: new Date().toISOString(),
    risc: risc,
    factors: factors,
    edicions: existent ? (existent.edicions || []) : [],
    font: 'auto_gas'
  };

  guardarEntrada(entrada);
  guardarRiscASupabase(avui, risc, factors, 'auto_gas');
  Logger.log('Risc GRAE guardat per ' + avui + ': ' + risc);
}

// ===== CÀLCUL FACTORS =====
function calcularFactorsAvui(dataStr) {
  const factors = {
    planspc: 0, smp: 0, allaus: 0,
    afluencia: 0, hc: 0, canvi: 0, boletaires: 0
  };

  // 1. PLANS PC
  try {
    const resp = UrlFetchApp.fetch(URL_PLANSPC_LATEST, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const dades = JSON.parse(resp.getContentText());
      const plans = dades.plans || [];
      const ordre = { 'EMERGÈNCIA': 3, 'ALERTA': 2, 'PREALERTA': 1 };
      let maxPla = 0;
      plans.forEach(p => {
        const val = ordre[(p.plafase || '').toUpperCase()] || 0;
        if (val > maxPla) maxPla = val;
      });
      factors.planspc = maxPla;
    }
  } catch (e) { Logger.log('Error Plans PC: ' + e.message); }

  // 2. ALERTES SMP
  try {
    const resp = UrlFetchApp.fetch(URL_SMP_LATEST, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const dades = JSON.parse(resp.getContentText());
      const avisos = dades.avisos || [];
      const nivellMaxPerZona = {};

      avisos.forEach(avis => {
        (avis.dies || []).forEach(dia => {
          if (dia.dia !== dataStr) return;
          (dia.afectacions || []).forEach(af => {
            const zona = af.zona;
            const nivellOrdre = { 'Groc': 1, 'Taronja': 2, 'Vermell': 3 };
            if (!nivellMaxPerZona[zona] ||
                (nivellOrdre[af.nivell] || 0) > (nivellOrdre[nivellMaxPerZona[zona]] || 0)) {
              nivellMaxPerZona[zona] = af.nivell;
            }
          });
        });
      });

      let numGroc = 0, numTaronja = 0, numVermell = 0;
      Object.values(nivellMaxPerZona).forEach(n => {
        if (n === 'Vermell') numVermell++;
        else if (n === 'Taronja') numTaronja++;
        else if (n === 'Groc') numGroc++;
      });

      let smp = 0;
      if      (numVermell >= 3) smp = 6;
      else if (numVermell > 0)  smp = 5;
      else if (numTaronja >= 3) smp = 4;
      else if (numTaronja > 0)  smp = 3;
      else if (numGroc >= 3)    smp = 2;
      else if (numGroc > 0)     smp = 1;
      factors.smp = smp;

      // HC
      let hc = 0;
      avisos.forEach(avis => {
        const meteor = (avis.meteor || '').toLowerCase();
        (avis.dies || []).forEach(dia => {
          if (dia.dia !== dataStr) return;
          (dia.afectacions || []).forEach(af => {
            if ((meteor.includes('vent') || meteor.includes('neu')) && af.nivell === 'Vermell')
              hc = Math.max(hc, 2);
            else if ((meteor.includes('vent') || meteor.includes('neu') || meteor.includes('pluja')) && af.nivell === 'Taronja')
              hc = Math.max(hc, 1);
            else if ((meteor.includes('vent') || meteor.includes('neu')) && af.nivell === 'Groc')
              hc = Math.max(hc, 1);
          });
        });
      });
      factors.hc = hc;
    }
  } catch (e) { Logger.log('Error SMP: ' + e.message); }

  // 3. ALLAUS (BPA)
  try {
    const resp = UrlFetchApp.fetch(URL_BPA_LATEST, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const dades = JSON.parse(resp.getContentText());
      const perillMax = (dades.resum && dades.resum.perill_maxim_numeric) || 1;
      factors.allaus = Math.round(Math.max(0, (perillMax - 1) * 1.25));
    }
  } catch (e) { Logger.log('Error BPA: ' + e.message); }

  // 4. AFLUÈNCIA
  try {
    const resp = UrlFetchApp.fetch(URL_AFLUENCIA + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      const dades = JSON.parse(resp.getContentText());
      const edicions = dades.edicions || {};
      if (edicions[dataStr] !== undefined) {
        const val = typeof edicions[dataStr] === 'object' ? edicions[dataStr].nivell : edicions[dataStr];
        factors.afluencia = val || 0;
      } else {
        factors.afluencia = calcularAfluenciaBaseGAS(dataStr);
      }
    }
  } catch (e) { Logger.log('Error Afluència: ' + e.message); }

  return factors;
}

function calcularAfluenciaBaseGAS(dataStr) {
  const data = new Date(dataStr + 'T12:00:00');
  const mes  = data.getMonth() + 1;
  const dia  = data.getDate();
  const dow  = data.getDay();
  const cap  = dow === 0 || dow === 6;

  if (cap && ((mes >= 7 && mes <= 9) || (mes === 10 && dia <= 15))) return 2;
  if (mes === 8 && dia <= 15) return 2;
  if (cap && mes === 10 && dia > 15) return 1;
  if (cap && mes === 11 && dia <= 15) return 1;
  if (!cap && ((mes === 6 && dia >= 22) || mes === 7 || mes === 8 || (mes === 9 && dia <= 7))) return 1;
  return 0;
}

function calcularRiscTotal(factors) {
  const total = (factors.planspc || 0) + (factors.smp || 0) + (factors.allaus || 0) +
                (factors.afluencia || 0) + (factors.hc || 0) + (factors.canvi || 0);
  return Math.min(6, Math.round((total / 21) * 6));
}

// ===== GESTIÓ FITXER HISTORIC =====
function llegirHistoric() {
  const carpeta = DriveApp.getFolderById(CARPETA_ID);
  const fitxers = carpeta.getFilesByName(NOM_FITXER);
  if (!fitxers.hasNext()) return [];
  return JSON.parse(fitxers.next().getBlob().getDataAsString());
}

function guardarHistoric(historic) {
  const carpeta = DriveApp.getFolderById(CARPETA_ID);
  const contingut = JSON.stringify(historic, null, 2);
  const fitxers = carpeta.getFilesByName(NOM_FITXER);
  if (fitxers.hasNext()) {
    fitxers.next().setContent(contingut);
  } else {
    carpeta.createFile(NOM_FITXER, contingut, 'application/json');
  }
}

function buscarEntrada(dataStr) {
  const historic = llegirHistoric();
  return historic.find(e => e.data === dataStr) || null;
}

function guardarEntrada(entrada) {
  const historic = llegirHistoric();
  const idx = historic.findIndex(e => e.data === entrada.data);
  if (idx >= 0) {
    historic[idx] = entrada;
  } else {
    historic.push(entrada);
    historic.sort((a, b) => a.data.localeCompare(b.data));
  }
  if (historic.length > 3650) historic.splice(0, historic.length - 3650);
  guardarHistoric(historic);
}

// ===== CONTEXT HISTORIC PER DIA =====
function getDiaContext(dataStr) {
  const context = { smp: null, bpa: null, planspc: null, afluencia: null };
  const carpeta = DriveApp.getFolderById(CARPETA_ID);

  try {
    const fitxers = carpeta.getFilesByName('smp_historic.json');
    if (fitxers.hasNext()) {
      const historic = JSON.parse(fitxers.next().getBlob().getDataAsString());
      const entrades = historic.filter(e => e.dataConsulta);
      const entradesFiltrades = entrades.filter(e => e.dataConsulta.substring(0,10) <= dataStr);
      if (entradesFiltrades.length > 0) {
        const ultima = entradesFiltrades[entradesFiltrades.length - 1];
        const avisos = ultima.avisos || [];
        const avisosDelDia = avisos.map(avis => {
          const diesDelDia = (avis.dies || []).filter(d => d.dia === dataStr);
          if (diesDelDia.length === 0) return null;
          const afectacions = diesDelDia.reduce((acc, d) => acc.concat(d.afectacions || []), []);
          return { meteor: avis.meteor, estat: avis.estat, afectacions: afectacions };
        }).filter(Boolean);
        context.smp = avisosDelDia;
        context.dataConsultaSMP = ultima.dataConsulta ? ultima.dataConsulta.substring(0,10) : null;
      } else {
        context.smp = [];
      }
    }
  } catch(e) { Logger.log('Error SMP historic: ' + e.message); }

  try {
    const fitxers = carpeta.getFilesByName('bpa_historic.json');
    if (fitxers.hasNext()) {
      const historic = JSON.parse(fitxers.next().getBlob().getDataAsString());
      const butlletins = (historic.butlletins || []).sort((a,b) => a.data > b.data ? 1 : -1);
      const filtrats = butlletins.filter(b => b.data && b.data <= dataStr);
      if (filtrats.length > 0) {
        const bpa = filtrats[filtrats.length - 1];
        context.bpa = {
          data: bpa.data,
          perill_maxim: bpa.resum ? bpa.resum.perill_maxim : null,
          perill_maxim_numeric: bpa.resum ? bpa.resum.perill_maxim_numeric : null,
          zones_alt_perill: bpa.resum ? (bpa.resum.zones_alt_perill || []) : [],
          recomanacio: bpa.resum ? bpa.resum.recomanacio : null
        };
      }
    }
  } catch(e) { Logger.log('Error BPA historic: ' + e.message); }

  try {
    const fitxers = carpeta.getFilesByName('pc_historic.json');
    if (fitxers.hasNext()) {
      const historic = JSON.parse(fitxers.next().getBlob().getDataAsString());
      const registres = historic.registres || [];
      const filtrats = registres.filter(r => r.timestamp && r.timestamp.startsWith(dataStr));
      if (filtrats.length > 0) {
        context.planspc = filtrats[filtrats.length - 1].plans || [];
      } else {
        const anteriors = registres.filter(r => r.timestamp && r.timestamp.substring(0,10) <= dataStr);
        if (anteriors.length > 0) {
          context.planspc = anteriors[anteriors.length - 1].plans || [];
        }
      }
    }
  } catch(e) { Logger.log('Error Plans PC historic: ' + e.message); }

  try {
    const fitxers = carpeta.getFilesByName('afuluencia.json');
    if (fitxers.hasNext()) {
      const dades = JSON.parse(fitxers.next().getBlob().getDataAsString());
      const edicions = dades.edicions || {};
      if (edicions[dataStr] !== undefined) {
        const val = typeof edicions[dataStr] === 'object' ? edicions[dataStr].nivell : edicions[dataStr];
        context.afluencia = val || 0;
      } else {
        context.afluencia = calcularAfluenciaBaseGAS(dataStr);
      }
    } else {
      context.afluencia = calcularAfluenciaBaseGAS(dataStr);
    }
  } catch(e) { context.afluencia = calcularAfluenciaBaseGAS(dataStr); }

  try {
    const fitxers = carpeta.getFilesByName('previsio_historic.json');
    if (fitxers.hasNext()) {
      const historic = JSON.parse(fitxers.next().getBlob().getDataAsString());
      let previsio = null;
      for (const e of historic) {
        if (!e.dataConsulta) continue;
        if (e.avui && e.avui.data === dataStr) { previsio = e.avui.variables || null; break; }
        if (e.dema && e.dema.data === dataStr) { previsio = e.dema.variables || null; break; }
      }
      context.previsio = previsio;
    }
  } catch(e) { Logger.log('Error Previsió historic: ' + e.message); }

  return context;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
