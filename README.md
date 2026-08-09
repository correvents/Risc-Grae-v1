# Risc GRAE

Quadre de comandament per valorar el **risc operacional diari dels GRAE** (Grup d'Actuacions Especials dels Bombers de la Generalitat de Catalunya).

L'aplicació agrega diàriament avisos meteorològics, butlletins d'allaus, plans de protecció civil i previsió, en calcula un índex de risc de 0 a 6 i el mostra en una interfície web estàtica.

- **Aplicació (operativa):** https://correvents.github.io/Risc-Grae-v1
- **Banc de proves:** https://correvents.github.io/Risc-Grae-v1/proves/
- **Mapa territorial:** https://correvents.github.io/Risc-Grae-v1/mapa.html

## Com funciona

```
Fonts externes            GitHub Actions              Emmagatzematge         Frontend
─────────────────         ──────────────              ──────────────         ────────
Meteocat (SMP,       ┐                           ┌─►  data/*.json      ─┐
previsió)            │                           │    (al repositori)   │
ICGC (BPA allaus)    ├─►  scripts/fetch-*.js  ───┤                      ├─►  index.html
Transparència Cat.   │    (dades diàries)        └─►  Supabase          │    mapa.html
(plans PC)           │                                (històric)        │
Open-Meteo           ┘                                                  │
                          scripts/risc-diari.js  ───►  risc_historic    ─┘
```

1. El workflow **Dades diàries GRAE** executa els `scripts/fetch-*.js`, que escriuen l'estat més recent a `data/*.json` (commitejat al repositori) i n'acumulen l'històric a Supabase.
2. El workflow **Risc diari GRAE** executa `scripts/risc-diari.js`, que llegeix els JSON de `data/`, calcula l'índex de risc del dia i el desa a la taula `risc_historic`.
3. `index.html` es serveix per GitHub Pages i llegeix tant els JSON publicats com Supabase (amb la clau `anon`).

## Estructura del repositori

| Fitxer / directori | Descripció |
| --- | --- |
| `index.html` | Aplicació completa (HTML + CSS + JS en un sol fitxer). Pestanyes: Risc GRAE, Previsió, Alertes (SMP), Allaus (BPA), Afluència, Plans PC, Helicòpters, Canvi Temps, Historial i Configuració. Inclou un manual d'ús integrat. |
| `mapa.html` | Mapa territorial amb Leaflet: capes de comarques i municipis sobre el perfil de Catalunya. |
| `*.geojson` | Geometries simplificades: `catalunya_simplificat_100m`, `comarques_simplificat_500m`, `municipis_simplificat_500m`. |
| `data/*.json` | Última instantània de cada font, actualitzada pels workflows. |
| `scripts/` | Scripts Node.js d'ingesta i càlcul (sense dependències externes: només `fetch` natiu de Node 20). |
| `.github/workflows/` | `data_diari.yml` (ingesta) i `risc_diari.yml` (càlcul del risc). |

### Scripts

| Script | Font | Sortida |
| --- | --- | --- |
| `fetch-smp.js` | Meteocat — Situacions Meteorològiques de Perill (`api.meteo.cat`) | `data/smp_latest.json`, taula `smp_historic` |
| `fetch-previsio.js` | Meteocat — previsió general de Catalunya (avui i demà) | `data/previsio_latest.json`, taula `previsio_historic` |
| `fetch-bpa.js` | ICGC — Butlletí de Perill d'Allaus (`bpa.icgc.cat`) | `data/bpa_latest.json`, taula `bpa_historic`, còpia a un Gist |
| `fetch-planspc.js` | Dades Obertes — plans de protecció civil activats | `data/planspc_latest.json`, taula `planspc_historic` |
| `fetch-canvi-temps.js` | Open-Meteo (previsió + arxiu de 30 dies) per a 7 punts de muntanya | `data/canvi_temps_latest.json`, taula `canvi_temps_historic` |
| `risc-diari.js` | Els JSON de `data/` + Supabase | Taula `risc_historic` |
| `utils.js` | Helpers compartits: crides REST a Supabase, lectura/escriptura de JSON, data d'avui a `Europe/Madrid` |

Tots els scripts d'ingesta comparen el resultat amb la instantània anterior i només escriuen a Supabase si hi ha canvis, tret que `FORCE=true`.

## Càlcul del risc

> ⚠️ **N'hi ha dos i no coincideixen.** Aquest apartat descriu el del **backend**, que és el que es desa cada nit a `risc_historic`. El de l'**aplicació** (`index.html`) és més nou i funciona diferent: es descriu tot seguit. Unificar-los és feina pendent.

### A l'aplicació (`detallarRisc`)

```
risc = mín(6, PERILL + INCREMENTS)
```

**Perill (0–5).** El més gran entre SMP i allaus, **no la suma** — sumar-los comptaria dues vegades el mateix mal temps. Si tots dos hi són, el segon hi afegeix un suplement. Es limita a 5 perquè quedi marge per als increments.

**Increments (0–3).** Afluència, operativitat dels helicòpters, canvi de temps i boletaires. Cadascun suma el seu propi valor d'escala, en nombres enters, i **junts tenen sostre**: modulen el perill, no el substitueixen.

Hi ha dues correccions que no es veuen mirant els punts:

- **L'afluència es rebaixa amb mal temps.** És una predicció feta amb estadístiques de calendari, i el calendari no veu quin temps farà. A partir del taronja baixa un graó abans de sumar-se.
- **Les allaus no la rebaixen.** Amb perill d'allaus alt hi va menys gent, però la que hi és és exactament la que està en perill.

Tot és configurable des de **Configuració → Fórmula de risc**, que a més explica el model i té un simulador per calibrar-lo sense tocar cap dia real.

### Al backend (`risc-diari.js`)

Puntua sis factors i els normalitza a una escala de 0 a 6:

| Factor | Origen | Rang |
| --- | --- | --- |
| `planspc` | Fase màxima dels plans de PC actius (prealerta 1, alerta 2, emergència 3) | 0–3 |
| `smp` | Nombre de zones i nivell dels avisos vigents per a avui (groc/taronja/vermell) | 0–6 |
| `allaus` | Grau de perill màxim del BPA, escalat: `round((perill − 1) × 1,25)` | 0–5 |
| `afluencia` | Nivell registrat a `afluencia_edicions`; si no n'hi ha, s'estima per temporada i cap de setmana | 0–2 |
| `hc` | Condicions adverses per a l'helicòpter (vent, neu, pluja) derivades dels avisos SMP | 0–2 |
| `canvi` | Canvi brusc de temps; el càlcul automàtic el deixa a 0 i s'ajusta manualment des de l'aplicació | 0–2 |

```
risc = min(6, round((suma_de_factors / 21) × 6))
```

Si per al dia en curs ja hi ha una entrada a `risc_historic` amb una `font` diferent d'`auto_github` o `auto_gas`, el script no la sobreescriu: les entrades manuals tenen prioritat.

## Workflows

**`data_diari.yml` — Dades diàries GRAE**

- Horaris (UTC): `45 5`, `0 8` i `30 13`. La primera execució del dia força el guardat a Supabase; les altres només hi escriuen si detecten canvis.
- Es pot llançar manualment amb `workflow_dispatch` i l'opció *Forçar guardat*.
- Cada pas té `continue-on-error: true`, de manera que la caiguda d'una font no atura la resta.
- El pas final commiteja `data/` si hi ha diferències (`chore: dades <data> UTC`).

**`risc_diari.yml` — Risc diari GRAE**

- Horari (UTC): `0 21`. També es pot llançar manualment.

**`sincronitzar-proves.yml` — Sincronitzar el web de proves**

Hi ha dues versions del web publicades:

| URL | Origen | Ús |
| --- | --- | --- |
| `/Risc-Grae-v1/` | `main` | Versió operativa |
| `/Risc-Grae-v1/proves/` | carpeta `proves/` de `main`, sincronitzada des de la branca `proves` | Banc de proves |

GitHub Pages publica `main` tal com està, així que el banc de proves és una carpeta dins de `main`. A cada push a la branca `proves`, aquest workflow hi copia `index.html` i `mapa.html` i commiteja el canvi a `main`.

No es dupliquen ni els GeoJSON ni `data/`: `index.html` llegeix els JSON per URL absoluta, i `mapa.html` busca els GeoJSON a l'arrel quan detecta que corre sota `/proves/`.

La còpia de proves es reconeix sola: fons verd, franja verda a dalt i `🧪 PROVES` al títol de la pestanya.

Per provar un canvi: puja'l a la branca `proves`, mira'l a `/proves/` i, quan et convenci, fusiona `proves` dins de `main`.

### Secrets necessaris

| Secret | Ús |
| --- | --- |
| `METEOCAT_API_KEY` | API de Meteocat (SMP i previsió) |
| `SUPABASE_URL` | URL del projecte Supabase |
| `SUPABASE_SERVICE_KEY` | Clau `service_role`, només als workflows |
| `GIST_TOKEN` | Opcional: còpia del BPA a un GitHub Gist |

El frontend fa servir la clau `anon` (pública), incrustada a `index.html`.

## Supabase

Taules utilitzades pels scripts i pel frontend:

`risc_historic`, `smp_historic`, `smp_override_historic`, `previsio_historic`, `bpa_historic`, `planspc_historic`, `canvi_temps_historic`, `afluencia_edicions`, `helicopters_historic`, `error_log`.

## Desenvolupament local

Cal **Node.js 20 o superior** (els scripts utilitzen `fetch` natiu i no tenen dependències, així que no hi ha `npm install`).

Servir el frontend:

```bash
python3 -m http.server 8000
# obre http://localhost:8000/index.html
```

Cal servir-lo per HTTP i no obrir el fitxer amb `file://`, perquè `mapa.html` carrega els GeoJSON amb `fetch`.

Executar un script d'ingesta (escriu a `data/` i, si hi ha canvis, a Supabase):

```bash
export SUPABASE_URL='https://…supabase.co'
export SUPABASE_SERVICE_KEY='…'
export METEOCAT_API_KEY='…'   # només per a SMP i previsió
export FORCE=false            # true per escriure a Supabase encara que no hi hagi canvis

node scripts/fetch-smp.js
node scripts/risc-diari.js
```

Sense les variables de Supabase els scripts fallen en intentar escriure l'històric, però `data/*.json` ja s'haurà actualitzat abans.

## Fonts de dades

- [Meteocat](https://www.meteo.cat/) — avisos SMP i previsió general.
- [ICGC](https://bpa.icgc.cat/) — Butlletí de Perill d'Allaus.
- [Dades obertes de la Generalitat](https://analisi.transparenciacatalunya.cat/) — plans de protecció civil activats.
- [Open-Meteo](https://open-meteo.com/) — previsió i arxiu meteorològic per punts.

Les dades són d'ús informatiu i no substitueixen els canals oficials.
