# Diari del projecte

Registre cronològic de què s'ha fet i per què. **El més recent, a dalt.**

Com que cada sessió de Claude Code arrenca sense memòria, aquest fitxer és el que permet reprendre la feina on es va deixar. En acabar una sessió, afegeix-hi una entrada.

Format d'una entrada: data, què s'ha fet, per què, i què queda pendent.

---

## 2026-08-08 — El 0-6 el dona Meteocat, i les zones marítimes van a la seva comarca

Dues correccions sobre la pestanya SMP Bombers acabada de fer.

**El grau de perill no cal calcular-lo.** Meteocat ja publica un **grau de perill de 0 a 6** per comarca i franja de 6 h, que surt de creuar el llindar del fenomen amb la probabilitat. El color de l'avís només n'és l'agrupació. Ve al camp `perill` de cada afectació, que `fetch-smp.js` ara desa cru com a `grauPerill`, i el risc de Bombers el fa servir tal com ve. L'escala inventada ahir (color + probabilitat) queda només com a reserva per a dades antigues i desapareixerà sola.

**El camp `perill` estava mal etiquetat.** El projecte el mostrava com una probabilitat (*Poc probable*…*Segur*) a la pestanya Alertes. Dues coses diuen que no ho és: Meteocat documenta **tres** bandes de probabilitat (10-30 %, 30-70 %, >70 %) i el codi en té quatre; i a les dades reals el llindar alt sempre surt com a "Segur" i el baix mai, que és just l'inrevés del que hauria de passar amb una probabilitat. Les etiquetes de la pestanya Alertes queden pendents de revisar — aquesta sessió no les toca.

**Zones marítimes.** Cada zona s'adjunta ara a la comarca costanera que té al davant, i la comarca es queda el valor més alt dels dos. Els codis 88-99 són els que ja hi havia al projecte i **no estan verificats**: no hem vist mai una alerta marítima passar-hi. Per això `fetch-smp.js` registra al log del workflow qualsevol codi de comarca desconegut amb tots els seus camps; la primera alerta d'onatge ens dirà si la llista és correcta.

Comprovat amb Playwright: el `grauPerill` cru mana per sobre de l'escala de reserva, i una alerta a la zona marítima 91 acaba comptant com a Maresme amb el valor correcte.

## 2026-08-08 — Pestanya SMP Bombers: risc per regions d'emergència

El cap del GRAE vol un risc SMP **de Bombers**, separat del risc del GRAE, perquè cada cap de regió pugui veure el risc del seu territori. Nova pestanya **SMP Bombers**, amb taula per franges horàries (avui i demà) i mapa pintat.

**Decisions preses:** la Cerdanya va al **Centre** (el decret la posa a Pirineus, però operativament depèn de la sala de Manresa). El Barcelonès i l'Anoia, que estan partits entre regions per municipis, s'assignen sencers a la Metropolitana Sud, perquè l'SMP arriba per comarca i no s'hi pot baixar més.

**La regla d'agregació.** El risc d'una regió és el valor més alt que assoleix la meitat + 1 de les seves comarques, amb els valors englobats: una comarca amb un 4 també compta per al 3. El risc de Catalunya és el mateix càlcul sobre les 8 regions. Amb l'exemple del cap (3,3,3,2,2,2,4,4 → 3) surt el que ell esperava.

**Canvi obligatori al backend.** `fetch-smp.js` col·lapsava `idComarca` en una zona Meteocat abans de desar i la comarca es perdia. Ara les afectacions de `smp_latest.json` van per comarca; les files cap a `smp_historic` es tornen a agrupar per zona (`agruparPerZona`), o sigui que **la taula de Supabase no canvia**.

**El que el cap no va especificar** és com es converteix un avís en un 0-6 per comarca. S'ha fet: nivell (Groc 1 / Taronja 3 / Vermell 5) + 1 punt si la probabilitat és *Molt probable* o *Segur*. Està aïllat a `RISC_BASE_NIVELL` i `PROB_ALTA` per si es vol canviar.

**Mapa:** SVG pla generat des del GeoJSON de comarques, sense Leaflet (index.html no té dependències), amb vista per regions i per comarques. El GeoJSON només es baixa en obrir la pestanya.

Comprovat amb Playwright sobre l'app servida en local: la regla d'agregació dona els valors esperats en sis casos (inclòs el del cap), les 43 comarques hi són sense duplicats, el mapa es dibuixa i no hi ha errors de JS.

**Pendent:** la pestanya no té dades fins que el workflow no torni a generar `smp_latest.json` amb el format nou; mentrestant surt un avís explicant-ho. Els objectius següents (subregions del GRAE, gra de municipi, zones marítimes, històric) són a `REGIONS-EMERGENCIA.md`.

## 2026-08-08 — SMP per regions d'emergència: recerca prèvia

El cap del GRAE vol que la pestanya SMP deixi d'agrupar per zones geogràfiques de muntanya i passi a agrupar per **regions d'emergència** de Bombers, partint-ne algunes en dues.

Aquesta sessió és **només recerca**: no s'ha tocat cap càlcul ni cap fitxer de codi. El resultat és `REGIONS-EMERGENCIA.md`, amb la taula regió → comarques de les 8 regions, els casos partits i les decisions pendents.

**El que s'ha trobat:**

- Les regions eren **7**; el febrer de 2026 el Govern va crear la **Regió d'Emergències Pirineus** (seu a Sort), segregada de la de Lleida. Ja no cal inventar-se la partició de Lleida: existeix, i amb nom oficial.
- Els `idComarca` de l'API SMP de Meteocat **són els `CODICOMAR` oficials** (comprovat contra `fetch-smp.js` i el GeoJSON de comarques). El mapatge comarca → regió és directe.
- Dues comarques estan partides entre regions per municipis: **Anoia** (Alta Anoia al Centre, la resta a Metropolitana Sud) i **Barcelonès** (Badalona, Sant Adrià i Santa Coloma a la Nord). Com que l'SMP arriba per comarca, s'hauran d'assignar senceres.
- La **Cerdanya** és el punt discutit: el decret la posa a Pirineus, però operativament depèn de la sala de Manresa (Centre).

**Trampa detectada:** `fetch-smp.js` col·lapsa `idComarca` → zona Meteocat *abans* de desar, i llavors la comarca es perd. Per anar per regions, aquest script s'ha de tocar primer; si no, la dada de comarca no existeix enlloc.

**Pendent:** decidir la Cerdanya, quines regions es tornen a partir per al GRAE, i què es fa amb l'històric de `smp_historic` (columna `zona` amb la nomenclatura antiga).
## 2026-08-08 — La fórmula, replantejada: és un índex de saturació

Repassant els pesos va sortir el que de debò s'ha de mesurar: **no és quant perill hi ha a la muntanya, sinó la probabilitat que els GRAE quedin desbordats** — si podran atendre tots els serveis que vagin sortint. Serveix per preveure el dia i per consultar què va passar.

Això va tombar el plantejament anterior. Un intent de model "demanda × dificultat × capacitat" també es va descartar: tractava les allaus com a dificultat per servei, i **un perill d'allaus 5 satura per si sol** encara que només hi hagi una allau, perquè pot afectar molta gent alhora.

**Regla acordada per al bloc de perill:**

- Allaus segons el BPA: 1→0, 2→0, 3→2, 4→4, 5→5.
- Es pren **el més gran** entre SMP i allaus, no la suma, per no comptar dues vegades el mateix.
- Si tots dos hi són, el segon hi afegeix un **suplement**: val 1–2 → +1; val 3 o més → +2.
- El perill es limita a **5** (`RISC_PERILL_MAX`) perquè sempre quedi un punt de marge: el darrer graó fins a 6 el mouen l'afluència, els helicòpters, el canvi de temps i els boletaires.

**Pendent immediat:** els valors de l'SMP (ara 0–6) no s'han tocat encara — es revisaran junt amb la pestanya SMP i el seu càlcul, en una sessió a part. Mentrestant, com que el perill es topa a 5, un SMP de 5 i un de 6 donen el mateix.

**Pendent de calibrar:** els increments poden sumar fins a +3,5, i hi ha casos (bolets + taronja + dos helis de baixa + canvi fort) que se'n van a 5,5 sense cap perill greu.

## 2026-08-08 — Fórmula de risc repensada: factor dominant + increments

Atacant el pendent d'unificar les dues fórmules, es va decidir no adoptar cap de les dues sinó repensar-la. **Aquest canvi és només al frontend; el script nocturn encara calcula amb l'antiga.**

**Què fallava a la fórmula del 22-07:** sumava rangs incomparables i la suma podia arribar a 16, però colors, barra i etiquetes estan calibrats a 0–6. Resultat: de 5 en amunt tot es veia igual, i casos molt diferents donaven el mateix número. El més greu: **perill d'allaus 5 tot sol donava 3 (MODERAT)**.

**Model nou:** `risc = min(6, base + increments)`

- **Base** = el més greu dels factors de perill: SMP (ja ve 0–6) o allaus (1→0, 2→1, 3→3, 4→4, **5→6**). Es pren el màxim, així un perill extrem no queda diluït.
- **Increments**: operativitat HC (cap heli +1, un heli +0,5), afluència (+0,25 / +0,5 / +1), canvi de temps (+0,5 / +1) i boletaires (+1).
- **Plans PC** queda informatiu: una fase activada ja es reflecteix als avisos SMP.
- El factor antic `hc` desapareix del càlcul; el substitueix l'operativitat.

Tot continua sent editable des de Configuració → Fórmula de risc, i al desglossament el factor que marca la base surt etiquetat com a **BASE**.

**Comprovat** amb Playwright sobre set escenaris: allaus 5 passa de 3 a 6; groc en una zona amb cap de setmana d'agost dona 1,5; vermell a tres zones amb allaus 4 i cap heli topa a 6.

**Pendent de calibrar:** els increments poden sumar fins a +4, així que un dia sense cap perill però amb tot en contra arriba a 4 (ALT) amb base 0. Cal decidir si es limita el total d'increments.

## 2026-08-08 — Web de proves separat de l'operatiu

Començat el 02-08 (`2d54f79`, `69774db`, `1fa4b81`) i acabat el 08-08 (`a7778b3` fins a `202e303`).

Fins ara l'única manera de veure un canvi era fusionar-lo a `main`, és a dir, publicar-lo directament al web operatiu.

**Resultat:** el banc de proves és la carpeta `proves/` de `main`, que `sincronitzar-proves.yml` copia des de la branca `proves` a cada push. Les dues webs funcionen: l'operativa a l'arrel i la de proves a `/proves/`.

La còpia de proves es distingeix sola (`marcarWebDeProves()`): **fons verd**, franja verda a dalt i `🧪 PROVES` al títol de la pestanya.

**Norma de treball a partir d'ara:** tot canvi va primer a `proves`, es mira funcionant a `/proves/` i només després es porta a `main`.

**Compte:** els dos webs comparteixen dades. `data/*.json` i Supabase són els mateixos, així que provar-hi coses que escriguin a Supabase toca les taules de veritat.

**Dues ensopegades pel camí:**

1. El desplegament des de `proves` fallava en 2 segons: l'entorn `github-pages` només accepta la branca per defecte. Es va resoldre fent que `proves` demanés la publicació a `main`.
2. Amb tot verd, `/proves/` continuava donant 404. Es va publicar un fitxer marca (`publicat.txt`) que només existia al desplegament del workflow: també donava 404 a l'arrel. Conclusió: **el Pages serveix la branca `main` directament**, i el desplegament del workflow no arribava enlloc.

**Solució adoptada:** enterrar `pages.yml` i fer que el banc de proves sigui la carpeta `proves/` dins de `main`, sincronitzada des de la branca `proves` per `sincronitzar-proves.yml`. Funciona amb el Pages tal com està configurat. Cost: una còpia duplicada d'`index.html` i `mapa.html` al repositori (els GeoJSON i `data/` no es dupliquen).

**Com es va confirmar:** el repositori té el workflow intern `pages-build-deployment` amb 316 execucions, totes des de `main`. Això demostra que el Pages està en mode branca i que publicar per Actions no hauria funcionat mai sense canviar la configuració. Els builds #315 (la fusió amb `proves/`) i #316 (`.nojekyll`) van sortir correctes, i a partir d'aquí les dues webs funcionen; els 404 que quedaven eren de memòria cau.

També s'hi va afegir `.nojekyll`: el web es publica tal com està i no cal que Jekyll el processi.

Si algun dia es canvia Settings → Pages → Source a "GitHub Actions", `pages.yml` és a l'historial (commit `48b22a8`) i és la solució neta, sense còpia duplicada.

## 2026-08-02 — Les caselles de la fórmula de risc no feien res

Reportat: a Configuració → Fórmula de risc hi ha una casella per desactivar cada factor, però desactivar-ne un no canviava el risc.

**Causa:** les caselles només s'aplicaven en prémer el botó "Guardar". Qui desmarcava un factor i tornava enrere amb "← Tornar" veia el mateix número, i la casella tornava a sortir marcada. La fórmula (`calcularRisc`) sempre havia estat correcta.

**Fet:**

- Les caselles i els camps de punts s'apliquen i es desen en canviar-los (`aplicarFormulaConfig`); el botó Guardar es manté i només confirma.
- L'aplicació automàtica no refà la taula: si ho fes, es perdria el focus mentre s'escriu als camps de punts.
- Al desglossament de cada dia, els factors desactivats surten atenuats i marcats com a "desactivat" — abans no hi havia cap pista visual de per què no sumaven.

Comprovat amb Playwright sobre l'app servida en local: amb SMP 3 i allaus 4, el risc passa de 9 a 4 en desmarcar aquests dos factors sense prémer Guardar, es manté després de recarregar, i "Valors per defecte" el torna a 9.

## 2026-07-27 — Documentació del projecte

El repositori no tenia cap documentació. S'hi afegeix:

- **`README.md`** — què és el projecte, flux de dades, estructura, scripts, càlcul del risc (el del backend), workflows i secrets, taules de Supabase i com executar-ho en local.
- **`CLAUDE.md`** — context per a Claude Code: trampes conegudes, convencions i decisions.
- **`DIARI.md`** — aquest fitxer.

Fet a [PR #1](https://github.com/correvents/Risc-Grae-v1/pull/1).

**Detectat en documentar (no s'ha tocat res):** el frontend i `scripts/risc-diari.js` calculen el risc de manera diferent des del 22-07. La pantalla mostra la fórmula nova i la base de dades desa l'antiga. Vegeu els pendents.

## 2026-07-22 — Operativitat dels helicòpters i nova fórmula de risc

Sessió llarga (17:52–19:59), tota sobre `index.html`. Reconstruïda a partir dels commits `eb17c15`, `2525ce8`, `782add5` i `7a873b7`.

**Nova fórmula de risc** (`eb17c15`)

- Passa a ser: SMP + afluència + operativitat HC + allaus + canvi, **sense límit superior**.
- Allaus: els nivells 1–2 ja no sumen; 3→+1, 4→+2, 5→+3.
- Operativitat: puntua segons el nombre d'helis operatius, invertit (0→+2, 1→+1, 2 o més→0). Substitueix l'antiga "Dificultat HC".
- Plans PC i Boletaires passen a ser **només informatius**.
- Nova pestanya *Fórmula de risc* a Configuració per activar/desactivar factors i editar-ne els punts (es desa a `localStorage`, clau `riscGRAE_formula`).

**Operativitat HC amb meteo real** (`2525ce8`)

- Un HC és operatiu si l'estat és `Total` i hi ha una finestra de ≥3 h amb ratxa ≤50 km/h i visibilitat ≥2 km (Open-Meteo per base).
- Arreglat un "4/4" que sortia sempre perquè no es llegia l'estat real dels helis.
- En aquesta primera versió, l'operativitat es comptava per **zones cobertes**.

**Correccions de la revisió** (`782add5`)

- Es torna al recompte **per heli** (X/4): agrupar per zones amagava un HC de baixa.
- Rendiment: cau d'operativitat i de meteo; 8 crides paral·leles passen de 16 consultes a 2 (Supabase) + 6 (Open-Meteo).
- `invalidarOperativitat()` en desar canvis d'helis.

**Últim canvi del dia** (`7a873b7`)

- La finestra de vol s'avalua les **24 h** i no només amb llum: els GRAE també operen de nit.

---

# Pendents

- [ ] **Unificar les dues fórmules de risc.** `scripts/risc-diari.js` encara calcula amb la fórmula antiga (i és el que es desa a `risc_historic`), mentre que `index.html` fa servir la nova des del 22-07. Cal decidir quina mana i migrar-hi l'altra. Afecta la comparabilitat de l'històric.
- [ ] **`risc-diari.js` no fa servir `canvi_temps_latest.json`**: el factor `canvi` es desa sempre a 0 (i `boletaires` també), tot i que les dades es generen cada dia.
- [ ] Decidir si l'operativitat HC (que depèn de dades introduïdes manualment al frontend) ha d'entrar al càlcul automàtic nocturn.
