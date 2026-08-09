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

**Nombres enters.** El risc no ha de tenir mai decimals. Cada increment suma el seu propi valor d'escala (afluència 0–3, canvi 0–2, boletaires 0–1) i l'operativitat va a l'inrevés (cap o un heli +2, dos +1, tres o més +0). `detallarRisc` arrodoneix el total, perquè els punts són editables.

**`RISC_FORMULA_VERSIO`.** La config de la fórmula es desa a `localStorage` i es rellegeix per sobre dels valors per defecte, o sigui que **un canvi de punts no arriba a qui ja tingui config desada**. Puja la versió sempre que canviï el *significat* dels punts, no només el seu valor: si no coincideix, la config es llença. Va per 4.

**Simulador.** A Configuració → Fórmula de risc hi ha un simulador que calcula amb valors inventats i ensenya el desglossament pas a pas. Serveix per calibrar sense tocar cap dia real; no desa res.

Per unificar-les caldrà, com a mínim:Per unificar-les caldrà, com a mínim: moure la config de la fórmula de `localStorage` a Supabase (ja hi ha `taula_config_Alertes_SMP` per als altres paràmetres) i afegir una columna d'operativitat a `risc_historic`, que ara no existeix.

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

## Dos webs: operatiu i proves

**Norma de treball: tot canvi va primer a la branca `proves`.** Es mira funcionant a `/proves/` i, quan estigui validat, es porta a `main`. No es toca `main` directament.

GitHub Pages publica `main` tal com està (mode "deploy from a branch"), **no** hi ha desplegament per Actions. Per això el banc de proves és la carpeta `proves/` dins de `main`, que `sincronitzar-proves.yml` copia des de la branca `proves` a cada push.

- Només se sincronitzen `index.html` i `mapa.html`. Els GeoJSON i `data/` no es dupliquen: `index.html` llegeix els JSON per URL absoluta i `mapa.html` fa servir `BASE = '../'` quan detecta `/proves/`.
- **`proves/` de `main` es genera sola: no l'editis a mà.** El que es toca és la branca `proves`.
- Com que el workflow commiteja a `main`, les dues branques divergeixen: per pujar a l'operatiu cal **fusionar** `proves` dins de `main`, no un fast-forward.
- La còpia de proves es distingeix sola: fons verd, franja verda i `🧪 PROVES` al títol (`marcarWebDeProves()`, que detecta `/proves/` a la ruta).

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
