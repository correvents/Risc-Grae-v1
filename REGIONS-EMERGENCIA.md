# Regions d'emergència de Bombers → comarques

Document de treball per reformular la pestanya **SMP**: passar d'agrupar per zones
geogràfiques de muntanya (zones internes de Meteocat) a agrupar per **regions
d'emergència** de Bombers de la Generalitat.

Estat: **decidit i implementat** a la pestanya *SMP Bombers*. Les subregions del
GRAE i el pas a municipis queden per a més endavant (vegeu l'apartat 6).

---

## 1. Quantes regions hi ha

Fins al febrer de 2026 n'hi havia **7**: Metropolitana Nord, Metropolitana Sud,
Girona, Centre, Lleida, Tarragona i Terres de l'Ebre.

El febrer de 2026 el Govern va aprovar la creació de la **Regió d'Emergències
Pirineus** (seu a Sort), que se segrega de la de Lleida. Són, doncs, **8**.

Això coincideix amb el que demana el cap del GRAE: la de Lleida s'ha de partir en
dues. El nom oficial de la nova ja existeix — **Pirineus** — i inclou l'Aran, tot
i que l'Aran manté el seu propi cos de bombers.

---

## 2. Taula regió → comarques

Els codis són els `CODICOMAR` oficials, que **coincideixen amb els `idComarca` que
retorna l'API SMP de Meteocat** (comprovat contra `scripts/fetch-smp.js` i
`comarques_simplificat_500m.geojson`). Per tant el mapatge és directe.

| Regió d'emergències | Comarques (codi) |
| --- | --- |
| **Metropolitana Nord** | Maresme (21) · Vallès Occidental (40) · Vallès Oriental (41) ¹ |
| **Metropolitana Sud** | Barcelonès¹ (13) · Baix Llobregat (11) · Alt Penedès (03) · Garraf (17) · Anoia² (06) |
| **Girona** | Alt Empordà (02) · Baix Empordà (10) · Gironès (20) · Pla de l'Estany (28) · Selva (34) · Garrotxa (19) · Ripollès (31) |
| **Centre** | Bages (07) · Osona (24) · Berguedà (14) · Solsonès (35) · Moianès (42) · Lluçanès (43) · Cerdanya³ (15) |
| **Lleida** | Segrià (33) · Noguera (23) · Urgell (38) · Pla d'Urgell (27) · Garrigues (18) · Segarra (32) |
| **Pirineus** (nova) | Alta Ribagorça (05) · Pallars Sobirà (26) · Pallars Jussà (25) · Alt Urgell (04) — l'Aran (39) hi és al decret, però va a part⁴ |
| **Tarragona** | Tarragonès (36) · Baix Camp (08) · Alt Camp (01) · Baix Penedès (12) · Conca de Barberà (16) · Priorat (29) |
| **Terres de l'Ebre** | Baix Ebre (09) · Montsià (22) · Ribera d'Ebre (30) · Terra Alta (37) |

Les 43 comarques hi són totes, sense forats.

### Notes

**¹ El Barcelonès està partit entre les dues metropolitanes.** Badalona, Sant Adrià
de Besòs i Santa Coloma de Gramenet són de la Nord; la resta (Barcelona i
l'Hospitalet) de la Sud. Barcelona ciutat, a més, té bombers municipals propis.

**² L'Anoia està partida entre Metropolitana Sud i Centre.** L'Alta Anoia (Calaf,
Calonge de Segarra, Castellfollit de Riubregós, els Prats de Rei, Pujalt, Sant
Martí Sesgueioles, Sant Pere Sallavinera i Veciana — 8 municipis) és del Centre;
els altres 25 (Igualada, Piera, Capellades…) són de la Metropolitana Sud.

**³ La Cerdanya va al Centre.** El decret la posa a Pirineus, però operativament
continua depenent de la sala de Manresa, i això és el que s'ha decidit reflectir.
Canviar-ho és tocar una línia de `REGIONS_BOMBERS` a `index.html`.

**⁴ L'Aran i la ciutat de Barcelona van a part** (`COMARQUES_FORA_REGIO` a
`index.html`). No és territori dels Bombers de la Generalitat: l'Aran té cos de
bombers propi i Barcelona, bombers municipals. Al mapa surten en gris, amb el
seu perímetre marcat, i **no compten al risc de cap regió** — el valor de l'SMP
es continua veient al tooltip, perquè el mal temps hi és igualment.

Amb un matís que ve del gra de les dades: l'Aran és una comarca sencera i se'n
pot sortir del càlcul, però **Barcelona no ho és**. El Barcelonès continua
comptant per la Metropolitana Sud, perquè l'Hospitalet, Badalona, Sant Adrià i
Santa Coloma sí que són territori nostre; del mapa només se'n marca el terme
municipal (`CONTORN_BARCELONA`, l'anell principal del municipi 080193). Si algun
dia l'SMP arriba per municipis, Barcelona també es podrà treure del càlcul.

**Zones marítimes.** L'SMP també emet avisos per zones marítimes, que no són
comarques. Cada zona s'adjunta a la comarca costanera que té al davant
(`MARITIMES_A_COMARCA` a `index.html`) i la comarca es queda el valor més alt dels
dos. Els codis 88-99 són els que ja hi havia al projecte i **no estan verificats**:
no hem vist mai una alerta marítima passar-hi. `fetch-smp.js` ara registra al log
del workflow qualsevol codi desconegut amb tots els seus camps.

---

## 3. El problema del gra: comarca vs municipi

L'SMP arriba **per comarca**, i dues comarques (Anoia i Barcelonès) estan partides
per municipis entre dues regions. Com que no podem baixar de comarca, cal assignar
cada comarca sencera:

- **Anoia** → Metropolitana Sud (25 municipis de 33). L'Alta Anoia hi queda mal
  assignada, però és territori de poc interès per al GRAE.
- **Barcelonès** → Metropolitana Sud (hi són Barcelona i l'Hospitalet; a la Nord,
  Badalona, Sant Adrià i Santa Coloma).

Si algun dia l'SMP arriba **per municipis**, aquestes dues assignacions deixen de
ser una aproximació: el mateix càlcul es podrà fer amb el gra real.

---

## 4. Quines regions es tornen a partir, per al GRAE

El cap del GRAE diu que "algunes les haurem de partir en dos". La de Lleida ja ve
partida d'origen (Lleida / Pirineus). Les candidates següents, si el criteri és
separar la part de muntanya de la part de plana o litoral:

| Regió | Part de muntanya (interès GRAE) | Resta |
| --- | --- | --- |
| Girona | Ripollès · Garrotxa | Alt/Baix Empordà · Gironès · Pla de l'Estany · Selva |
| Centre | Berguedà · Solsonès · (Cerdanya) | Bages · Osona · Moianès · Lluçanès · Alta Anoia |
| Tarragona | Conca de Barberà · Priorat (Prades, Montsant) | Tarragonès · Baix Camp · Alt Camp · Baix Penedès |

Metropolitana Nord (Montseny, Sant Llorenç), Metropolitana Sud (Montserrat) i
Terres de l'Ebre (Ports) tenen massís però són d'una peça; **proposta: no partir-les.**

---

## 5. Com està implementat

Pestanya **SMP Bombers** d'`index.html`. És un càlcul independent del risc del
GRAE: no entra a la fórmula de `Risc GRAE` ni es desa a `risc_historic`.

**Risc d'una comarca (0-6).** No se'l calcula el projecte: **Meteocat ja publica
un grau de perill de 0 a 6** per comarca i franja de 6 h, que surt de creuar el
llindar del fenomen amb la probabilitat que passi. El color de l'avís (verd, groc,
taronja, vermell) només n'és l'agrupació. Ve al camp `perill` de cada afectació i
`fetch-smp.js` el desa cru com a `grauPerill`.

Per a dades anteriors a aquest canvi, que no porten `grauPerill`, hi ha una escala
de reserva deduïda del color (Groc 1, Taronja 3, Vermell 5, +1 si la probabilitat
és alta). És una aproximació i desapareixerà sola.

> **Ull:** el camp `perill` es mostrava fins ara com una probabilitat
> (*Poc probable*…*Segur*) a la pestanya Alertes. Segons la documentació de
> Meteocat és el grau de perill 1-6, no la probabilitat. Dues coses ho reforcen:
> Meteocat documenta **tres** bandes de probabilitat (10-30 %, 30-70 %, >70 %) i
> no quatre, i a les dades reals el llindar alt sempre surt com a "Segur" mentre
> que el baix no hi surt mai — que és l'inrevés del que hauria de passar si fos
> una probabilitat. Les etiquetes de la pestanya Alertes s'han de revisar.

**Risc d'una regió i de Catalunya (`agregarRisc`).** El valor més alt que
assoleix **la meitat + 1** de les unitats. Els valors s'engloben: una comarca amb
un 4 també compta per al 3 i per al 2. El risc de Catalunya és el mateix càlcul
aplicat sobre les 8 regions.

> Exemple del cap del GRAE: 8 regions amb 3, 3, 3, 2, 2, 2, 4, 4. El llindar és 5.
> N'hi ha 5 amb ≥3 i només 2 amb ≥4 → el risc de Catalunya és **3**.

**Canvi obligatori al backend.** `scripts/fetch-smp.js` col·lapsava `idComarca` en
una zona Meteocat *abans* de desar, i la comarca es perdia. Ara cada afectació de
`smp_latest.json` porta `comarca` i `comarcaNom`. Les files que van a
`smp_historic` es tornen a agrupar per zona (`agruparPerZona`), o sigui que la
taula de Supabase **no canvia**.

**Conseqüència.** El *fallback* a Supabase no porta comarca, perquè la taula desa
la zona. Quan el frontend hi cau, la pestanya surt buida amb un avís explicant-ho.
La pestanya tampoc no té dades fins que el workflow no torni a generar
`data/smp_latest.json` amb el format nou.

**Mapa.** SVG pla generat des de `comarques_simplificat_500m.geojson`, sense
Leaflet ni cap altra dependència, amb dues vistes: *per regions* (totes les
comarques d'una regió pintades amb el valor de la regió) i *per comarques*. El
GeoJSON només es baixa quan s'obre la pestanya.

El **perímetre de cada regió** va marcat en negre gruixut (`svgDefsPerimetres`).
No es calcula ajuntant les comarques i esborrant les fronteres de dins: el
GeoJSON està simplificat sense topologia i les comarques veïnes no comparteixen
tots els vèrtexs, o sigui que les fronteres internes no s'anul·len i queden
trossos de ratlla escampats (provat, es veu). Es fa amb SVG: el contorn de totes
les comarques de la regió amb un traç gruixut, retallat amb *tot menys la regió*
(rectangle sencer + els seus anells, amb `clip-rule="evenodd"`). Del traç només
en queda la meitat de fora i les ratlles de dins desapareixen soles. Es defineix
un cop i els quatre mapes el reutilitzen amb `<use>`.

---

## 6. Objectius futurs

1. **Subregions per al GRAE.** Un mapa equivalent però partint les regions en
   muntanya i plana (apartat 4). El càlcul ja hi serveix tal com és: només canvia
   la taula de grups.
2. **Risc SMP per municipis.** Si algun dia l'SMP arriba amb gra de municipi, el
   mateix `agregarRisc` funciona un nivell més avall, i les assignacions
   aproximades de l'Anoia i el Barcelonès deixen de ser aproximades.
3. **Verificar els codis de les zones marítimes.** Ja s'adjunten a la comarca
   costanera que tenen al davant, però la taula 88-99 és heretada i sense
   comprovar. La primera alerta d'onatge sortirà al log del workflow amb tots els
   camps i llavors es podrà corregir.
4. **Històric.** `smp_historic` desa la zona, no la comarca. Si es vol poder
   reconstruir el risc per regions cap enrere, cal afegir-hi la comarca i decidir
   què es fa amb les files antigues.
5. **Revisar les etiquetes de probabilitat de la pestanya Alertes**, que fan
   servir el camp `perill` com si fos una probabilitat quan sembla ser el grau de
   perill 1-6.
6. **Unificar les dues fórmules de risc** (pendent de fa temps, vegeu `DIARI.md`).

---

## Fonts

- [Regions d'emergències — Departament d'Interior](https://interior.gencat.cat/ca/el_departament/adreces-i-telefons/regions_d_emergencies/index.html)
- [Regions d'emergències de Bombers — gencat](https://web.gencat.cat/ca/generalitat/com-ens-organitzem/departaments/interior/regions-demergencies)
- [Regions d'Emergències de Bombers — Dades obertes de Catalunya](https://analisi.transparenciacatalunya.cat/Seguretat/Regions-d-Emerg-ncies-de-Bombers/55ge-4jcz)
- [La Generalitat crea la Regió d'Emergències Pirineus — RàdioSeu](https://www.radioseu.cat/noticies/la-generalitat-crea-la-regio-demergencies-pirineus)
- [Sort acollirà la seu de la nova Regió d'Emergències Pirineus — Pirineus Digital](https://pirineusdigital.cat/sort-acollira-la-seu-de-la-nova-regio-demergencies-pirineus/)
- [Els Comuns demanen explicacions per l'exclusió de la Cerdanya — Pirineus Digital](https://pirineusdigital.cat/els-comuns-demanen-explicacions-el-govern-sobre-lexclusio-de-cerdanya-de-la-regio-demergencies-del-pirineu/)
- Ordre INT/184/2015, que fixa les comarques i municipis de cada regió d'emergències.
