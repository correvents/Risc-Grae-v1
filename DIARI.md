# Diari del projecte

Registre cronològic de què s'ha fet i per què. **El més recent, a dalt.**

Com que cada sessió de Claude Code arrenca sense memòria, aquest fitxer és el que permet reprendre la feina on es va deixar. En acabar una sessió, afegeix-hi una entrada.

Format d'una entrada: data, què s'ha fet, per què, i què queda pendent.

---

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
