# Desar l'evolució de la predicció durant el dia

Document de treball. Complementa `ANALISI-DADES.md`: aquell diu **què falta desar per poder
validar la fórmula**; aquest diu **què falta per deixar l'Apps Script i com desar i veure
com evoluciona la predicció al llarg del dia**.

Estat: **anàlisi feta, res implementat.** Dades comprovades contra Supabase el 26-08-2026.
Decisions de producte resoltes (§8); el codi de l'Apps Script ja és al repositori.

---

## 1. L'Apps Script no és un backup

Les dues coses escriuen a la mateixa taula `risc_historic` de Supabase. L'Apps Script no és
una alternativa a Supabase: n'és un dels dos productors. I des del 7 d'agost és **l'únic** que
hi ha posat res.

| `font` | Qui és | Files | Període | Estat |
| --- | --- | --- | --- | --- |
| `auto_gas` | Google Apps Script | 110 | 06-03 → avui | Únic actiu |
| `auto_github` | `scripts/risc-diari.js` | 63 | 12-05 → **07-08** | Peta cada nit |
| `web` | Desat manual des de l'app | 1 | 19-08 | Puntual |

### 1.1 Què fa, ara que en tenim el codi

El projecte és **`historic_risc_grae`** (Drive, creat el 06-03-2026 — la data exacta de la
primera fila `auto_gas`). N'hi ha una còpia a **`apps-script/historic_risc_grae.js`**, perquè
es pugui auditar sense sortir del repositori. Corre amb un trigger diari cap a les 09:08 UTC.

**La bona notícia: no hi ha lògica secreta.** `calcularRiscTotal()` és exactament la mateixa
fórmula antiga que `risc-diari.js`:

```js
const total = planspc + smp + allaus + afluencia + hc + canvi;
return Math.min(6, Math.round((total / 21) * 6));
```

I compta les zones SMP **crues** igual que ell, deixa `canvi` i `boletaires` sempre a `0` igual
que ell, i fa servir la mateixa escala d'allaus `(perill-1) × 1,25`. Migrar no vol dir
reimplementar res que no sapiguem: vol dir **completar** el que ja hi ha.

### 1.2 El que sí que és diferent: llegeix d'una altra canonada

Aquí és on s'expliquen les discrepàncies. L'Apps Script **no llegeix `data/*.json` del
repositori**:

| Factor | D'on el treu l'Apps Script |
| --- | --- |
| Allaus | Un **Gist de GitHub** (`bf2beb9…`) — que és on `fetch-bpa.js` també escriu, o sigui que aquesta sí que ve del repositori, però via intermediari |
| SMP | Un **altre Apps Script** (`consulta_smp_meteocat`), amb la seva pròpia cadència |
| Plans PC | Un **altre Apps Script** (`Plans PC`) |
| Afluència | Un **altre Apps Script** (`afluencia`) |

Això respon el misteri del 25 d'agost: va desar `smp: 0` no perquè calculi malament, sinó
perquè **va llegir d'una font diferent** de la que alimenta `smp_historic`, amb una foto
d'un altre moment. Dues canonades paral·leles que no es miren.

També manté una **segona còpia de l'històric** en un JSON a Drive
(`risc_grae_historic.json`), i exposa endpoints web (`doGet`/`doPost`). Comprovat: **cap dels
dos webs crida aquests endpoints**, o sigui que apagar-los no trenca res del que fem servir.

### 1.3 Nota de seguretat

La constant s'anomena `SUPABASE_SERVICE_KEY` però el valor és una clau `sb_publishable_`,
és a dir **pública**. Vol dir que `risc_historic` accepta escriptures amb clau pública: qui
tregui la clau del web pot escriure-hi. Convé mirar-ho quan es toquin les polítiques RLS que ja
queden anotades a `ANALISI-DADES.md`.

## 2. Com calcula cada paràmetre cadascun dels dos

La referència és el **frontend de la branca `proves`**, que és on viu la fórmula actual
(`RISC_FORMULA_VERSIO = 6`). El de `main` encara porta la fórmula antiga. Els scripts de
`scripts/` i els workflows són **idèntics a les dues branques**, i s'executen des de `main`.

L'Apps Script i `risc-diari.js` calculen igual (§1.1), així que la columna del mig val per als
dos:

| Factor | Frontend `proves` (en viu) | Backend (`risc-diari.js` = Apps Script) | Què falta |
| --- | --- | --- | --- |
| **SMP** 0-6 | Agrupa zones amb `zonesGrup` i filtra per `taula_config_Alertes_SMP` | Compta zones **crues**, sense agrupar ni filtrar | Divergeix: tres zones d'un mateix grup li compten com a tres |
| **Allaus** 0-5 | Punts `{3:2, 4:4, 5:5}` | Escala antiga `(perill-1) × 1,25` | Portar la taula de punts |
| **Afluència** 0-3 | `getInfoDia()`: calendari + edicions | `calcularAfluenciaBase()` + edicions | Dues implementacions del mateix calendari |
| **Operativitat HC** 0-4 | `avaluarOperativitat()`: estat + finestra de vol (Open-Meteo) + província | — | **No existeix**: ni es calcula ni té columna |
| **Canvi de temps** 0-2 | Llegeix `canvi_temps_latest.json` | Sempre `0` | Les dades existeixen, no es llegeixen |
| **Boletaires** 0-1 | Marca manual | Sempre `0` | El backend ha de **respectar** la marca manual, no sobreescriure-la amb 0 |
| **Plans PC** 0-3 | Informatiu, no suma | **Suma 0-3** al total | Treure'l del càlcul del backend |

I la fórmula tampoc és la mateixa: el frontend fa **perill dominant + increments** (versió 6),
el backend una **suma ponderada** `min(6, round(suma / 21 × 6))`.

**Bloqueig pràctic:** la config de la fórmula viu a `localStorage`, dins del navegador de cada
usuari. Un script de servidor no la pot llegir. Mentre no pugi a Supabase, backend i frontend
no poden calcular igual per definició.

## 3. Dos bugs que expliquen per què el script de la nit no escriu

**3.1 L'upsert no diu sobre què resoldre el conflicte.** `scripts/utils.js` envia
`Prefer: resolution=merge-duplicates` però sense `on_conflict=data`. PostgREST mira la clau
primària `id` (autogenerada, no coincideix mai) i xoca amb el `UNIQUE(data)` real:

```
Supabase risc_historic upsert error 409:
duplicate key value violates unique constraint "risc_historic_data_key"
```

**3.2 El cron travessa la mitjanit a l'estiu.** El cron és `0 21 * * *` (22:00 CET a l'hivern),
però a l'estiu són les 23:00 i el retard de GitHub Actions l'empenyia passada la mitjanit de
Madrid. Fins al 7 d'agost això el salvava: arribava abans que l'Apps Script i inseria el dia
següent net. Quan el retard va afluixar, va començar a caure sempre sobre la fila del matí.

## 4. On es perd l'evolució

La ingesta corre **tres cops al dia** (05:45, 08:00 i 13:30 UTC) i tres taules crues ja
acumulen una fila per consulta. Per al 24 d'agost, `smp_historic` guarda **vuit consultes**, la
primera feta dos dies abans. L'evolució hi és; la llença la capa de càlcul.

| Taula | Clau | Evolució |
| --- | --- | --- |
| `smp_historic` | `id` + `data_consulta` | ✅ acumula |
| `previsio_historic` | PK `data_consulta` | ✅ acumula |
| `planspc_historic` | PK `timestamp` | ✅ acumula |
| `bpa_historic` | PK (`data`, `zona`) | ❌ sobreescriu |
| `canvi_temps_historic` | UNIQUE (`data`, `tipus_dia`, `punt`) | ❌ sobreescriu |
| `helicopters_historic` | PK (`data`, `heli_id`) | ❌ sobreescriu |
| `risc_historic` | **UNIQUE (`data`)** | ❌ **el coll d'ampolla** |

`UNIQUE(data)` és el que fa impossible guardar l'evolució: cada càlcul del dia esborra
l'anterior, i el número que es veu a Historial és l'últim que va escriure algú, no la predicció
d'un moment concret.

## 5. Disseny proposat: separar «el dia» de «la predicció»

Taula nova, en comptes de tocar `risc_historic` (que trencaria el frontend i l'Historial).
Es manté el principi d'`ANALISI-DADES.md`: desar en cru i no col·lapsar.

```sql
-- Cada fila és UNA predicció feta en UN moment per UN dia
create table public.risc_snapshots (
  id             bigserial primary key,
  data           date        not null,   -- el dia predit
  calculat_at    timestamptz not null default now(),
  horitzo        smallint    not null,   -- dies d'antelació: 0=avui, 1=demà

  risc           smallint    not null,

  -- factors d'entrada, tal com es van fer servir
  smp            smallint,
  allaus         smallint,
  afluencia      smallint,
  operativitat   smallint,   -- ara no es desa enlloc
  canvi          smallint,
  boletaires     smallint,
  planspc        smallint,

  -- traçabilitat: permet respondre «per què va sortir 4?»
  formula_versio smallint,
  formula_config jsonb,      -- els punts concrets d'aquell moment
  desglossament  jsonb,      -- base, dominant, suplement, increments, topat
  fonts          jsonb,      -- data_consulta de cada font usada

  font           text,       -- auto_github / web / manual
  notes          text,
  unique (data, calculat_at, font)
);

create index on public.risc_snapshots (data, calculat_at desc);
```

### Les dues columnes que fan la feina

**`horitzo`** — quants dies d'antelació tenia la predicció. És el que permetrà dir si
l'encertem: predir un 5 amb dos dies d'antelació no val el mateix que predir-lo el mateix matí.
Sense aquesta columna, comparar prediccions és comparar coses diferents.

**`fonts`** — el `data_consulta` de cada font que va alimentar el càlcul. Amb això un snapshot
és **autocontingut**: encara que `bpa_historic` sobreescrigui la seva fila demà, se sap amb
quina dada es va calcular.

### Cadència

Un càlcul **després de cada ingesta** (les tres que ja hi ha) més el de la nit. Cada execució
desa dos snapshots: `horitzo 0` per avui i `horitzo 1` per demà. Un dia acaba amb ~8 snapshots:
quatre fets el dia abans i quatre fets el mateix dia.

`risc_historic` es queda com està i passa a ser una **vista** del darrer snapshot de cada dia,
així res del que ja funciona es trenca.

## 6. Visualització: Historial → Risc GRAE

La pestanya ja tria un dia. El que canvia és que en comptes d'una targeta ensenya com va
evolucionar la predicció d'aquell dia:

- **Corba** del risc previst al llarg del temps, amb el valor final destacat.
- **Taula** d'snapshots: hora de càlcul · horitzó · risc · cada factor · **què va canviar**.
- Clicant una fila, el desglossament que ja tenim.

La columna «què va canviar» es calcula comparant amb el snapshot anterior — no cal desar-la.
És el que converteix una llista de números en una explicació, i és el material que necessitarà
l'agent auditor previst més endavant.

## 7. Ordre de feina

1. **Arreglar el 409** — `on_conflict=data` a `utils.js` i ancorar el cron lluny de la mitjanit.
   Una línia; torna a deixar el script de la nit escrivint.
2. **Pujar la config de la fórmula a Supabase** — mentre visqui a `localStorage`, backend i
   frontend no poden coincidir. És el bloqueig real de tot el que ve després.
3. **Un sol mòdul de càlcul** — extreure `detallarRisc()` a un fitxer que facin servir tant el
   navegador com Node. Deixa d'haver-hi dues fórmules.
4. **Completar els factors que falten al backend** — canvi de temps i operativitat HC; treure
   Plans PC del càlcul; conservar la marca manual de boletaires en comptes de posar-hi `0`.
5. **Crear `risc_snapshots` i escriure-hi** a cada ingesta. A partir d'aquí no es perd res, que
   és l'objectiu de tot això.
6. **Apagar l'Apps Script** — quan una setmana de snapshots quadri. Es desactiva el trigger
   diari; els endpoints web no els crida ningú (§1.2), i el JSON de Drive queda com a arxiu.
7. **Historial amb corba i taula.**

## 8. Decisions preses (26-08-2026)

- **Codi de l'Apps Script**: recuperat de Drive i arxivat a `apps-script/historic_risc_grae.js`.
  No hi ha lògica secreta: mateixa fórmula antiga que `risc-diari.js` (§1.1). El que canvia són
  les fonts (§1.2).
- **Boletaires**: es queda **manual**. Sense boletaires `+0`, amb boletaires `+1`. El backend
  **no l'ha de sobreescriure amb `0`**: ha de conservar la marca que hi hagi. És l'únic factor
  que no es pot derivar de cap API.
- **Plans PC**: **informatiu**, no suma. Cal treure'l del càlcul del backend, on encara aporta
  fins a 3 punts sobre 21.
- **Recalcular el passat**: **no cal.** L'objectiu és que a partir del dia que això funcioni
  quedi tot ben desat i es pugui analitzar. Els dies anteriors es deixen com estan.

### El que això implica

Que els boletaires siguin manuals i el backend no els pugui endevinar **fa que un càlcul
automàtic mai sigui l'última paraula**. El disseny d'`risc_snapshots` ja ho aguanta: una edició
manual és simplement un snapshot més, amb `font: 'web'` i el seu `calculat_at`. No cal cap
mecanisme d'excepció com el que ara té `risc-diari.js` (que mira la `font` i s'atura) — el
darrer snapshot mana, i tots queden desats.
