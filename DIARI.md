# Diari del projecte

Registre cronològic de què s'ha fet i per què. **El més recent, a dalt.**

Com que cada sessió de Claude Code arrenca sense memòria, aquest fitxer és el que permet reprendre la feina on es va deixar. En acabar una sessió, afegeix-hi una entrada.

Format d'una entrada: data, què s'ha fet, per què, i què queda pendent.

---

## 2026-08-09 — Configuració: què suma cada factor, taula per taula

Petició amb un motiu concret: **s'ha de poder explicar i justificar als caps**. L'explicació que hi havia deia com funcionava el model, però no deixava veure el més important, que és que **cap factor suma el seu valor tal qual**.

S'hi afegeixen dos desplegables a Configuració → Fórmula de risc, amb el valor de cada ítem al costat del que suma de veritat:

- **Què suma cada perill.** SMP (directe, ja ve 0-6), allaus (on més es nota: un 3 aporta 2 i un 5 aporta 5, perquè el BPA mesura la probabilitat que hi hagi allaus i nosaltres mesurem si ens desbordarà), i el suplement del segon perill.
- **Què suma cada increment.** Operativitat (un punt per heli de baixa), afluència amb **dues columnes** — el que aporta amb bon temps i el que aporta amb taronja o vermell, que és el mateix dia amb temps diferent —, canvi de temps, boletaires i el sostre.

Cada fila que no és una suma directa porta el **per què** al costat. On sí que ho és (SMP, canvi de temps), el motiu va un cop sobre la taula en comptes de repetir-se a cada fila.

**Les taules es generen des de `riscFormula`, no escrites a mà.** Si algú canvia un punt, es refan soles: no es poden desincronitzar. Això treu una feina de la norma dels tres llocs — ara els punts només s'han de tocar a les constants i al `CLAUDE.md`.

## 2026-08-09 — Operativitat proporcional, i què cal desar per saber si l'encertem

**Operativitat proporcional**, com la resta de factors: suma tants punts com **helis de baixa** hi ha, de les 4 bases. 4 volen +0, 3 volen +1, 2 volen +2, 1 vola +3, cap vola +4 (topat pel sostre a 3). Això arregla que 0 i 1 heli quedessin igualats. `RISC_FORMULA_VERSIO` puja a 5.

**El que s'ha trobat mirant si podríem analitzar-ho més endavant:** ara mateix **no**. Els dies que desem no es poden ni reconstruir.

`risc_historic` desa `planspc, smp, allaus, afluencia, hc, canvi, boletaires`, però la fórmula del frontend fa servir l'**operativitat**, que no té columna — i la columna `hc` és de la fórmula antiga, que ja no s'usa. Tampoc no es desa quina versió de fórmula va produir el número, i en dos dies ja anem per la 5. Un risc 4 del dia 8 i un del dia 9 poden voler dir coses diferents.

I encara falta el més important: el risc es calcula amb **previsions**, i per saber si l'encertem cal saber **què va passar de veritat** (dades observades de les estacions XEMA) i, sobretot, **quants serveis va tenir el GRAE aquell dia**. Aquesta última no surt de cap API: l'ha de portar Bombers, i és la que decideix si tot això serveix.

Tot analitzat a **`ANALISI-DADES.md`**, amb el SQL concret dels canvis. **No s'ha tocat res de Supabase.**

**Principi que en surt, i que ja ens ha mossegat dues vegades:** desar en cru i no col·lapsar. `fetch-smp.js` col·lapsava la comarca abans de desar i vam perdre la dada; el grau 0-6 de Meteocat es llençava i el deduíem del color. Si l'API ho dona, es desa tal com ve — agregar és barat, recuperar el que no s'ha desat és impossible.

**Avís de seguretat detectat de passada:** nou taules de Supabase tenen la RLS desactivada i la clau `anon` és pública (va incrustada a `index.html`). Qualsevol que la tregui del codi pot llegir i modificar aquelles taules. No s'ha tocat: activar la RLS sense polítiques bloquejaria l'app. Detall a `ANALISI-DADES.md`.

## 2026-08-09 — Sostre als increments, i la fórmula explicada a Configuració

Continuació de l'anterior. Rebaixar l'afluència amb mal temps corregia la duplicitat, però no el que grinyolava de debò: **un pont d'agost sense cap perill de muntanya arribava a 6**, igual que un vermell d'allaus.

**Sostre dels increments** (`incrementsMax` = 3). Els increments modulen el perill, no el substitueixen. Aquell pont d'agost (afluència 3 + operativitat 2 + canvi 2 + boletaires 1 = 8) ara es queda a **3**. Amb perill alt no canvia res: el perill mana i el total continua topant a 6.

**Operativitat repesada.** Dos helis operatius ja carreguen (+1), i amb un o cap suma +2. Abans dos helis no sumaven gens. La contrapartida és que 0 i 1 heli queden igualats: amb una escala d'enters de 0 a 2 no hi caben cinc estats, i el salt important és tenir-ne dos o menys.

**Afluència amb mal temps, simplificada.** Un sol tram a partir del taronja: SMP 0-2 no la toca, SMP 3-6 li treu un graó. Abans el vermell l'anul·lava del tot; ara es tracta igual que el taronja.

**Configuració → Fórmula de risc, refeta.** És on s'ha d'entendre com funciona això, i era un paràgraf apilat. Ara hi ha:

- Què mesura el número (probabilitat de quedar desbordats, no perill de muntanya).
- El càlcul en dues parts, amb la fórmula escrita.
- Un desplegable **"Les correccions"** que explica les quatre regles que no es dedueixen mirant els punts: per què el perill no se suma, per què l'afluència es rebaixa amb mal temps, per què les allaus no la rebaixen, i per què els increments tenen sostre.
- Un **simulador**: es mouen els sis valors d'entrada i surt el risc amb el desglossament pas a pas ("mana allaus amb 5", "increments 8, topat pel sostre a 3"). No desa res; serveix per calibrar.

`RISC_FORMULA_VERSIO` puja a 4.

Comprovat amb Playwright: vint escenaris de càlcul i el simulador funcionant, amb el sostre visible al desglossament.

**Com s'ha d'anar ajustant això.** Cada cop que es canviïn punts o correccions cal tocar tres llocs alhora: les constants de `RISC_FORMULA_DEFAULT`, l'explicació de Configuració → Fórmula de risc, i `CLAUDE.md`. I pujar `RISC_FORMULA_VERSIO` si canvia el significat, o el canvi no arribarà a qui ja tingui config desada al navegador.

**Pendent:** contrastar els números amb serveis reals. Fins ara tot s'ha calibrat raonant, no amb dades.

## 2026-08-09 — L'afluència es rebaixa quan hi ha avisos SMP

Venia del pendent de calibrar els increments, que amb el pas a enters podien sumar fins a +8. La solució no és posar-hi un sostre: el problema de fons és que **el mal temps comptava dues vegades**.

L'afluència és una **predicció** de quanta gent hi haurà a la muntanya, feta amb estadístiques de calendari (caps de setmana, agost, ponts). Aquestes estadístiques no veuen quin temps farà, que és justament el que fa que la gent es quedi a casa. Amb un avís taronja o vermell no estàvem sumant un factor de més: sumàvem una previsió que ja sabíem falsa.

**Regla nova** (`afluenciaSMP`): l'SMP rebaixa l'afluència **abans** que sumi, `afluència efectiva = màx(0, afluència − reducció)`. Els trams segueixen el **color de l'avís**, no el número — a l'escala d'SMP 1-2 és groc, 3-4 taronja i 5-6 vermell:

- Cap avís o groc (0-2): reducció 0. Un groc no atura ningú.
- Taronja (3-4): reducció 1.
- Vermell (5-6): reducció 3, o sigui que l'anul·la.

**No s'aplica a les allaus**, tot i que també fan quedar gent a casa. Amb perill 4-5 hi va menys gent, però la que hi és és exactament la que està en perill i cada servei és molt més gros. Amb un vermell de pluja, en canvi, no hi ha ningú a qui rescatar.

**Error propi que va sortir provant:** la primera proposta posava el primer tram a SMP 2, i amb això el cas que havia reportat l'usuari aquest matí (SMP 2 amb afluència 2, que ha de donar 4) passava a donar 3. SMP 2 és **groc a tres zones o més**, encara groc, i havia dit que el groc no atura ningú. Corregit a taronja.

El sostre es queda a **6** sempre, per decisió expressa.

Comprovat amb Playwright sobre setze escenaris: el cas reportat continua donant 4, el groc no rebaixa res, el taronja rebaixa un graó, el vermell anul·la l'afluència i les allaus no la toquen.

`RISC_FORMULA_VERSIO` puja a 3, perquè hi ha un factor nou i les configs desades no el porten.

**Encara pendent:** un cap de setmana d'agost sense cap avís, amb dos helis de baixa i canvi de temps fort, continua arribant a 6. Ara és defensable (és un dia realment tens per al GRAE), però convindria contrastar-ho amb dades reals de serveis.

## 2026-08-08 — El risc passa a nombres enters

Reportat: amb SMP 2 i afluència 2 el risc sortia **2,5** i n'havien de sortir **4**. La causa era la taula de punts de l'afluència (`{1: 0,25, 2: 0,5, 3: 1}`), que amb afluència 2 sumava mig punt.

**Regla nova:** el risc no ha de tenir mai decimals, i cada increment suma **el seu propi valor d'escala**.

- Afluència: 0-3 → +0, +1, +2, +3.
- Canvi de temps: 0-2 → +0, +1, +2.
- Operativitat HC, que va a l'inrevés: cap heli +2, un heli +1, dos o més +0.
- Boletaires (+1) i el suplement del segon perill (+1 / +2) ja eren enters.

`detallarRisc` arrodoneix el total abans de topar-lo, perquè els punts es poden editar des de Configuració i d'allà en podria sortir un decimal. El camp de punts passa a `step="1"`.

**Trampa que això destapava:** la config de la fórmula es desa a `localStorage` i es tornava a llegir per sobre dels valors per defecte, o sigui que qui ja tingués l'escala antiga desada hauria continuat veient 2,5 després del canvi. S'hi afegeix `RISC_FORMULA_VERSIO`: si la versió desada no coincideix, la config es llença i es parteix dels valors nous. **Cal pujar-la sempre que canviï el significat dels punts, no només el seu valor.**

Comprovat amb Playwright sobre deu escenaris, entre ells el cas reportat (surt 4), que cap resultat té decimals, i que una config antiga a `localStorage` queda descartada.

**Pendent de calibrar, i ara més gros:** els increments poden sumar fins a **+8** (afluència 3 + operativitat 2 + canvi 2 + boletaires 1). Un dia sense cap perill de muntanya però amb tot en contra arriba a 6. Cal decidir si es limita el total d'increments o si es tornen a repesar.

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
