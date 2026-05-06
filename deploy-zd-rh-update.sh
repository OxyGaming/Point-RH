#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════
# Mise à jour Point RH — instance "zd-rh" (préprod)
# ────────────────────────────────────────────────────────────────────────────
# À utiliser pour TOUS les redéploiements ultérieurs de pointrh-zd.
# NE PAS confondre avec deploy-zd-rh.sh (déploiement INITIAL — regénère le .env
# et casserait les Server Actions en cache chez les clients).
# ════════════════════════════════════════════════════════════════════════════

echo "🚀 Déploiement Point RH (zd-rh) en cours..."

# ── Configuration ─────────────────────────────────────────────────────────────
APP_DIR="/var/www/Point-RH-zd"
DATA_DIR="/var/data/point-rh-zd"
DB_FILE="$DATA_DIR/prod.db"
BACKUP_DIR="$DATA_DIR/backups"
BACKUP_KEEP=7
BACKUP_FILE=""
PM2_NAME="pointrh-zd"
PORT=3003

cd "$APP_DIR" || exit 1

# ── Sauvegarde timestampée ────────────────────────────────────────────────────
echo "💾 Sauvegarde base de données..."
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/prod_${TIMESTAMP}.db"

if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$BACKUP_FILE"
  echo "✅ Backup : $BACKUP_FILE"
  ls -t "$BACKUP_DIR"/prod_*.db 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f
  echo "🗂️  Backups conservés : $(ls "$BACKUP_DIR"/prod_*.db 2>/dev/null | wc -l)"
else
  echo "ℹ️ Aucune base existante à sauvegarder"
fi

# ── Restauration automatique en cas d'erreur ──────────────────────────────────
restore_on_error() {
  local exit_code=$?
  echo ""
  echo "❌ Erreur lors du déploiement (code $exit_code) !"
  if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    echo "🔄 Restauration automatique depuis $BACKUP_FILE..."
    cp "$BACKUP_FILE" "$DB_FILE"
    echo "✅ Base restaurée."
    pm2 restart "$PM2_NAME" --update-env 2>/dev/null || true
    echo "⚠️  Déploiement annulé — ancienne version toujours en ligne."
  else
    echo "⚠️  Pas de backup disponible pour restaurer."
  fi
  exit "$exit_code"
}
trap restore_on_error ERR

# ── Pull Git ──────────────────────────────────────────────────────────────────
echo "📥 Pull Git..."
git checkout master
git pull origin master

# ── Dépendances ───────────────────────────────────────────────────────────────
# IMPORTANT : --include=dev neutralise NODE_ENV=production et NPM_CONFIG_OMIT=dev
# qui pourraient polluer l'env et faire skip silencieusement les devDeps
# (Tailwind, TypeScript, ESLint…). Sans ces deps, le build casse 200 lignes
# plus tard dans webpack avec une trace illisible. Voir incident 2026-05.
echo "📦 Installation des dépendances..."
npm install --include=dev

# ── Environnement ─────────────────────────────────────────────────────────────
echo "🔐 Chargement de l'environnement..."
set -a
source .env
set +a

# ── Vérification DATABASE_URL ─────────────────────────────────────────────────
# Garde-fou : on doit pointer vers la BDD de l'instance zd-rh (jamais celle de prod)
if [[ "${DATABASE_URL:-}" != *"point-rh-zd"* ]]; then
  echo "❌ ERREUR : DATABASE_URL ne pointe pas vers /var/data/point-rh-zd"
  echo "   Valeur actuelle : ${DATABASE_URL:-<non définie>}"
  echo "   Vérifiez le fichier .env sur le serveur."
  exit 1
fi
if [[ "${DATABASE_URL:-}" != *"prod.db"* ]]; then
  echo "❌ ERREUR : DATABASE_URL ne pointe pas vers prod.db"
  echo "   Valeur actuelle : ${DATABASE_URL:-<non définie>}"
  exit 1
fi
echo "🗄️  Base de données : $DATABASE_URL"

# ── Synchronisation schéma Prisma ─────────────────────────────────────────────
#
# Safelist des tables effaçables en cas de blocage migration.
# Toute migration qui toucherait une table HORS de cette liste doit échouer
# immédiatement : les données métier (agents, utilisateurs, règles, LPA,
# JsType, etc.) ne sont PAS réimportables depuis un fichier externe.
#
# Tables réimportables (planning = issu d'un fichier Excel/TXT) :
PURGEABLE_TABLES=("ResultatAgent" "Simulation" "PlanningLigne" "PlanningImport")

echo "🗄️ Synchronisation du schéma Prisma..."
PUSH_OUTPUT=$(npx prisma db push 2>&1) && PUSH_OK=true || PUSH_OK=false
echo "$PUSH_OUTPUT"

if [ "$PUSH_OK" = "false" ] && echo "$PUSH_OUTPUT" | grep -q "cannot be executed"; then
  echo ""
  echo "⚠️  Migration bloquée par des données existantes."

  CITED_TABLES=$(echo "$PUSH_OUTPUT" | grep -oE '\b(ResultatAgent|Simulation|PlanningLigne|PlanningImport|Agent|User|AuditLog|UserAgentFilter|WorkRule|JsType|Lpa|LpaJsType|NpoExclusionCode|AgentJsDeplacementRule)\b' | sort -u)

  if [ -z "$CITED_TABLES" ]; then
    echo "❌ Impossible d'identifier les tables bloquantes depuis la sortie Prisma."
    echo "   Intervention manuelle requise — déploiement annulé."
    exit 1
  fi

  echo "   Tables bloquantes identifiées :"
  echo "$CITED_TABLES" | sed 's/^/     - /'

  UNSAFE=""
  for t in $CITED_TABLES; do
    FOUND=false
    for p in "${PURGEABLE_TABLES[@]}"; do
      if [ "$t" = "$p" ]; then FOUND=true; break; fi
    done
    if [ "$FOUND" = false ]; then
      UNSAFE="$UNSAFE $t"
    fi
  done

  if [ -n "$UNSAFE" ]; then
    echo ""
    echo "🛑 ARRÊT : la migration toucherait des tables non réimportables :$UNSAFE"
    echo "   Ces données ne peuvent pas être reconstruites depuis un fichier d'import."
    echo "   Le déploiement est annulé pour protéger les données."
    echo ""
    echo "   Pour forcer : traiter la migration manuellement (prisma migrate resolve,"
    echo "   scripts de backfill, etc.), puis relancer ce déploiement."
    exit 1
  fi

  echo ""
  echo "   Toutes les tables bloquantes sont réimportables — purge en cours..."
  sqlite3 "$DB_FILE" "
    DELETE FROM ResultatAgent;
    DELETE FROM Simulation;
    DELETE FROM PlanningLigne;
    DELETE FROM PlanningImport;
  "
  echo "✅ Tables de planning vidées — nouvelle tentative..."
  npx prisma db push
elif [ "$PUSH_OK" = "false" ]; then
  echo "❌ Échec prisma db push (erreur non liée aux données de planning)"
  exit 1
fi

# ── Garde-fou devDependencies ─────────────────────────────────────────────────
# Vérification explicite avant build : si NODE_ENV=production ou omit=dev
# polluent l'env, npm install peut silencieusement skip les devDeps. On échoue
# tôt avec un message clair plutôt que de plonger dans une trace webpack.
if [ ! -d "node_modules/@tailwindcss/postcss" ]; then
  echo "❌ devDependencies manquantes (@tailwindcss/postcss absent de node_modules/)"
  echo "   Cause probable : NODE_ENV=production ou npm config omit=dev exporté."
  echo "   Correction : rm -rf node_modules && npm install --include=dev"
  exit 1
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "🏗️ Build..."
npm run build

# ── Copie des fichiers statiques dans le dossier standalone ───────────────────
# Requis avec output: "standalone" — Next.js ne les copie pas automatiquement
echo "📂 Copie des fichiers statiques..."
mkdir -p .next/standalone/public
mkdir -p .next/standalone/.next/static
cp -r public/. .next/standalone/public/
cp -r .next/static/. .next/standalone/.next/static/

# ── Redémarrage PM2 ───────────────────────────────────────────────────────────
# Désactiver le trap avant le redémarrage (PM2 peut retourner des codes non-0)
trap - ERR
echo "🔄 Redémarrage PM2..."
pm2 restart "$PM2_NAME" --update-env || \
  PORT=$PORT DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-}" \
  pm2 start node --name "$PM2_NAME" -- .next/standalone/server.js

echo "💾 Sauvegarde configuration PM2..."
pm2 save

echo ""
echo "✅ Déploiement Point RH (zd-rh) terminé avec succès"
echo "   Base   : $DB_FILE"
echo "   Backup : $BACKUP_FILE"
echo "   PM2    : $PM2_NAME"
