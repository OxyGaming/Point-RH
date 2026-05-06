#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════
# Déploiement Point RH — instance "zd-rh" (préprod, base de données VIDE)
# ────────────────────────────────────────────────────────────────────────────
# Sous-domaine : zd-rh.apps-reseau.fr
# Port         : 3003 (3000/3001/3002 déjà occupés)
# Process PM2  : pointrh-zd
# Code         : /var/www/Point-RH-zd
# Données      : /var/data/point-rh-zd
# ════════════════════════════════════════════════════════════════════════════

# ── Configuration ─────────────────────────────────────────────────────────────
SUBDOMAIN="zd-rh.apps-reseau.fr"
PORT=3003
APP_NAME="pointrh-zd"
APP_DIR="/var/www/Point-RH-zd"
DATA_DIR="/var/data/point-rh-zd"
DB_FILE="${DATA_DIR}/prod.db"
NGINX_VHOST_NAME="pointrh-zd"
EXPECTED_IP="51.91.127.57"

SOURCE_APP_DIR="/var/www/Point-RH"
SOURCE_NGINX_VHOST="/etc/nginx/sites-available/pointrh"

echo "🚀 Déploiement Point RH (zd-rh) en cours..."
echo "   Sous-domaine : ${SUBDOMAIN}"
echo "   Port         : ${PORT}"
echo "   PM2          : ${APP_NAME}"
echo ""

# ── 0. Vérifications préalables ──────────────────────────────────────────────
echo "🔍 Vérifications..."

if [ ! -d "${SOURCE_APP_DIR}" ]; then
    echo "❌ Instance source ${SOURCE_APP_DIR} introuvable."; exit 1
fi
if [ ! -f "${SOURCE_APP_DIR}/.env" ]; then
    echo "❌ ${SOURCE_APP_DIR}/.env introuvable — impossible d'hériter des variables."; exit 1
fi
if [ ! -f "${SOURCE_NGINX_VHOST}" ]; then
    echo "❌ Vhost source ${SOURCE_NGINX_VHOST} introuvable."; exit 1
fi
if pm2 list | awk '{print $4}' | grep -qx "${APP_NAME}"; then
    echo "❌ Instance PM2 '${APP_NAME}' déjà existante. Pour repartir à zéro :"
    echo "     pm2 delete ${APP_NAME}"
    exit 1
fi
if ss -tlnp 2>/dev/null | awk '{print $4}' | grep -qE ":${PORT}\$"; then
    echo "❌ Le port ${PORT} est occupé. Adapter PORT dans le script."; exit 1
fi
if [ -e "/etc/nginx/sites-enabled/${NGINX_VHOST_NAME}" ]; then
    echo "❌ Vhost Nginx '${NGINX_VHOST_NAME}' déjà activé. Pour repartir à zéro :"
    echo "     sudo rm /etc/nginx/sites-enabled/${NGINX_VHOST_NAME}"
    echo "     sudo rm /etc/nginx/sites-available/${NGINX_VHOST_NAME}"
    exit 1
fi

# DNS — la résolution doit déjà pointer sur le VPS, sinon Let's Encrypt échouera
RESOLVED_IP=$(getent hosts "${SUBDOMAIN}" | awk '{print $1}' | head -n1)
if [ -z "${RESOLVED_IP}" ]; then
    echo "❌ ${SUBDOMAIN} ne résout pas. Vérifier l'enregistrement DNS A."; exit 1
fi
if [ "${RESOLVED_IP}" != "${EXPECTED_IP}" ]; then
    echo "⚠️  ${SUBDOMAIN} résout vers ${RESOLVED_IP} (attendu ${EXPECTED_IP})."
    echo "   Le certbot risque d'échouer. Continuer ? (Ctrl+C pour annuler, Entrée pour continuer)"
    read -r _
fi

echo "✅ Vérifications OK"
echo ""

# ── 1. Répertoires ────────────────────────────────────────────────────────────
echo "📁 Création des répertoires..."
sudo mkdir -p "${DATA_DIR}"
sudo chown ubuntu:ubuntu "${DATA_DIR}"
sudo mkdir -p "${APP_DIR}"
sudo chown ubuntu:ubuntu "${APP_DIR}"

# ── 2. Clone du repo (URL héritée de l'instance source) ──────────────────────
echo "📥 Clone du repository..."
REMOTE=$(cd "${SOURCE_APP_DIR}" && git config --get remote.origin.url)
echo "   Remote : ${REMOTE}"

if [ -z "$(ls -A "${APP_DIR}" 2>/dev/null)" ]; then
    git clone "${REMOTE}" "${APP_DIR}"
else
    echo "   Répertoire déjà initialisé, fetch+pull..."
    cd "${APP_DIR}"
    git fetch origin
    git checkout master
    git pull origin master
fi

cd "${APP_DIR}"
git checkout master
git pull origin master

# ── 3. Génération du .env ─────────────────────────────────────────────────────
# Stratégie : on hérite du .env source pour conserver les variables optionnelles
# (SIM_MAX_*, CASCADE_*, etc.), MAIS on régénère les variables instance-spécifiques :
#   - DATABASE_URL → nouvelle BDD vide
#   - PORT         → 3003
#   - JWT_SECRET   → nouveau (BDD vide, pas de comptes à honorer)
#   - NEXT_SERVER_ACTIONS_ENCRYPTION_KEY → nouveau (isolation totale)
echo "🔐 Génération du .env (instance isolée)..."
NEW_JWT=$(openssl rand -base64 48)
NEW_SA_KEY=$(openssl rand -base64 32)

# Filtrer les variables qu'on va réécrire, garder le reste intact
grep -vE '^(DATABASE_URL|PORT|JWT_SECRET|NEXT_SERVER_ACTIONS_ENCRYPTION_KEY|NODE_ENV)=' \
    "${SOURCE_APP_DIR}/.env" > .env || true

# Ajouter les variables instance-spécifiques
cat >> .env <<EOF
# ─── Variables instance "zd-rh" (régénérées le $(date -Iseconds)) ───
DATABASE_URL="file:${DB_FILE}"
PORT=${PORT}
JWT_SECRET="${NEW_JWT}"
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="${NEW_SA_KEY}"
NODE_ENV=production
EOF

chmod 600 .env
echo "   ✅ .env créé (600)"

# ── 4. Dépendances ────────────────────────────────────────────────────────────
# IMPORTANT : --include=dev neutralise NODE_ENV=production et NPM_CONFIG_OMIT=dev
# qui pourraient polluer l'env et faire skip silencieusement les devDeps
# (Tailwind, TypeScript, ESLint…). Sans ces deps, le build casse 200 lignes
# plus tard dans webpack avec une trace illisible. Voir incident 2026-05.
echo "📦 npm install..."
npm install --include=dev

# ── 5. Schéma Prisma sur BDD vide ────────────────────────────────────────────
echo "🗄️  Création de la BDD via prisma db push..."
set -a
source .env
set +a
npx prisma db push

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

# ── 6. Build ──────────────────────────────────────────────────────────────────
echo "🏗️  npm run build..."
npm run build

# ── 7. Copie des statiques (output: standalone) ──────────────────────────────
echo "📂 Copie des fichiers statiques..."
mkdir -p .next/standalone/public
mkdir -p .next/standalone/.next/static
cp -r public/. .next/standalone/public/
cp -r .next/static/. .next/standalone/.next/static/

# ── 8. Démarrage PM2 ──────────────────────────────────────────────────────────
echo "🟢 Démarrage PM2 (${APP_NAME} sur :${PORT})..."
PORT=${PORT} \
DATABASE_URL="file:${DB_FILE}" \
JWT_SECRET="${NEW_JWT}" \
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="${NEW_SA_KEY}" \
NODE_ENV=production \
    pm2 start node --name "${APP_NAME}" -- .next/standalone/server.js

pm2 save

# Petite attente pour que le serveur soit prêt avant le test
sleep 3

# Test local (sans passer par Nginx)
if curl -fsS "http://127.0.0.1:${PORT}/" -o /dev/null; then
    echo "   ✅ App répond sur 127.0.0.1:${PORT}"
else
    echo "   ⚠️  L'app ne répond pas encore sur :${PORT}. Vérifier 'pm2 logs ${APP_NAME}'."
fi

# ── 9. Vhost Nginx HTTP minimal (certbot complétera le HTTPS) ────────────────
echo "⚙️  Vhost Nginx HTTP-only (challenge ACME)..."

sudo tee "/etc/nginx/sites-available/${NGINX_VHOST_NAME}" >/dev/null <<NGINX_HTTP
server {
    listen 80;
    listen [::]:80;
    server_name ${SUBDOMAIN};

    # Limite identique à pointrh : uploads Excel/TXT planning
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
    }

    access_log /var/log/nginx/${NGINX_VHOST_NAME}.access.log;
    error_log  /var/log/nginx/${NGINX_VHOST_NAME}.error.log;
}
NGINX_HTTP

sudo ln -sf "/etc/nginx/sites-available/${NGINX_VHOST_NAME}" \
            "/etc/nginx/sites-enabled/${NGINX_VHOST_NAME}"

sudo nginx -t
sudo systemctl reload nginx

# Test que le vhost HTTP répond bien sur le sous-domaine externe
sleep 1
if curl -fsS -H "Host: ${SUBDOMAIN}" "http://127.0.0.1/" -o /dev/null; then
    echo "   ✅ Nginx route ${SUBDOMAIN} → :${PORT}"
else
    echo "   ⚠️  Le routing Nginx ne semble pas répondre — Let's Encrypt risque d'échouer."
fi

# ── 10. Certificat Let's Encrypt + bloc HTTPS automatique ────────────────────
echo "🔒 Certbot (Let's Encrypt)..."
# Le compte LE existe déjà (cert pour rh.apps-reseau.fr présent), donc pas besoin
# de --email. Certbot ajoute automatiquement le bloc HTTPS et la redirection 80→443.
sudo certbot --nginx -d "${SUBDOMAIN}" -n --agree-tos --redirect

# ── 11. Récapitulatif ─────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "✅ Déploiement zd-rh terminé !"
echo "════════════════════════════════════════════════════════════════════════"
echo "   URL       : https://${SUBDOMAIN}"
echo "   Code      : ${APP_DIR}"
echo "   Données   : ${DB_FILE} (BDD VIDE)"
echo "   Port local: ${PORT}"
echo "   PM2       : ${APP_NAME}"
echo ""
echo "   ⚠️  La base est VIDE — créez un compte admin via l'app à la 1re visite."
echo "   📋 Pour suivre les logs : pm2 logs ${APP_NAME}"
echo "   🔄 Pour redéployer      : adapter deploy-rh.sh ou relancer ce script"
echo "════════════════════════════════════════════════════════════════════════"
