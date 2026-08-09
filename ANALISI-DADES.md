# Poder analitzar si el risc l'encertem

Document de treball. Tot el calibratge de la fórmula s'ha fet **raonant**, no amb dades:
ningú ha comparat mai el número que va sortir un dia amb el que va acabar passant.

Per poder fer-ho algun dia cal desar, **des d'avui**, la informació que ho permetrà.
Aquest document diu què falta i per què.

Estat: **anàlisi feta, res implementat.** Cal decidir els canvis a Supabase.

---

## 1. El problema urgent: els dies que desem ara no es poden reconstruir

`risc_historic` té aquestes columnes:

```
id · data · risc · planspc · smp · allaus · afluencia · hc · canvi · boletaires
notes · font · creat_at
```

I la fórmula del frontend fa servir: **SMP, allaus, afluència, operativitat dels
helicòpters, canvi de temps i boletaires**.

Hi ha dos desajustos:

- **`operativitat` no es desa enlloc.** És un factor del càlcul i no té columna. La
  columna `hc` és de la fórmula antiga (dificultat de vol 0-2), que ja no s'usa.
- **No es desa quina fórmula va produir el número.** Els punts són editables i
  `RISC_FORMULA_VERSIO` ja va per 5 en dos dies. Un risc 4 del dia 8 i un del dia 9
  poden voler dir coses diferents.

**Conseqüència:** un dia desat avui no es pot recalcular ni comparar amb un altre.
Cada dia que passa és un dia perdut per a l'anàlisi.

## 2. Què caldria desar

### 2.1 Reproduir el càlcul (imprescindible)

| Camp | Per què |
| --- | --- |
| `operativitat_helis` | Factor del càlcul que ara es perd (0-4 helis que poden volar) |
| `formula_versio` | Sense això no se sap què volia dir el número |
| `formula_config` (jsonb) | Els punts concrets, que són editables per l'usuari |
| `desglossament` (jsonb) | Perill base, factor dominant, suplement, increments i si es va topar |

Amb `desglossament` es pot respondre "per què va sortir 4?" sense reimplementar res.

### 2.2 Distingir la previsió del que va passar (el moll de l'os)

Això és el que permet dir si **l'encertem**, i ara no hi és de cap manera.

- El risc es calcula amb **previsions** (avisos SMP, BPA, previsió meteo).
- Per validar-lo cal saber **què va passar de veritat**: si la tempesta va caure, si
  va nevar, si els helicòpters van poder volar.

Cal desar, per a cada dia, dues fotos separades:

| Foto | Quan | D'on surt |
| --- | --- | --- |
| **Previsió** | el dia abans i el mateix matí | el que ja recollim |
| **Observat** | l'endemà | dades d'estacions XEMA de Meteocat (pluja, vent, neu acumulada) |

Meteocat té API de dades d'estacions (XEMA), amb la mateixa clau que ja fem servir per
a l'SMP. Seria un script nou, `fetch-observat.js`, que cada matí desa el que va passar
el dia anterior.

### 2.3 El que realment volem predir

El risc mesura **la probabilitat que els GRAE quedin desbordats**. Per saber si
l'encertem cal la variable que intentem predir, i **no la tenim**:

- Nombre de serveis del GRAE aquell dia.
- Quants simultanis, i si algun es va haver de deixar en espera.
- Si es va haver de demanar reforç a una altra regió.

Aquesta dada no surt de cap API: l'ha de portar Bombers. **És la peça que decideix si
tot això serveix o no**, i convé demanar-la aviat encara que sigui un full de càlcul
mensual: sense ella, calibrar la fórmula continuarà sent opinió.

## 3. Canvis proposats a Supabase

```sql
-- Reproduir el càlcul
alter table public.risc_historic
  add column if not exists operativitat_helis smallint,
  add column if not exists formula_versio     smallint,
  add column if not exists formula_config     jsonb,
  add column if not exists desglossament      jsonb;

-- El que va passar de veritat (taula nova)
create table if not exists public.observat_historic (
  id            bigserial primary key,
  data          date not null,
  comarca       smallint not null,
  pluja_mm      real,
  vent_ratxa    real,
  neu_cm        real,
  font          text,
  creat_at      timestamptz default now(),
  unique (data, comarca)
);

-- Els serveis reals (l'ha d'omplir Bombers)
create table if not exists public.serveis_grae (
  id            bigserial primary key,
  data          date not null,
  regio         text,
  num_serveis   smallint,
  simultanis    smallint,
  en_espera     smallint,
  notes         text,
  creat_at      timestamptz default now()
);
```

Cap d'aquests canvis trenca res: només afegeixen columnes que poden ser nul·les.

## 4. Principi a seguir mentrestant

**Desar en cru i no col·lapsar.** Ja hem topat dues vegades amb el mateix error:

- `fetch-smp.js` col·lapsava la comarca en una zona abans de desar, i quan va caldre el
  risc per regions d'emergència la dada no existia enlloc.
- El grau de perill 0-6 de Meteocat es llençava i es deduïa del color, fins que es va
  veure que ja venia donat.

Regla: **si l'API ho dona, es desa tal com ve.** Agregar és barat i es pot fer després;
recuperar el que no s'ha desat és impossible.

## 5. Ordre suggerit

1. **Afegir les quatre columnes a `risc_historic`** — barat i atura la pèrdua diària.
2. **Demanar les dades de serveis a Bombers** — és el que triga més a arribar.
3. `fetch-observat.js` amb les dades XEMA.
4. Una pestanya d'anàlisi que creui previsió, observat i serveis.

---

## Nota de seguretat (a part, però convé saber-ho)

Revisant la base de dades, Supabase avisa que **nou taules tenen la RLS desactivada**:
`taula_config_alertes_smp`, `smp_override_historic`, `helicopters_historic`,
`bpa_historic`, `previsio_historic`, `planspc_historic`, `afluencia_edicions`,
`error_log` i `canvi_temps_historic`.

Com que la clau `anon` va incrustada a `index.html` i és pública, **qualsevol que la
tregui del codi pot llegir i modificar aquestes taules**. `risc_historic` i
`smp_historic` sí que tenen RLS.

No s'ha tocat res: activar la RLS sense polítiques bloquejaria l'aplicació. Cal
decidir quines polítiques hi ha d'haver (probablement lectura per a tothom i
escriptura només per a `service_role`) i aplicar-ho amb calma.
