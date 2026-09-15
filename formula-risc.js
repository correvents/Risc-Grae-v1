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

  const api = {
    RISC_SOSTRE, RISC_PERILL_MAX, RISC_FORMULA_DEFAULT, RISC_FORMULA_VERSIO,
    detallarRisc, calcularRisc
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node
  else arrel.FormulaRisc = api;                                               // navegador
})(typeof globalThis !== 'undefined' ? globalThis : this);
