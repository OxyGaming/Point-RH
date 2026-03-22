/**
 * Templates email — version HTML et texte brut.
 *
 * Chaque template exporte deux fonctions :
 *   buildXxxHtml(data)  → string HTML
 *   buildXxxText(data)  → string texte brut (fallback clients email)
 */

// ── Constantes de mise en page ────────────────────────────────────────────────

const BRAND_COLOR = "#2563eb";   // Bleu Point RH
const BRAND_NAME  = "Point RH";

/** Enveloppe HTML commune à tous les emails */
function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body  { margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrap { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    .header { background: ${BRAND_COLOR}; padding: 28px 32px; }
    .header h1 { margin: 0; color: #fff; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    .header p  { margin: 4px 0 0; color: rgba(255,255,255,.8); font-size: 13px; }
    .body   { padding: 32px; color: #374151; font-size: 15px; line-height: 1.6; }
    .body h2 { margin: 0 0 16px; font-size: 17px; color: #111827; }
    .card   { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .card dl { margin: 0; }
    .card dt { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; margin-top: 10px; }
    .card dt:first-child { margin-top: 0; }
    .card dd { margin: 2px 0 0; font-size: 14px; color: #111827; font-weight: 500; }
    .badge  { display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 9999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
    .btn    { display: inline-block; margin-top: 24px; padding: 12px 24px; background: ${BRAND_COLOR}; color: #fff !important; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>${BRAND_NAME}</h1>
      <p>Gestion des ressources humaines</p>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      Cet email est envoyé automatiquement par ${BRAND_NAME}.<br/>
      Ne pas répondre à cet email.
    </div>
  </div>
</body>
</html>`;
}

// ── Template : Nouvelle demande d'inscription ─────────────────────────────────

export interface PendingRegistrationData {
  userName: string;       // "Jean Dupont"
  userEmail: string;
  motif: string;
  createdAt: Date;
  adminUrl: string;       // ex: "http://localhost:3000/admin"
  userId: string;
}

export function buildPendingRegistrationHtml(data: PendingRegistrationData): string {
  const date = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(data.createdAt);

  const body = `
    <h2>Nouvelle demande d'inscription</h2>
    <p>
      Une nouvelle demande de création de compte est en attente de validation.
      <br/><span class="badge">En attente</span>
    </p>

    <div class="card">
      <dl>
        <dt>Nom complet</dt>
        <dd>${escapeHtml(data.userName)}</dd>

        <dt>Adresse e-mail</dt>
        <dd>${escapeHtml(data.userEmail)}</dd>

        <dt>Motif de la demande</dt>
        <dd>${escapeHtml(data.motif)}</dd>

        <dt>Date de la demande</dt>
        <dd>${date}</dd>
      </dl>
    </div>

    <p>Rendez-vous dans l'interface d'administration pour approuver ou refuser cette demande.</p>

    <a href="${data.adminUrl}" class="btn">Accéder à l'administration →</a>
  `;

  return wrapHtml("Nouvelle demande d'inscription — Point RH", body);
}

export function buildPendingRegistrationText(data: PendingRegistrationData): string {
  const date = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(data.createdAt);

  return `
POINT RH — Nouvelle demande d'inscription
==========================================

Une nouvelle demande de création de compte est en attente de validation.

DÉTAILS DE LA DEMANDE
---------------------
Nom complet    : ${data.userName}
Email          : ${data.userEmail}
Motif          : ${data.motif}
Date           : ${date}

Accédez à l'administration pour valider ou refuser cette demande :
${data.adminUrl}

---
Cet email est envoyé automatiquement par Point RH. Ne pas répondre.
`.trim();
}

// ── Template : Relance — demande non traitée ──────────────────────────────────

export interface RemindPendingData {
  userName: string;
  userEmail: string;
  motif: string;
  createdAt: Date;
  adminUrl: string;
  pendingCount: number;   // nombre total de demandes en attente
  remindAfterHours: number;
}

export function buildRemindPendingHtml(data: RemindPendingData): string {
  const date = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(data.createdAt);

  const body = `
    <h2>Rappel — Demande d'inscription non traitée</h2>
    <p>
      La demande de création de compte ci-dessous est toujours en attente depuis
      plus de <strong>${data.remindAfterHours} heure${data.remindAfterHours > 1 ? "s" : ""}</strong>.
      ${data.pendingCount > 1
        ? `<br/>Il y a en tout <strong>${data.pendingCount} demandes</strong> en attente.`
        : ""}
    </p>

    <div class="card">
      <dl>
        <dt>Nom complet</dt>
        <dd>${escapeHtml(data.userName)}</dd>

        <dt>Adresse e-mail</dt>
        <dd>${escapeHtml(data.userEmail)}</dd>

        <dt>Motif de la demande</dt>
        <dd>${escapeHtml(data.motif)}</dd>

        <dt>Demande soumise le</dt>
        <dd>${date}</dd>
      </dl>
    </div>

    <a href="${data.adminUrl}" class="btn">Traiter les demandes →</a>
  `;

  return wrapHtml("Rappel demande en attente — Point RH", body);
}

export function buildRemindPendingText(data: RemindPendingData): string {
  const date = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(data.createdAt);

  return `
POINT RH — Rappel : demande d'inscription non traitée
======================================================

Cette demande est en attente depuis plus de ${data.remindAfterHours}h.
${data.pendingCount > 1 ? `Nombre total de demandes en attente : ${data.pendingCount}` : ""}

DÉTAILS DE LA DEMANDE
---------------------
Nom complet    : ${data.userName}
Email          : ${data.userEmail}
Motif          : ${data.motif}
Date           : ${date}

Accédez à l'administration :
${data.adminUrl}

---
Cet email est envoyé automatiquement par Point RH. Ne pas répondre.
`.trim();
}

// ── Utilitaire ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
