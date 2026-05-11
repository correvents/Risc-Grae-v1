const { supabaseUpsert, supabaseSelect, readJSON, avuiMadrid } = require('./utils');

function calcularAfluenciaBase(dataStr) {
  const d = new Date(dataStr + 'T12:00:00');
  const mes = d.getMonth() + 1, dia = d.getDate(), dow = d.getDay(), cap = dow === 0 || dow === 6;
  if (cap && ((mes >= 7 && mes <= 9) || (mes === 10 && dia <= 15))) return 2;
  if (mes === 8 && dia <= 15) return 2;
  if (cap && mes === 10 && dia > 15) return 1;
  if (cap && mes === 11 && dia <= 15) return 1;
  if (!cap && ((mes === 6 && dia >= 22) || mes === 7 || mes === 8 || (mes === 9 && dia <= 7))) return 1;
  return 0;
}

async function getAfluencia(avui) {
  try {
    const rows = await supabaseSelect('afluencia_edicions', { data: avui });
    if (rows.length > 0) return rows[0].nivell ?? 0;
  } catch {}
  return calcularAfluenciaBase(avui);
}

function calcularFactors(avui) {
  const f = { planspc: 0, smp: 0, allaus: 0, afluencia: 0, hc: 0, canvi: 0, boletaires: 0 };

  // Plans PC
  const planspc = readJSON('planspc_latest.json');
  if (planspc?.plans?.length) {
    const ordre = { 'EMERGÈNCIA': 3, 'ALERTA': 2, 'PREALERTA': 1 };
    f.planspc = Math.max(0, ...planspc.plans.map(p => ordre[(p.plafase || '').toUpperCase()] || 0));
  }

  // SMP + HC
  const smp = readJSON('smp_latest.json');
  if (smp?.avisos?.length) {
    const maxPerZona = {};
    const ordre = { 'Groc': 1, 'Taronja': 2, 'Vermell': 3 };
    for (const avis of smp.avisos)
      for (const diaObj of avis.dies) {
        if (diaObj.dia !== avui) continue;
        for (const af of diaObj.afectacions)
          if (!maxPerZona[af.zona] || (ordre[af.nivell] || 0) > (ordre[maxPerZona[af.zona]] || 0))
            maxPerZona[af.zona] = af.nivell;
      }
    const vals = Object.values(maxPerZona);
    const nv = vals.filter(n => n === 'Vermell').length;
    const nt = vals.filter(n => n === 'Taronja').length;
    const ng = vals.filter(n => n === 'Groc').length;
    if      (nv >= 3) f.smp = 6; else if (nv > 0) f.smp = 5;
    else if (nt >= 3) f.smp = 4; else if (nt > 0) f.smp = 3;
    else if (ng >= 3) f.smp = 2; else if (ng > 0) f.smp = 1;

    let hc = 0;
    for (const avis of smp.avisos) {
      const meteor = (avis.meteor || '').toLowerCase();
      for (const diaObj of avis.dies) {
        if (diaObj.dia !== avui) continue;
        for (const af of diaObj.afectacions) {
          if ((meteor.includes('vent') || meteor.includes('neu')) && af.nivell === 'Vermell') hc = Math.max(hc, 2);
          else if ((meteor.includes('vent') || meteor.includes('neu') || meteor.includes('pluja')) && af.nivell === 'Taronja') hc = Math.max(hc, 1);
          else if ((meteor.includes('vent') || meteor.includes('neu')) && af.nivell === 'Groc') hc = Math.max(hc, 1);
        }
      }
    }
    f.hc = hc;
  }

  // BPA
  const bpa = readJSON('bpa_latest.json');
  if (bpa?.resum?.perill_maxim_numeric) {
    f.allaus = Math.round(Math.max(0, (bpa.resum.perill_maxim_numeric - 1) * 1.25));
  }

  return f;
}

async function main() {
  const avui = avuiMadrid();

  // No sobreescriure si ja hi ha entrada manual per avui
  const existent = await supabaseSelect('risc_historic', { data: avui });
  if (existent.length > 0 && existent[0].font !== 'auto_github' && existent[0].font !== 'auto_gas') {
    console.log(`⏭️ Entrada manual per ${avui} (font: ${existent[0].font}), no sobreescric`);
    return;
  }

  const factors = calcularFactors(avui);
  factors.afluencia = await getAfluencia(avui);

  const total = factors.planspc + factors.smp + factors.allaus + factors.afluencia + factors.hc + factors.canvi;
  const risc = Math.min(6, Math.round((total / 21) * 6));

  await supabaseUpsert('risc_historic', {
    data: avui, risc,
    planspc: factors.planspc, smp: factors.smp, allaus: factors.allaus,
    afluencia: factors.afluencia, hc: factors.hc, canvi: factors.canvi,
    boletaires: factors.boletaires, notes: '', font: 'auto_github'
  });

  console.log(`✅ Risc GRAE ${avui}: ${risc} | planspc=${factors.planspc} smp=${factors.smp} allaus=${factors.allaus} afluencia=${factors.afluencia} hc=${factors.hc}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
