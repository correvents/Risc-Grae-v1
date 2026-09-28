# Diari del projecte

Registre cronològic de què s'ha fet i per què. **El més recent, a dalt.**

Com que cada sessió de Claude Code arrenca sense memòria, aquest fitxer és el que permet reprendre la feina on es va deixar. En acabar una sessió, afegeix-hi una entrada.

Format d'una entrada: data, què s'ha fet, per què, i què queda pendent.

---

## 2026-09-17 — El Maresme sortia com a «Costa Brava»

Preguntat mirant la pestanya Alertes: *«Costa Brava té alertes demà?»*. **No.** L'avís del 18-09 és
per al Baix Llobregat, el Baix Penedès, el Barcelonès, el Garraf i el **Maresme**, i cap és de la
Costa Brava.

El que passava: la fila de la taula no ensenya la zona de Meteocat sinó un **grup**, i el grup que
es diu «Costa Brava» conté també la zona «Litoral Nord», que és on Meteocat posa el Maresme. Llegint
la taula semblava que l'avís fos a Girona quan era al Maresme.

**Per què no s'ha mogut la zona sencera.** «Litoral Nord» són dues comarques: **21 Maresme + 34
Selva**. Moure la zona hauria arrossegat la Selva, que sí que és Costa Brava (Blanes, Lloret,
Tossa): canviàvem un error de nom per un altre. Per això l'excepció va **per comarca**,
`comarquesGrup = { 21: 'Litoral Central' }`, i es consulta **abans** que la zona.

Tot passa ara per **`grupDeZona(zona, comarca, params)`**, a `formula-risc.js`, que fan servir els
dos costats. Hi havia **quatre** llocs que resolien el grup pel seu compte; ara no en queda cap.

**Afecta el número de l'SMP, i s'ha de saber.** El factor compta **grups amb avís**, no comarques:
1–2 grups → SMP 1, 3 o més → SMP 2. Ajuntar el Maresme amb el Litoral Central vol dir un grup menys
en els dies que toquin tots dos. Demà no canvia res (de 2 grups a 1, i tots dos donen SMP 1), però
un dia amb avís al Maresme, al Barcelonès i a l'Empordà passaria de SMP 2 a SMP 1.

### Tres sistemes, no dos

Apuntat perquè és el que fa que això s'entengui i no es dedueix del codi:

| | Agrupa per | Per a què |
| --- | --- | --- |
| Alertes + factor SMP | zones de Meteocat → **grups orogràfics** | quants àmbits tenen avís |
| SMP Bombers | comarca → **regió d'emergència** | quina regió queda tocada |

Comprovat amb les dades reals de demà que **l'SMP Bombers no s'ha mogut gens**: continua donant
Metropolitana Sud (3 de 5 comarques, llindar 3). El Maresme, allà, va a Metropolitana Nord i no
arriba al llindar (1 de 3, en calen 2) — com abans del canvi.

**I una tercera cosa que es va veure pel camí:** els dos mapatges orogràfics **no diuen el mateix**.
La fórmula fa 8 grups (Empordà i Gironès dins de «Costa Brava») i l'`index.html` en fa 9 (a part).
No és cap error —un pondera i l'altre dibuixa una taula— però convé saber-ho abans de comparar-los.

**Pendent:** la targeta d'«ahir» i el pla B sense JSON llegeixen d'`smp_historic`, que guarda les
files **per zona**: per aquells dos camins el Maresme continua caient a «Costa Brava». Arreglar-ho
demana desar la comarca a les files, i això toca l'esquema.

## 2026-09-17 — Les allaus sortien «1/5» sense butlletí: un `|| 1` que convertia el 0 en 1

Reportat mirant la taula nova de l'historial: *«la fila allaus està desactivada ara, hauria de
sortir —, i surt 1/5»*.

La primera hipòtesi era que l'interruptor no havia arribat a Supabase. **No era això.** Mirant el
`bpa_latest.json` d'aquell moment:

```json
"resum": { "perill_maxim": "Desconegut", "perill_maxim_numeric": 0 }
```

I a `formula-risc.js`:

```js
const perillMax = dades.bpa.resum.perill_maxim_numeric || 1;   // ← el 0 es torna 1
```

Fora de temporada l'ICGC **no publica butlletí**: el resum arriba amb `Desconegut` i `0`, i aquell
`|| 1` ho convertia en un 1. La pantalla i les captures ensenyaven «1/5» com si hi hagués perill
feble **mesurat**, quan el que passa és que no n'hi ha cap. És la trampa 12 al revés: un factor
sense dades no pot semblar un factor a 1, igual que no pot semblar un factor a 0.

O sigui que l'interruptor d'allaus, fins ara, tapava un bug en comptes d'un problema de dades: el
que arreglava no era «el perill de la primavera congelat», sinó aquest `|| 1`.

**El número del risc no en canvia.** A l'escala de perill, tant el 0 com l'1 valen 0 punts
(`allaus.punts` va `{1:0, 2:0, 3:2, 4:4, 5:5}`). Comprovat cas per cas:

| | allaus | risc |
| --- | --- | --- |
| BPA sense butlletí (avui) | **0** (abans 1) | 0 |
| BPA sense butlletí + interruptor | 0 | 0 |
| BPA amb perill 3 | 3 | 2 |
| BPA amb perill 3 + interruptor | 0 | 0 |
| Sense cap dada de BPA | 0 | 0 |

Només canvia que el que es veu és el que hi ha.

**El `?v=` de `formula-risc.js` puja a 7.** El fitxer es carrega amb `<script src="formula-risc.js?v=…">`
i sense pujar-lo el navegador serveix el de la memòria cau: el canvi no es veuria. Si tornes a tocar
`formula-risc.js`, puja'l.

**Pendent:** les captures ja desades porten `allaus: 1` i no es reescriuen — són fotos. A partir
d'ara desaran 0.

## 2026-09-17 — Resolta la trampa 11 bis: era l'endpoint, i hi ha una v2 amb data

Reportat: meteo.cat dona avisos per al **Barcelonès de demà** i l'SMP Bombers de la web surt en
blanc.

**No era la web.** Una passada de dades llançada a mà a les 15:23 de Madrid:

```
📥 Meteocat SMP: 0 episodis, 0 avisos.
```

Zero. Res descartat per estat ni per zona: l'API no ens donava **res**. Amb 0 avisos, l'SMP Bombers
no té què pintar i la pantalla feia el que havia de fer.

**Era l'endpoint, i ara està demostrat.** Fem servir `/pronostic/v1/smp/episodis-oberts`, que només
torna els episodis **ja oberts**. Un avís publicat avui per a demà pertany a un episodi que encara
no ha començat i no hi surt. La trampa 11 bis deia, amb raó, que una sola observació no feia una
llei; ara ja n'hi ha **tres** (15-09 dues vegades, 17-09 una) i, sobretot, hi ha la prova directa.

`scripts/provar-smp-endpoints.js` (sonda manual, no escriu res) demana els quatre camins alhora:

| Endpoint | 17-09 a les 15:28 de Madrid |
| --- | --- |
| v1 `episodis-oberts` | **0 elements** |
| v2 `episodis-oberts?data=2026-09-17` | 0 elements |
| **v2 `episodis-oberts?data=2026-09-18`** | **1 episodi obert · 1 avís vigent · emès a les 09:44** |
| v1 `episodis-oberts/preavisos` | `[]` |
| `quotes/v1/consum-actual` | **20.000/mes, 439 fetes, 19.561 lliures** |

L'avís de demà el tenien publicat des de les **09:44 del matí**. El teníem a l'abast sis hores i no
el vam demanar mai.

**I la quota deixa de ser una incògnita**: pla `Prediccio_20000`, vint mil consultes al mes. En
gastem unes desenes al dia. La idea de consultar cada hora amb episodis oberts no té cap problema
de quota; el que la bloquejava era no saber-ho.

### Però la v2 no és un canvi de dues lletres

L'estructura és una altra, i toca el moll de l'os:

| v1 (el que llegeix `processarSMP`) | v2 |
| --- | --- |
| `avisos[].dies[]` | `avisos[].**evolucions**[]` |
| l'afectació porta `periodes[]` | **el període porta `afectacions[]`** (niuat a l'inrevés) |
| `afectacio.comarca` | `afectacio.**idComarca**` |
| `afectacio.nivell` = `"Groc"` | `nivell` = **`1`** (número) |
| `avis.meteor` = text | `episodi.meteor` = **`{ nom }`** |
| `afectacio.grauPerill` | `afectacio.**perill**` |
| `dia` = `"2026-09-18"` | `dia` = `"2026-09-18T00:00Z"` |
| **`afectacio.zona`** | **no hi és** |

L'última fila és la important. `ponderarSMP` —el factor SMP del risc— pondera **per zona**
(`riscParams.zonesGrup`, les quinze zones de muntanya, amb els pesos que l'usuari edita a
Configuració → Alertes SMP). La v2 no dona zones: només comarques. O sigui que:

- **L'SMP Bombers no té cap problema**: `matriuRiscComarques` ja treballa per comarca. Només cal
  llegir `idComarca` i el niuat nou.
- **El factor SMP del risc sí**: sense noms de zona, s'ha de decidir com es pondera. O es fa un
  mapatge comarca → zona, o els pesos passen a ser per comarca (i llavors la pantalla de
  Configuració canvia).

### Rectificació: el port era molt més petit del que vaig dir

Vaig llegir malament. La taula de diferències de dalt compara la v2 amb l'**estructura interna**
que produeix `processarSMP`, no amb la resposta crua de la v1. Mirant el codi de debò:
`processarSMP` **ja llegia la forma de la v2** —`avis.evolucions`, `ev.periodes[].afectacions[]`,
`af.idComarca`, `af.perill`, `episodi.meteor.nom`— i `fetch-smp.js` **ja portava la taula
`COMARCA_A_ZONA`**, idèntica a la que havia extret de Supabase. La v1 i la v2 tornen el mateix
format: el que canvia és **quins episodis**.

O sigui que no calia decidir res sobre la ponderació, ni tocar la fórmula, ni la pantalla de
Configuració, ni l'històric. Només d'on es baixa.

### El canvi, que és de deu línies

`baixarEpisodis()` fa **tres consultes** en comptes d'una: la v1 de sempre, la v2 amb la data
d'avui i la v2 amb la de demà. Els episodis s'ajunten i `fusionarAvisos()` uneix els dies del
mateix avís, perquè un episodi de dos dies surt a més d'una resposta i sense això escriuria les
files repetides a `smp_historic`.

**La v1 s'hi queda a posta.** No està demostrat que la v2 amb data d'avui en sigui un
superconjunt: el dia de la prova totes dues tornaven buit, o sigui que la comparació no deia res.
Perdre els avisos d'avui per guanyar els de demà seria un mal canvi.

I com que passar d'una consulta a tres triplica les possibilitats que una fallada passatgera
s'emporti la passada sencera, cada consulta té **un reintent**. Si després continua fallant, peta:
no es desa mitja foto com si fos bona.

**Provat** amb la resposta v2 real d'aquell dia:

| | |
| --- | --- |
| v1 i v2-avui buides, v2-demà amb l'avís | l'avís passa (**és el cas d'avui**) |
| el mateix episodi a dues respostes | es dedupeix, no es repeteix cap fila |
| tot buit | 0 avisos, sense petar |
| una consulta que falla i es recupera | el reintent la salva |
| una consulta que falla sempre | peta, com ha de fer |

I la cadena sencera, amb l'avís de demà: **factor SMP 1** (abans 0), **SMP Bombers → Metropolitana
Sud 06-12**, i el **Barcelonès pintat** al mapa amb el Baix Llobregat, el Baix Penedès, el Garraf i
el Maresme. Cap zona descartada ni desconeguda.

**Pendent:** veure-ho córrer de debò a la pròxima passada.

## 2026-09-17 — La primera captura de `matinada` va petar: la llista de franges viu a tres llocs

Primera matinada amb el règim nou. Els crons de Supabase, impecables — **al segon**:

| job | ha disparat |
| --- | --- |
| `ingesta-matinada-estiu` | 04:45:00 UTC |
| `captura-matinada-estiu` | 04:50:00 UTC |
| `ingesta-mati-estiu` | 08:40:00 UTC |
| `captura-mati-estiu` | 08:50:00 UTC |

**I la captura del matí ja no crema mitja hora**: 26 segons (08:50:01 → 08:50:27), sense cap
`⏳ Meteocat encara no ha actualitzat`. La d'ahir al migdia, amb l'ancoratge vell, va durar **32
minuts**. Era el motiu de moure l'ancoratge del matí darrere de l'emissió.

**Però la captura de `matinada` va fallar.** Codi 23514:

```
new row for relation "risc_captures" violates check constraint "risc_captures_franja_valida"
```

La taula porta un `check (franja in ('mati','migdia','vespre','extra'))` des que es va crear. Vaig
canviar `diaIFranja()` i `FRANGES_CAPTURA` i **no la restricció**: la llista de franges viu a tres
llocs i només en vaig tocar dos. La captura de les 06:50 del 17-09 s'ha perdut.

Restricció arreglada (accepta `matinada`) i apuntada als tres llocs al `CLAUDE.md` i a
`PLA-CAPTURES.md`. **No es recupera la captura perduda**: un reintent ara desaria les dades de les
11 h amb l'etiqueta `matinada`, que és justament la mentida que el `capturat_at` explícit va venir a
tancar. A la taula nova de l'historial hi sortirà com una columna buida, que és el que ha de fer.

Val la pena veure com es va detectar: el workflow **va quedar en vermell**. Si l'error hagués anat
per un camí amb `continue-on-error`, ningú se n'hauria assabentat.

### Les emissions del vespre: ara sí que hi ha números

`data_emisio`, hora de Madrid, del 16-09:

```
10:27 · 10:29 · 17:27 · 18:26 · 18:32 · 20:20 · 20:30 · 21:12 · 21:34 · 21:43 · 22:19
```

La captura del vespre va fer servir l'emissió de les **20:20** — i després en van venir **cinc més**,
l'última a les **22:19**. O sigui que l'ancoratge de les 20:30 no va tard: va **d'hora**, i es perd
sistemàticament la cua del vespre.

El 15-09 la cua s'acabava a les 18:53, o sigui que són dos dies molt diferents i encara no hi ha
prou mostra per decidir l'hora nova. Però la direcció ja no és dubtosa. **Candidat: moure la captura
del vespre a les 22:45**, o afegir-ne una de tardana i deixar la de les 20:30. És decisió teva.

**Pendent:** decidir l'hora de la captura del vespre amb una setmana de `data_emisio`.

## 2026-09-17 — Quatre captures, vuit columnes, i la config que no havia pujat mai

Demanat: veure a l'Historial **les quatre prediccions de la vigília i les quatre del mateix dia en
columnes consecutives**, saber **què suma cada factor** a més del seu valor, i entendre per què les
allaus hi surten a «1/5» si estan desactivades.

### 1. Quatre captures al dia

Hi havia tres franges (`mati`, `migdia`, `vespre`) i quatre ancoratges d'ingesta. Les captures
anaven per lliure a 10:45 i 20:30, o sigui que les vuit columnes no existien: com a molt sis.

Ara hi ha **quatre jobs de captura per temporada**, cadascun **10 minuts darrere de la seva
ingesta** (06:50 · 10:50 · 14:50 · 20:30 de Madrid), perquè capturi el que s'acaba de baixar. Els
jobs de `pg_cron` passen de catorze a **setze**.

**El parany, trobat abans de publicar-ho.** El tall de franja del matí era `hora < 11`: afegir-hi la
captura de les 06:50 hauria fet que les dues primeres del dia caiguessin totes dues a `mati` i, amb
el `UNIQUE (dia_captura, franja, horitzo)`, **la segona hauria esborrat la primera sense dir res**.
Els talls de `diaIFranja()` es van refer per aïllar cada ancoratge i la franja nova és `matinada`.
Els tres noms vells es mantenen perquè les files ja desades continuïn volent dir el mateix.

### 2. Les vuit prediccions en una taula

L'historial tenia **tres taules** —el mateix dia, l'endemà, el dia abans— i per veure l'evolució
calia saltar d'una a l'altra i quadrar hores pel cap. Ara n'hi ha **una de vuit columnes**: quatre de
la vigília (horitzó `dema`) i quatre del mateix dia (horitzó `avui`), en ordre, amb capçalera de dos
pisos i les fletxes de canvi entre columna i columna.

Les franges **sense captura hi surten buides a posta**. Si s'amaguessin, un dia amb tres captures es
veuria igual que un dia amb quatre, i justament el que volem saber és si alguna no s'ha fet.

També es poden **obrir en detall les vuit**. Abans el selector només oferia les d'horitzó `avui`: el
que s'havia dit la vigília es veia a la taula però no es podia desplegar.

Retirats `blocPrevisio` (la fila de xips, que ara és la taula mateixa), `blocHoritzo` i
`blocSMPBombers`, que ja no cridava ningú.

### 3. Què suma cada factor

Sota el valor de cada factor hi va ara **el que aquell factor suma de veritat** al risc.

No és cosmètic: cap factor no suma el seu valor tal qual, i sense dir-ho la taula enganya. Unes
allaus a «1/5» semblen sumar 1 quan en sumen **0** —el nivell 1 val 0 a l'escala de perill—, i l'SMP
i les allaus competeixen pel perill dominant, de manera que el segon només hi posa un suplement.
Quan els increments topen al màxim, la suma de la columna no dona el risc: també es diu.

### 4. El motiu de debò de l'«1/5»: la config no havia pujat mai a Supabase

Mirat a la taula:

```
allaus_desactivat = null · formula = null · formula_versio = null · op_config = null
```

Quan la configuració va passar del `localStorage` a Supabase (trampa 19) es va escriure **només el
camí de baixada**. El que ja hi havia desat als navegadors no hi va pujar mai i les columnes es van
quedar a `null`. El resultat és el pitjor possible perquè no es veu: **la pantalla calculava amb la
config bona i el backend de les captures, que només llegeix Supabase, amb els valors per defecte**.
Dos números diferents per al mateix dia, que és exactament el que les captures havien de resoldre.

Amb l'interruptor d'allaus es veia a la cara: apagat al navegador, `null` a Supabase, i les captures
desant `allaus: 1` amb el perill de la primavera congelat al `bpa_latest.json`.

**`migrarConfigCapAmunt(data)`** ho puja en carregar la config, amb dues condicions alhora: que a
Supabase el camp sigui `null` **i** que aquest dispositiu tingui la preferència desada de veritat.
La segona no és un detall — sense ella, el primer navegador que obrís l'app pujaria els valors per
defecte i taparia per sempre la preferència del company que sí que l'havia posada. Un dispositiu que
no té res a dir, no diu res. Si la pujada falla, **es diu a la franja de dades**: mentre duri, el
risc desat no és el que es veu.

I la captura desa ara els **interruptors de temporada** (`allausDesactivat`, `boletairesActiu`) dins
del desglossament, perquè una foto amb `allaus: 1` es pugui distingir d'un dia amb l'interruptor
posat. Les captures anteriors a avui no en porten constància i es llegeixen com a actives, que és el
que el backend feia llavors.

De passada, la franja de dades avisa també quan les **allaus estan desactivades**: feia exactament el
mateix que un factor desmarcat —posar el perill a 0— i només es veia entrant a Configuració.

**Pendent:** que algú obri l'app perquè la migració s'executi i les columnes deixin de ser `null`;
fins llavors les captures continuen calculant-se amb els valors per defecte. I l'emissió de les
**21:43** de Madrid del 16-09, que és després de l'ancoratge de la captura del vespre: amb una
setmana de `data_emisio` es podrà decidir si cal moure-la.

## 2026-09-16 — Neteja: els crons de GitHub ja no pintaven res

Preguntat: si els crons de Supabase serien millors. **Ja hi eren** —des d'aquell mateix matí— i ja
manaven. El que havia quedat brut és que **ningú havia tret els de GitHub**, i feien la mateixa
feina a hores aleatòries:

| workflow | crons de GitHub | dispatches de `pg_cron` | passades/dia |
| --- | --- | --- | --- |
| `data_diari` | 6 | 4 | **10** |
| `captura-risc` | 3 | 3 | **6** |

Setze passades al dia on en calien set, i les de GitHub arribant de 2 a 7 hores tard, sense servir
per a cap hora. A sobre, cada captura de reserva podia cremar mitja hora de reintents i sis
consultes a Meteocat.

**En queda un per workflow**, com a xarxa de seguretat: si el `pg_cron` caigués (projecte pausat,
secret del Vault caducat, `pg_net` trencat), garanteixen una passada al dia — degradat, però viu — i
que només n'hi hagi una es veu de seguida a Actions.

**El guardat forçat diari passa a ser puntual.** El feia el cron de les 00:23 comparant la cadena
del cron al pas «Determinar force»; ara el dispara també la passada de matinada del `pg_cron`, amb
`{"inputs":{"force":"true"}}`. El cron de GitHub es manté com a reserva d'això mateix.

**I el reintent deixa de cremar mitja hora els dies tranquils.** El bucle esperava un butlletí nou
comparant empremtes, però **l'empremta d'una llista buida no canvia mai**: un dia sense cap avís
—que són la majoria— feia els sis intents sencers per res. Ara, si no hi ha cap avís, no hi ha res
a esperar i es captura de seguida.

### La finestra del vespre és molt més ampla del que s'havia escrit

Les emissions del 16-09, hora de Madrid: **10:27 · 10:29 · 20:20 · 21:43**.

Les dues últimes són **després** de la finestra que s'havia documentat al matí (17:20–19:00), i la
de les **21:43 cau més d'una hora després de l'ancoratge de la captura del vespre (20:30)**. O sigui
que aquella captura s'està perdent sistemàticament l'última actualització del dia.

No es toca encara —són dos dies de dades—, però és el primer candidat a canviar: o moure la captura
del vespre cap a les 22:15, o afegir-ne una de tardana. Amb una setmana de `data_emisio` es podrà
decidir amb números.

**Un camp més que veiem i no fem servir:** l'avís porta `perill` (número) al seu nivell, a més de
`llindar1` i `llindar2`. Nosaltres només llegim `perill` a dins de l'afectació. Queda apuntat per si
algun dia fa falta.

## 2026-09-16 — Hores garantides: 06:50, 10:50, 14:50 i 20:30

Demanat: que **a aquestes hores la web tingui les dades, amb certesa**. No una estimació: certesa.

**On era el coll d'ampolla.** No a la cau del navegador (els JSON ja porten `?t=`) ni a GitHub Pages:

| | |
| --- | --- |
| `data_diari.yml` | commiteja en ~25 s, però els seus crons són de GitHub → **2-7 h de retard** |
| `captura-risc.yml` | arrenca puntual, però **el commit va després del bucle de reintents** |

Mesurat aquell mateix matí: l'ancoratge era a les 06:15:14 i els JSON es van publicar a les
**06:46:21** — 31 minuts després.

**La solució no va ser un workflow nou.** `data_diari.yml` ja fa exactament el que cal; el que
estava malament era **qui el dispara**. Ara també el dispara `pg_cron` de Supabase, amb vuit jobs
`ingesta-*` (estiu i hivern) ancorats uns minuts abans de cada hora objectiu i escalonats respecte
de les captures.

**Provat en producció la mateixa nit:**

```
18:20:01  →  data_diari (dispatch de pg_cron)  →  18:20:28 publicat   (27 s)
18:30:01  →  captura                            →  18:30:31 desada    (30 s)
```

**Les tres peces de fiabilitat que hi van amb això:**

1. **El job ja no menteix quan una font cau.** Els cinc passos porten `continue-on-error` —hi són a
   posta— però deixaven la passada **en verd**. Ara cada pas té `id` i un pas final la tanca en
   vermell dient quines han fallat, després d'haver desat el que sí que ha arribat.
2. **La captura tampoc.** Els noms dels `fetch-*` fallats van per `FONTS_KO`, es marquen amb
   `ha_fallat` i la captura es desa com a **incompleta** (que l'Historial ja pinta). Cada font hi
   porta `edat_min`.
3. **L'app es refresca per ancoratge, no només per rellotge.** Amb els 15 minuts sols, una pestanya
   que hagués baixat a les 10:40 no tornava a mirar fins a les 10:55. `ANCORATGES_MADRID` +
   `hiHaDadesDAbansDelAncoratge()` fan que torni a baixar si la seva última descàrrega és anterior a
   l'últim ancoratge passat.

**Una dada nova que obliga a vigilar.** La captura del vespre va portar
`meteocat_emissio = 20:20 de Madrid` — **més tard que tota la finestra documentada** (17:20–19:00).
La captura de les 20:30 la va enganxar per deu minuts. O sigui que la finestra del vespre va com a
mínim de les 17:22 a les 20:20, i **l'ancoratge de les 20:30 té menys marge del que semblava**. Amb
una setmana de `data_emisio` es podrà decidir amb números si cal moure'l més tard.

**Què queda:**

- Vigilar si l'emissió del vespre passa de les 20:30 algun dia.
- Quan hi hagi episodi obert, valorar passar a consultar cada hora de 06 a 23.
- La quota de peticions del pla de Meteocat continua sent desconeguda.

## 2026-09-16 — Quan publica Meteocat de debò, i per què els ancoratges anaven malament

Demanat: mesurar cada quant s'actualitza l'SMP per decidir cada quant s'ha de consultar.

**La resposta no calia mesurar-la punxant més: ja la teníem i la llençàvem.** `processarSMP` agafava
set camps de l'API i la resta ni es miraven. Registrant al log els camps no usats va sortir a la
primera passada:

```
🔎 Camps de l'avis que no fem servir: tipus=<string>, dataEmisio="2026-09-15T16:53Z"
```

**`dataEmisio`** (amb una sola `s`) diu quan van publicar cada avís. Ara es desa a
`smp_historic.data_emisio` i a `risc_captures.meteocat_emissio`, que era buida des del primer dia
precisament perquè no sabíem d'on treure-la. De propina, com que els episodis oberts arrosseguen
avisos de dies enrere, **una sola consulta ja va recuperar tres dies d'emissions**:

| dia | emissions (Madrid) |
| --- | --- |
| dl 14 | 09:32 · 17:22 |
| dt 15 | 10:21 · 10:24 · **18:45 · 18:53** |
| dc 16 | 10:27 · 10:29 |

**Publiquen dues vegades al dia**, no tres: cap a les **09:30–10:30** i cap a les **17:20–19:00**.

**I això explica el que passava.** L'ancoratge del matí era a les 08:15 de Madrid: **dues hores
abans** que publiquessin. Cada matí agafava el butlletí del dia anterior, cremava els 30 minuts
sencers de reintents i acabava forçant la captura. Mogut a les **10:45**.

El del vespre **es queda a les 20:30**. Ho havia proposat moure a les 19:15 i era mala idea: les
emissions arriben fins a les 18:53, i per a una captura anar tard no fa mal mentre que anar d'hora
sí. Vint minuts de marge no són marge.

**I el 15-09 queda explicat amb hores:** les emissions d'aquell vespre van ser a les **18:45 i
18:53**, i la nostra consulta a les **20:36** va tornar `[]`. Els avisos ja estaven emesos i tot i
així no sortien a `episodis-oberts`. Això torna a apuntar cap a la primera hipòtesi (l'episodi no
estava obert), però ara amb marques de temps en comptes d'un argument de mostreig.

**Un forat trobat pel camí.** El workflow cridava els `fetch-*.js` amb `|| true`: si Meteocat
fallava, l'error es descartava, `captura-risc.js` llegia el JSON vell del disc i el desava com si
fos d'ara. I `fonts_estat.hi_es` no ho delatava, perquè val `!!smp` i el fitxer sempre hi és — la
trampa 12 dins del camí de les captures. Ara els noms dels que fallen van per `FONTS_KO`, es marquen
(`ha_fallat`) i la captura es desa com a **incompleta**. Cada font hi porta també `edat_min`.

**Què queda:**

- **Una setmana de `data_emisio`** per confirmar les dues finestres amb mostra gruixuda. Ara la
  consulta és d'una línia.
- **El forat del vespre per a la frescor**: l'emissió de les ~18:00 no arriba a la pantalla fins a
  la captura de les 20:30, perquè l'última ingesta del dia és a les ~16:17 de Madrid. Caldria una
  passada de dades cap a les 19:00, disparada per `pg_cron` com les captures.
- La quota de peticions del pla de Meteocat continua sent desconeguda.

## 2026-09-15 — Per què l'SMP de demà surt 0 amb avisos publicats: «episodis-oberts» vol dir això

Reportat: «a Meteocat ara donen molts avisos per demà i la web no els ha detectat». Confirmat que
eren **avisos SMP formals**, no la predicció general.

**No és cap error nostre.** El log de la passada de les 18:36 UTC diu `📥 Meteocat SMP: 0 episodis,
0 avisos`: l'API `pronostic/v1/smp/episodis-oberts` respon `[]`. I «oberts» vol dir el que sembla —
la documentació diu que retorna els episodis oberts i els avisos actius **que afecten el dia de la
consulta**. Un avís emès al vespre per a l'endemà, sense cap episodi obert avui, no hi surt.

Les dades pròpies ho confirmen. De les files d'`smp_historic` amb `dia` posterior al de la consulta:

| | consultes | files |
| --- | --- | --- |
| amb avisos també per al mateix dia | 177 | 2.940 |
| **sense** avisos per al mateix dia | 6 | 68 |

I els 6 casos sense són **tots `Ampliat`**: un episodi ja obert que s'allarga a un dia veí (p. ex.
consultant el 05-08, dies 04 i 06). **Cap avís de dia futur no ha vingut mai d'un episodi encara no
obert.** El patró aguanta les 3.504 files.

**Es va descartar pel camí** que fos el filtre per estat. `processarSMP` només es queda els avisos
`Vigent` i `Ampliat` i saltava la resta **en silenci** — era un candidat raonable, i ara el filtre
registra al log què descarta i per quin estat (`ESTATS_QUE_COMPTEN`). Va servir per descartar-ho en
una passada: no es descartava res, simplement no arribava res.

**Què queda per fer, i és el que importa:** mentre l'SMP surti d'`episodis-oberts`, **l'SMP de demà
és una cota inferior, no el valor de debò** — a la pantalla i a les captures. Per arreglar-ho cal un
altre camí de l'API (consulta d'episodi per codi, pre-alertes), i la documentació
(`apidocs.meteocat.gencat.cat`) no és accessible des del contenidor: s'ha de mirar des de fora.

També caldrà decidir com es diu a la pantalla, perquè ara mateix un 0 per manca d'episodi obert té
exactament la mateixa cara que un 0 de bon temps — que és justament el que la trampa 12 no vol.

**Confirmat l'endemà, i amb el preu mesurat.** El 16-09 l'episodi ja era obert i l'API va passar de
0 a **8 avisos**, amb taronges a mig país. Les captures ensenyen el que va costar la diferència, per
al **mateix dia objectiu** (16-09):

| quan es va calcular | risc | SMP |
| --- | --- | --- |
| 15-09 18:15 | 1 | 0 |
| 15-09 19:01 (vespre) | **0** | **0** |
| 16-09 04:56 (matí) | **3** | **3** |
| 16-09 10:30 (migdia) | **4** | **4** |

O sigui: **al vespre es donava un 0 per a un dia que va ser un 4**, i tot el salt és de l'SMP. Els
avisos ja eren públics; el que faltava era que l'episodi s'obrís. Això és el que cal tenir al cap
per decidir si val la pena anar a buscar l'altre camí de l'API: la previsió del vespre —que és la
que serveix per planificar l'endemà— és justament la que més se'n ressent.

I val la pena adonar-se que **això només es veu perquè les captures ja funcionaven**: amb
`risc_historic` sol hi hauria el 4 final i el 0 del vespre s'hauria perdut. És exactament per a
això que es van fer.

### Rectificació (16-09, més tard): la conclusió anava massa lluny

Es va escriure que l'API **no** dona els avisos fins que l'episodi s'obre, i això **no està
demostrat**. L'argument que semblava fort —«de les 3.504 files amb dia futur, totes venien d'un
episodi ja obert»— té un biaix de mostreig que se'l menja:

| hora UTC de la consulta | 05 | 06 | 08 | … | 16 | 17 | **18** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| consultes amb canvi | 102 | 32 | 43 | … | 5 | 3 | **1** |

**En tot l'històric hi ha una sola consulta a les 18 h UTC**, que és quan surt el butlletí de les
20:30 de Madrid. Gairebé tot el que tenim és de matí, quan l'episodi ja sol estar obert. I dels 39
dies vistos «amb el dia ja començat», 27 es van veure a les 05 h UTC: la primera passada del dia.
Cap dels dos fets diu res sobre què hi havia la vigília — diu que no ho miràvem.

O sigui que el que tenim és **una observació** (15-09, 18:36 i 19:01 UTC, `[]` amb avisos publicats),
no un patró. El que sí que queda descartat és que la culpa sigui nostra: ni el filtre per estat ni
el mapatge de zones; la resposta era buida de debò.

**Ara es resoldrà sol.** Amb una captura cada vespre, comparar l'horitzó `dema` del vespre amb
l'horitzó `avui` del matí següent dona la resposta en unes setmanes, sense haver de tocar res.

## 2026-09-15 — Ja hi ha captures de veritat: el secret portava un salt de línia enmig

**`risc_captures` ha deixat d'estar buida.** Les dues primeres files hi són:

```
2026-09-15 · extra · avui (15-09) → risc 0 · SMP 0 · allaus 1 · afluència 0 «Dia feiner» · HC 3/4 · canvi 0 · Plans PC 2
2026-09-15 · extra · dema (16-09) → risc 1 · SMP 0 · allaus 1 · afluència 0 «Dia feiner» · HC 3/4 · canvi 1 · Plans PC 2
```

amb `dades_completes = true`, `formula_versio = 6`, la fórmula sencera, el desglossament, el detall
dels quatre helis i l'SMP Bombers.

**Què ho bloquejava.** Tres errors encadenats, cadascun amagant el següent:

1. El workflow recollia `$?` **després d'un `if`**, o sigui l'estat de l'`if`: una captura fallada
   sortia verda. Arreglat abans.
2. El secret `SUPABASE_SERVICE_KEY` no era la clau `service_role` → 401 de la RLS. Canviat.
3. En enganxar la clau nova hi va entrar un **salt de línia enmig**. `fetch` llança
   `Headers.append: "***\n***" is an invalid header value` i **la petició no arriba ni a sortir**.
   El `trim()` que hi vam posar només toca els extrems i no va servir de res; el que ho va
   destapar va ser l'avís que havíem afegit nosaltres, que deia que l'espai era a dins.

Ara la clau es neteja amb `.replace(/\s+/g, '')`: **cap clau de Supabase conté espais**, o sigui
que treure'ls tots és segur i la captura funciona encara que el secret vingui brut. L'avís es
manté i diu que ja s'han tret, perquè el codi no ha d'amagar que el secret està mal desat —
**val la pena tornar-lo a enganxar net** amb el botó de copiar de Supabase.

**L'escala dels boletaires.** Repassant el desglossament amb aquestes files de veritat, el mateix
factor sortia amb dues escales a la mateixa pantalla: la taula de l'historial «0/1» i el
desglossament de sota «0/2». Mana l'1 — la fórmula el tracta com a binari (mira si val més de 0 i
suma `punts[1]`). Corregit el `/2`, i el desplegable de l'edició manual passa de 0-2 a 0-1: oferir
un «2 - Alta activitat» que sumava exactament el mateix que un 1 feia creure que hi havia graus.
També s'hi treu «només informatiu», que era fals. En obrir el formulari el valor es topa a 1,
perquè un dia desat amb un 2 no deixi el desplegable sense cap opció triada.

**Comprovat al navegador** amb les dues files reals: portada i historial diuen el mateix, el
selector de captures funciona i els mapes de l'SMP Bombers es tornen a dibuixar (43 comarques, 42
verdes i l'Aran en gris). El cas nou respecte de la prova amb dades inventades era
`comarques: {}` —avui no hi ha cap avís de l'SMP, o sigui que la matriu és buida—, i els mapes
surten tots verds, com toca, sense petar.

**Què queda pendent:**

- **Veure passar les tres captures del dia.** Els sis `cron.job` de Supabase hi són i estan actius,
  però `cron.job_run_details` encara és buit: cap no ha arribat a disparar-se. La primera prova de
  debò és la del vespre.
- Tornar a enganxar el secret net (el codi ja se'n surt, però el secret continua brut).
- Les dades dels helicòpters són del **06-09**: nou dies. L'operativitat es calcula amb l'últim
  estat desat, que no és el d'avui.
- `bpa_historic` encara s'escriu a sobre: de les allaus no en queda evolució.
- La RLS continua desactivada a nou taules (vegeu `PLA-CAPTURES.md` §9).

## 2026-09-15 — La primera captura falla: la clau dels scripts no és la de servei

La primera execució de `captura-risc.yml` va sortir **verda i sense desar res**. Dues coses, totes
dues importants:

**1. La clau.** `❌ Supabase risc_captures upsert error 401: new row violates row-level security
policy`. El secret `SUPABASE_SERVICE_KEY` de GitHub **no és la clau `service_role`**: els scripts
escriuen com a `anon`. Fins ara no s'havia notat perquè les taules on escriuen o tenen la RLS
desactivada (`bpa_historic`, `planspc_historic`, `canvi_temps_historic`, `helicopters_historic`,
`previsio_historic`, `afluencia_edicions`, `error_log`, `taula_config_alertes_smp`,
`smp_override_historic`) o tenen polítiques que deixen escriure a tothom (`risc_historic`:
«Escriptura autenticada», «Inserció des de GAS»; `smp_historic`: «Inserció GAS»). `risc_captures`
és la primera taula que neix ben tancada, i per això és la primera que se'n queixa.

**Cal canviar el secret** a la clau `service_role` de debò (Supabase → Project Settings → API keys).
No s'ha afegit cap política d'escriptura per a `anon`: seria obrir la taula a qualsevol que tregui
la clau pública de l'`index.html`, i la gràcia de les captures és justament que siguin de fiar.

**2. El workflow amagava l'error.** `codi=$?` després d'un `if` recull l'estat **de l'`if`**, que
és 0 quan la condició falla i no hi ha `else` — no el del `node`. O sigui que una captura fallada
sortia com a execució correcta. Ara l'estat es recull abans de res i el pas peta si la captura peta.

## 2026-09-15 — Historial: les captures de dos dies, amb el mateix desglossament i els mapes

Demanat: veure matí, migdia i vespre **d'ahir i d'avui**, amb la més nova a punt; que el
desglossament digui exactament el mateix que la portada (inclòs el motiu pel qual puja el risc); i
que hi hagi l'SMP Bombers amb taula **i mapes**.

- **`desglossamentHTML(d)`**: el desglossament passa a ser una sola funció que fan servir la targeta
  de la portada i l'historial. Rep tot el que necessita per paràmetre, i per això es pot dibuixar
  igual amb dades en viu o amb una captura desada. Comprovat que la portada queda idèntica (PERILL,
  «2n · +2», «↓ mal temps» amb el 3 barrat, els motius de cada heli, els increments).
- **L'historial ensenya tres blocs**: el risc del dia, el que se'n preveia l'endemà i **el dia
  abans**, cadascun amb les seves franges i les fletxes del que va canviar.
- **Selector de captures** (les d'ahir i les d'avui) amb la més nova triada per defecte, i a sota el
  detall sencer: el desglossament i l'SMP Bombers d'aquella captura.
- **Els mapes es tornen a dibuixar** amb el que va quedar desat: `captura-risc.js` ara desa, a més
  de les regions, la **matriu per comarca i franja**, i el pintat de mapes s'ha separat de la
  seqüència de la pestanya (`pintarSVGComarques`) perquè el mateix codi valgui per a un dia passat.

Comprovat al navegador amb captures simulades de dos dies: les tres taules, el selector, el
desglossament complet i els dos mapes (43 comarques pintades, franja triable).

---

## 2026-09-15 — Captures del risc: es desa l'evolució, no només el final

Reportat: «cada cop que s'actualitzen dades es va modificant i sempre es queda amb les últimes
dades». Cert i de mena estructural — `risc_historic` té `UNIQUE (data)`, o sigui una fila per dia
que s'escriu a sobre. El mateix a `bpa_historic`, `canvi_temps_historic` i `helicopters_historic`.
`smp_historic`, en canvi, ja acumula totes les consultes (1.030 combinacions zona/dia/meteor amb
més d'una): de l'SMP ja teníem història; del risc calculat, no.

Decidit amb en Jordi: disparar les captures des de Supabase (`pg_cron`) perquè siguin a l'hora, i
**una sola fórmula** compartida entre navegador i Node.

**Fet avui:**

- **`risc_captures`** (taula nova, append-only, amb RLS: lectura per a tothom, escriptura només
  `service_role`). Una fila per captura i horitzó, amb el risc, el desglossament sencer, tots els
  factors, l'SMP Bombers, la fórmula amb què s'ha calculat i `dades_completes`/`fonts_estat` per no
  confondre mai un factor que falta amb un factor a zero.
- **`formula-risc.js`**, l'única definició de la fórmula, que carreguen tant l'`index.html`
  (`<script src>`) com els scripts de Node (`require`). Hi han anat també el calendari d'afluència,
  l'SMP ponderat, el criteri de vol dels helis i el nucli de l'SMP Bombers, perquè els factors
  també s'han de calcular igual als dos costats. `detallarRisc(dia, formula)` és pur: no llegeix
  `localStorage`, ni Supabase, ni cap variable global.
- **La config passa a Supabase** (`formula`, `formula_versio`, `allaus_desactivat`, `op_config`):
  sense això el backend calcularia amb els valors per defecte mentre el navegador en té d'editats.
- **`scripts/captura-risc.js`** i **`captura-risc.yml`**, amb el reintent de mitja hora si Meteocat
  encara no ha publicat (es detecta per l'empremta del butlletí; si al cap de 30 minuts continua
  igual, es captura dient que no era nou).

**Comprovacions:** el calendari s'ha comparat dia a dia amb el codi anterior (1.116 dies del 2025 al
2027, cap diferència); la fórmula dona el mateix número a Node i al navegador; l'app passa per les
onze pestanyes sense errors; i la captura s'ha executat sencera contra un PostgREST de mentida,
inclosos el camí del reintent (codi 75) i el de la captura forçada.

**Afegit el mateix dia:** la pestanya **Historial → Risc** ja no ensenya la foto final del dia sinó
les captures: «com es veia venir» (el risc que es donava per a aquell dia a cada captura, començant
per la del vespre anterior), una taula per horitzó amb els factors i les fletxes de canvi entre
captures, el desglossament desplegable de cadascuna i l'SMP Bombers per regió. Els dies anteriors al
15-09-2026 continuen ensenyant la foto de `risc_historic`, amb un avís que diu per què no hi ha més.

**Pendent:** activar el `pg_cron` a Supabase (cal un token de GitHub, instruccions a
`PLA-CAPTURES.md` §4), fer que `bpa_historic` deixi d'escriure's
a sobre perquè les allaus també tinguin evolució. L'SMP Bombers dins de la fórmula del risc queda
previst, com es va demanar: la captura ja el desa, així que hi haurà història per calibrar-lo.

---

## 2026-09-15 — Les dades velles del matí no eren de l'app: el cron arriba tard

Reportat al migdia: totes les fonts marcades «fa 14 h», de les 22:13 del vespre anterior. L'app deia
la veritat — **el workflow de dades no havia corregut cap vegada aquell dia**.

**El retard dels crons de GitHub s'ha disparat.** Mesurat sobre les últimes passades (hores UTC):

| Ancoratge | 11-09 | 12-09 | 13-09 | 14-09 |
| --- | --- | --- | --- | --- |
| 05:45 | +4 h 15 | +3 h 51 | +4 h 52 | +5 h 14 |
| 08:00 | +4 h 43 | +4 h 03 | +5 h 13 | +6 h 53 |
| 10:00 | +4 h 07 | +3 h 25 | +4 h 10 | +6 h 13 |
| 13:30 | +3 h 33 | +2 h 53 | +3 h 29 | +5 h 14 |
| 16:00 | +3 h 03 | +2 h 14 | +2 h 39 | +4 h 13 |

O sigui que la primera passada del dia queia entre les **09:36 i les 11:00 UTC** (11:36-13:00
local): cada matí, fins al migdia, la web ensenyava les dades del vespre anterior. Ja s'havia
reportat el 09-09 i aleshores es va llegir com un problema de refresc del navegador; era això.

**Fet:** els ancoratges dels crons ja no són l'hora a la qual es vol consultar sinó l'hora a la qual
s'ha de demanar perquè arribi quan toca.

- `data_diari.yml`: sis passades ancorades a **00:23, 03:37, 06:47, 09:53, 12:43 i 14:17 UTC**, amb
  minuts senars (els crons a l'hora en punt són els més congestionats). Amb el retard d'aquests dies,
  la primera arriba entre les 05 i les 09 del matí, hora local.
- La cadena del guardat forçat s'ha canviat a `23 0 * * *`: compara el cron literal i, si no
  coincideix, el `FORCE` diari deixa de fer-se **sense dir res**.
- Cap ancoratge passa de les 14:00 UTC: amb 7 h de retard seria 21:00 UTC (23 h a Madrid) i, si
  travessés la mitjanit, `fetch-canvi-temps.js` escriuria la fila del dia equivocat.
- `risc_diari.yml` passa de les 21:00 a les **18:43 UTC**. `diaDeTancament()` protegeix fins a les
  6 h de Madrid, i 21:00 + 7 h són exactament les 6 h: hi arribava just. Ara el pitjor cas cau a
  les 03:43 i el dia que es tanca continua sent el bo.

També s'ha llançat una passada a mà (`workflow_dispatch` amb `force`) per no esperar-se: commit
`chore: dades 2026-09-15 10:07 UTC`.

**Pendent:** això només retalla el retard, no el treu. Si algun dia cal garantir l'hora, l'única
sortida és un disparador de fora (un cron extern cridant `workflow_dispatch`), amb el token que
això comporta.

---

## 2026-09-09 — «🚁 Operativitat · sense dades»: l'arrencada arribava tard

Reportat: la targeta del risc ensenyava `🚁 Operativitat · sense dades · — HC`. No hi havia cap
error al log, ni al del navegador ni a `error_log` de Supabase, i els helis hi són (quatre files a
`helicopters_historic`). Reproduït al contenidor amb Supabase i Open-Meteo responent: donava `4/4`.

**La causa és una cursa d'arrencada, no la xarxa.** `riscState` no existeix fins que `renderRisc`
crida `carregarRiscEstat`, i `renderRisc` només s'executa **quan torna la config de Supabase**.
`actualitzarRiscAuto()` se'n torna a la primera línia si `riscState` encara no hi és
(`if (!riscState.today && !riscState.tomorrow) return;`). Els JSON del disc arriben abans que
Supabase, o sigui que **totes** les crides que fan en carregar-se queien en va: ningú tornava a
demanar l'operativitat i la targeta es quedava amb «sense dades» tota la sessió. Els altres factors
no ho notaven perquè `renderRisc` els recalcula al moment de pintar; l'operativitat no, perquè és
asíncrona.

**Fet:**

- `carregarRiscConfig().then(...)` acaba amb un `actualitzarRiscAuto()`: quan `riscState` ja hi és,
  es torna a demanar el que es va perdre.
- **`ambSostre(promesa, ms, etiqueta)`**, nou. El client de Supabase no accepta timeout: si una
  consulta no torna, la promesa no es resol **mai** i s'emporta en silenci tot el que l'esperava.
- La config de risc va amb sostre de 10 s. Sense això, un Supabase que no respon deixava la pàgina
  **sense targeta de risc**, perquè tot l'arrencada l'espera.
- `avaluarOperativitat` va amb sostre de 20 s, treu l'entrada de la cau (si no, l'error es quedaria
  memoritzat per sempre), ho registra i **ho diu**: la targeta posa `sense dades: no ha respost en
  20 s` i la franja avisa que el risc es calcula sense aquest factor. Un factor que falta no pot
  semblar un factor a zero.
- Les consultes de meteo dels quatre helis van en paral·lel. En sèrie, quatre timeouts de 8 s
  seguits es menjaven el sostre del càlcul sencer.
- Un error d'operativitat ja no avorta el desat de la resta de factors, i la pestanya HC ofereix un
  botó «🔄 Torna-ho a provar».

Comprovat al navegador amb Supabase penjat: la pàgina es dibuixa als 10 s amb la config del
dispositiu, l'operativitat falla als 20 s amb el missatge a la franja i la cau queda buida per
tornar-ho a provar. Amb Supabase i Open-Meteo responent, `4/4` com sempre.

---

## 2026-09-09 — Interruptor de temporada de boletaires

Demanat: un interruptor per decidir si els boletaires compten. Reportat també que marcar la casella
de la fórmula «no activa res».

**I era veritat.** El factor `boletaires` existia, però **ningú n'establia mai el valor**: la casella
de Configuració → Fórmula de risc només diu si el factor compta, i `dia.boletaires` es quedava a 0
si no s'editava el dia a mà — cosa que, a sobre, marca el dia com a editat i congela la resta de
factors d'aquell dia. O sigui que el factor no havia sumat mai res pel camí automàtic.

**Fet:** pestanya nova **Configuració → 🍄 Boletaires** amb una casella de temporada. Mentre està
activada, `calcularValorsAuto` posa el factor a 1 a tots els dies automàtics; els dies editats a mà
mantenen el seu valor. Es desa a **Supabase** (`taula_config_alertes_smp.boletaires_actiu`, columna
nova) i no al navegador com l'interruptor d'allaus: que hi hagi bolets val per a tot l'equip, i avui
mateix hem vist com de mal va la configuració que només té un dispositiu. Si Supabase no respon,
queda desat al navegador i la pantalla ho diu, en comptes de fer creure que ja està compartit.

La franja de dades recorda que la temporada està activada: no s'apaga sola quan s'acaba.

Comprovat al navegador: la línia passa de «🍄 Boletaires · — · 0/2» a «Temporada · 1/2 · +1»,
l'increment entra a `detallarRisc`, i un dia editat a mà amb 0 es queda a 0.

---

## 2026-09-09 — L'app es refresca sola

Reportat al matí: la franja de dades marcava totes les fonts «fa 15 h», de les 21:20 del dia abans.

**No era cap error del sistema.** El workflow de dades havia corregut a les 10:08 UTC i Pages havia
desplegat el commit a les 10:08:39, tots dos amb èxit. El que estava congelat era **la pestanya**:
`app: 09/08 21:21:51` és l'hora en què aquell navegador va rebre l'HTML, i les dades eren del mateix
moment. L'app només baixava els JSON en obrir-se, o sigui que una pantalla deixada oberta al vespre
ensenyava l'endemà els avisos d'ahir amb la mateixa cara de bones.

**També:** un factor desmarcat a la fórmula ja no ensenya el seu valor. Sortia «❄️ Risc allaus ·
desactivat · Feble · 1/5», que es llegeix com si sumés 1 quan no suma res; ara el valor és **—** a
tots els factors apagats (SMP, allaus, afluència, operativitat, canvi, boletaires). Atenuar la fila
no n'hi havia prou.

**Fet:** `refrescarSiCal()` es dispara amb `visibilitychange`, amb `focus` i cada 5 minuts, i torna a
baixar-ho tot si fa més de 15 min (`REFRESC_MINUTS`) de l'última descàrrega — es mesura per
`estatFonts[k].baixat`, que és quan ho vam baixar nosaltres, no per la `dataConsulta` de l'origen.
També refà les targetes si el dia ha canviat amb la pestanya oberta. Amb dades fresques no demana
res: comprovat que tornar a la pestanya dues vegades seguides només fa una petició.

---

## 2026-09-08 (vespre) — La targeta del risc recalcula, no llegeix

Reportat: «l'SMP sí que dona els riscos, però després no passen a la principal». Amb la pestanya
Alertes marcant 1 avui i 4 demà, la targeta del Risc GRAE seguia a 0, en mode auto i sense cap avís
de dades que faltessin.

**Causa.** La pestanya calcula al moment de dibuixar-se; la targeta llegia `dia.smp` del
`localStorage`. Aquell valor només s'actualitza si `actualitzarRiscAuto` arriba fins al
`desarIPintarRisc()`, i el càlcul dels dos dies quedava **fora de qualsevol try**: qualsevol error a
`calcularValorsAuto` avortava la funció abans de desar res. Com que ningú espera aquella promesa,
l'error no sortia enlloc i la targeta es quedava amb el número d'una càrrega anterior — indefinidament.

**Fet:**

- `renderRisc` recalcula els factors dels dies en viu (avui i demà, si no estan editats a mà) just
  abans de pintar. Les dues pantalles surten del mateix càlcul i ja no poden divergir.
- El càlcul d'`actualitzarRiscAuto` va dins d'un try: un error deixa de tombar el desat.
- Si el càlcul peta, la franja de dades ho diu en vermell (`errorCalculRisc`) en comptes de deixar un
  número vell amb cara de bo.

Comprovat al navegador amb un `localStorage` que porta els dos dies a 0 i les dades reals del
8-09 (17:17 UTC): la portada passa a ensenyar 1 avui i 4 demà, igual que la pestanya, i un dia marcat
com a editat a mà es queda com estava.

---

## 2026-09-08 (tarda) — L'Empordà no comptava, i la franja diu què anul·la el risc

Amb l'SMP a 2 i 4 a la pestanya Alertes, el Risc GRAE seguia a 0. Buscant-ho es va veure que
`calcularSMPPonderat` **descarta en silenci** els avisos de zones que no tenen pes > 0, i que això
tapa dues coses molt diferents: una zona que l'usuari ha apagat i una zona que el mapatge no coneix.

**L'Empordà era del segon cas.** `zonesGrup` no la tenia i Meteocat hi emet avisos: **941 a
`smp_historic`**, l'últim per a demà. Cap d'ells no ha comptat mai. Comprovat contra
`select distinct zona from smp_historic`: les zones que fa servir l'SMP són quinze més les
marítimes, i era l'única que faltava.

**Fet:**

- `Empordà` → `Costa Brava` al mapatge, que ara viu en una sola constant (`RISC_PARAMS_DEFAULT`).
  N'hi havia una segona còpia dins de `resetRiscParams` que s'havia quedat enrere — sense el Gironès,
  sense l'Empordà i sense les marítimes: prémer «Valors per defecte» deixava el mapatge pitjor.
- Els paràmetres desats al `localStorage` es fusionen amb els del codi: els pesos són decisió de
  l'usuari, els noms de zona no, i un dispositiu amb una còpia antiga ja no perd zones.
- La franja de dades avisa dels dos casos: *avisos a zones desactivades a Configuració* i *avisos a
  una zona que l'app no coneix*. I hi surt un xip nou amb les zones actives i **d'on ve la
  configuració** (Supabase o la còpia d'aquest dispositiu quan Supabase no respon).

Avui i demà el número no canvia (l'Empordà no era decisiu), però un dia que ho fos, el risc hauria
sortit més baix del que toca sense que res ho digués.

---

## 2026-09-08 — Saber si les dades hi són: franja d'estat i risc marcat com a incomplet

Reportat: «al matí no s'havia carregat cap risc SMP i ara sí», i el Risc GRAE segueix a 0 mentre la
pestanya Alertes marca 2 i 4. Dues coses diferents, i cap de les dues es podia veure des de la web.

**1. Al matí no hi havia res per carregar.** El butlletí del 7-09 a les 18:17 UTC era literalment
`{"avisos": []}`: Meteocat no tenia cap episodi obert. L'avís de tempesta (intensitat de pluja) va
entrar al repositori amb la passada de les 10:05 UTC del 8-09. O sigui que no era un problema de
càrrega: no hi havia dades, i **la web no ho distingia de «cap alerta»**.

**2. El 0 de la portada** és el bug del 6-09, que encara no és a `main`.

**Fet — que es vegi si tenim les dades:**

- `estatFonts` + franja `#estat-dades` sota les pestanyes, visible a totes: per a cada font (SMP,
  allaus, canvi de temps, plans PC, previsió) l'hora de consulta a l'origen, l'antiguitat, i d'on ve
  (JSON del repositori o Supabase, que per a l'SMP no porta comarques). Botó d'actualitzar.
- Una font que no arriba surt en vermell com a **SENSE DADES** i la franja diu quines falten.
- La targeta del risc dels dies en viu es marca **INCOMPLET** quan falta una font que entra al
  càlcul: número en gris amb asterisc, banda vermella a dalt i `SENSE DADES` a la línia del factor,
  en comptes d'un «Cap alerta 0/6» que sembla una lectura bona. Els dies editats a mà no es marquen.
- Una font amb més de 8 h (`FONT_VELLA_H`) surt en taronja: hi és, però pot haver-hi avisos nous.
- La pestanya **Alertes** distingeix els tres casos que abans es veien tots com «0 · Cap alerta»:
  *no tenim les dades* (targetes a `—`, banda vermella i, si ha petat la càrrega, «això no vol dir
  que no hi hagi avisos: vol dir que no ho sabem»), *Meteocat no té cap episodi obert* (0 de veritat,
  dient l'hora de la consulta) i *cap avís per a aquell dia* concret. Amb dades velles, banda taronja.
- El workflow `data_diari.yml` passa de 3 a 5 passades (s'hi afegeixen les 10:00 i les 16:00 UTC).
  GitHub endarrereix els crons fins a 3 h i amb tres passades hi havia forats de 6-8 h. Compte: són
  més crides a l'API de Meteocat; si la quota va justa, treure una línia ho desfà.

**Pendent:** fusionar el PR perquè tot això arribi a la web. I els tres de sempre.

---

## 2026-09-06 — L'SMP que es quedava a 0 a la portada, i el perímetre de les regions

Reportat: al Risc GRAE surt «⚠️ Alertes SMP · Cap alerta · 0/6» mentre la pestanya Alertes ensenya
un 2 per al mateix dia.

**Causa.** Els dos llocs criden `calcularSMPPonderat`, però la pestanya el calcula en el moment de
dibuixar-se i la targeta llegeix el que hi ha desat al `localStorage`. `actualitzarRiscAuto()` desava
i pintava *després* d'esperar `avaluarOperativitat()`, que va a Supabase i a Open-Meteo: si aquella
crida trigava o quedava penjada (`meteoPermetVol` feia un `fetch` sense timeout), l'SMP, les allaus i
el canvi de temps es quedaven només a la memòria. I com que `renderRisc()` rellegeix el `localStorage`
(`carregarRiscEstat`), el primer redibuix els llençava: canviar de pestanya i tornar deixava el 0
enganxat fins a recarregar.

Reproduït amb Chromium sobre les dades del 6-09 (7 zones grogues per calor → SMP 2) amb Open-Meteo
sense resposta: la targeta d'avui deia «Cap alerta 0/6» i, després del canvi, «Avís groc · Calor 2/6».

**Fet:**

- Els factors es desen i es pinten abans d'esperar l'operativitat (`desarIPintarRisc`), que ara només
  hi afegeix el seu increment quan arriba i, si peta, deixa el que ja hi ha dibuixat.
- `meteoPermetVol` passa a `fetchAmbTimeout` (8 s) i la cau d'operativitat esborra la promesa si es
  rebutja, perquè el següent intent ho torni a provar.
- **`carregarRiscConfig()` no havia funcionat mai:** demanava `taula_config_Alertes_SMP` i la taula es
  diu `taula_config_alertes_smp`. PostgREST hi busca el nom exacte → 404 silenciós, la config de zones
  queia sempre al `localStorage` de cada dispositiu i el que es desava des de Configuració no anava
  enlloc. A més, `rowToRiscParams` muntava les zones de zero i una columna absent (`NaN`) apagava la
  zona; ara manté el valor de base. Afegida la columna `pes_zona_maritima`, que no existia.
- **Pestanyes a Windows:** la barra era una sola fila amb desplaçament horitzontal i la barra amagada.
  Al Mac i al mòbil s'hi arriba (trackpad, dit); amb un ratolí normal, no — les últimes pestanyes eren
  inabastables. Ara fa wrap (dues files a 1024 i 1366 px) i per sota de 600 px es manté la fila que
  llisca, amb la barra visible.
- **Perímetre de les regions al mapa d'SMP Bombers**, en negre gruixut: amb totes les comarques d'una
  regió pintades igual no es veia on acabava. No es pot treure fusionant comarques (el GeoJSON està
  simplificat sense topologia i queden trossos de ratlla pel mig, provat); es fa amb un traç retallat
  per *tot menys la regió* amb `evenodd`. Vegeu `CLAUDE.md`.
- **L'Aran i la ciutat de Barcelona**, en gris i fora del risc de cap regió: tenen bombers propis.
  L'Aran surt de `REGIONS_BOMBERS.Pirineus` (era una comarca sencera); Barcelona no es pot treure del
  càlcul perquè les dades són per comarca i el Barcelonès també porta l'Hospitalet, o sigui que només
  se'n marca el terme municipal. Vegeu `REGIONS-EMERGENCIA.md`.

**Pendent:** els tres de sempre (unificar les fórmules, `canvi` al backend, operativitat al càlcul
nocturn). Nou: quan l'SMP arribi per municipis, Barcelona també podrà sortir del càlcul.

---

## 2026-08-28 — Les regions es despleguen i ensenyen els avisos de cada comarca

A la taula, clicant una regió s'obre el detall: **les comarques que hi tenen avís** —les que estan a
0 les vuit franges no hi surten— amb la fila del grau de perill i, a sota, **una fila per fenomen amb
el nivell de l'avís i la probabilitat de cada franja**. El llindar va al costat del nom quan n'hi ha
un de sol i, si no, al títol de cada cel·la, que porta sempre el detall sencer.

Substitueix el desplegable «🔍 Detall per comarques» que hi havia sota la taula, que llistava **totes**
les comarques de **totes** les regions i només en donava el número: la mateixa informació, més fluixa i
lluny de la fila que t'interessa. Les dades ja hi eren (`matriu[codi].dies[dia][franja].riscos` guarda
meteor, nivell, probabilitat i llindar de cada afectació); només no es miraven.

Per dins, `fenomensComarca()` gira la matriu: en comptes de «què hi ha en aquesta franja», «aquest
fenomen, quan i amb quina probabilitat», que és com es llegeix un avís. Si una franja porta dos avisos
del mateix fenomen, mana el més gros (nivell primer, probabilitat després). Quines regions estan
obertes es recorda a `smpBombersEstat.obertes`: l'app es redibuixa sola quan arriben dades noves i, si
no, es tancarien totes just quan les estàs mirant.

De passada queda a la vista una cosa que sorprèn i és correcta: una regió pot marcar 0 amb comarques a
4 i a 6. El llindar de `agregarRisc` és la meitat + 1 de les comarques, i dues comarques calentes de
set no hi arriben — la regió mesura si la *regió* quedarà desbordada, no si hi ha perill en algun lloc.
Ara es pot veure d'on surt el número en comptes d'haver-hi de confiar.

Comprovat al navegador amb avisos inventats (calor i tempesta a Girona, vent al Segrià): les files
surten en ordre, els nivells i les probabilitats cauen a la franja que toca, una regió sense avisos ho
diu, i el desplegament sobreviu a un redibuix.

## 2026-08-28 — Quatre mapes alhora a l'SMP Bombers

Hi havia un sol mapa amb tres desplegables (dia, franja, vista). Per comparar les comarques amb les
regions, o avui amb demà, calies canviar el desplegable i recordar el que acabaves de veure. Ara n'hi
ha **quatre de més petits, tots alhora**: comarques i regions d'avui a dalt, els mateixos de demà a
sota.

I la franja de sis hores **va passant sola cada 2 s** (00-06 → 06-12 → 12-18 → 18-00), que és la
manera de veure com es mou el dia sense clicar res. Arrenca per la franja de l'hora que és. Clicar una
franja la fixa —si continuessin passant no la podries mirar— i el botó ⏸/▶ atura i reprèn.

Per dins, el que importa: la geometria es projecta **un sol cop** (`projeccioComarques`) i cada canvi
de franja només reescriu el `fill` i el `<title>` de cada comarca (`pintarMapesSMPBombers`). Refer
quatre SVG sencers cada dos segons faria pampallugues, perdria el tooltip obert i cremaria CPU per no
moure ni un punt de la geometria.

El temporitzador **es mata sol quan la secció deixa de tenir la classe `active`**. Comprovar només si
l'element existeix no serveix: en canviar de pestanya la secció es queda al DOM, i el temporitzador
hauria seguit pintant per sempre quatre mapes que ningú mira. En tornar a la pestanya, `renderSMPBombers`
l'arrenca de nou.

Comprovat amb el navegador i una matriu inventada: la seqüència avança sola, clicar una franja la fixa,
el botó reprèn, el mapa de regions pinta tota la regió de Girona amb l'agregat mentre el de comarques
manté el valor de cada comarca, demà es queda a 0, i el temporitzador queda a `null` en sortir de la
pestanya i torna a arrencar en entrar-hi.

## 2026-08-28 — Els colors de l'SMP i un interruptor per a l'estiu

Dues peticions petites de la pestanya i de la configuració.

**Els colors de l'SMP Bombers ara són els de l'avís.** La taula, el mapa i la llegenda pintaven un
degradat de set tons (verd, verd clar, llima, taronja, taronja fosc, vermell, granat) que no volia dir
res per a qui mira avisos de Meteocat cada dia. Ara segueixen l'avís: **1–2 groc**, **3–4 taronja**,
**5–6 vermell**, 0 verd, i dins de cada color el valor baix és el to clar i l'alt el fosc, de manera
que els dos graons d'un mateix avís es distingeixen sense deixar de ser el mateix color.

El canvi és una constant nova, `COLORS_SMP`, i **no** una edició de `COLORS_RISC`: aquella és
l'escala del risc del GRAE (l'usa el simulador i li fan joc les classes `.risc-color-*`) i no ha de
canviar perquè canviïn els colors de l'SMP. El text passa a blanc a partir del 4, que és on el fons
es fa fosc.

**Interruptor d'allaus fora de temporada** (Configuració → Allaus BPA). A l'estiu l'ICGC no publica
butlletí, però l'últim desat es queda a `bpa_latest.json` i el càlcul el continuava llegint: al juliol
encara hi hauria el perill de la primavera, congelat i sumant. La casella el posa a **0**.

No és el mateix que treure la casella `allaus` de la fórmula: allà es desactiva el factor, aquí es diu
que el perill que hi ha és 0. Per això val tant per al càlcul automàtic com per a un dia editat a mà:
el nivell es llegeix sempre per `nivellAllaus(dia)`, no per `dia.allaus`. El simulador se'l salta a
posta, perquè hi calibres la fórmula amb valors inventats i ha de respondre encara que avui les
allaus estiguin desactivades. Al desglossament de la targeta hi surt la marca «🌞 fora de temporada».

De passada, la pestanya Allaus BPA deia una fórmula que ja no existeix (nivell 2 → 1,5, nivell 5 → 6,
amb decimals). Ara ensenya els punts de veritat, generats des de `riscFormula`, o sigui que segueix
sola qualsevol canvi.

Es desa al navegador, com els llindars d'operativitat. **Només afecta el frontend:** `risc-diari.js`
no pot llegir el `localStorage`, així que el risc que es desa cada nit a `risc_historic` continuarà
comptant les allaus. És el mateix forat que ja tenen els punts de la fórmula, i es tancarà quan la
config passi a Supabase (passa 2 d'`EVOLUCIO-PREDICCIONS.md`).

Comprovat amb el navegador: la llegenda pinta els set colors nous, la casella desa i recupera
`riscGRAE_allaus`, `nivellAllaus({allaus: 4})` retorna 0 amb l'interruptor posat i 4 al simulador, i
la consola no dona cap error.

Pendent: el de sempre, passes 2 a 7 d'`EVOLUCIO-PREDICCIONS.md`.

## 2026-08-27 — Una sola branca, i l'upsert que petava en silenci

**Es deixa de treballar amb dues branques.** `proves` es fusiona a `main` i es queda quieta. El motiu és estructural: els workflows programats **només s'executen des de la branca per defecte**, o sigui que qualsevol canvi a `scripts/` fet a `proves` neix mort. Havia passat dues vegades, i ahir mateix el fix d'`smp_historic` va estar un dia sencer sense executar-se. A més, `/proves/` mai va ser un entorn aïllat: comparteix `data/` i Supabase amb l'operatiu.

La fusió porta a l'operatiu 30 commits, entre els quals **tres bugs que la gent estava patint** i que ja estaven arreglats (les dues targetes "Ahir" i el recompte d'helis duplicat), i també la **fórmula versió 6**. Els números que veu la gent canvien: és un canvi de criteri, decidit.

Detall pel camí: `main` i `proves` semblaven tenir historials **no relacionats**. Era un artefacte del clon superficial de la sessió; amb `git fetch --unshallow` apareix l'avantpassat comú (`a8f7d84`, 08-08). Val la pena recordar-ho abans de concloure res de l'historial en una sessió nova.

**L'upsert que petava en silenci.** `supabaseUpsert()` enviava `merge-duplicates` sense dir sobre quina restricció resoldre el conflicte, així que PostgREST mirava la clau primària —un `id` autogenerat que no coincideix mai— i acabava xocant amb el UNIQUE de veritat amb un **409**. Afectava **dues** taules:

- `risc_historic` (UNIQUE `data`): petava cada nit des del 7 d'agost. Per això l'Apps Script era l'únic que desava el risc.
- `canvi_temps_historic` (UNIQUE `data,tipus_dia,punt`): **descobert avui.** Només hi quedava la primera escriptura de cada dia; les de les 08:00 i les 13:30 petaven i el workflow se les empassava (`continue-on-error`). Del canvi de temps no en teníem cap evolució i ningú se n'havia adonat.

**La deriva del cron.** El cron és a les 21:00 UTC però GitHub l'endarrereix de manera irregular: avui ha sortit a les 00:24, **3 h 24 min tard**. Quan travessa la mitjanit de Madrid, `avuiMadrid()` retorna l'endemà i la foto de tancament cau sobre el dia equivocat. Ancorar l'hora no aguanta retards així, o sigui que el dia el decideix l'script: `diaDeTancament()` tracta les hores petites com a part del dia operatiu anterior. Comprovat amb el rellotge falsejat a cinc hores, incloses les dues bandes del canvi horari.

**Verificat en real:** disparat el workflow a mà sobre un dia que ja tenia fila. Abans hauria donat 409; ara acaba en verd i la fila s'actualitza al lloc, sense duplicat.

Pendent: passes 2 a 7 d'`EVOLUCIO-PREDICCIONS.md` (config de la fórmula a Supabase, un sol mòdul de càlcul, factors que falten al backend, `risc_snapshots`, apagar l'Apps Script i l'Historial amb corba).

## 2026-08-26 — `smp_historic` deixa de perdre la comarca

Trobat llegint la fórmula a Configuració. `fetch-smp.js` desa cada afectació **per comarca** i captura el grau de perill cru de Meteocat, amb comentaris que diuen explícitament per què no s'ha de col·lapsar («si es col·lapsés aquí la comarca es perdria i el risc per regions d'emergència no es podria calcular»). I tot seguit `agruparPerZona()` ho tornava a col·lapsar just abans d'escriure a Supabase, perquè la taula no tenia on posar-ho. El JSON les tenia; Supabase no. **Tercera vegada** que passa el patró que `ANALISI-DADES.md` ja documenta dos cops.

La primera idea era treure `agruparPerZona()` i desar una fila per comarca. **No es pot**: els dos webs —també el de `main`— reconstrueixen els avisos amb `smpDesDeSupabase()`, que dedupeix per `zona`. Amb files per comarca, el *fallback* ensenyaria les dades d'una sola comarca com si fossin de tota la zona. Una regressió a l'operatiu, i Supabase és compartida entre els dos webs.

Fet **sense tocar la cardinalitat**: dues columnes noves (`grau_perill` i `comarques` jsonb) i `agruparPerZona()` que ara acumula el detall en comptes de llençar-lo. Mateixes files, tots els camps antics idèntics.

Comprovat amb les dades reals de `main`: 17 files abans i després, zero camps antics canviats, cap comarca perduda, `grau_perill` sempre present. Verificada la forma exacta contra Supabase amb una fila de prova (esborrada), inclosa la consulta `jsonb_array_elements` que farà servir el risc per regions.

Pendent: `smpDesDeSupabase()` encara no llegeix `comarques`, o sigui que el *fallback* d'SMP Bombers continua sortint buit; i les files anteriors al 26-08 tenen la columna a `null`, cosa que no es recupera.

## 2026-08-26 — L'Apps Script no era un backup, i «Ahir» no es podia creure

Reportat: "ahir teníem risc 4 però a la principal no surt", i l'endemà "ara diu 1 i ahir deia 3". Tres bugs diferents amagats sota el mateix símptoma, i al fons un problema d'arquitectura.

**Els tres bugs (arreglats, PR #5 a #8):**

1. **La targeta «Ahir» del Risc GRAE no llegia mai Supabase.** `riscState.yesterday` només es generava fent rodar el que ahir era `today` dins del `localStorage` del mateix navegador, i `actualitzarRiscAuto()` només recalcula `today`/`tomorrow`. Des d'un altre dispositiu queia al valor per defecte (tot a 0). Ara `sincronitzarRiscAhir()` el descarrega de `risc_historic`.
2. **La targeta «Ahir» de la pestanya Alertes sempre donava 0.** `calcularSMPPonderat()` només llegeix `dadesCarregades.smp`, l'avís de meteo.cat **en viu**, que és una previsió i mai conté un dia passat: estructuralment no podia donar res més que 0. Ara `sincronitzarSMPAhir()` recupera les alertes d'`smp_historic` i les avalua amb la mateixa ponderació.
3. **Cap pestanya amb dades carregava a `/proves/`.** `_base` només mirava `location.protocol === 'file:'`; servit per HTTP quedava `'.'`, relatiu al directori del document. A l'arrel funcionava per casualitat; a `/proves/` resolia a `proves/data/*.json`, que no existeix (per disseny). Ara puja un nivell sota `/proves/`, com ja feia `carregarGeoComarques()`.

També: el desglossament del Risc GRAE ara diu **per què** suma cada factor (fenomen SMP, situació de neu, motiu de calendari de l'afluència, factor del canvi de temps), i les allaus ensenyen què aporten de veritat a la fórmula, que no és 1:1 amb el nivell.

**El problema de fons.** Investigant d'on sortia el «1», resulta que `scripts/risc-diari.js` **no escriu res des del 7 d'agost**: peta cada nit amb un 409 (`utils.js` fa upsert sense `on_conflict=data`). Qui desa el risc diari és l'**Apps Script** (`font: auto_gas`), i **el seu codi no és al repositori**, o sigui que no es pot auditar què calcula.

Anàlisi completa i disseny a **`EVOLUCIO-PREDICCIONS.md`**: què falta per apagar l'Apps Script (sis factors comparats un a un, dues fórmules diferents, config a `localStorage` que el backend no pot llegir) i com desar l'evolució de la predicció durant el dia (`risc_snapshots`, amb `horitzo` i `fonts`). Res implementat encara; hi ha quatre decisions pendents al final del document.

## 2026-08-12 — Un sol recompte d'helis, i que digui quin és el problema

Reportat: el recompte sortia **dues vegades**. La targeta nova (Estat · Condicions de vol · Distribució) i les dues targetes velles (`renderIndexos`: "Distribució territorial" i "Operativitat") deien el mateix, i a més **no deien el mateix número**: les velles comptaven províncies sense mirar si l'heli podia volar, i puntuaven amb mitjos punts (Total=1, Parcial=0,5), que és la fórmula antiga.

Retirades `renderIndexos` i `calcularIndexos`. Ara només hi ha el bloc unificat, que surt tant a la pestanya com a **Configuració → Helicòpters** (allà, sense capçalera gran, el número va dins del mateix bloc).

**Els tres blocs ara diuen el problema, no que n'hi ha un:**

| Abans | Ara |
| --- | --- |
| Estat · "Fora: HC4" | **Estat dels helicòpters** · "HC4: Baixa — revisió 50.05" (estat real + observacions) |
| Condicions de vol · "No poden sortir: HC1" | **Condicions de vol** · "HC1: visibilitat de fins a 800 m de 10 a 14 h · ratxes de fins a 72 km/h de 15 a 19 h" |
| Distribució · "1 no suma" | **Distribució territorial** · el mateix + les quatre províncies, marcades les cobertes |

Per poder-ho dir, `meteoPermetVol` ara desa **quines hores** fallen i **per què** (`tramsHores` les agrupa en trams llegibles) en lloc de tornar "no vola (meteo)". Quan no falla cap hora concreta però tampoc no hi ha finestra, ho diu clar: la trenca la nit.

### Dos errors de fons que van sortir pel camí

**1. `logError` podia petar i endur-se qui el cridava.** Se'l crida des de *tots* els `catch` de l'aplicació; si la crida a Supabase falla, convertia un error ja controlat en un de no controlat i avortava la funció que l'havia cridat. És exactament com la caiguda de Leaflet s'enduia tota la pestanya d'helicòpters. Ara la inserció va dins d'un `try` i la promesa té els dos mànecs.

**2. Canviar un llindar t'expulsava de Configuració.** La pàgina de paràmetres es dibuixa dins de `app-risc`, el mateix contenidor que reescriu `renderRisc()`. Com que `aplicarOpConfig()` crida `actualitzarRiscAuto()` → `renderRisc()`, tocar el vent o la visibilitat et tornava a la pantalla de risc enmig de l'ajust. Ara `actualitzarRiscAuto` no dibuixa si la pàgina de paràmetres és oberta (marcador `#pagina-parametres`); el botó "← Tornar" continua funcionant igual.

El segon només es veia perquè el primer ja no amaga res: l'excepció de `logError` avortava abans d'arribar-hi. Un error que se n'empassa un altre.

## 2026-08-12 — `carregarHelisPerRisc`: una funció que vaig esborrar

Reportat des de `/proves/`: **"No s'ha pogut calcular: carregarHelisPerRisc is not defined"**.

Aquesta és la **segona part** del mateix error d'ahir, i té una causa diferent i pitjor. Ahir el problema era el nom equivocat (`calcularOperativitat` en lloc d'`avaluarOperativitat`). Avui el problema és que **la funció ja no hi era**: la vaig esborrar sense adonar-me'n en refactoritzar `opConfig`, quan vaig substituir de cop tot el bloc que anava de `const OP_RATXA_MAX = 50;` fins a `const meteoVolCache = {};`. `carregarHelisPerRisc` vivia allà dins.

Recuperada literalment de `git show 9d59173:index.html` i tornada a posar just abans de `meteoVolCache`. Carrega els helis del dia exacte; si no n'hi ha, l'últim registre desat; i si tampoc, la flota per defecte.

**Per què no ho va agafar el test.** El test de la pestanya HC *creava* la funció per poder aïllar el càlcul (`carregarHelisPerRisc = async () => hs`), o sigui que passava en verd precisament perquè la funció no existia. Un stub que crea el que hauria de comprovar no comprova res. Ara `test-hc.js` **afirma primer que existeixen** `avaluarOperativitat`, `carregarHelisPerRisc`, `meteoPermetVol`, `provinciaDeBase`, `renderHCGraeOperatius` i `invalidarOperativitat`, i només després les substitueix.

**Regla que se'n treu:** en un fitxer de 380 KB sense mòduls, substituir un bloc gran de cop és perillós; abans de fer-ho, comprovar quines funcions hi ha a dins.

## 2026-08-09 — El número d'HC operatius, arreglat i posat al davant

Reportat: la targeta d'HC GRAE operatius deia **"No s'ha pogut calcular"**.

**Causa:** cridava `calcularOperativitat`, que no existeix. La funció es diu `avaluarOperativitat`. El `try/catch` s'empassava l'error i només deixava el missatge genèric, així que no es podia saber què passava; ara el `catch` registra a l'`error_log` i ensenya el motiu.

**Segona causa, més de fons:** el bloc penjava de `renderIndexos`, que al seu torn depèn de la càrrega de dades del dia. I la inicialització del mapa era **fatal**: si Leaflet no carregava, s'enduia tota la pestanya, inclòs el número. Ara la creació del mapa va dins d'un `try` i el bloc del recompte es dibuixa des de la capçalera, independentment.

**Disseny nou**, com es va demanar: el valor mana i va **al costat del títol, gros** (`2/4`), amb les províncies cobertes a sota. I sota la capçalera, **els tres paràmetres d'on surt**, cadascun amb el seu subtotal i el motiu:

1. **Estat** 3/4 — Fora: HC4
2. **Condicions de vol** 3/3 — finestra de ≥3 h dins de límits, amb llum de dia
3. **Distribució** 2/3 — 1 no suma: comparteixen província

Comprovat amb Playwright sobre quatre helis inventats (un de baixa, dos a la mateixa província): el càlcul dona 2/4 i els tres blocs expliquen d'on surt cada resta.

## 2026-08-09 — Condicions de vol: configurables, i només de dia

Decidit: **de moment el GRAE no vola de nit.** Això canvia una cosa que semblava resolta. La finestra de vol s'avaluava les **24 h** des del 22 de juliol, amb el raonament que els GRAE operen de nit; ara es busca **només entre hores amb llum** (`is_day` d'Open-Meteo) i una finestra no pot travessar la nit.

I això alhora **valida el llindar de visibilitat**: els 2.000 m només s'han de comparar amb la mínima HEMS de **dia** (1.500 m d'EASA), i hi som per sobre. El conflicte dia/nit que vaig detectar desapareix perquè la nit ja no compta.

**Els valors es queden com estaven** (50 km/h, 2.000 m, 3 h) però **deixen de ser constants**: ara són `opConfig`, editables des de Configuració → Operativitat HC i desades a `localStorage` (`riscGRAE_opHC`). Es recalcula a l'instant i el resum de sota diu sempre què hi ha aplicat. La casella "només amb llum de dia" també és configurable, per si algun dia canvia.

**Precisió important del cap del GRAE, escrita a la pestanya:** aquests llindars diuen si l'helicòpter **pot sortir de l'heliport**, no si podrà treballar al lloc del servei. Això últim depèn d'on sigui el servei i de com ho vegi la tripulació al moment, i no es pot preveure des d'aquí. Un HC pot comptar com a operatiu i haver de renunciar a un rescat concret per turbulència, boira de vall o falta d'espai per a la grua.

**Encara no tenim el sostre de núvols**, que és l'altra meitat de les mínimes HEMS: Open-Meteo no el dona directament.

## 2026-08-09 — Llindars de vol: contrastats amb la normativa

Buscats els llindars reals d'enlairament per a HC de rescat, per validar els dos números que teníem sense font.

**El vent (50 km/h ≈ 27 kt) quadra.** El límit d'aeronau de l'H135 és força més alt, però per a **vol de muntanya** la recomanació operativa és no sortir per sobre d'uns 25 kt, i amb ratxes o en llocs confinats encara menys. El nostre valor és raonable.

**La visibilitat (2.000 m) no quadra, i el problema és més subtil del que semblava.** Les mínimes HEMS d'EASA (SPA.HEMS.120) són **1.500 m de dia** (amb sostre de 600 ft) i **3.000 m de nit sense NVIS** (1.200 ft). Com que la nostra finestra s'avalua les **24 h** —els GRAE volen de nit—, un sol llindar és **massa estricte de dia i massa lax de nit**: de dia descartem hores volables i de nit en donem per bones que no ho serien.

**Cal separar `OP_VIS_MIN` en un valor de dia i un de nit**, i per fer-ho bé s'ha de saber si volen amb NVIS. Preguntes concretes per al GRAE, escrites a Configuració → Operativitat HC.

**No tenim el sostre de núvols**, que és l'altra meitat de les mínimes HEMS: Open-Meteo no el dona directament i caldria derivar-lo.

De passada: la flota són **Airbus H135 P2**, amb bases a Sabadell, Olot, la Seu d'Urgell i Tírvia.

## 2026-08-09 — "HC GRAE operatius": els tres paràmetres en un sol valor

La pestanya Helicòpters tenia dos indicadors separats (Distribució territorial i Operativitat) i la fórmula del risc feia servir un tercer càlcul, que comptava aparells i **no mirava la distribució**. Tres números per a la mateixa cosa, i el que manava era el pitjor dels tres.

**Ara n'hi ha un que mana: `HC GRAE operatius`.** `calcularOperativitat` creua els tres paràmetres alhora i retorna **províncies cobertes** per helis que poden volar, no aparells:

1. Estat `Total` a la pestanya Helicòpters.
2. Condicions de vol des de la seva base (finestra de ≥3 h dins llindars, 24 h).
3. Distribució: dos HC operatius a la mateixa província en compten **un**, perquè el segon no cobreix territori nou.

Això arregla la limitació que vaig detectar ahir. La pestanya es diu ara **🚁 Helicòpters GRAE Operatius**, amb el valor al títol i una targeta nova que diu quines províncies es cobreixen, quins aparells no sumen per compartir província i quins no volen i per què.

**Els llindars de vol no estan validats i s'ha de preguntar al GRAE.** `OP_RATXA_MAX` = 50 km/h i `OP_VIS_MIN` = 2000 m són els que ja hi havia al projecte i **no consta d'on van sortir**: no són un límit d'aeronau ni una mínima VFR publicada. Són conservadors — poden deixar fora dies en què s'hauria pogut volar. Queda escrit ben visible a Configuració → Operativitat HC: cal saber quin vent màxim admeten per enlairar-se i quina visibilitat mínima apliquen.

**Limitació que queda:** la província és una aproximació de la regió d'emergència. Amb 4 províncies i 8 regions, la cobertura real és més fina del que el número diu. Quan calgui precisió, cal passar a `REGIONS_BOMBERS`, que ja hi és.

## 2026-08-09 — Operativitat: escala corregida i què vol dir "operatiu"

Dues correccions sobre el que havia fet malament.

**Els punts eren erronis.** Havia posat una escala proporcional (un punt per heli de baixa), i no és el que toca: **cap operatiu → +2, un → +1, dos o més → +0**. Amb dos HC ja es cobreix el territori, i l'escala només s'ha de moure quan la cobertura queda compromesa. Es torna, doncs, a l'escala que ja hi havia abans que jo la toqués.

**La terminologia era errònia.** No són "helis de baixa" sinó **HC operatius**: en plena operativitat, amb condicions de vol des d'on són, i distribuïts pel territori. El número que es veu a la pantalla principal és aquest (X/4), i el que s'ha d'explicar és que **el número que es veu i el que suma no són el mateix**.

**Limitació que ha sortit comprovant-ho: la distribució territorial NO es comprova.** El codi compta els HC un per un i no mira on són, o sigui que **dos HC operatius a la mateixa regió compten igual que dos de repartits**, encara que la cobertura real sigui molt pitjor. Ho he marcat com a pendent, ben visible, a Configuració → Operativitat HC.

**On s'explica cada cosa**, tal com es va demanar:

- *Configuració → Operativitat HC*: què vol dir operatiu (les condicions), i l'avís de la distribució.
- *Configuració → Fórmula de risc*: que el X/4 que es veu no suma punt per punt, sinó +0, +1 o +2.

`RISC_FORMULA_VERSIO` puja a 6. La 5 va ser l'intent d'escala proporcional, descartat.

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
