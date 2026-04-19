#!/bin/bash
set -euo pipefail

echo "🚀 Déploiement Point RH en cours..."

# ── Configuration ─────────────────────────────────────────────────────────────
APP_DIR="/var/www/Point-RH"
DATA_DIR="/var/data/point-rh"
DB_FILE="$DATA_DIR/prod.db"
BACKUP_DIR="$DATA_DIR/backups"
BACKUP_KEEP=7   # nombre de backups à conserver
BACKUP_FILE=""  # rempli plus bas

cd "$APP_DIR" || exit 1

# ── Sauvegarde timestampée ────────────────────────────────────────────────────
echo "💾 Sauvegarde base de données..."
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/prod_${TIMESTAMP}.db"

if [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$BACKUP_FILE"
  echo "✅ Backup : $BACKUP_FILE"
  # Rotation — supprimer les anciens au-delà de BACKUP_KEEP
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
    pm2 restart pointrh --update-env 2>/dev/null || true
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
echo "📦 Installation des dépendances..."
npm install

# ── Environnement ─────────────────────────────────────────────────────────────
echo "🔐 Chargement de l'environnement..."
set -a
source .env
set +a

# ── Vérification DATABASE_URL ─────────────────────────────────────────────────
if [[ "${DATABASE_URL:-}" != *"prod.db"* ]]; then
  echo "❌ ERREUR : DATABASE_URL ne pointe pas vers prod.db"
  echo "   Valeur actuelle : ${DATABASE_URL:-<non définie>}"
  echo "   Vérifiez le fichier .env sur le serveur."
  exit 1
fi
echo "🗄️  Base de données : $DATABASE_URL"

# ── Synchronisation schéma Prisma ─────────────────────────────────────────────
echo "🗄️ Synchronisation du schéma Prisma..."
# Première tentative de push
PUSH_OUTPUT=$(npx prisma db push 2>&1) && PUSH_OK=true || PUSH_OK=false
echo "$PUSH_OUTPUT"

if [ "$PUSH_OK" = "false" ] && echo "$PUSH_OUTPUT" | grep -q "cannot be executed"; then
  echo ""
  echo "⚠️  Migration bloquée par des données existantes dans les tables de planning."
  echo "   Ces données sont réimportables depuis l'interface — vidage en cours..."
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
pm2 restart pointrh --update-env || \
  PORT=3001 DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" pm2 start node --name pointrh -- .next/standalone/server.js

echo "💾 Sauvegarde configuration PM2..."
pm2 save

echo ""
echo "✅ Déploiement Point RH terminé avec succès"
echo "   Base : $DB_FILE"
echo "   Backup : $BACKUP_FILE"
