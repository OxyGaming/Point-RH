#!/bin/bash
#
# toggle-unified.sh — gestion des flags du solveur unifié en production.
#
# Le solveur unifié est livré derrière deux flags optionnels :
#   - UNIFIED_SHADOW=1            → exécution en parallèle, logs serveur
#                                    uniquement, AUCUN impact UI
#   - FEATURE_UNIFIED_PRIMARY=1   → expose l'onglet "Solveur unifié ⚗"
#                                    dans le multi-JS et la simulation simple
#
# Le rollback consiste à commenter la ligne et redémarrer PM2. Ce script
# automatise les manipulations courantes pour éviter les erreurs
# (oubli de restart, ligne ajoutée en double, etc.).
#
# Usage :
#   ./toggle-unified.sh status         → affiche l'état des deux flags
#   ./toggle-unified.sh shadow on      → active UNIFIED_SHADOW=1
#   ./toggle-unified.sh shadow off     → désactive UNIFIED_SHADOW
#   ./toggle-unified.sh ui on          → active FEATURE_UNIFIED_PRIMARY=1
#   ./toggle-unified.sh ui off         → désactive FEATURE_UNIFIED_PRIMARY
#   ./toggle-unified.sh full on        → active les deux
#   ./toggle-unified.sh full off       → désactive les deux (rollback complet)
#
# Toute modification entraîne un restart PM2 (--update-env pour relire .env).

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Point-RH}"
ENV_FILE="$APP_DIR/.env"
PM2_NAME="${PM2_NAME:-pointrh}"

cd "$APP_DIR" || { echo "❌ APP_DIR introuvable : $APP_DIR"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "❌ Fichier .env introuvable : $ENV_FILE"; exit 1; }

# ─── Helpers ──────────────────────────────────────────────────────────────────

flag_active() {
  local var="$1"
  grep -E "^${var}=1\$" "$ENV_FILE" >/dev/null
}

set_flag() {
  local var="$1"
  local on_off="$2"

  if [ "$on_off" = "on" ]; then
    if flag_active "$var"; then
      echo "  ℹ️  $var déjà actif."
      return
    fi
    # Si la ligne existe en commentaire, la dé-commenter, sinon l'ajouter.
    if grep -qE "^#\s*${var}=1\$" "$ENV_FILE"; then
      sed -i.bak "s/^#\s*${var}=1\$/${var}=1/" "$ENV_FILE"
    else
      echo "${var}=1" >> "$ENV_FILE"
    fi
    echo "  ✅ $var activé."
  else
    if ! flag_active "$var"; then
      echo "  ℹ️  $var déjà inactif."
      return
    fi
    sed -i.bak "s/^${var}=1\$/# ${var}=1/" "$ENV_FILE"
    echo "  ✅ $var désactivé."
  fi
}

restart_pm2() {
  echo ""
  echo "🔄 Redémarrage PM2 ($PM2_NAME)..."
  # PM2 --update-env lit l'environnement du SHELL appelant, pas le .env
  # directement. Il faut donc sourcer le .env avant le restart pour que les
  # nouvelles valeurs (et la disparition des lignes commentées) soient
  # transmises au process. set -a/+a auto-export tout ce que source charge.
  #
  # On unset d'abord les deux flags pour que les lignes commentées soient
  # vraiment retirées de l'env (sinon une variable précédemment exportée
  # reste héritée même si elle est commentée dans le .env).
  unset UNIFIED_SHADOW FEATURE_UNIFIED_PRIMARY
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  pm2 restart "$PM2_NAME" --update-env
  echo "✅ PM2 redémarré."
}

show_status() {
  echo "📊 État des flags solveur unifié"
  echo "   Fichier : $ENV_FILE"
  echo ""
  if flag_active "UNIFIED_SHADOW"; then
    echo "   UNIFIED_SHADOW            ✅ actif (logs serveur uniquement)"
  else
    echo "   UNIFIED_SHADOW            ⚪ inactif"
  fi
  if flag_active "FEATURE_UNIFIED_PRIMARY"; then
    echo "   FEATURE_UNIFIED_PRIMARY   ✅ actif (onglet UI visible)"
  else
    echo "   FEATURE_UNIFIED_PRIMARY   ⚪ inactif"
  fi
  echo ""
  echo "💡 Note : FEATURE_UNIFIED_PRIMARY implique aussi le shadow (les logs"
  echo "         sont émis en plus du rendu UI)."
}

# ─── Dispatch ─────────────────────────────────────────────────────────────────

ACTION="${1:-}"
VALUE="${2:-}"

case "$ACTION" in
  status)
    show_status
    ;;

  shadow)
    [ -n "$VALUE" ] || { echo "❌ Usage : $0 shadow on|off"; exit 1; }
    case "$VALUE" in
      on|off) ;;
      *) echo "❌ Valeur invalide : $VALUE (on|off)"; exit 1 ;;
    esac
    echo "🎛️  Flag UNIFIED_SHADOW → $VALUE"
    set_flag "UNIFIED_SHADOW" "$VALUE"
    restart_pm2
    show_status
    ;;

  ui)
    [ -n "$VALUE" ] || { echo "❌ Usage : $0 ui on|off"; exit 1; }
    case "$VALUE" in
      on|off) ;;
      *) echo "❌ Valeur invalide : $VALUE (on|off)"; exit 1 ;;
    esac
    echo "🎛️  Flag FEATURE_UNIFIED_PRIMARY → $VALUE"
    set_flag "FEATURE_UNIFIED_PRIMARY" "$VALUE"
    restart_pm2
    show_status
    ;;

  full)
    [ -n "$VALUE" ] || { echo "❌ Usage : $0 full on|off"; exit 1; }
    case "$VALUE" in
      on|off) ;;
      *) echo "❌ Valeur invalide : $VALUE (on|off)"; exit 1 ;;
    esac
    echo "🎛️  Bascule complète → $VALUE"
    set_flag "UNIFIED_SHADOW" "$VALUE"
    set_flag "FEATURE_UNIFIED_PRIMARY" "$VALUE"
    restart_pm2
    show_status
    ;;

  *)
    cat <<EOF
toggle-unified.sh — gestion des flags du solveur unifié

Usage :
  $0 status                  Affiche l'état actuel des flags
  $0 shadow on|off           Active/désactive UNIFIED_SHADOW (logs uniquement)
  $0 ui on|off               Active/désactive FEATURE_UNIFIED_PRIMARY (UI)
  $0 full on|off             Active/désactive les deux flags

Exemples (déploiement progressif recommandé) :
  $0 status                  # vérifier l'état initial
  $0 shadow on               # phase 1 : observation logs uniquement
  $0 ui on                   # phase 2 : exposition utilisateurs
  $0 ui off                  # rollback UI immédiat
  $0 full off                # rollback complet (ni shadow ni UI)

Fichier modifié : $ENV_FILE
PM2 : $PM2_NAME (restart --update-env automatique après chaque modif)
EOF
    exit 1
    ;;
esac
