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



  // ==================== OPERATIVITAT DELS HELICÒPTERS ====================
  // El criteri de vol (finestra mínima, ratxa, visibilitat, només de dia) i el
  // recompte de províncies cobertes. Aquí hi ha el que es pot compartir: la
  // baixada de dades i la cau les fa cadascú (el navegador amb timeout, el
  // backend amb fetch pelat), però **què vol dir "pot volar" és una sola cosa**.

  const OP_DEFAULT = { ratxaMax: 50, visMin: 2000, horesMin: 3, nomesDia: true };

  function urlMeteoVol(lat, lon) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&hourly=visibility,wind_gusts_10m,is_day&forecast_days=3&timezone=Europe%2FMadrid&wind_speed_unit=kmh';
  }

  // Llista d'hores → trams llegibles: [10,11,12,15] → "de 10 a 13 h i de 15 a 16 h"
  function tramsHores(hores) {
    if (!hores.length) return '';
    const trams = [];
    let ini = hores[0], prev = hores[0];
    for (let i = 1; i < hores.length; i++) {
      if (hores[i] === prev + 1) { prev = hores[i]; continue; }
      trams.push([ini, prev]); ini = prev = hores[i];
    }
    trams.push([ini, prev]);
    return trams.map(([a, b]) => `de ${a} a ${b + 1} h`).join(' i ');
  }


  // Diu si es pot volar i, si no, **què falla i quan**: "visibilitat de fins a
  // 800 m de 10 a 14 h" és el que permet decidir; "no vola (meteo)" no.
  // `H` és l'objecte `hourly` d'Open-Meteo tal com ve.
  function avaluarFinestraVol(H, dataStr, conf) {
    const opConfig = conf || OP_DEFAULT;
    if (!H || !H.time) return { ok: true, motiu: '', maxSeguides: 0 };   // sense dades → no es penalitza
    // Es busca la finestra més llarga d'hores seguides dins de límits. Si el
    // GRAE no vola de nit, les hores sense llum no compten i, a més, trenquen
    // la ratxa: una finestra no pot travessar la nit.
    let seguides = 0, maxSeguides = 0;
    // Es guarda també *què* falla i *quan*, per poder dir-ho a la pestanya:
    // "no vola (meteo)" no serveix per decidir res.
    const horesVis = [], horesVent = [];
    let pitjorVis = Infinity, pitjorRatxa = 0;
    for (let hh = 0; hh <= 23; hh++) {
      const idx = H.time.indexOf(dataStr + 'T' + String(hh).padStart(2, '0') + ':00');
      if (idx < 0) continue;
      if (opConfig.nomesDia && H.is_day && H.is_day[idx] === 0) { seguides = 0; continue; }
      const ratxa = H.wind_gusts_10m[idx];
      const vis = H.visibility[idx];
      if (vis != null && vis < opConfig.visMin) { horesVis.push(hh); pitjorVis = Math.min(pitjorVis, vis); }
      if (ratxa != null && ratxa > opConfig.ratxaMax) { horesVent.push(hh); pitjorRatxa = Math.max(pitjorRatxa, ratxa); }
      const bo = (ratxa != null && ratxa <= opConfig.ratxaMax) && (vis != null && vis >= opConfig.visMin);
      if (bo) { seguides++; maxSeguides = Math.max(maxSeguides, seguides); }
      else seguides = 0;
    }
    const ok = maxSeguides >= opConfig.horesMin;
    const parts = [];
    if (horesVis.length) parts.push(`visibilitat de fins a ${Math.round(pitjorVis)} m ${tramsHores(horesVis)}`);
    if (horesVent.length) parts.push(`ratxes de fins a ${Math.round(pitjorRatxa)} km/h ${tramsHores(horesVent)}`);
    // Cap hora dolenta i tot i així no vola: la finestra la trenca la nit
    if (!parts.length && !ok) parts.push(`cap tram de ${opConfig.horesMin} h seguides${opConfig.nomesDia ? ' amb llum de dia' : ''} (el més llarg, ${maxSeguides} h)`);

    return { ok, motiu: ok ? '' : parts.join(' · '), maxSeguides };
  }

  function provinciaDeBase(base) {
    if (!base) return null;
    const b = base.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Girona
    const girona = ["girona","figueres","olot","ripoll","vic","manlleu","banyoles","blanes","lloret","santa coloma de farners","la bisbal","palafrugell","palamos","roses","escala","la jonquera","puigcerda","cerdanya","camprodon","sant feliu"];
    if (girona.some(x => b.includes(x))) return "Girona";
    // Tarragona
    const tarragona = ["tarragona","reus","tortosa","valls","el vendrell","amposta","ametlla","calafell","cambrils","salou","mont-roig","gandesa","mora","deltebre","rapita","ebre"];
    if (tarragona.some(x => b.includes(x))) return "Tarragona";
    // Lleida
    const lleida = ["lleida","balaguer","cervera","igualada","solsona","tremp","sort","vielha","seu d urgell","la seu","ponts","mollerussa","tarrega","artesa","pobla de segur","pont de suert"];
    if (lleida.some(x => b.includes(x))) return "Lleida";
    // Barcelona
    const barcelona = ["barcelona","sabadell","terrassa","badalona","hospitalet","mataro","granollers","mollet","montcada","rubi","sant cugat","vilafranca","vilanova","berga","cardona","torello","puig-reig","navarcles","manresa","sant joan","martorell","abrera","esparreguera"];
    if (barcelona.some(x => b.includes(x))) return "Barcelona";
    return null; // no identificat
  }

  function provinciaDeCoords(lat, lon) {
    // Fallback per coordenades quan no es pot determinar per nom
    if (lat >= 41.7 && lon >= 2.3) return 'Girona';
    if (lat < 41.35) return 'Tarragona';
    if (lat < 41.5 && lon >= 0.8 && lon < 2.3) return 'Tarragona';
    if (lon < 1.3) return 'Lleida';
    if (lon < 1.85 && lat >= 41.5) return 'Lleida';
    return 'Barcelona';
  }


  // "HC GRAE operatius" creua els tres paràmetres alhora: estat de plena
  // operativitat, condicions de vol des de la base i distribució pel territori.
  // Es compten **províncies cobertes**, no aparells: dos helis a la mateixa
  // província no cobreixen el doble de territori.
  function resumirOperativitat(detall) {
    const provCobertes = new Set(detall.filter(d => d.operatiu && d.prov).map(d => d.prov));
    const senseProv = detall.filter(d => d.operatiu && !d.prov).length;
    return {
      count: provCobertes.size + senseProv,
      aparells: detall.filter(d => d.operatiu).length,
      provincies: [...provCobertes],
      total: detall.length,
      detall
    };
  }


  // ==================== SMP BOMBERS (per comarca i regió) ====================
  // Càlcul independent del risc del GRAE: el grau de perill de Meteocat per
  // comarca i franja de 6 h, agregat a regió d'emergència. Viu aquí perquè les
  // captures del risc l'han de desar, i ha de ser el mateix número que es veu a
  // la pestanya SMP Bombers.
  const REGIONS_BOMBERS = {
    'Metropolitana Nord': [21, 40, 41],
    'Metropolitana Sud':  [13, 11, 3, 17, 6],
    'Girona':             [2, 10, 20, 28, 34, 19, 31],
    'Centre':             [7, 24, 14, 35, 42, 43, 15],
    'Lleida':             [33, 23, 38, 27, 18, 32],
    'Pirineus':           [5, 26, 25, 4],
    'Tarragona':          [36, 8, 1, 12, 16, 29],
    "Terres de l'Ebre":   [9, 22, 30, 37]
  };

  // Territori que no cobreixen els Bombers de la Generalitat i que, per tant,
  // no ha de comptar al risc de cap regió. Es pinta en gris al mapa, amb el
  // seu perímetre propi i el valor de l'SMP al tooltip: la meteorologia hi és
  // igualment, el que no hi és som nosaltres.
  //
  //   · Aran (39): el decret la posa a la regió Pirineus, però l'Aran manté
  //     el seu propi cos de bombers (vegeu REGIONS-EMERGENCIA.md).
  //
  // La ciutat de Barcelona també va a part (bombers municipals), però no és
  // una comarca: el Barcelonès continua comptant per la Metropolitana Sud,
  // perquè l'Hospitalet i la resta sí que són nostres, i al mapa se'n marca
  // només el terme municipal (CONTORN_BARCELONA).
  const PERIODES_SMP = ['00-06', '06-12', '12-18', '18-00'];

  const comarcaARegio = {};
  Object.entries(REGIONS_BOMBERS).forEach(([regio, codis]) => {
    codis.forEach(c => comarcaARegio[c] = regio);
  });

  // Meteocat ja publica un grau de perill de 0 a 6 per comarca i franja de 6 h
  // (el color n'és només l'agrupació). Ve al camp `perill` de cada afectació i
  // `fetch-smp.js` el desa cru com a `grauPerill`: es fa servir tal com ve.
  //
  // L'escala de reserva de sota només actua amb dades antigues, anteriors al
  // canvi de `fetch-smp.js`, que encara no porten `grauPerill`.
  const RISC_BASE_NIVELL = { 'Groc': 1, 'Taronja': 3, 'Vermell': 5 };
  const PROB_ALTA = ['Molt probable', 'Segur'];

  function riscDeAfectacio(af) {
    if (Number.isFinite(af.grauPerill)) return Math.max(0, Math.min(6, af.grauPerill));
    const base = RISC_BASE_NIVELL[af.nivell];
    if (!base) return 0;
    return base + (PROB_ALTA.includes(af.probabilitat) ? 1 : 0);
  }

  // L'SMP també avisa per zones marítimes, que no són comarques. Cada zona
  // s'adjunta a la comarca costanera que té al davant: si hi ha risc a la zona
  // marítima, la comarca se'l queda (es pren el valor més alt dels dos).
  //
  // ⚠️ Els codis 88-99 són els que ja hi havia al projecte, però no s'han pogut
  // verificar: no hem vist mai una alerta marítima passar per aquí. Ara
  // `fetch-smp.js` registra al log del workflow qualsevol codi desconegut amb
  // tots els seus camps, així que la primera alerta d'onatge ens dirà si la
  // llista és aquesta i en quin ordre.
  const MARITIMES_A_COMARCA = {
    88: 2,   // Alt Empordà
    89: 10,  // Baix Empordà
    90: 34,  // Selva
    91: 21,  // Maresme
    92: 13,  // Barcelonès
    93: 11,  // Baix Llobregat
    94: 17,  // Garraf
    95: 12,  // Baix Penedès
    96: 36,  // Tarragonès
    97: 8,   // Baix Camp
    98: 9,   // Baix Ebre
    99: 22   // Montsià
  };

  // Risc d'un conjunt (comarques d'una regió, o regions de Catalunya): el valor
  // més alt que assoleix la meitat + 1 de les unitats. Els valors s'engloben,
  // és a dir que una unitat amb un 4 també compta per al 3 i per al 2.
  // Exemple del cap del GRAE: 8 regions amb 3,3,3,2,2,2,4,4 → llindar 5;
  // n'hi ha 5 amb ≥3 i només 2 amb ≥4, o sigui que el total és 3.
  function agregarRisc(valors) {
    if (!valors.length) return 0;
    const llindar = Math.floor(valors.length / 2) + 1;
    for (let v = 6; v >= 1; v--) {
      if (valors.filter(x => x >= v).length >= llindar) return v;
    }
    return 0;
  }

  // comarca → dia → període → { valor, riscos: [{meteor, nivell, probabilitat, llindar}] }
  function matriuRiscComarques(data, nomComarca) {
    const matriu = {};
    for (const avis of (data?.avisos || [])) {
      const meteor = avis.meteor || '';
      for (const dia of (avis.dies || [])) {
        for (const af of (dia.afectacions || [])) {
          // Una zona marítima es compta com la comarca costanera que té al davant
          const codi = MARITIMES_A_COMARCA[af.comarca] || af.comarca;
          if (!codi || !comarcaARegio[codi]) continue;  // dades antigues sense comarca
          const valor = riscDeAfectacio(af);
          if (!valor) continue;
          if (!matriu[codi]) matriu[codi] = { nom: (nomComarca ? nomComarca(codi) : null) || af.comarcaNom || ('Comarca ' + codi), dies: {} };
          if (!matriu[codi].dies[dia.dia]) matriu[codi].dies[dia.dia] = {};
          for (const p of (af.periodes || [])) {
            const cel = matriu[codi].dies[dia.dia][p] || { valor: 0, riscos: [] };
            if (valor > cel.valor) cel.valor = valor;
            cel.riscos.push({ meteor, nivell: af.nivell, probabilitat: af.probabilitat, llindar: af.llindar });
            matriu[codi].dies[dia.dia][p] = cel;
          }
        }
      }
    }
    return matriu;
  }

  // Valor d'una comarca en un dia i franja (0 si no hi ha avís).
  const riscComarca = (matriu, codi, dia, periode) =>
    matriu[codi]?.dies?.[dia]?.[periode]?.valor || 0;

  function valorsRegio(matriu, regio, dia, periode) {
    return REGIONS_BOMBERS[regio].map(c => riscComarca(matriu, c, dia, periode));
  }


  // Valor de cada regió per dia i franja, que és el que es desa a les captures.
  // `dies` són les dates que interessen (avui i demà).
  function resumSMPBombers(avisos, dies, nomComarca) {
    const matriu = matriuRiscComarques({ avisos }, nomComarca);
    const resum = {};
    for (const dia of dies) {
      resum[dia] = {};
      for (const regio of Object.keys(REGIONS_BOMBERS)) {
        const perFranja = {};
        for (const p of PERIODES_SMP) perFranja[p] = agregarRisc(valorsRegio(matriu, regio, dia, p));
        perFranja.dia = Math.max(...PERIODES_SMP.map(p => perFranja[p]));
        resum[dia][regio] = perFranja;
      }
    }
    return { regions: resum, comarques: matriu };
  }


  // ==================== ELS FACTORS D'UN DIA ====================
  // Els factors d'un dia a partir de les dades tal com arriben (els JSON) i de
  // la configuració. Pur: qui crida decideix què hi ha carregat i què diu la
  // config, i per això el backend en treu exactament els mateixos valors.
  //   dades  = { smp, bpa, canvi, planspc }
  //   config = { riscParams, allausDesactivat, boletairesActiu, smpPrecalculat }
  function factorsDelDia(data, dades, config) {
  const conf = config || {};
  dades = dades || {};
    const resultat = {
      smp: 0,
      smpDetall: [],
      allaus: 0,
      hc: 0,
      canvi: 0,
      // Mentre hi ha temporada de bolets (Configuració → Boletaires), el factor
      // val 1 per a tots els dies automàtics. Abans no el posava ningú: la
      // casella de la fórmula només diu si compta, i el valor es quedava a 0.
      boletaires: conf.boletairesActiu ? 1 : 0,
      notes: []
    };
    
    // 1. ALERTES SMP - rang 0-6
    const smpCalc = conf.smpPrecalculat || ponderarSMP(dades.smp && dades.smp.avisos, data, conf.riscParams || {});
    resultat.smp = smpCalc.valor;
    resultat.smpDetall = smpCalc.detall;
    if (smpCalc.valor > 0) {
      resultat.notes.push(`SMP: ${smpCalc.explicacio}`);
    }
    
    // 2. RISC ALLAUS (BPA) - valor màxim del dia directe (1-5)
    // Fora de temporada es deixa a 0: vegeu l'interruptor d'allaus.
    //
    // **Compte amb el 0.** Aquí hi havia `perill_maxim_numeric || 1`, i fora de
    // temporada l'ICGC no publica butlletí: el resum arriba amb
    // `perill_maxim: "Desconegut"` i `perill_maxim_numeric: 0`, i aquell `|| 1`
    // ho convertia en un 1. La pantalla i les captures ensenyaven «1/5» com si
    // hi hagués perill feble **mesurat**, quan el que passa és que no hi ha
    // butlletí. És la trampa 12 al revés: un factor sense dades no pot semblar
    // un factor a 1, igual que no pot semblar un factor a 0.
    //
    // El número del risc no en canvia: a l'escala de perill, tant el 0 com l'1
    // valen 0 punts (`allaus.punts` va {1:0, 2:0, 3:2, 4:4, 5:5}). El que
    // canvia és que el que es veu és el que hi ha.
    if (!conf.allausDesactivat && dades.bpa && dades.bpa.resum) {
      const perillMax = Number(dades.bpa.resum.perill_maxim_numeric) || 0;
      resultat.allaus = perillMax;
      if (perillMax >= 3) {
        resultat.notes.push(`BPA: perill ${perillMax}/5`);
        const zonesMax = (dades.bpa.zones || []).filter(z => z.perill_numeric === perillMax);
        resultat.allausDetall = {
          zones: [...new Set(zonesMax.map(z => z.nom).filter(Boolean))],
          situacions: [...new Set(zonesMax.map(z => z.situacio_primaria).filter(Boolean))]
        };
      }
    }
    
    // 3. DIFICULTAT VOL HC - rang 0-2
    // 0=vola, 1=limitació, 2=no vola
    if (dades.smp && dades.smp.avisos) {
      dades.smp.avisos.forEach(avis => {
        avis.dies?.forEach(dia => {
          if (dia.dia === data) {
            const meteor = avis.meteor?.toLowerCase() || '';
            const esRellevant = meteor.includes('vent') || meteor.includes('neu') || meteor.includes('pluja');
            if (!esRellevant) return;
            dia.afectacions?.forEach(af => {
              const nivell = af.nivell;
              if ((meteor.includes('vent') || meteor.includes('neu')) && nivell === 'Vermell') {
                resultat.hc = Math.max(resultat.hc, 2);
              } else if (nivell === 'Taronja') {
                resultat.hc = Math.max(resultat.hc, 1);
              } else if ((meteor.includes('vent') || meteor.includes('neu')) && nivell === 'Groc') {
                resultat.hc = Math.max(resultat.hc, 1);
              }
            });
          }
        });
      });
      if (resultat.hc > 0) {
        resultat.notes.push(`HC: dificultat ${resultat.hc}/2`);
      }
    }
    
    // 4. CANVI DE TEMPS - rang 0-2
    if (dades.canvi && dades.canvi.resultats) {
      const avui = dades.canvi.data;
      const clauDia = avui === data ? 'avui' : (data > avui ? 'dema' : null);
      if (clauDia) {
        const entrades = Object.values(dades.canvi.resultats);
        const maxNivell = entrades
          .map(r => r[clauDia]?.nivell || 0)
          .reduce((a, b) => Math.max(a, b), 0);
        resultat.canvi = maxNivell;
        if (maxNivell > 0) {
          resultat.notes.push(`Canvi temps: nivell ${maxNivell}/2`);
          const puntsMax = entrades.filter(r => (r[clauDia]?.nivell || 0) === maxNivell);
          resultat.canviDetall = {
            punts: [...new Set(puntsMax.map(r => r.punt?.nom).filter(Boolean))],
            factors: [...new Set(puntsMax.flatMap(r => r[clauDia]?.factors || []))]
          };
        }
      }
    }

    // 5. PLANS PC - rang 0-3 (0=cap, 1=prealerta, 2=alerta, 3=emergència)
    if (dades.planspc && dades.planspc.plans) {
      const ordre = { 'EMERGÈNCIA': 3, 'ALERTA': 2, 'PREALERTA': 1 };
      let maxPla = 0;
      dades.planspc.plans.forEach(p => {
        const val = ordre[(p.plafase || '').toUpperCase()] || 0;
        if (val > maxPla) maxPla = val;
      });
      resultat.planspc = maxPla;
      if (maxPla > 0) {
        const labels = { 1: 'Prealerta', 2: 'Alerta', 3: 'Emergència' };
        resultat.notes.push(`Plans PC: ${labels[maxPla]}`);
      }
    }
    
    return resultat;
  }
  


  // ==================== PARÀMETRES DE L'SMP (zones i pesos) ====================
  // Els pesos per zona i el mapatge de zona Meteocat → grup. El backend els ha
  // de llegir igual que el navegador: una zona que no hi consti desapareix del
  // càlcul sense dir res (hi va estar l'Empordà, amb 941 avisos que no van
  // comptar mai).
  const RISC_PARAMS_DEFAULT = {
    zones: {
      'Pirineu Occidental': 1,
      'Pirineu Oriental': 1,
      'Costa Brava': 1,
      'Litoral Central': 1,
      'Plana de Lleida': 1,
      'Camp de Tarragona': 1,
      "Terres de l'Ebre": 1,
      'Zona Marítima': 1,
    },
    // Mapeig de zona original a grup (per agrupar alertes)
    zonesGrup: {
      'Pirineu Occidental': 'Pirineu Occidental',
      'Pirineu Central': 'Pirineu Occidental',
      'Pirineu Oriental': 'Pirineu Oriental',
      'Prepirineu': 'Pirineu Oriental',
      'Costa Brava': 'Costa Brava',
      'Litoral Nord': 'Costa Brava',
      'Empordà': 'Costa Brava',
      "Gironès i Pla de l'Estany": 'Costa Brava',
      'Litoral Central': 'Litoral Central',
      'Vallès': 'Litoral Central',
      'Penedès': 'Litoral Central',
      'Plana de Lleida': 'Plana de Lleida',
      'Catalunya Central': 'Plana de Lleida',
      'Camp de Tarragona': 'Camp de Tarragona',
      'Serres de Prades i Montsant': 'Camp de Tarragona',
      "Terres de l'Ebre": "Terres de l'Ebre",
      'Comarca 88': 'Zona Marítima',
      'Comarca 89': 'Zona Marítima',
      'Comarca 90': 'Zona Marítima',
      'Comarca 91': 'Zona Marítima',
      'Comarca 92': 'Zona Marítima',
      'Comarca 93': 'Zona Marítima',
      'Comarca 94': 'Zona Marítima',
      'Comarca 95': 'Zona Marítima',
      'Comarca 96': 'Zona Marítima',
      'Comarca 97': 'Zona Marítima',
      'Comarca 98': 'Zona Marítima',
      'Comarca 99': 'Zona Marítima',
    },
    periodes: {
      '00-06': 0.3,
      '06-12': 0.8,
      '12-18': 1.0,
      '18-24': 0.6,
    },
    nivells: {
      'Groc': 1,
      'Taronja': 2,
      'Vermell': 3,
    },
    normalitzador: 1,  // Dividir punts totals per aquest valor per obtenir 0-6
    maxSMP: 6,         // Valor màxim SMP
  };

  function rowToRiscParams(row, base) {
    // Una columna que no existeixi a la taula, o que hi sigui nul·la, no ha de
    // desactivar res: es queda el valor de base. Sense això, una zona sense
    // columna (o una columna nova encara buida) sortia NaN i el filtre
    // `zones[z] > 0` la donava per apagada sense que ningú l'hagués tocat.
    const val = (v, defecte) => (v == null || isNaN(+v)) ? defecte : +v;
    return {
      ...base,
      zones: {
        ...base.zones,
        'Pirineu Occidental': val(row.pes_pirineu_occidental, base.zones['Pirineu Occidental']),
        'Pirineu Oriental':   val(row.pes_pirineu_oriental,   base.zones['Pirineu Oriental']),
        'Costa Brava':        val(row.pes_emporda,            base.zones['Costa Brava']),
        'Litoral Central':    val(row.pes_litoral_central,    base.zones['Litoral Central']),
        'Plana de Lleida':    val(row.pes_plana_lleida,       base.zones['Plana de Lleida']),
        'Camp de Tarragona':  val(row.pes_camp_tarragona,     base.zones['Camp de Tarragona']),
        "Terres de l'Ebre":   val(row.pes_terres_ebre,        base.zones["Terres de l'Ebre"]),
        'Zona Marítima':      val(row.pes_zona_maritima,      base.zones['Zona Marítima']),
      },
      periodes: {
        ...base.periodes,
        '00-06': val(row.pes_periode_00_06, base.periodes['00-06']),
        '06-12': val(row.pes_periode_06_12, base.periodes['06-12']),
        '12-18': val(row.pes_periode_12_18, base.periodes['12-18']),
        '18-24': val(row.pes_periode_18_24, base.periodes['18-24']),
      },
      nivells: {
        ...base.nivells,
        'Groc':    val(row.pes_nivell_groc,    base.nivells['Groc']),
        'Taronja': val(row.pes_nivell_taronja, base.nivells['Taronja']),
        'Vermell': val(row.pes_nivell_vermell, base.nivells['Vermell']),
      },
      normalitzador: val(row.normalitzador, base.normalitzador),
      maxSMP:        val(row.max_smp,       base.maxSMP),
    };
  }


  const api = {
    RISC_SOSTRE, RISC_PERILL_MAX, RISC_FORMULA_DEFAULT, RISC_FORMULA_VERSIO,
    detallarRisc, calcularRisc,
    afluenciaDelCalendari, formatDateStr, calcularSetmanaSanta,
    ponderarSMP, avaluarZonesSMPPerNivell,
    OP_DEFAULT, urlMeteoVol, tramsHores, avaluarFinestraVol,
    provinciaDeBase, provinciaDeCoords, resumirOperativitat,
    REGIONS_BOMBERS, PERIODES_SMP, comarcaARegio, MARITIMES_A_COMARCA,
    riscDeAfectacio, agregarRisc,
    matriuRiscComarques, riscComarca, valorsRegio, resumSMPBombers,
    factorsDelDia, RISC_PARAMS_DEFAULT, rowToRiscParams
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node
  else arrel.FormulaRisc = api;                                               // navegador
})(typeof globalThis !== 'undefined' ? globalThis : this);
