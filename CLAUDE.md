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

| | Frontend (`index.html`, `calcularRisc`) | Backend (`scripts/risc-diari.js`) |
| --- | --- | --- |
| Factors | SMP + afluència + operativitat HC + allaus + canvi | planspc + smp + allaus + afluència + hc + canvi |
| Allaus | nivells 1–2 → 0; 3→1, 4→2, 5→3 | `round((perill − 1) × 1,25)` |
| Plans PC | només informatiu, no suma | suma 0–3 |
| Escala | suma directa, **sense límit superior** | `min(6, round((suma / 21) × 6))` |
| Configurable | sí, per l'usuari (localStorage) | no |

La del frontend és la nova (22-07-2026); la del backend és l'antiga i és **la que es desa cada nit a `risc_historic`**. Migrar-la és feina pendent. Si toques una de les dues, comprova si l'altra també ho necessita.

**2. `risc-diari.js` no fa servir `canvi_temps_latest.json`.**

El factor `canvi` sempre es desa a 0 des del càlcul automàtic (i `boletaires` també), tot i que `fetch-canvi-temps.js` genera les dades. El frontend sí que el fa servir.

**3. Les entrades manuals manen.**

`risc-diari.js` no sobreescriu una entrada de `risc_historic` si la seva `font` no és `auto_github` ni `auto_gas`. No canviïs aquest comportament sense parlar-ho.

**4. `index.html` és un sol fitxer de ~380 KB.**

Tot (HTML, CSS, JS) hi va dins, sense build ni mòduls. És deliberat: es publica directament a GitHub Pages. Fes servir edicions puntuals; no el reescriguis sencer. Conté un **manual d'ús integrat** a la pestanya Configuració: si canvies un càlcul, actualitza també la documentació que hi ha allà dins.

**5. Dues claus de Supabase.**

Frontend → clau `anon`, incrustada al JS (pública, és correcte). Scripts → `service_role`, sempre via GitHub Secrets. **Mai** posis la `service_role` a `index.html`.

## Operativitat dels helicòpters (frontend)

Un HC compta com a operatiu si el seu estat és `Total` **i** la meteo permet volar: cal una finestra de **≥3 hores seguides** amb ratxa ≤50 km/h i visibilitat ≥2000 m (constants `OP_RATXA_MAX`, `OP_VIS_MIN`, `OP_HORES_MIN`, via Open-Meteo per coordenades de base).

- La finestra s'avalua **les 24 hores**, no només amb llum: els GRAE també operen de nit.
- El recompte és **per heli** (X/4), no per zones cobertes: agrupar per zones amagava helis de baixa.
- Si no hi ha coordenades o falla la xarxa, **no es penalitza** (`ok: true`).
- Hi ha cau (`operativitatCache`, `meteoVolCache`); si canvies dades d'helis, crida `invalidarOperativitat()`.

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
