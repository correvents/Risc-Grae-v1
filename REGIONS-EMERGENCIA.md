# Regions d'emergència de Bombers → comarques

Document de treball per reformular la pestanya **SMP**: passar d'agrupar per zones
geogràfiques de muntanya (zones internes de Meteocat) a agrupar per **regions
d'emergència** de Bombers de la Generalitat.

Estat: **proposta, pendent de validar amb el cap del GRAE.** Encara no s'ha tocat codi.

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
| **Metropolitana Nord** | Barcelonès¹ (13) · Maresme (21) · Vallès Occidental (40) · Vallès Oriental (41) |
| **Metropolitana Sud** | Barcelonès¹ (13) · Baix Llobregat (11) · Alt Penedès (03) · Garraf (17) · Anoia² (06) |
| **Girona** | Alt Empordà (02) · Baix Empordà (10) · Gironès (20) · Pla de l'Estany (28) · Selva (34) · Garrotxa (19) · Ripollès (31) |
| **Centre** | Bages (07) · Osona (24) · Berguedà (14) · Solsonès (35) · Moianès (42) · Lluçanès (43) · Cerdanya³ (15) · Anoia² (06) |
| **Lleida** | Segrià (33) · Noguera (23) · Urgell (38) · Pla d'Urgell (27) · Garrigues (18) · Segarra (32) |
| **Pirineus** (nova) | Aran (39) · Alta Ribagorça (05) · Pallars Sobirà (26) · Pallars Jussà (25) · Alt Urgell (04) · Cerdanya³ (15) |
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

**³ La Cerdanya és el punt discutit.** El decret la posa a Pirineus, però
operativament continua depenent de la sala de Manresa (Centre), i això ha generat
polèmica al territori. **Cal decidir a quina la posem.**

**Zones marítimes.** L'SMP també emet avisos per zones marítimes (`idComarca` 88-99,
que el codi actual anomena `Comarca 88`…`Comarca 99`). No tenen regió d'emergència.
Cal decidir si es descarten o si es pengen de les regions costaneres.

---

## 3. El problema del gra: comarca vs municipi

L'SMP arriba **per comarca**, i dues comarques (Anoia i Barcelonès) estan partides
per municipis entre dues regions. Com que no podem baixar de comarca, cal assignar
cada comarca sencera:

- **Anoia** → Metropolitana Sud (25 municipis de 33). L'Alta Anoia hi queda mal
  assignada, però és territori de poc interès per al GRAE.
- **Barcelonès** → indiferent per al GRAE (no hi ha muntanya). Proposta: Metropolitana Sud.

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

## 5. Què implica al codi (encara no fet)

1. **`scripts/fetch-smp.js`** col·lapsa `idComarca` → zona Meteocat abans de desar.
   Per anar per regions cal que desi la **comarca** (o directament la regió) i no la
   zona. Mentre desi la zona, la informació de comarca es perd i no es pot recuperar.
2. **`index.html`** fa un segon salt, `riscParams.zonesGrup` (zona Meteocat → grup
   GRAE). Aquest mapatge desapareix i el substitueix comarca → regió.
3. **`smp_historic`** de Supabase té una columna `zona` amb els noms antics. En
   canviar la nomenclatura, l'històric deixa de ser comparable: cal decidir si es
   migra, si es conviu amb les dues o si es parteix de zero.
4. **`riscParams.zones`** (quines zones compten per al risc) i la taula
   `taula_config_Alertes_SMP` passen a tenir una fila per regió.
5. **El manual integrat** d'`index.html` (apartat 2.9, "Agrupació de zones SMP")
   s'ha d'actualitzar amb la taula nova.

---

## Fonts

- [Regions d'emergències — Departament d'Interior](https://interior.gencat.cat/ca/el_departament/adreces-i-telefons/regions_d_emergencies/index.html)
- [Regions d'emergències de Bombers — gencat](https://web.gencat.cat/ca/generalitat/com-ens-organitzem/departaments/interior/regions-demergencies)
- [Regions d'Emergències de Bombers — Dades obertes de Catalunya](https://analisi.transparenciacatalunya.cat/Seguretat/Regions-d-Emerg-ncies-de-Bombers/55ge-4jcz)
- [La Generalitat crea la Regió d'Emergències Pirineus — RàdioSeu](https://www.radioseu.cat/noticies/la-generalitat-crea-la-regio-demergencies-pirineus)
- [Sort acollirà la seu de la nova Regió d'Emergències Pirineus — Pirineus Digital](https://pirineusdigital.cat/sort-acollira-la-seu-de-la-nova-regio-demergencies-pirineus/)
- [Els Comuns demanen explicacions per l'exclusió de la Cerdanya — Pirineus Digital](https://pirineusdigital.cat/els-comuns-demanen-explicacions-el-govern-sobre-lexclusio-de-cerdanya-de-la-regio-demergencies-del-pirineu/)
- Ordre INT/184/2015, que fixa les comarques i municipis de cada regió d'emergències.
