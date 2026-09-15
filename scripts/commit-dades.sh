#!/usr/bin/env bash
# Commit i push dels JSON de `data/`, resistent a la cursa entre workflows.
#
# Hi ha dos workflows que escriuen a `data/` —«Dades diàries GRAE» i «Captura
# del risc»— i es poden solapar de sobres: la captura reintenta fins a mitja
# hora si Meteocat no ha actualitzat el butlletí, o sigui que és normal que una
# passada de dades empenyi pel mig. Quan passa, el `git push` rebota.
#
# **El que no es pot fer és rebasar.** Aquests JSON són instantànies
# regenerables, no codi: no hi ha cap fusió que tingui sentit. Un `pull
# --rebase` els tracta com a fusionables i acaba en conflicte als quatre
# alhora. Va passar el 15-09-2026: la captura del vespre es va desar bé a
# Supabase i el pas de commit va morir amb `CONFLICT (content)` als quatre
# fitxers, deixant els JSON del repositori enrere sense que ho digués ningú
# més que el quadret vermell d'Actions.
#
# El criteri és **mana el més nou**: qui empeny l'últim és qui ha baixat les
# dades més tard. Si el remot s'ha mogut, es tornen a posar els nostres fitxers
# a sobre del que hi hagi allà i es torna a provar. I si el remot ja porta
# exactament el mateix, no hi ha res a empènyer i s'acaba bé.
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

missatge() { echo "chore: dades $(date -u '+%Y-%m-%d %H:%M UTC')"; }

git add data/
if git diff --staged --quiet; then
  echo "Sense canvis als JSON"
  exit 0
fi
git commit -m "$(missatge)"

for i in 1 2 3; do
  if git push; then
    echo "✅ JSON empesos"
    exit 0
  fi

  echo "⚠️ El remot s'ha mogut ($i/3): em quedo amb els JSON d'aquesta passada, que són els més nous."
  tmp=$(mktemp -d)
  cp -a data/. "$tmp/"
  git fetch origin main
  git reset --hard FETCH_HEAD
  cp -a "$tmp/." data/
  rm -rf "$tmp"

  git add data/
  if git diff --staged --quiet; then
    echo "El remot ja porta exactament aquests JSON: no hi ha res a empènyer."
    exit 0
  fi
  git commit -m "$(missatge)"
done

echo "❌ Tres intents i el push continua rebotant. Els JSON s'han quedat sense pujar."
exit 1
