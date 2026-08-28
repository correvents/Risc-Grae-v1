# CLAUDE.md

Context per a Claude Code. El `README.md` explica el projecte a qualsevol persona; aquest fitxer recull el que **no es veu llegint el codi**: decisions, trampes i convencions.

Es parla i s'escriu en **català** (codi, comentaris, commits, interfície i documentació inclosos).

## Regla d'or: el repositori és la memòria

Cada sessió arrenca en un contenidor nou, sense memòria de les converses anteriors. Tot el que no estigui commitejat es perd.

- Abans de començar: llegeix aquest fitxer i les últimes entrades de `DIARI.md`.
- En acabar una sessió de feina: **afegeix una entrada a `DIARI.md`** (què s'ha fet, per què, què queda pendent) i commiteja-ho.

## Arquitectura en una frase

Frontend estàtic (GitHub Pages) + scripts Node que s'executen per GitHub Actions i escriuen a `data/*.json` (al repositori) i a Supabase. No hi ha servidor, ni build, ni dependències npm.

## Trampes importants

**1. Hi ha DUES fórmules de risc diferents, i no coincideixen.**

| | Frontend (`index.html`, `detallarRisc`) | Backend (`scripts/risc-diari.js`) |
| --- | --- | --- |
| Model | **perill dominant + increments** | suma ponderada |
| Perill | el més gran entre SMP (0–6) i allaus (1→0, 2→0, 3→2, 4→4, 5→5), **+ suplement** si el segon perill també hi és (val 1–2 → +1; ≥3 → +2), topat a `RISC_PERILL_MAX` = 5 | — |
| Increments | operativitat HC, afluència, canvi, boletaires; **topats a `incrementsMax` = 3** entre tots | — |
| Factors | SMP, allaus, operativitat, afluència, canvi, boletaires | planspc, smp, allaus, afluència, hc, canvi |
| Plans PC | informatiu, no suma | suma 0–3 |
| Escala | `min(6, perill + increments)`, **només nombres enters** | `min(6, round((suma / 21) × 6))` |
| Configurable | sí, per l'usuari (localStorage, amb versió) | no |

**Què mesura:** no és el perill de la muntanya sinó la **probabilitat que els GRAE quedin desbordats** — si podran atendre tot el que surti. Per això el perill d'allaus pesa tant (una allau gran satura per si sola) i per això hi compten la gent que hi ha a la muntanya i els helicòpters disponibles. El perill es limita a 5 perquè quedi sempre un punt de marge per als increments.

La del frontend és la nova (08-08-2026); la del backend és l'antiga i és **la que es desa cada nit a `risc_historic`**. Migrar-la és la feina pendent, i arrossega els altres dos pendents: el backend no calcula ni `canvi` ni l'operativitat dels helis. Si toques una de les dues, comprova si l'altra també ho necessita.

### Les correccions de la fórmula del frontend

Tres regles que no es dedueixen mirant els punts, i que són el moll de l'os. **Si en toques una, actualitza també l'explicació de Configuració → Fórmula de risc**, que les explica a l'usuari.

1. **El perill no se suma, es pren el més gran.** Un dia amb SMP 4 i allaus 4 no és el doble de perillós que un amb SMP 4: és el mateix temps mirat de dues maneres. El suplement recull que dos perills alhora carreguen una mica més.
2. **L'afluència es rebaixa amb mal temps** (`afluenciaSMP`). L'afluència és una *predicció* feta amb estadístiques de calendari, i el calendari no veu quin temps farà — que és justament el que fa que la gent es quedi a casa. A partir del taronja (SMP ≥ 3) la previsió baixa un graó abans de sumar-se. Els trams segueixen el **color** de l'avís, no el número: a l'escala d'SMP, 1–2 és groc i 3–6 taronja o vermell. **No s'aplica a les allaus**: amb perill alt hi va menys gent, però la que hi és és exactament la que està en perill.
3. **Els increments tenen sostre** (`incrementsMax` = 3). Modulen el perill, no el substitueixen: un pont d'agost amb dos helis de baixa i canvi de temps fort no ha de valer el mateix que un vermell d'allaus.

**Nombres enters.** El risc no ha de tenir mai decimals. Cada increment suma el seu propi valor d'escala (afluència 0–3, canvi 0–2, boletaires 0–1), **tret de l'operativitat**, que no és proporcional: cap HC operatiu → +2, un → +1, **dos o més → 0**, perquè amb dos ja es cobreix el territori. `detallarRisc` arrodoneix el total, perquè els punts són editables.

**`RISC_FORMULA_VERSIO`.** La config de la fórmula es desa a `localStorage` i es rellegeix per sobre dels valors per defecte, o sigui que **un canvi de punts no arriba a qui ja tingui config desada**. Puja la versió sempre que canviï el *significat* dels punts, no només el seu valor: si no coincideix, la config es llença. Va per 6.

**Els dies desats no es poden reconstruir.** `risc_historic` no té columna d'operativitat (que és un factor del càlcul) ni de versió de fórmula, i la columna `hc` és de la fórmula antiga. Cada dia que passa és un dia perdut per a l'anàlisi. Vegeu **`ANALISI-DADES.md`**, que porta el SQL concret i el principi que en surt: **si l'API ho dona, es desa tal com ve** — agregar és barat, recuperar el que no s'ha desat és impossible.

**Interruptor d'allaus fora de temporada.** A l'estiu l'ICGC no publica butlletí, però l'últim
desat es queda a `bpa_latest.json` i el càlcul el continuaria llegint: al juliol encara hi hauria el
perill de la primavera. La casella de Configuració → Allaus BPA (`allausConfig.desactivat`, desat a
`localStorage` amb la clau `riscGRAE_allaus`) posa el nivell a **0**. No és el mateix que treure la
casella `allaus` de la fórmula: allà es desactiva el factor, aquí es diu que el perill és 0, i per
això val també per a un dia editat a mà. **Tot el codi ha de llegir el nivell per `nivellAllaus(dia)`**;
si algú torna a llegir `dia.allaus` cru, l'interruptor deixa de fer efecte en aquell camí. El
simulador se'l salta a posta (`simulacio: true`): serveix per calibrar amb valors inventats.
Només afecta el frontend — el backend (`risc-diari.js`) no pot llegir el `localStorage`.

**Simulador.** A Configuració → Fórmula de risc hi ha un simulador que calcula amb valors inventats i ensenya el desglossament pas a pas. Serveix per calibrar sense tocar cap dia real; no desa res.

**Taules de "què suma cada factor"** (`renderExplicacioFactors`). Dos desplegables a la mateixa pestanya que ensenyen, per a cada valor de cada factor, què aporta de veritat — perquè cap factor suma el seu valor tal qual i això s'ha de poder justificar a un cap. **Es generen des de `riscFormula`, no escrites a mà**, o sigui que segueixen sols qualsevol canvi de punts: no els has d'actualitzar.

Per unificar-les caldrà, com a mínim:Per unificar-les caldrà, com a mínim: moure la config de la fórmula de `localStorage` a Supabase (ja hi ha `taula_config_Alertes_SMP` per als altres paràmetres) i afegir una columna d'operativitat a `risc_historic`, que ara no existeix.

**Els colors de l'SMP Bombers no són els del risc del GRAE.** `COLORS_SMP` (taula, mapa i llegenda
de la pestanya SMP Bombers) no és un degradat: és el **color de l'avís de Meteocat**, que és el que
el cap de regió té al cap. 1–2 groc, 3–4 taronja, 5–6 vermell, 0 verd, i dins de cada color el valor
baix és el to clar i l'alt el fosc. `COLORS_RISC` és l'altra escala, la del risc del GRAE (l'usa el
simulador i li fan joc les classes `.risc-color-*`). No les barregis: volen dir coses diferents.

**2. `risc-diari.js` no fa servir `canvi_temps_latest.json`.**

El factor `canvi` sempre es desa a 0 des del càlcul automàtic (i `boletaires` també), tot i que `fetch-canvi-temps.js` genera les dades. El frontend sí que el fa servir.

**3. Les entrades manuals manen.**

`risc-diari.js` no sobreescriu una entrada de `risc_historic` si la seva `font` no és `auto_github` ni `auto_gas`. No canviïs aquest comportament sense parlar-ho.

**4. `index.html` és un sol fitxer de ~380 KB.**

Tot (HTML, CSS, JS) hi va dins, sense build ni mòduls. És deliberat: es publica directament a GitHub Pages. Fes servir edicions puntuals; no el reescriguis sencer. Conté un **manual d'ús integrat** a la pestanya Configuració: si canvies un càlcul, actualitza també la documentació que hi ha allà dins.

**5. La pàgina de Configuració viu dins d'`app-risc`.**

És el mateix contenidor que reescriu `renderRisc()`, o sigui que **qualsevol crida a `renderRisc` mentre l'usuari és a Configuració l'expulsa** enmig del que estigui ajustant. Per això `actualitzarRiscAuto` només dibuixa si no hi ha `#pagina-parametres` al DOM. Si afegeixes un camí que acabi cridant `renderRisc`, comprova-ho.

**6. `logError` no ha de petar mai.**

Se'l crida des de tots els `catch`. Si peta ell, converteix un error controlat en un de no controlat i avorta la funció que l'havia cridat — silenciosament, perquè sembla que el `catch` ja ho tenia resolt. La crida a Supabase va dins d'un `try` i la promesa té els dos mànecs. No hi posis res que pugui llançar.

**7. `supabaseUpsert` necessita `onConflict` si el UNIQUE no és la clau primària.**

`utils.js` envia `Prefer: resolution=merge-duplicates`. Sense el tercer argument, PostgREST mira
la **clau primària** — sovint un `id` autogenerat que no coincideix mai — i l'upsert acaba xocant
amb el UNIQUE de veritat amb un **409**. Com que els workflows porten `continue-on-error`, això
falla **en silenci**.

Va passar a dues taules i va estar setmanes sense detectar-se: `risc_historic` (UNIQUE `data`) i
`canvi_temps_historic` (UNIQUE `data,tipus_dia,punt`). Si afegeixes una taula amb un UNIQUE que
no sigui la primària, passa-li les columnes: `supabaseUpsert('taula', files, 'col1,col2')`.

**8. El cron pot travessar la mitjanit.** GitHub Actions endarrereix els crons de manera
irregular — s'ha vist un retard de **3 h 24 min**. Si el retard creua la mitjanit de Madrid,
`avuiMadrid()` ja retorna l'endemà i la feina cau sobre el dia equivocat. Per això
`risc-diari.js` no fa servir `avuiMadrid()` directament sinó `diaDeTancament()`, que tracta les
hores petites com a part del dia operatiu anterior. Ancorar l'hora del cron no n'hi ha prou.

**9. Dues claus de Supabase.**

Frontend → clau `anon`, incrustada al JS (pública, és correcte). Scripts → `service_role`, sempre via GitHub Secrets. **Mai** posis la `service_role` a `index.html`.

## Operativitat dels helicòpters (frontend)

Un HC compta com a operatiu si el seu estat és `Total` **i** la meteo permet volar: cal una finestra de **≥3 hores seguides** amb ratxa ≤50 km/h i visibilitat ≥2000 m (constants `OP_RATXA_MAX`, `OP_VIS_MIN`, `OP_HORES_MIN`, via Open-Meteo per coordenades de base).

- **De moment el GRAE no vola de nit**, així que la finestra es busca només entre hores amb llum (`is_day` d'Open-Meteo) i no pot travessar la nit. És configurable: si algun dia s'opera de nit, cal desmarcar-ho i pujar la visibilitat mínima.
- **Mesura si poden sortir de l'heliport, no si podran treballar al lloc.** Això últim depèn d'on sigui el servei i del criteri de la tripulació, i no es pot preveure.
- El recompte és **per heli** (X/4), no per zones cobertes: agrupar per zones amagava helis de baixa.
- Si no hi ha coordenades o falla la xarxa, **no es penalitza** (`ok: true`).
- **El recompte és de províncies cobertes, no d'aparells.** `avaluarOperativitat` creua els tres paràmetres alhora — estat `Total`, finestra de vol des de la base i **distribució** — i retorna `count` = províncies cobertes per HC que poden volar. Dos HC operatius a la mateixa província en compten un. `aparells` porta el recompte d'aparells, per si cal.
- **N'hi ha un de sol.** Hi havia un segon recompte (`calcularIndexos` / `renderIndexos`) que dibuixava les seves pròpies targetes de "Distribució territorial" i "Operativitat" amb mitjos punts i sense mirar les condicions de vol: donava un número diferent per a la mateixa cosa. Retirat. Si tornes a necessitar un desglossament, surt de `detall`, no d'un càlcul paral·lel.
- **`meteoPermetVol` diu què falla i quan** (`visibilitat de fins a 800 m de 10 a 14 h`), no només que no vola: és el que permet decidir. `tramsHores` agrupa les hores dolentes en trams.
- **`renderHCGraeOperatius` va per prefix** (`heliEl`), o sigui que el mateix bloc surt a la pestanya i a Configuració → Helicòpters. Si no hi ha capçalera gran, el número el dibuixa ell mateix.
- **Els llindars són configurables** (`opConfig`, desat a `localStorage` amb la clau `riscGRAE_opHC`; per defecte 50 km/h, 2000 m, 3 h, només de dia) i s'editen a Configuració → Operativitat HC. Ja no són constants.
- **Contrastats:** 50 km/h (27 kt) quadra amb la pràctica de vol de muntanya (~25 kt). Els 2000 m són conservadors respecte de la mínima HEMS de dia d'EASA (1.500 m), que és la que aplica perquè no es vola de nit. El sostre de núvols no el tenim: Open-Meteo no el dona. La flota són H135 P2.
- La província és una aproximació de la regió d'emergència; quan calgui precisió, caldrà passar a `REGIONS_BOMBERS`.
- Hi ha cau (`operativitatCache`, `meteoVolCache`); si canvies dades d'helis, crida `invalidarOperativitat()`.

## Una sola branca: `main` (des del 27-08-2026)

**Es treballa directament a `main`.** La branca `proves` es va abandonar el 27-08-2026;
queda al repositori per si algun dia es vol recuperar, però no s'hi commiteja.

**El motiu, que és el que importa:** els workflows programats **només s'executen des de la
branca per defecte**, que és `main`. Qualsevol canvi a `scripts/` fet a `proves` **no s'executa
mai**: neix mort. Ja va passar dues vegades (el 08-08 amb `fetch-smp.js` i el 26-08 amb el fix
d'`smp_historic`, que va estar un dia sencer sense fer res). El model de dues branques estava
pensat per al frontend i no aguanta un repositori que també conté ingesta.

I la separació donava menys del que semblava: `/proves/` **comparteix `data/*.json` i Supabase**
amb l'operatiu, o sigui que mai va ser un entorn aïllat. Donava una URL per mirar la interfície,
no seguretat.

GitHub Pages publica `main` tal com està (mode "deploy from a branch"), **no** hi ha desplegament
per Actions. La carpeta `proves/` continua servint-se a `/proves/` i es distingeix sola: fons
verd, franja verda i `🧪 PROVES` al títol (`marcarWebDeProves()`, que detecta `/proves/` a la
ruta). `sincronitzar-proves.yml` només s'activa amb pushes a `proves`, així que ara no fa res.

Si algun dia es vol tornar a tenir un banc de proves, **que no sigui una branca**: o s'edita
`proves/index.html` directament, o es posa Settings → Pages → Source = "GitHub Actions" i es
recupera `pages.yml` de l'historial (commit `48b22a8`), que és la solució neta.

**Compte igualment:** el que provis a `/proves/` escriu a les taules de veritat.

Es va provar primer de publicar per Actions (`pages.yml`, esborrat): el desplegament sortia verd però el Pages continuava servint la branca, així que `/proves/` donava 404. Si algun dia es posa Settings → Pages → Source = "GitHub Actions", aquell workflow és a l'historial i és una solució més neta, sense còpia duplicada.

**Els dos webs comparteixen dades.** `data/*.json` i Supabase són els mateixos: la còpia de proves **no** és un entorn aïllat, i si hi guardes coses les escrius a les taules de veritat. Tingues-ho present abans de provar-hi res que escrigui.

## Convencions

- **Codi**: JS pla, sense frameworks ni dependències. Node 20+ (`fetch` natiu). Als scripts, els helpers compartits van a `scripts/utils.js`.
- **Scripts d'ingesta**: comparen amb la instantània anterior i només escriuen a Supabase si hi ha canvis, tret que `FORCE=true`. Mantén aquest patró als scripts nous.
- **Dates**: sempre `Europe/Madrid` per al "dia" operatiu (`avuiMadrid()`), no UTC. Els crons dels workflows sí que són UTC.
- **Commits**: en català, imperatiu, amb el cos explicant el *per què*. Un commit per canvi lògic.
- **`data/*.json`**: els commiteja el workflow. No els editis a mà.

## Comprovacions abans de donar per bona una feina

No hi ha tests ni linter. Com a mínim:

```bash
node --check scripts/<fitxer>.js     # sintaxi dels scripts
python3 -m http.server 8000          # i obrir l'app; mirar la consola del navegador
```

L'app s'ha de servir per HTTP: amb `file://` els GeoJSON del mapa no carreguen.
