# Captures del risc: veure com evoluciona, no només com acaba

Document de disseny i estat de la feina.

**Fet** (15-09-2026): la taula `risc_captures` amb RLS, la fórmula compartida `formula-risc.js`
(amb el calendari d'afluència, l'SMP ponderat, el criteri de vol dels helis i l'SMP Bombers), la
config de la fórmula/allaus/llindars HC moguda a Supabase, `scripts/captura-risc.js` i el workflow
`captura-risc.yml` amb el reintent.

També la pestanya **Historial → Risc** (§7), que ja ensenya les captures.

**Fet** (16-09-2026): el disparador de Supabase de §4, amb `pg_cron` + `pg_net` cridant
`workflow_dispatch`. Els crons de GitHub queden com a xarxa de seguretat, un per workflow.

**Fet** (17-09-2026): **quatre captures al dia en comptes de tres**, a les mateixes hores que la
ingesta (06:50 · 10:50 · 14:50 · 20:30 de Madrid) perquè capturin el que s'acaba de baixar. La franja
nova és `matinada` i els talls de `diaIFranja()` es van refer per aïllar-les: amb els de tres, les
dues primeres del dia haurien caigut totes dues a `mati` i el `UNIQUE` hauria esborrat la primera.
L'historial les ensenya **totes vuit en una sola taula** —les quatre de la vigília i les quatre del
mateix dia— amb el que suma cada factor sota el seu valor.

Amb això els jobs de `pg_cron` són **setze** (estiu i hivern de cadascun): vuit `captura-*` i vuit
`ingesta-*`. Cada captura va **10 minuts darrere de la seva ingesta** (`ingesta-matinada` a les 06:45
i `captura-matinada` a les 06:50, i així les quatre), perquè capturi el que s'acaba de baixar.

**Falta**: l'evolució de les allaus (`bpa_historic` encara s'escriu a sobre).

## 1. El problema

`risc_historic` té `UNIQUE (data)`: **una fila per dia, que s'escriu a sobre**. Cada vegada que
arriben dades noves, el valor anterior desapareix. Al final del dia només queda l'última foto, i
la pregunta que interessa —*com ha anat canviant el risc a mesura que arribava informació*— no es
pot respondre perquè la resposta ja no hi és.

Passa el mateix a:

| Taula | Clau | Conserva l'evolució? |
| --- | --- | --- |
| `risc_historic` | UNIQUE (data) | **No** — s'escriu a sobre |
| `bpa_historic` | PK (data, zona) | **No** — s'escriu a sobre |
| `canvi_temps_historic` | UNIQUE (data, tipus_dia, punt) | **No** — s'escriu a sobre |
| `helicopters_historic` | PK (data, heli_id) | **No** — s'escriu a sobre |
| `smp_historic` | PK (id), amb `data_consulta` | **Sí** — hi ha 1.030 combinacions zona/dia/meteor amb més d'una consulta |
| `previsio_historic` | PK (data_consulta) | Sí |
| `planspc_historic` | PK (timestamp) | Sí |

O sigui que de l'SMP **ja tenim l'evolució guardada des de fa mesos** (només s'hi escriu quan hi ha
canvis, i cada escriptura és una fila nova). El que no tenim és el **risc calculat** en cada
moment, ni el perill d'allaus en cada moment, ni res que lligui les dues coses.

## 2. Què es vol

Tres captures al dia — **08:15, 12:30 i 20:30**, que és quan Meteocat actualitza l'SMP — i, a cada
captura, desar la foto sencera:

- El **risc GRAE d'avui i de demà** amb tot el desglossament (quin perill mana, el suplement del
  segon, cada increment i si es va topar).
- Els **factors que el formen**: SMP ponderat i el detall per zona/comarca, perill d'allaus,
  afluència, operativitat dels helicòpters, canvi de temps, boletaires, plans de PC.
- L'**SMP Bombers** per regió d'emergència.
- **Amb quina fórmula** es va calcular (versió i punts), perquè un 4 d'avui i un 4 de demà vulguin
  dir el mateix.

Amb això, la pestanya Historial pot ensenyar, per a qualsevol dia: les tres captures d'avui i de
demà, el desglossament de cadascuna, i com ha anat canviant l'SMP i les allaus al llarg del dia.

## 3. La taula nova: `risc_captures`

**Append-only. Res s'escriu mai a sobre.** Una fila per captura i horitzó (avui / demà), o sigui
**vuit** files al dia des que les captures són quatre.

```sql
create table if not exists public.risc_captures (
  id              bigserial primary key,
  capturat_at     timestamptz not null default now(),  -- quan s'ha fet de veritat
  franja          text not null
    check (franja in ('matinada','mati','migdia','vespre','extra')),
  dia_captura     date not null,                       -- dia operatiu (Europe/Madrid)
  horitzo         text not null,                       -- 'avui' | 'dema'
  dia_objectiu    date not null,                       -- el dia que es prediu

  risc            smallint not null,
  perill_base     smallint,
  dominant        text,                                -- 'smp' | 'allaus' | null
  suplement       smallint,

  smp             smallint,
  allaus          smallint,
  afluencia       smallint,
  operativitat    smallint,                            -- províncies cobertes per HC que poden volar
  canvi           smallint,
  boletaires      smallint,
  planspc         smallint,

  desglossament   jsonb not null,   -- la sortida sencera de detallarRisc()
  smp_detall      jsonb,            -- per zona i comarca, tal com ve
  allaus_detall   jsonb,
  operativitat_detall jsonb,        -- per heli: estat, motiu, província
  smp_bombers     jsonb,            -- per regió d'emergència i franja horària

  formula_versio  smallint,
  formula_config  jsonb,
  meteocat_emissio timestamptz,     -- data d'emissió del butlletí que s'ha fet servir
  dades_completes boolean,          -- false si alguna font no havia arribat
  fonts_estat     jsonb,            -- quina font faltava i per què
  font            text,             -- 'auto_github' | 'manual'
  unique (dia_captura, franja, horitzo)
);
```

El `unique` és a posta: si la captura es reintenta perquè Meteocat encara no havia actualitzat, el
reintent **completa la mateixa fila** en comptes de crear-ne una de nova. Una captura feta a mà fora
d'hora va amb `franja = 'extra'` i no xoca amb res.

**El `check` de `franja` és el tercer lloc on viu la llista de franges**, i el 17-09-2026 va ser el
que es va oblidar: amb `diaIFranja()` i `FRANGES_CAPTURA` ja canviats, la primera captura de
`matinada` va petar amb **23514** (`violates check constraint "risc_captures_franja_valida"`) i
aquell risc no es va desar. Si algun dia n'afegeixes una altra, els tres llocs alhora:

```sql
alter table public.risc_captures drop constraint if exists risc_captures_franja_valida;
alter table public.risc_captures add constraint risc_captures_franja_valida
  check (franja = any (array['matinada','mati','migdia','vespre','extra']));
```

`risc_historic` **es manté tal com és** (la pestanya la fa servir per a «ahir» i hi ha 194 files
d'història): es continua escrivint com fins ara, i les captures hi conviuen al costat.

**`dades_completes` i `fonts_estat` no són decoració.** Si l'SMP no havia arribat quan es va fer la
captura, el risc d'aquella captura val menys, i això s'ha de poder distingir d'un dia tranquil de
debò. És la mateixa regla de la franja de dades: *un factor que falta no pot semblar un factor a
zero*.

## 4. DECISIÓ 1 — El rellotge: com aconseguir que la captura sigui a l'hora

**Aquest és el problema seriós.** GitHub Actions endarrereix els crons de manera irregular: mesurat
entre l'11 i el 14 de setembre del 2026, de **2 h 14 min a 6 h 53 min**. Una captura «de les 8:15»
feta amb un cron de GitHub pot caure a les 13:00. Si les tres captures arriben quan volen, la sèrie
temporal no serveix per comparar dies.

Tres maneres de resoldre-ho:

### a) Supabase `pg_cron` + `pg_net` dispara el workflow *(recomanada)*

Supabase té `pg_cron` (feina programada dins de Postgres, que sí que s'executa a l'hora) i `pg_net`
(peticions HTTP des de la base de dades). Es programen tres feines que criden l'API de GitHub:

```sql
select cron.schedule('captura-mati', '15 6 * * *', $$
  select net.http_post(
    url     := 'https://api.github.com/repos/correvents/Risc-Grae-v1/actions/workflows/captura-risc.yml/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || <token del Vault>,
                                  'Accept', 'application/vnd.github+json'),
    body    := '{"ref":"main","inputs":{"franja":"mati"}}'::jsonb);
$$);
```

Un `workflow_dispatch` per API **s'executa de seguida** (avui mateix n'hem llançat un i ha arrencat
en segons): el retard només afecta els crons programats dins de GitHub.

- **A favor:** hora exacta, la lògica de captura es queda on és (Node, al repositori), i no cal
  cap servei de tercers.
- **En contra:** cal un *token* de GitHub (fine-grained, només `actions: write` en aquest
  repositori) desat al Vault de Supabase, i cal activar les dues extensions.
- **Compte amb l'horari d'estiu:** `pg_cron` va en UTC. 08:15 locals són les 06:15 UTC a l'estiu i
  les 07:15 a l'hivern. O es programen dues feines per franja amb condició de mes, o la feina es
  programa un pèl abans i el script espera fins a l'hora bona.

### b) Només GitHub, amb finestres *(el que es pot fer avui mateix, sense res nou)*

Molts ancoratges repartits, i el script decideix a quina franja pertany segons **l'hora real** en
què s'executa; si ja hi ha captura d'aquella franja, no en fa cap altra.

- **A favor:** zero infraestructura nova, funciona demà.
- **En contra:** l'hora de la captura continua sent aproximada (pot variar hores entre dies), i
  amb mala sort una franja es pot quedar sense captura.

### c) Cron extern (cron-job.org o similar) cridant `workflow_dispatch`

Igual que (a) però amb un servei de fora. Mateix token, una dependència més i un lloc més on mirar
quan falli.

### Com s'activa (a) — el que falta fer

1. **Token de GitHub**: Settings → Developer settings → Personal access tokens → *Fine-grained*.
   Només aquest repositori, permís **Actions: Read and write**, sense res més. Caducitat llarga.
2. **Desar-lo a Supabase** (SQL editor):
   ```sql
   select vault.create_secret('ghp_…', 'github_actions_token', 'Token per disparar captures');
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   ```
3. **Programar les tres captures** (hores UTC; a l'estiu 08:15 locals són les 06:15 UTC):
   ```sql
   select cron.schedule('captura-mati', '15 6 * * *', $$
     select net.http_post(
       url := 'https://api.github.com/repos/correvents/Risc-Grae-v1/actions/workflows/captura-risc.yml/dispatches',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_token'),
         'Accept', 'application/vnd.github+json',
         'User-Agent', 'supabase-cron'),
       body := '{"ref":"main","inputs":{"franja":"mati"}}'::jsonb);
   $$);
   ```
   I el mateix amb `'captura-migdia', '30 10 * * *'` (12:30 locals) i `'captura-vespre', '30 18 * * *'`
   (20:30 locals). **A l'hivern cal sumar-hi una hora** o programar-ne dues versions.
4. **Comprovar-ho**: `select * from cron.job;` i, després de la primera passada,
   `select * from cron.job_run_details order by start_time desc limit 5;`.

Mentre això no hi sigui, les captures les fan els crons de reserva de
`captura-risc.yml` (00:23, 06:47 i 14:17 UTC), que arriben quan GitHub vol.

**Recomanació: (a), amb (b) com a xarxa de seguretat** — els ancoratges de GitHub es queden com a
reserva per si la crida de Supabase falla, i com que la captura és idempotent per `(dia, franja,
horitzó)`, que es dupliquin no fa cap mal.

## 5. DECISIÓ 2 — Una sola fórmula

Ara n'hi ha dues i **no coincideixen** (és la trampa 1 del `CLAUDE.md`): la del frontend
(`detallarRisc`, perill dominant + increments) i la del backend (`risc-diari.js`, suma ponderada).
Si la captura la fa el backend amb la seva fórmula, **el número desat no serà el que es veu a la
pantalla**, i tot l'exercici no serveix de res.

Cal unificar-les. Dues maneres:

### a) Un fitxer `formula-risc.js` compartit *(recomanada)*

Un sol fitxer a l'arrel que el navegador carrega amb `<script src="formula-risc.js?v=...">` i que
els scripts de Node fan servir amb `require()`:

```js
// ... definicions ...
if (typeof module !== 'undefined') module.exports = { detallarRisc, calcularRisc, RISC_FORMULA_DEFAULT };
```

- **A favor:** una sola definició, impossible que divergeixin. Hi van també `getInfoDia`
  (l'afluència de calendari) i `avaluarOperativitat`, que el backend també necessita.
- **En contra:** trenca la regla «`index.html` és un sol fitxer». És una excepció conscient i
  acotada: un fitxer més, sense build ni dependències, servit igual per Pages.

### b) Duplicar la fórmula al backend

Copiar `detallarRisc` a `scripts/`. Funciona avui i divergeix d'aquí tres mesos. **No recomanada.**

### El que la unificació arrossega

La fórmula del frontend llegeix coses que el backend **no pot veure** perquè viuen al `localStorage`
de cada navegador. S'han de moure a Supabase (a `taula_config_alertes_smp`, on ja hi ha
`boletaires_actiu`):

| Ara | Clau | Cap a |
| --- | --- | --- |
| Punts de la fórmula | `riscGRAE_formula` | columna `formula` (jsonb) + `formula_versio` |
| Interruptor d'allaus fora de temporada | `riscGRAE_allaus` | columna `allaus_desactivat` |
| Llindars d'operativitat HC | `riscGRAE_opHC` | columna `op_config` (jsonb) |

Això, a més, arregla un problema que ja tenim: **la configuració només val per al dispositiu que la
va tocar**. Igual que els boletaires, el `localStorage` queda com a reserva quan Supabase no respon.

## 6. El reintent quan Meteocat no ha actualitzat

L'script de captura no es fia de l'hora: mira la **data d'emissió del butlletí**.

1. Es demana l'SMP i es compara `dataEmissio` amb la de l'última captura desada.
2. Si no és més nova, s'espera 5 minuts i es torna a provar, fins a 6 vegades (30 minuts).
3. Si al cap de 30 minuts continua sense actualitzar-se, **es captura igualment** amb
   `meteocat_actualitzat = false` i es diu a `fonts_estat`. Una captura que diu «aquí no hi havia
   res nou» val; una captura que no existeix, no.

Tot dins de la mateixa execució (un job de GitHub pot durar hores), que és més senzill que
encadenar execucions i deixa el reintent visible en un sol lloc.

## 7. La pestanya Historial nova

Per a cada dia:

- **Les tres captures en línia**, i per a cadascuna el risc d'avui i de demà, amb el desglossament
  desplegable exactament com es veu a la portada (es pot redibuixar des de `desglossament`, no cal
  recalcular res).
- **La columna «com ha canviat»**: què va moure el número entre una captura i la següent (per
  exemple, «SMP 2 → 4: avís nou de tempesta al Pirineu Oriental»).
- **Gràfic d'evolució** del dia: SMP i allaus hora a hora, sortint d'`smp_historic` i `bpa_historic`
  (que ja tenim, l'un amb totes les consultes i l'altre a partir d'ara).
- **Comparació previsió vs realitat**: el risc que es donava *ahir per a avui* (captura d'horitzó
  `dema`) al costat del que va sortir *avui per a avui*. Això és el que permet dir si l'endevinem, i
  ara mateix no hi ha manera de mirar-ho.
- **SMP Bombers** de cada captura, per regió.

## 8. SMP Bombers dins del risc GRAE — previst, no ara

Queda **apuntat per a més endavant**, com es va demanar. Avui l'SMP Bombers és un càlcul a part
(risc SMP per regió d'emergència) i el risc GRAE fa servir l'SMP ponderat per zones de muntanya.
Fer-lo entrar a la fórmula vol dir decidir com es combina un valor *per regió* amb un risc que ara
és *de tot Catalunya* — probablement passant el risc GRAE a ser també per regió, que és un canvi
gran i mereix el seu propi document. **Mentrestant la captura ja el desa** (`smp_bombers`), o sigui
que el dia que s'hi posi hi haurà història per calibrar-lo.

## 9. Problemes previstos i què s'hi fa

| Problema | Solució |
| --- | --- |
| El cron de GitHub no és puntual (2-7 h de retard) | §4: disparar per `pg_cron` de Supabase; GitHub com a reserva |
| Les dues fórmules no coincideixen | §5: fitxer compartit `formula-risc.js` |
| La config viu al `localStorage` i el backend no la veu | §5: moure-la a `taula_config_alertes_smp` |
| Una font que no ha arribat fa baixar el risc sense que es noti | `dades_completes` + `fonts_estat` a cada captura |
| Reintents i execucions duplicades | `unique (dia_captura, franja, horitzo)`: el reintent completa la fila |
| La captura de les 20:30 pot travessar la mitjanit si arriba tard | El dia i la franja es calculen de l'hora real a `Europe/Madrid`, com `diaDeTancament()` |
| Els punts de la fórmula canvien i els números vells deixen de ser comparables | `formula_versio` + `formula_config` a cada fila |
| Volum de dades | 6 files al dia amb uns quants jsonb: uns pocs MB l'any. No és cap problema |
| **La RLS està desactivada a 9 taules** | Vegeu el requadre de sota |

> **Seguretat (ja apuntat a `ANALISI-DADES.md`, encara sense resoldre).** Nou taules tenen la
> Row Level Security desactivada: `taula_config_alertes_smp`, `smp_override_historic`,
> `helicopters_historic`, `bpa_historic`, `previsio_historic`, `planspc_historic`,
> `afluencia_edicions`, `error_log` i `canvi_temps_historic`. Com que la clau `anon` va dins de
> l'`index.html` i és pública, **qualsevol que la tregui del codi pot llegir i modificar aquestes
> taules**. La taula nova `risc_captures` ha de néixer amb RLS posada: lectura per a tothom,
> escriptura només per a `service_role`. Per a les altres nou cal decidir les polítiques i
> aplicar-ho amb calma — activar la RLS sense polítiques deixaria l'app sense dades.

## 10. Ordre de treball

1. **Taula `risc_captures`** amb RLS. Barata i atura la pèrdua diària.
2. **`formula-risc.js` compartit** + config de la fórmula a Supabase. És la peça que fa que el
   número desat sigui el número que es veu.
3. **`scripts/captura-risc.js`** + workflow `captura-risc.yml` amb els ancoratges de reserva i el
   reintent de §6.
4. **Disparador de Supabase** (`pg_cron` + `pg_net`) per a les tres hores exactes.
5. **`bpa_historic` amb `data_consulta`** (perquè les allaus també deixin evolució; avui s'escriu a
   sobre) i el mateix per a `canvi_temps_historic` si es vol la seva evolució.
6. **Historial nou** (§7).
7. *(Previst)* SMP Bombers dins de la fórmula (§8).

Els passos 1-3 ja donen el valor principal: a partir d'aquell dia hi ha història. El 4 la fa
puntual, i el 6 la fa mirable.
