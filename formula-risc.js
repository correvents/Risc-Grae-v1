// ==================== FÓRMULA DE RISC (compartida) ====================
//
// **Aquest fitxer és l'única definició de la fórmula.** El carreguen tant
// l'`index.html` (amb <script src>) com els scripts de Node (amb require). És
// l'excepció conscient a la regla «l'index.html és un sol fitxer»: fins ara hi
// havia dues fórmules —la del frontend i la de `risc-diari.js`— i no donaven el
// mateix número. Amb les captures del risc això deixava de ser un detall: el
// que es desa ha de ser exactament el que es veu a la pantalla.
//
// Si el canvies, no cal tocar res més: el navegador i el backend el llegeixen
// tots dos. Puja `RISC_FORMULA_VERSIO` si en canvia el *significat*.
//
// El risc mesura la probabilitat de quedar desbordats: no és "quant perill hi ha
// a la muntanya" sinó "podrem atendre tot el que surti".
//
//   perill = min(PERILL_MAX, el més gran d'SMP i allaus + suplement pel segon)
//   risc   = min(SOSTRE, perill + increments)
//
// Es pren el més gran i no la suma per no comptar dues vegades el mateix, però
// dos perills alhora carreguen més: el segon hi afegeix un suplement.
// El perill es limita a 5 perquè sempre quedi marge: el darrer graó fins a 6 el
// mouen la gent que hi ha a la muntanya, els helicòpters i el canvi de temps.

(function (arrel) {
  'use strict';

  const RISC_SOSTRE = 6;
  const RISC_PERILL_MAX = 5;

  const RISC_FORMULA_DEFAULT = {
    // --- Perill (es pren el més gran; el segon hi suma un suplement) ---
    smp:          { actiu: true, perill: true },                          // ja ve en escala 0-6
    allaus:       { actiu: true, perill: true, punts: { 1: 0, 2: 0, 3: 2, 4: 4, 5: 5 } },
    segonPerill:  { actiu: true, punts: { 1: 1, 3: 2 } },                 // suplement: segon perill 1-2 → +1; 3 o més → +2
    // --- Increments ---
    // Tot en nombres enters: el risc no ha de sortir mai amb decimals. Cada
    // factor suma el seu propi valor d'escala, tret de l'operativitat, que és
    // a l'inrevés (com menys helis operatius, més suma).
    // La clau és el nombre d'HC **operatius** (0-4): estat de plena operativitat
    // i meteo que permet volar. Amb dos o més ja es pot cobrir el territori, i
    // per això no sumen; l'escala només es mou quan en queden un o cap.
    operativitat: { actiu: true, punts: { 0: 2, 1: 1, 2: 0, 3: 0, 4: 0 } },
    afluencia:    { actiu: true, punts: { 0: 0, 1: 1, 2: 2, 3: 3 } },
    // L'afluència és una previsió feta amb estadístiques de calendari, i el
    // calendari no veu quin temps farà. Amb avisos SMP la gent no hi va, així
    // que la previsió s'ha de corregir a la baixa abans de sumar-la; si no,
    // el mal temps compta dues vegades. Reducció segons el valor d'SMP:
    // Els trams segueixen el color de l'avís, no el número: a l'escala d'SMP
    // 1-2 és groc i 3-6 taronja o vermell. Un groc no atura ningú; a partir
    // del taronja hi va menys gent i la previsió baixa un graó.
    // No s'aplica a les allaus: amb perill 4-5 baixa la gent, però la que hi
    // ha és justament la que està en perill.
    afluenciaSMP: { actiu: true, punts: { 0: 0, 3: 1 } },
    // Sostre del que poden sumar tots els increments junts. Sense això, un dia
    // sense cap perill de muntanya però amb tot en contra (pont d'agost, dos
    // helis de baixa, canvi de temps fort, boletaires) arribava a 6, que és el
    // mateix que un vermell d'allaus. Els increments modulen, no manen.
    incrementsMax: { actiu: true, punts: { 0: 3 } },
    canvi:        { actiu: true, punts: { 0: 0, 1: 1, 2: 2 } },
    boletaires:   { actiu: true, punts: { 0: 0, 1: 1 } },                 // 0 o 1
    // Plans PC: només informatiu, no entra al càlcul
  };

  // Versió de la fórmula. Puja-la sempre que canviï el *significat* dels punts,
  // no només el seu valor: una config desada amb l'escala antiga no es pot
  // reinterpretar amb la nova i s'ha de descartar. La 2 és el pas a nombres
  // enters, on cada increment suma el seu propi valor d'escala; la 3 hi afegeix
  // la reducció de l'afluència quan hi ha avisos SMP, la 4 el sostre dels
  // increments i la 6 l'escala d'operativitat per HC operatius (0→+2, 1→+1,
  // 2 o més→0). La 5 va ser un intent d'escala proporcional, descartat.
  const RISC_FORMULA_VERSIO = 6;

  // Detall del càlcul: quin factor marca la base i què hi suma cadascun.
  //
  // `dia.allaus` ha d'arribar **ja resolt**: qui crida decideix si l'interruptor
  // de temporada el posa a 0 (al navegador, `nivellAllaus()`; al backend, la
  // config de Supabase). Aquí no es llegeix cap configuració de fora, i per això
  // el backend en pot treure el mateix número que la pantalla.
  function detallarRisc(dia, formula) {
    const F = formula || RISC_FORMULA_DEFAULT;
    const perills = [];
    if (F.smp.actiu)    perills.push({ nom: 'smp',    valor: parseFloat(dia.smp || 0) });
    if (F.allaus.actiu) perills.push({ nom: 'allaus', valor: +(F.allaus.punts[parseInt(dia.allaus || 0)] ?? 0) });
    perills.sort((a, b) => b.valor - a.valor);

    const major = perills[0] || { nom: null, valor: 0 };
    const segon = perills[1] || { nom: null, valor: 0 };
    const dominant = major.valor > 0 ? major.nom : null;

    // Dos perills alhora carreguen més que un de sol, però no se sumen sencers
    let suplement = 0;
    if (F.segonPerill.actiu && major.valor > 0 && segon.valor > 0) {
      suplement = segon.valor >= 3 ? +(F.segonPerill.punts[3] ?? 0) : +(F.segonPerill.punts[1] ?? 0);
    }
    const base = Math.min(RISC_PERILL_MAX, major.valor + suplement);
    const segonNom = suplement > 0 ? segon.nom : null;

    const increments = {};
    if (F.operativitat.actiu) {
      const n = (dia.operativitatHelis == null) ? 4 : parseInt(dia.operativitatHelis);
      increments.operativitat = +(F.operativitat.punts[n] ?? 0);
    }
    // L'SMP rebaixa l'afluència prevista abans que sumi (vegeu afluenciaSMP)
    const smpValor = parseFloat(dia.smp || 0);
    let reduccioAfluencia = 0;
    if (F.afluenciaSMP.actiu) {
      const trams = Object.keys(F.afluenciaSMP.punts).map(Number).sort((a, b) => a - b);
      for (const t of trams) if (smpValor >= t) reduccioAfluencia = +(F.afluenciaSMP.punts[t] ?? 0);
    }
    const afluenciaBruta = parseInt(dia.afluencia || 0);
    const afluenciaEfectiva = Math.max(0, afluenciaBruta - reduccioAfluencia);
    if (F.afluencia.actiu)  increments.afluencia  = +(F.afluencia.punts[afluenciaEfectiva] ?? 0);
    if (F.canvi.actiu)      increments.canvi      = +(F.canvi.punts[parseInt(dia.canvi || 0)] ?? 0);
    if (F.boletaires.actiu) increments.boletaires = parseInt(dia.boletaires || 0) > 0 ? +(F.boletaires.punts[1] ?? 0) : 0;

    let extra = Object.values(increments).reduce((a, b) => a + b, 0);
    // Els increments modulen el perill, no el substitueixen: junts tenen sostre
    const extraSenseTopar = extra;
    const extraMax = F.incrementsMax.actiu ? +(F.incrementsMax.punts[0] ?? 0) : Infinity;
    extra = Math.min(extra, extraMax);
    // El risc sempre és un nombre enter. Els punts per defecte ja ho són, però
    // es poden editar des de Configuració, i d'allà en podria sortir un decimal.
    const brut = Math.round(base + extra);
    return {
      base, dominant, suplement, segonNom, increments, extra,
      extraSenseTopar, extraTopat: extraSenseTopar > extra,
      afluenciaBruta, afluenciaEfectiva, reduccioAfluencia,
      topat: brut > RISC_SOSTRE,
      risc: Math.max(0, Math.min(RISC_SOSTRE, brut))
    };
  }

  function calcularRisc(dia, formula) {
    return detallarRisc(dia, formula).risc;
  }


  // ==================== AFLUÈNCIA: EL CALENDARI ====================
  // Portat aquí des de l'index.html perquè el backend n'hagi de treure el mateix
  // nivell: l'afluència és un increment de la fórmula i, si els dos costats no el
  // calculessin igual, el risc desat no seria el de la pantalla.
  // `edicions` són les files d'`afluencia_edicions` (data → nivell o {nivell, motiu}).
  const calcularSetmanaSanta = (any) => {
    const a = any % 19;
    const b = Math.floor(any / 100);
    const c = any % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    
    // Diumenge de Pasqua
    const pasqua = new Date(any, mes - 1, dia);
    
    // Divendres Sant (2 dies abans)
    const divendresSant = new Date(pasqua);
    divendresSant.setDate(pasqua.getDate() - 2);
    
    // Dilluns de Pasqua (1 dia després)
    const dillunsPasqua = new Date(pasqua);
    dillunsPasqua.setDate(pasqua.getDate() + 1);
    
    return {
      pasqua: pasqua,
      divendresSant: divendresSant,
      dillunsPasqua: dillunsPasqua
    };
  };
  
  const formatDateStr = (date) => {
    const any = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${any}-${mes}-${dia}`;
  };
  
  const generarFestiusDinamics = (any) => {
    const festius = {};
    const ss = calcularSetmanaSanta(any);
    
    // Festius fixes
    const fixes = [
      // 1 i 6 gener -> nivell 1 (dins vacances Nadal)
      { mes: 5, dia: 1, nom: "Dia del Treball" },
      // 23 i 24 juny (Sant Joan) -> nivell 1 (baixa afluència)
      { mes: 8, dia: 15, nom: "L'Assumpció" },
      { mes: 9, dia: 11, nom: "Diada Nacional" },
      { mes: 10, dia: 12, nom: "Festa Nacional Espanya" },
      { mes: 11, dia: 1, nom: "Tots Sants" },
      { mes: 12, dia: 6, nom: "Dia de la Constitució" },
      { mes: 12, dia: 8, nom: "La Immaculada" }
      // Nadal i Sant Esteve -> nivell 1 (baixa afluència real)
      // Festius locals Barcelona -> nivell 1 (baixa afluència)
    ];
    
    fixes.forEach(f => {
      const dataStr = `${any}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;
      festius[dataStr] = { nivell: 2, motiu: f.nom };
    });
    
    // Festius mòbils (Setmana Santa)
    festius[formatDateStr(ss.divendresSant)] = { nivell: 2, motiu: "Divendres Sant" };
    festius[formatDateStr(ss.dillunsPasqua)] = { nivell: 2, motiu: "Dilluns de Pasqua" };
    
    return festius;
  };
  
  // Generar períodes dinàmicament per qualsevol any
  const generarPeriodesDinamics = (any) => {
    const ss = calcularSetmanaSanta(any);
    const iniciSS = new Date(ss.divendresSant);
    iniciSS.setDate(iniciSS.getDate() - 1);
    
    // Calcular dies de Setmana Santa
    const dlPasqua = new Date(ss.dillunsPasqua);
    const dgPasqua = new Date(dlPasqua);
    dgPasqua.setDate(dgPasqua.getDate() - 1);
    const dsSant = new Date(dgPasqua);
    dsSant.setDate(dsSant.getDate() - 1);
    const dvSant = new Date(ss.divendresSant);
    const djSant = new Date(dvSant);
    djSant.setDate(djSant.getDate() - 1);
    const dcSant = new Date(djSant);
    dcSant.setDate(dcSant.getDate() - 1);
    const dtSS = new Date(dcSant);
    dtSS.setDate(dtSS.getDate() - 1);
    const dlSS = new Date(dtSS);
    dlSS.setDate(dlSS.getDate() - 1);
    const dgAnterior = new Date(dlSS);
    dgAnterior.setDate(dgAnterior.getDate() - 1);
    const dsAnterior = new Date(dgAnterior);
    dsAnterior.setDate(dsAnterior.getDate() - 1);
    
    // Detectar ponts dinàmicament segons el dia de la setmana dels festius
    const periodes2 = [
      // Cap de setmana anterior a Setmana Santa (nivell 2)
      { inici: formatDateStr(dsAnterior), fi: formatDateStr(dgAnterior), motiu: "Cap setmana anterior Setmana Santa" },
      // Dimecres i Dijous Sant (nivell 2)
      { inici: formatDateStr(dcSant), fi: formatDateStr(djSant), motiu: "Dimecres i Dijous Sant" },
      // Divendres Sant a Dilluns Pasqua (nivell 2)
      { inici: formatDateStr(dvSant), fi: formatDateStr(dlPasqua), motiu: "Pont Setmana Santa" },
      { inici: `${any}-08-01`, fi: `${any}-08-15`, motiu: "1a quinzena d'agost" },
      { inici: `${any}-12-05`, fi: `${any}-12-08`, motiu: "Pont Puríssima" }
    ];
    
    // Dilluns i Dimarts de Setmana Santa (nivell 1)
    const periodes1Extra = [
      { inici: formatDateStr(dlSS), fi: formatDateStr(dtSS), motiu: "Setmana Santa (dilluns-dimarts)" }
    ];
    
    // Pont 1 de Maig
    const dia1maig = new Date(any, 4, 1).getDay();
    if (dia1maig === 5) { // Divendres
      periodes2.push({ inici: `${any}-05-01`, fi: `${any}-05-03`, motiu: "Pont 1 de Maig" });
    } else if (dia1maig === 4) { // Dijous
      periodes2.push({ inici: `${any}-05-01`, fi: `${any}-05-04`, motiu: "Pont 1 de Maig" });
    }
    
    // Temporada estiu-tardor - caps de setmana nivell 2
    // Juliol, Agost, Setembre i 1a quinzena Octubre
    let dataEstiu = new Date(any, 6, 1); // 1 juliol
    const fiEstiu = new Date(any, 9, 15); // 15 octubre
    while (dataEstiu <= fiEstiu) {
      if (dataEstiu.getDay() === 6) { // Dissabte
        const diumenge = new Date(dataEstiu);
        diumenge.setDate(diumenge.getDate() + 1);
        let motiu = "Cap de setmana estiu";
        if (dataEstiu.getMonth() === 8 || dataEstiu.getMonth() === 9) {
          motiu = "Temporada tardor (bolets)";
        }
        periodes2.push({ 
          inici: formatDateStr(dataEstiu), 
          fi: formatDateStr(diumenge), 
          motiu: motiu 
        });
      }
      dataEstiu.setDate(dataEstiu.getDate() + 1);
    }
    
    return {
      nivell1: [
        { inici: `${any-1}-12-20`, fi: `${any}-01-07`, motiu: "Vacances de Nadal" },
        { inici: `${any}-02-14`, fi: `${any}-02-17`, motiu: "Carnaval" },
        ...periodes1Extra,
        { inici: `${any}-06-22`, fi: `${any}-09-07`, motiu: "Vacances d'estiu" },
        { inici: `${any}-12-20`, fi: `${any}-12-31`, motiu: "Vacances de Nadal" }
      ],
      nivell2: periodes2
    };
  };
  
  function afluenciaDelCalendari(dataStr, edicions) {
    // Parsejar la data correctament evitant problemes de timezone
    const [any, mes, dia] = dataStr.split('-').map(Number);
    const data = new Date(any, mes - 1, dia);
    const diaSemana = data.getDay();
    const diesNom = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'];
    
    let nivell = 0;
    let motiu = "Dia feiner";
    let esEditat = false;
    
    // Mirar edicions manuals (poden ser nivell 3)
    if (edicions && edicions[dataStr] !== undefined) {
      if (typeof edicions[dataStr] === 'object') {
        nivell = edicions[dataStr].nivell;
        motiu = edicions[dataStr].motiu || "Editat manualment";
      } else {
        nivell = edicions[dataStr];
        motiu = "Editat manualment";
      }
      esEditat = true;
    } else {
      // Generar dades dinàmicament per l'any de la data
      const festiusDinamics = generarFestiusDinamics(any);
      const periodesDinamics = generarPeriodesDinamics(any);
      
      // Comprovar períodes nivell 2 (ponts)
      for (const periode of periodesDinamics.nivell2) {
        const [ai, mi, di] = periode.inici.split('-').map(Number);
        const [af, mf, df] = periode.fi.split('-').map(Number);
        const inici = new Date(ai, mi - 1, di);
        const fi = new Date(af, mf - 1, df);
        if (data >= inici && data <= fi) {
          nivell = 2;
          motiu = periode.motiu;
          break;
        }
      }
      
      // Festius (nivell 2)
      if (nivell === 0 && festiusDinamics[dataStr]) {
        nivell = festiusDinamics[dataStr].nivell;
        motiu = festiusDinamics[dataStr].motiu;
      }
      
      // Períodes nivell 1 (vacances)
      if (nivell === 0) {
        for (const periode of periodesDinamics.nivell1) {
          const [ai, mi, di] = periode.inici.split('-').map(Number);
          const [af, mf, df] = periode.fi.split('-').map(Number);
          const inici = new Date(ai, mi - 1, di);
          const fi = new Date(af, mf - 1, df);
          if (data >= inici && data <= fi) {
            nivell = 1;
            motiu = periode.motiu;
            break;
          }
        }
      }
      
      // Cap de setmana
      if (nivell === 0 && (diaSemana === 0 || diaSemana === 6)) {
        nivell = 1;
        motiu = "Cap de setmana";
      }
    }
    
  return { data: dataStr, diaSemana: diesNom[diaSemana], nivell, motiu, esEditat };
  }
  



  // ==================== SMP PONDERAT ====================
  // Aquí també per la mateixa raó que el calendari: és el perill que sol manar
  // a la fórmula, i els dos costats n'han de treure el mateix valor.
  function avaluarZonesSMPPerNivell(infoPerZona) {
    const zonesPerNivell = { 'Groc': [], 'Taronja': [], 'Vermell': [] };
    const detall = [];
    for (const [zona, info] of Object.entries(infoPerZona)) {
      zonesPerNivell[info.nivell].push(zona);
      detall.push({ zona, nivell: info.nivell, meteors: [...info.meteors] });
    }

    const numGroc    = zonesPerNivell['Groc'].length;
    const numTaronja = zonesPerNivell['Taronja'].length;
    const numVermell = zonesPerNivell['Vermell'].length;

    let valor = 0, explicacio = 'Cap alerta';
    if      (numVermell >= 3) { valor = 6; explicacio = `${numVermell} zones vermell (≥3)`; }
    else if (numVermell >  0) { valor = 5; explicacio = `${numVermell} zona vermell (<3)`;  }
    else if (numTaronja >= 3) { valor = 4; explicacio = `${numTaronja} zones taronja (≥3)`; }
    else if (numTaronja >  0) { valor = 3; explicacio = `${numTaronja} zona taronja (<3)`;  }
    else if (numGroc    >= 3) { valor = 2; explicacio = `${numGroc} zones groc (≥3)`;       }
    else if (numGroc    >  0) { valor = 1; explicacio = `${numGroc} zona groc (<3)`;        }

    return { valor, explicacio, zones: { groc: numGroc, taronja: numTaronja, vermell: numVermell }, detall };
  }

  // Valor SMP 0-6 d'un dia a partir dels avisos i dels pesos per zona.
  // `params` és riscParams: { zones: {grup: pes}, zonesGrup: {zonaMeteocat: grup} }.
  function ponderarSMP(avisos, data_str, params) {
  if (!avisos) {
    return { valor: 0, explicacio: 'Sense dades', zones: { groc: 0, taronja: 0, vermell: 0 }, detall: [] };
  }

    const nivellOrdre = { 'Groc': 1, 'Taronja': 2, 'Vermell': 3 };
    const infoPerZona = {}; // zonaGrup → { nivell màxim, meteors Set }
    // Avisos que hi són però que no compten perquè la seva zona no està
    // activada a Configuració → Alertes SMP. Sense això, un dia amb avisos
    // pertot arreu podia donar 0 sense cap explicació enlloc.
    const descartades = new Set();   // zona coneguda, però apagada per l'usuari
    const desconegudes = new Set();  // zona que el mapatge no coneix: forat nostre

    for (const avis of avisos) {
      const meteor = avis.meteor || '';
      for (const dia of (avis.dies || [])) {
        if (dia.dia !== data_str) continue;
        for (const afectacio of (dia.afectacions || [])) {
          const zonaOriginal = afectacio.zona || '';
          const nivell = afectacio.nivell || '';
          const zonaGrup = params.zonesGrup[zonaOriginal] || zonaOriginal;
          if (!((params.zones[zonaGrup] ?? -1) > 0)) {
            if (nivellOrdre[nivell]) {
              if (zonaGrup in params.zones) descartades.add(zonaGrup);
              else desconegudes.add(zonaOriginal);
            }
            continue;
          }
          if (!nivellOrdre[nivell]) continue;

          if (!infoPerZona[zonaGrup]) {
            infoPerZona[zonaGrup] = { nivell, meteors: new Set([meteor]) };
          } else {
            if (nivellOrdre[nivell] > nivellOrdre[infoPerZona[zonaGrup].nivell]) {
              infoPerZona[zonaGrup].nivell = nivell;
            }
            infoPerZona[zonaGrup].meteors.add(meteor);
          }
        }
      }
    }

    return { ...avaluarZonesSMPPerNivell(infoPerZona), descartades: [...descartades], desconegudes: [...desconegudes] };
  }


  const api = {
    RISC_SOSTRE, RISC_PERILL_MAX, RISC_FORMULA_DEFAULT, RISC_FORMULA_VERSIO,
    detallarRisc, calcularRisc,
    afluenciaDelCalendari, formatDateStr, calcularSetmanaSanta,
    ponderarSMP, avaluarZonesSMPPerNivell
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node
  else arrel.FormulaRisc = api;                                               // navegador
})(typeof globalThis !== 'undefined' ? globalThis : this);
