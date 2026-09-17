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

**1. La fórmula del risc viu a `formula-risc.js`, i és l'única que hi ha.**

El fitxer el carreguen **tots dos costats**: l'`index.html` amb `<script src="formula-risc.js?v=…">`
i els scripts de Node amb `require('../formula-risc.js')`. És l'excepció conscient a la regla que
l'app és un sol fitxer (trampa 4), i té un motiu concret: **fins al 15-09-2026 n'hi havia dues i no
donaven el mateix número** — el frontend feia perill dominant + increments i `risc-diari.js` una suma
ponderada `min(6, round((suma/21)×6))`. Amb les captures del risc això deixava de ser un detall: el
que es desa ha de ser exactament el que es veu a la pantalla.

| | Com és ara |
| --- | --- |
| Model | **perill dominant + increments** |
| Perill | el més gran entre SMP (0–6) i allaus (1→0, 2→0, 3→2, 4→4, 5→5), **+ suplement** si el segon perill també hi és (val 1–2 → +1; ≥3 → +2), topat a `RISC_PERILL_MAX` = 5 |
| Increments | operativitat HC, afluència, canvi, boletaires; **topats a `incrementsMax` = 3** entre tots |
| Plans PC | informatiu, no suma |
| Escala | `min(6, perill + increments)`, **només nombres enters** |
| Configurable | sí, per l'usuari |

**`detallarRisc(dia, formula)` no llegeix res de fora**: ni `localStorage`, ni Supabase, ni
`riscFormula`. `dia.allaus` hi ha d'arribar **ja resolt** per l'interruptor de temporada i la config
li entra per paràmetre. És el que fa que el backend en tregui el mateix número que la pantalla; si hi
tornes a posar una lectura de config a dins, es trenca.

**Què mesura:** no és el perill de la muntanya sinó la **probabilitat que els GRAE quedin desbordats**
— si podran atendre tot el que surti. Per això el perill d'allaus pesa tant (una allau gran satura per
si sola) i per això hi compten la gent que hi ha a la muntanya i els helicòpters disponibles. El
perill es limita a 5 perquè quedi sempre un punt de marge per als increments.

**Pendent:** `risc-diari.js` encara desa a `risc_historic` amb la fórmula antiga; ha de passar a
`formula-risc.js` com la resta. Vegeu `PLA-CAPTURES.md`.

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

**I compte amb el 0 del BPA, que fins al 17-09-2026 es convertia en 1.** `factorsDelDia` feia
`perill_maxim_numeric || 1`. Fora de temporada l'ICGC no publica i el resum arriba amb
`perill_maxim: "Desconegut"` i `perill_maxim_numeric: 0`: aquell `|| 1` ho tornava un 1, i la
pantalla i les captures ensenyaven **«1/5» com si hi hagués perill feble mesurat**. És la trampa 12
al revés — un factor sense dades no pot semblar un factor a 1, igual que no pot semblar un factor a
0. Ara es llegeix el número tal com ve. El risc no en canvia (a l'escala, 0 i 1 valen tots dos 0
punts), però el que es veu ja és el que hi ha. Aquest bug és el que feia semblar imprescindible
l'interruptor a l'estiu; l'interruptor continua fent falta per a un dia editat a mà i per si algun
dia el butlletí queda congelat de debò.

**Interruptor de temporada de boletaires.** El factor `boletaires` existia a la fórmula però **ningú
n'establia mai el valor**: la casella de Fórmula de risc només diu si compta, i `dia.boletaires` es
quedava a 0 tret que s'edités el dia a mà — cosa que, a sobre, marca el dia com a editat i congela
la resta de factors. Ara `boletairesConfig.actiu` (Configuració → Boletaires) el posa a 1 a
`calcularValorsAuto` per a tots els dies automàtics. **Es desa a Supabase**
(`taula_config_alertes_smp.boletaires_actiu`), no al `localStorage` com el d'allaus: que hi hagi
bolets o no val per a tot l'equip i ha de valer per a tothom, no per a qui va marcar la casella; el
`localStorage` només és la reserva quan Supabase no respon, i llavors es diu a la pantalla. No
s'apaga sol quan s'acaba la temporada: la franja de dades recorda que està activat.

**Simulador.** A Configuració → Fórmula de risc hi ha un simulador que calcula amb valors inventats i ensenya el desglossament pas a pas. Serveix per calibrar sense tocar cap dia real; no desa res.

**Taules de "què suma cada factor"** (`renderExplicacioFactors`). Dos desplegables a la mateixa pestanya que ensenyen, per a cada valor de cada factor, què aporta de veritat — perquè cap factor suma el seu valor tal qual i això s'ha de poder justificar a un cap. **Es generen des de `riscFormula`, no escrites a mà**, o sigui que segueixen sols qualsevol canvi de punts: no els has d'actualitzar.

Per unificar-les caldrà, com a mínim: moure la config de la fórmula de `localStorage` a Supabase (ja hi ha `taula_config_alertes_smp` per als altres paràmetres) i afegir una columna d'operativitat a `risc_historic`, que ara no existeix.

**El perímetre de les regions no surt de fusionar comarques.** El
`comarques_simplificat_500m.geojson` està simplificat **sense topologia**: dues comarques veïnes no
comparteixen tots els vèrtexs. Si mires de treure el contorn d'una regió ajuntant les seves
comarques i esborrant les arestes que surten dues vegades, les fronteres de dins no s'anul·len i
queden trossos de ratlla pel mig (provat, amb tolerància inclosa: no s'arregla). Es fa amb SVG a
`svgDefsPerimetres()`: traç gruixut sobre el contorn de totes les comarques de la regió, retallat
amb **tot menys la regió** (rectangle sencer + els seus anells, `clip-rule="evenodd"`). En queda
només la meitat de fora i les ratlles interiors desapareixen soles. Es defineix un cop i els quatre
mapes el reutilitzen amb `<use href="#smpb-perimetres">`; no en facis una còpia per mapa.

**L'Aran i la ciutat de Barcelona no són territori nostre** (`COMARQUES_FORA_REGIO`,
`CONTORN_BARCELONA`): bombers propis. Es pinten en gris i no compten al risc de cap regió, però el
valor de l'SMP es continua veient al tooltip. L'Aran és una comarca i se'n pot sortir del càlcul;
**Barcelona no**, perquè les dades són per comarca i el Barcelonès també porta l'Hospitalet i
companyia — se'n marca només el terme municipal. Vegeu `REGIONS-EMERGENCIA.md`.

**Els quatre mapes de l'SMP Bombers es dibuixen un cop i es repinten.** `projeccioComarques()`
projecta les 43 comarques una sola vegada i en guarda els camins; `svgComarques(idMapa)` només en fa
l'esquelet, sense color, amb el codi de comarca a `data-codi`; i `pintarMapesSMPBombers(matriu,
franja)` canvia el `fill` i el `<title>` a cada franja. La seqüència de franges avança sola cada 2 s
i el temporitzador (`smpbTemporitzador`) **es mata sol quan la secció deixa de tenir la classe
`active`**: la secció es queda al DOM en canviar de pestanya, o sigui que comprovar només si
l'element existeix no serveix, i sense això s'acumularien temporitzadors pintant mapes que ningú
mira. Si hi afegeixes un mapa, posa'l a `SMPB_MAPES`; no facis un segon camí de dibuix.

**Els colors de l'SMP Bombers no són els del risc del GRAE.** `COLORS_SMP` (taula, mapa i llegenda
de la pestanya SMP Bombers) no és un degradat: és el **color de l'avís de Meteocat**, que és el que
el cap de regió té al cap. 1–2 groc, 3–4 taronja, 5–6 vermell, 0 verd, i dins de cada color el valor
baix és el to clar i l'alt el fosc. `COLORS_RISC` és l'altra escala, la del risc del GRAE (l'usa el
simulador i li fan joc les classes `.risc-color-*`). No les barregis: volen dir coses diferents.

**2. `risc-diari.js` no fa servir `canvi_temps_latest.json`.**

El factor `canvi` sempre es desa a 0 des del càlcul automàtic (i `boletaires` també), tot i que `fetch-canvi-temps.js` genera les dades. El frontend sí que el fa servir.

**3. Les entrades manuals manen.**

`risc-diari.js` no sobreescriu una entrada de `risc_historic` si la seva `font` no és `auto_github` ni `auto_gas`. No canviïs aquest comportament sense parlar-ho.

**4. `index.html` és un sol fitxer de ~380 KB, amb una sola excepció.**

Tot (HTML, CSS, JS) hi va dins, sense build ni mòduls. És deliberat: es publica directament a GitHub
Pages. Fes servir edicions puntuals; no el reescriguis sencer. Conté un **manual d'ús integrat** a la
pestanya Configuració: si canvies un càlcul, actualitza també la documentació que hi ha allà dins.

L'única excepció és **`formula-risc.js`** (trampa 1), que ha de ser compartit amb Node. Va per camí
relatiu, o sigui que el web de proves en necessita la seva còpia: `sincronitzar-proves.yml` ja la fa.
Si n'hi afegissis un altre, recorda-ho — i pensa-t'ho dues vegades.

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

**8 bis. Les hores les mana Supabase, no els crons de GitHub.** Des del 16-09-2026, tant la ingesta
com les captures les dispara `pg_cron` amb `workflow_dispatch` (`pg_net` → l'API de GitHub, amb el
token al Vault). Arriba **al segon** i la passada publica en menys de mig minut: mesurat, el dispatch
de les 18:20:01 tenia els JSON al repositori a les 18:20:28.

Hi ha **setze jobs**, estiu i hivern de cadascun: vuit `captura-*` i vuit `ingesta-*`. Cada captura
va **10 minuts darrere de la seva ingesta** (06:45→06:50, 10:40→10:50, 14:45→14:50, 20:20→20:30 de
Madrid), perquè capturi el que s'acaba de baixar i no el de la passada d'abans. Es miren amb
`select jobname, schedule, active from cron.job order by jobname` i l'historial amb
`select * from cron.job_run_details order by start_time desc`.

**Els crons de GitHub ja no serveixen per a cap hora.** N'hi havia nou fent la mateixa feina a hores
aleatòries —deu passades al dia de `data_diari` on en calien quatre, sis de captura on en calien
tres—, i es van treure el 16-09-2026. En queda **un per workflow**, com a xarxa de seguretat: si el
`pg_cron` caigués (projecte pausat, secret del Vault caducat, `pg_net` trencat), garanteixen una
passada al dia i que només n'hi hagi una es veu de seguida a Actions.

Tot el que ve a continuació continua sent cert i és el motiu pel qual es va fer tot això.

**8. Les hores dels crons són ancoratges, no hores d'execució.** GitHub Actions els endarrereix
de manera irregular i **molt**: mesurat entre l'11 i el 14 de setembre del 2026, de **2 h 14 min a
6 h 53 min**, i creixent (abans s'havia vist 3 h 24 min). Se'n deriven dues coses:

- **La primera passada del dia s'ha d'ancorar de matinada.** Amb el primer cron a les 05:45 UTC, la
  primera passada queia entre les 09:36 i les 11:00 UTC: cada matí, fins al migdia, la web ensenyava
  les dades del vespre anterior — i això es va reportar dues vegades com si fos un error de l'app.
  Ara el primer ancoratge és a les **00:23 UTC**. Els minuts van **senars i lluny del :00**, que és
  l'hora més congestionada. Si canvies el primer cron, canvia també la cadena que el compara a
  `data_diari.yml` (el guardat forçat diari), o deixa de fer-se en silenci.
- **Cap cron pot arribar a tocar la mitjanit de Madrid.** Si el retard la creua, `avuiMadrid()` ja
  retorna l'endemà i la feina cau sobre el dia equivocat. Per això `risc-diari.js` no fa servir
  `avuiMadrid()` directament sinó `diaDeTancament()`, que tracta les hores petites com a part del dia
  operatiu anterior — però el seu marge acaba a les 6 h de Madrid (`HORA_INICI_DIA`), i amb 7 h de
  retard l'ancoratge de les 21:00 UTC hi arribava just: ara és a les **18:43 UTC**. A
  `data_diari.yml`, l'últim ancoratge no passa de les **14:00 UTC** per la mateixa raó
  (`fetch-canvi-temps.js` fa servir `avuiMadrid()`).

Quan les dades es vegin velles, mira **quan va córrer l'últim workflow**, no només què hi ha desat:
si no ha corregut, la franja de dades diu la veritat i el que cal és una passada a mà
(Actions → Dades diàries GRAE → Run workflow).

**9. Dues claus de Supabase, i comprova que la dels scripts sigui la bona.**

Frontend → clau `anon`, incrustada al JS (pública, és correcte). Scripts → `service_role`, sempre via
GitHub Secrets. **Mai** posis la `service_role` a `index.html`.

**El secret `SUPABASE_SERVICE_KEY` ha contingut durant mesos una clau que no era la `service_role`**,
i no ho va delatar res: totes les taules on escrivien els scripts o tenen la RLS desactivada o tenen
polítiques que deixen escriure a qualsevol (`risc_historic`: «Escriptura autenticada», «Inserció des
de GAS»; `smp_historic`: «Inserció GAS»). Va sortir el 15-09-2026, quan `risc_captures` —la primera
taula que neix amb la RLS ben posada— va respondre **401 / 42501 row-level security**. Amb la clau
`service_role` la RLS no s'aplica mai, o sigui que **un 42501 en un script vol dir clau equivocada,
no política equivocada**: `errorSupabase()` a `utils.js` ja ho diu així. Si mai afegeixes una taula
amb RLS i les escriptures et reboten, mira la clau abans de tocar les polítiques.

**9 bis. Un secret amb un salt de línia no dona error de permisos: no arriba a sortir.**
Els secrets de GitHub s'enganxen a mà i és fàcil que hi entri un salt de línia o un espai. Una
capçalera HTTP no els admet, i `fetch` llança `Headers.append: "..." is an invalid header value`
**abans** de fer la petició. Al log surt emmascarat (`"***\n***"`), que és justament la pista: el
secret ocupa dues línies. Va passar el 15-09-2026 en canviar la clau per la `service_role`.

**Un `trim()` no n'hi ha prou**, i val la pena saber per què: el salt era **enmig** de la clau, no
als extrems — la pantalla de Supabase la ensenya partida i el retorn hi entra en copiar-la. Es va
provar, es va tornar a fallar igual, i el que ho va destapar va ser l'avís que havíem posat
nosaltres. Ara `utils.js` (i `captura-risc.js`, que llegeix la clau pel seu compte) fa
`.replace(/\s+/g, '')`: **cap clau de Supabase conté espais**, o sigui que treure'ls tots és segur.
L'avís es manté i diu que ja s'han tret, perquè el codi no ha d'amagar que el secret està mal desat.

**10. El nom d'una taula de Supabase distingeix majúscules.** PostgREST busca la relació pel nom
exacte: `taula_config_Alertes_SMP` no és `taula_config_alertes_smp` i dona **404**, no un error
visible. Va estar mesos així: la config de zones mai va arribar de Supabase (queia al `localStorage`
de cada dispositiu) i el que es guardava des de Configuració no anava enlloc. Totes les taules van
en minúscules; si n'afegeixes una, comprova-ho contra `information_schema.tables`.

**11. Una zona que no és al mapatge desapareix del càlcul sense dir res.** `calcularSMPPonderat`
tradueix la zona de Meteocat a grup amb `riscParams.zonesGrup` i, si el grup no té pes > 0, **salta
l'avís**. Una zona que no hi consti cau pel mateix forat: hi va estar **l'Empordà**, amb 941 avisos a
`smp_historic` que no han comptat mai. Les zones que fa servir l'SMP són les quinze de
`RISC_PARAMS_DEFAULT.zonesGrup` més les marítimes; per comprovar-ho, `select distinct zona from
smp_historic`. La franja de dades avisa dels dos casos (zona apagada per l'usuari, zona desconeguda
per l'app), i els paràmetres desats al `localStorage` es fusionen sempre amb el mapatge del codi: els
pesos són decisió de l'usuari, els noms de zona no.

**12. Un factor sense dades no pot semblar un factor a zero.** El risc es calcula amb el que hi ha
carregat: si l'SMP no ha arribat, val 0 i el número surt igual de tranquil que un dia sense avisos.
`estatFonts` registra, per a cada font (`FONTS_DADES`), si ha arribat, quan es va consultar l'origen
i per quin camí; la franja `#estat-dades` (sota les pestanyes, a totes les pestanyes) ho ensenya, i
`renderRisc` marca la targeta com a **INCOMPLET** i posa `SENSE DADES` a la línia del factor que
falta. Si hi afegeixes una font que entri al càlcul, posa-la a `FONTS_DADES` amb `factor: true` i
crida `marcarFont`/`marcarFontError` als dos camins de la seva càrrega — si no, tornarà a passar per
un 0 legítim. Els dies editats a mà (`modificatManualment`) no es marquen: els valors són de
l'usuari, no de la font.

**13. L'app es refresca sola: aquesta pantalla es queda oberta tot el dia.** Les dades es baixaven
només en obrir-la, o sigui que una pestanya deixada oberta al vespre ensenyava l'endemà els avisos
d'ahir amb la mateixa cara de bones (l'hora de la franja ho delatava, però calia mirar-la). Ara
`refrescarSiCal()` es dispara amb `visibilitychange`, amb `focus` i cada 5 min, i torna a baixar-ho
tot si fa més de `REFRESC_MINUTS` (15) de l'última descàrrega — `estatFonts[k].baixat`, que és quan
ho vam baixar, no la `dataConsulta` de l'origen. També refà les targetes si el dia ha canviat amb la
pestanya oberta. Si hi afegeixes una font, res a fer: va per `recarregarTotesLesDades()`.

**I també es refresca quan passa un ancoratge**, no només per rellotge. Amb els 15 minuts sols, una
pestanya que hagués baixat a les 10:40 no tornava a mirar fins a les 10:55 — o sigui que a les 10:50,
l'hora en què hem promès que hi serien, encara ensenyava les d'abans. `ANCORATGES_MADRID`
(`06:50 · 10:50 · 14:50 · 20:30`) i `hiHaDadesDAbansDelAncoratge()` ho tanquen: si l'última descàrrega
és anterior a l'últim ancoratge passat, es torna a baixar encara que faci dos minuts.

Es mira l'hora de **Madrid** amb `Intl`, no la del navegador: els ancoratges són els dels crons i el
dispositiu pot estar en un altre fus. Si l'`Intl` amb fus fallés, `ultimAncoratge()` torna `null` i
queda el refresc per rellotge de sempre. **Aquestes hores han de coincidir amb els jobs `ingesta-*`
de `pg_cron`**, que disparen uns minuts abans per deixar marge al runner i a GitHub Pages; si en
canvies unes, canvia les altres.

**11 ter. L'API diu quan va publicar cada avís: `dataEmisio`** (amb una sola `s`, tal com ve). Es
llençava sense mirar-la des del primer dia — `processarSMP` només agafava set camps i la resta ni
es miraven. Es va trobar el 16-09-2026 registrant al log els camps que no fem servir.

**Per què importa:** la nostra `data_consulta` diu quan vam preguntar, que depèn del nostre
calendari; `dataEmisio` diu **quan ho van publicar ells**. Sense això no es pot saber cada quant
s'actualitza l'SMP de veritat, i per tant no es pot decidir cada quant s'ha de consultar. Ara es
desa a `smp_historic.data_emisio` i a `risc_captures.meteocat_emissio` (columna que existia buida
des del principi justament perquè no sabíem d'on treure-la).

**Una emissió nova compta com a canvi** (`hasChanged`), encara que els avisos diguin exactament el
mateix: si Meteocat republica, això és precisament l'esdeveniment que volem tenir desat. Costa
alguna fila de més; recuperar el que no s'ha desat no es pot.

Les files anteriors al 16-09-2026 tenen la columna a `null`, i això no es recupera.

**11 bis. L'SMP de demà sortia 0 amb avisos ja publicats: la v1 només dona els episodis oberts.**
Baixem l'SMP de `https://api.meteo.cat/pronostic/v1/smp/episodis-oberts`. El 15-09-2026, a les 18:36
i a les 19:01 UTC —just després del butlletí de les 20:30 de Madrid—, l'API va respondre `[]`
(`📥 Meteocat SMP: 0 episodis, 0 avisos` al log) mentre el web de Meteocat ja tenia avisos formals
per a l'endemà. L'endemà al matí l'episodi era obert i en van arribar 8, amb taronges. El risc del
16-09 va passar de **0** (previst el 15 al vespre) a **4** (mesurat el 16 al migdia).

**Compte amb com es llegeix això.** És **una sola observació**, i no s'ha de convertir en una llei:

- El 15-09 va ser el **primer dia** que miràvem just després del butlletí del vespre. Fins llavors
  les passades eren gairebé totes de matí: a tot l'històric d'`smp_historic` hi ha **una** consulta
  a les 18 h UTC, contra 102 a les 5 h. No teníem el costum de mirar-hi, o sigui que no en sabíem res.
- Per això **no serveix** l'argument que semblava fort: «de les 3.504 files amb `dia` posterior al de
  la consulta, totes venien d'un episodi ja obert». Gairebé totes aquelles consultes eren de matí,
  quan l'episodi ja sol estar obert. El biaix de mostreig se les menja.
- I els 39 dies que vam veure «amb el dia ja començat» tampoc no ho demostren: 27 es van veure a les
  05 h UTC, la primera passada del dia. No vol dir que Meteocat no ho tingués la vigília; vol dir
  que no ho vam demanar.

El que **sí** que està descartat és que sigui cosa nostra: no és el filtre per estat
(`ESTATS_QUE_COMPTEN` registra al log tot el que descarta, i aquell dia no descartava res) ni el
mapatge de zones. La resposta era `[]` de debò.

**RESOLT el 17-09-2026, i era sistemàtic.** No calien setmanes: es va poder preguntar directament.
Aquell dia, a les 15:28 de Madrid, amb meteo.cat ensenyant avisos per al Barcelonès de l'endemà:

| Endpoint | Resposta |
| --- | --- |
| `/pronostic/v1/smp/episodis-oberts` (el d'abans) | **`[]`** |
| `/pronostic/v2/smp/episodis-oberts?data=2026-09-17` | `[]` |
| **`/pronostic/v2/smp/episodis-oberts?data=2026-09-18`** | **1 episodi obert, 1 avís vigent, emès a les 09:44** |

La v1 torna **només els episodis ja començats**, i un avís publicat avui per a demà pertany a un
episodi que encara no ha començat. No era cap excepció del 15-09: passa cada vegada. L'avís d'aquell
dia el teníem a l'abast des de les 09:44 del matí i no el vam demanar mai.

**El format de la v2 és el mateix** i `processarSMP` ja el sabia llegir (`evolucions`, `idComarca`,
`perill`, `meteor.nom`), o sigui que el canvi va ser només d'on es baixa: ara `baixarEpisodis()` fa
**tres consultes** —v1, v2 amb la data d'avui i v2 amb la de demà— i n'ajunta els episodis.
`fusionarAvisos()` uneix els dies del mateix avís perquè un episodi de dos dies no escrigui les files
repetides a `smp_historic`. **La v1 s'hi manté a posta**: no està demostrat que la v2 amb data d'avui
en sigui un superconjunt (el dia de la prova totes dues tornaven buit), i perdre els avisos d'avui
per guanyar els de demà seria un mal canvi.

**I la quota va deixar de ser una incògnita**: `https://api.meteo.cat/quotes/v1/consum-actual` diu
pla `Prediccio_20000`, **20.000 consultes al mes**, amb 439 fetes el 17-09. Vuit consultes al dia no
són res: el que bloquejava mirar-hi més sovint no era la quota, era no saber-la. Si algun dia cal
consultar cada hora amb episodis oberts, hi cap de sobres.

La sonda que ho va resoldre es queda al repositori: `scripts/provar-smp-endpoints.js` (Actions →
«Provar endpoints SMP»). No escriu res enlloc i serveix per tornar-hi el dia que l'API canviï.

**14. La targeta del risc recalcula els dies en viu al moment de pintar.** `renderRisc` no llegeix
`dia.smp` del `localStorage` per a avui i demà: crida `calcularValorsAuto(dia.data)` i el refà, que és
el que la pestanya Alertes ha fet sempre. Mentre no ho feia, la portada podia ensenyar un 0 amb la
pestanya marcant 4: n'hi havia prou que el càlcul d'`actualitzarRiscAuto` petés a mig camí —cosa que
avortava la funció **abans de desar**, i en silenci, perquè ningú espera aquella promesa— i la targeta
es quedava amb el valor d'una càrrega anterior. Ara els dos llocs surten del mateix càlcul i no poden
dir coses diferents; els dies editats a mà i «ahir» no es toquen. Si el càlcul peta, es diu a la
franja de dades (`errorCalculRisc`) en comptes de deixar un número vell amb bona cara.

**15. `actualitzarRiscAuto` desa i pinta ABANS d'esperar l'operativitat.** L'ordre no és casual.
L'operativitat va a Supabase i a Open-Meteo, i mentre no tornava, l'SMP i les allaus del dia es
quedaven només a la memòria: la targeta ensenyava el valor vell i `renderRisc()` —que rellegeix el
`localStorage` a `carregarRiscEstat`— el llençava al primer redibuix. Sortia un SMP 0 a la portada
amb un 2 a la pestanya Alertes. Si hi afegeixes factors nous, posa'ls **abans** del primer
`desarIPintarRisc()`, i deixa després només el que depengui de la xarxa.

**16. `actualitzarRiscAuto` no fa res si `riscState` encara no existeix.** La primera línia és
`if (!riscState.today && !riscState.tomorrow) return;`, i `riscState` no es carrega fins que
`renderRisc` crida `carregarRiscEstat` — o sigui **després** que torni la config de Supabase. Els
JSON del disc arriben abans, i totes les crides que fan en carregar-se queien en va. Els factors
sincrònics no ho notaven (`renderRisc` els refà al moment de pintar, vegeu 13), però
**l'operativitat dels helis sí**: és asíncrona i ningú la tornava a demanar, o sigui que la targeta
es quedava amb «sense dades» tota la sessió. Per això l'arrencada acaba amb un `actualitzarRiscAuto()`
dins del `.then()` de `carregarRiscConfig`. Si hi afegeixes un factor asíncron, no confiïs que una
càrrega de dades el demanarà.

**17. Cap promesa de Supabase pot anar sense sostre de temps.** El client (`sbClient`) no accepta
timeout: si la consulta no torna, la promesa **no es resol mai**, no llança res i s'emporta en
silenci tot el que l'esperava. Va deixar la pàgina sense targeta de risc (l'arrencada espera
`carregarRiscConfig`) i l'operativitat penjada per sempre a `operativitatCache`. Fes-les servir amb
**`ambSostre(promesa, ms, etiqueta)`**, i quan salti, treu l'entrada de qualsevol cau —si no,
l'error queda memoritzat— i **digues-ho** (`errorOperativitat` a la targeta i a la franja de dades):
un factor que no ha arribat no pot semblar un factor a zero.

**18. Les captures del risc són append-only i no substitueixen `risc_historic`.** `risc_historic`
té `UNIQUE (data)` i s'escriu a sobre: al final del dia només queda l'última foto i no es pot saber
com hi ha arribat. `risc_captures` desa, **quatre vegades al dia**, el risc d'avui i de demà amb el
desglossament sencer, els factors, l'SMP Bombers i la fórmula amb què es va calcular. **Cap fila no
es toca mai**; el `UNIQUE (dia_captura, franja, horitzo)` hi és perquè un reintent completi la
mateixa fila i no en creï una de nova. Ho fa `scripts/captura-risc.js`, que **no** calcula res pel
seu compte: tot surt de `formula-risc.js`. Vegeu `PLA-CAPTURES.md`.

**Les franges són quatre i els talls de `diaIFranja()` han d'aïllar-les.** `matinada` · `mati` ·
`migdia` · `vespre`, una per ancoratge (06:50 · 10:50 · 14:50 · 20:30). Quan n'hi havia tres, el tall
del matí era `hora < 11`: afegir-hi la captura de les 06:50 hauria fet que les dues primeres del dia
caiguessin totes dues a `mati` i, amb el `UNIQUE (dia_captura, franja, horitzo)`, **la segona hauria
esborrat la primera sense dir res**. Els noms de les tres velles es mantenen perquè les files ja
desades continuïn volent dir el mateix.

**La llista de franges viu a tres llocs i s'han de canviar tots tres alhora:**

| On | Què passa si no hi consta |
| --- | --- |
| `diaIFranja()` a `scripts/captura-risc.js` | la captura cau a la franja del costat i el `UNIQUE` n'esborra una |
| `FRANGES_CAPTURA` a l'`index.html` (mateix ordre: és el de les columnes) | aquella captura no troba columna a l'historial |
| El `check risc_captures_franja_valida` a Supabase | **la captura peta amb 23514 i el risc no es desa** |

El tercer és el que es va oblidar el 17-09-2026: amb els altres dos ja fets, la primera captura de
`matinada` va morir amb `violates check constraint "risc_captures_franja_valida"` i aquella foto es
va perdre. El SQL per arreglar-ho és a `PLA-CAPTURES.md` §3. Es veu de seguida perquè el workflow
queda en vermell — però només si algú mira Actions.

**L'historial les ensenya totes vuit en una sola taula.** Quatre columnes de la vigília (horitzó
`dema`) i quatre del mateix dia (horitzó `avui`), en ordre, perquè l'evolució es llegeixi d'esquerra
a dreta. Les franges sense captura hi surten buides a posta: si s'amaguessin, un dia amb tres
captures es veuria igual que un dia amb quatre. Sota el valor de cada factor hi va **el que aquell
factor suma de veritat** (`aportacioFactor`), perquè cap factor no suma el seu valor tal qual i sense
dir-ho la taula enganya: unes allaus a «1/5» semblen sumar 1 quan en sumen 0.

**La captura desa també els interruptors de temporada** (`desglossament.allausDesactivat` i
`.boletairesActiu`). Sense això, una captura amb `allaus: 1` no es distingeix d'un dia amb
l'interruptor posat —que donaria 0— i l'historial ensenyava «1/5» sense poder dir si allò comptava.
Les captures anteriors al 17-09-2026 no en porten constància i es llegeixen com a actives, que és el
que el backend feia llavors.

**Les hores no les mana `captura-risc.yml`.** Els seus crons són la reserva; qui les dispara a
l'hora és Supabase (`pg_cron` + `pg_net` → `workflow_dispatch`), perquè un `dispatch` per API
arrenca de seguida i un cron de GitHub no (trampa 8). Si un dia les captures deixen d'arribar a
l'hora, mira `select * from cron.job_run_details order by start_time desc` abans de tocar el
workflow.

**Els ancoratges van darrere de l'emissió, no davant.** Les hores es van posar a 08:15 / 12:30 /
20:30 suposant que eren les de Meteocat. Amb `dataEmisio` desat (trampa 11 ter) es va poder mirar, i
les emissions reals cauen en **dues** finestres: **09:30–10:30** i **17:20–19:00** de Madrid. La del
matí, doncs, preguntava **dues hores abans** que publiquessin: sempre agafava el butlletí del dia
abans i cremava els 30 minuts sencers de reintents. Moguda a les **10:50**, que és l'ancoratge de la
ingesta del matí: les captures van a les mateixes hores que les passades de dades (06:50 · 10:50 ·
14:50 · 20:30) perquè capturin el que s'acaba de baixar i no el de la passada d'abans.

La del vespre es queda a les **20:30** a posta: per a una captura, **anar tard no fa mal i anar
d'hora sí**. Amb les emissions arribant fins a les 18:53, ancorar a les 19:15 deixaria vint minuts de
marge i un dia que publiquessin més tard el perdríem. Si algun dia mous aquestes hores, mira primer
`select distinct data_emisio at time zone 'Europe/Madrid' from smp_historic order by 1 desc`.

**Una font caiguda no pot passar per una font a zero.** Els `fetch-*.js` es criden de manera que un
error no aturi la captura, però els noms dels que han fallat van a **`FONTS_KO`** i `captura-risc.js`
els marca (`fonts_estat[x].ha_fallat`) i posa `dades_completes` a fals. Abans era un `|| true` pelat:
l'error es descartava, la captura llegia el JSON vell del disc i el desava com si fos d'ara — i
`hi_es` no ho delatava, perquè val `!!smp` i el fitxer sempre hi és. Cada font desa també
`edat_min`, els minuts que fa que es va consultar l'origen.

**19. La configuració ja no és de cada navegador: mana Supabase.** La fórmula, l'interruptor
d'allaus, els llindars dels helis i la temporada de boletaires es desen a
`taula_config_alertes_smp` (`formula`, `formula_versio`, `allaus_desactivat`, `op_config`,
`boletaires_actiu`) i el `localStorage` només és la reserva quan Supabase no respon. **És
imprescindible per a les captures**: si el backend calculés amb els valors per defecte mentre el
navegador en té d'editats, el risc desat no seria el que es veu. Si afegeixes un paràmetre nou que
entri al càlcul, ha d'anar a Supabase, no només al navegador.

**I el camí de pujada és tan necessari com el de baixada.** Quan la config va passar a Supabase es va
escriure només la baixada: el que ja hi havia desat al `localStorage` no hi va pujar mai i les
columnes es van quedar a `null`. És exactament el cas que la trampa volia evitar, però al revés i
sense veure's — la pantalla calculant amb la config bona i el backend amb els valors per defecte. Va
passar amb l'interruptor d'allaus: apagat al navegador des de l'estiu, `allaus_desactivat` a `null`,
i les captures desant `allaus: 1` amb el perill de la primavera congelat al `bpa_latest.json`.

Ara `migrarConfigCapAmunt(data)` puja, en carregar la config, el que compleix **dues** condicions: que
a Supabase el camp sigui `null` **i** que aquest dispositiu tingui la preferència desada de veritat al
`localStorage`. La segona no és un detall: sense ella, el primer navegador que obrís l'app pujaria els
valors per defecte i taparia per sempre la preferència del company que sí que l'havia posada, i amb la
fórmula congelaria a Supabase uns punts per defecte que després no es podrien canviar des del codi. Un
dispositiu que no té res a dir, no diu res. L'excepció és una `formula` amb una `formula_versio` que
no és la d'ara — aquesta banda la llença per versió, però el backend la llegeix igualment i calcularia
amb uns punts que aquí ja no volen dir el mateix. Si la pujada falla, es diu a la franja de dades
(`configDivergent`): mentre duri, el risc desat no és el que es veu.

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
- **`data/*.json`**: els commiteja el workflow. No els editis a mà. I **els commiteja per
  `scripts/commit-dades.sh`**, no amb `git push` a pèl: hi ha dos workflows que escriuen a `data/`
  («Dades diàries GRAE» i «Captura del risc») i es solapen sovint, perquè la captura reintenta fins
  a mitja hora. Són instantànies regenerables, o sigui que **no es rebasen mai** —un `pull --rebase`
  els dona per fusionables i acaba en conflicte als quatre alhora, com el 15-09-2026—: mana el més
  nou, que és qui empeny l'últim. Si hi afegeixes un workflow que escrigui a `data/`, crida el
  mateix script.

## Comprovacions abans de donar per bona una feina

No hi ha tests ni linter. Com a mínim:

```bash
node --check scripts/<fitxer>.js     # sintaxi dels scripts
python3 -m http.server 8000          # i obrir l'app; mirar la consola del navegador
```

L'app s'ha de servir per HTTP: amb `file://` els GeoJSON del mapa no carreguen.
