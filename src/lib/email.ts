/**
 * Service d'envoi d'email — couche transport Nodemailer.
 *
 * Compatible avec :
 *   - Gmail       : SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false
 *   - Mailtrap    : SMTP_HOST=sandbox.smtp.mailtrap.io, SMTP_PORT=2525
 *   - Resend SMTP : SMTP_HOST=smtp.resend.com, SMTP_PORT=465, SMTP_SECURE=true
 *   - Tout serveur SMTP standard
 *
 * Variables d'environnement requises :
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
import nodemailer, { type Transporter } from "nodemailer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

// ── Singleton transport ───────────────────────────────────────────────────────

let _transport: Transporter | null = null;

function getTransport(): Transporter {
  if (_transport) return _transport;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "[email] Configuration SMTP incomplète. Vérifiez SMTP_HOST, SMTP_USER et SMTP_PASS dans .env"
    );
  }

  _transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Délai de connexion : 10 secondes
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });

  return _transport;
}

// ── Envoi d'un email ──────────────────────────────────────────────────────────

/**
 * Envoie un email via le transport SMTP configuré.
 * Ne lève jamais d'exception — retourne { ok: false, error } en cas d'échec.
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "Point RH";

  try {
    const transport = getTransport();
    const info = await transport.sendMail({
      from,
      to: Array.isArray(payload.to) ? payload.to.join(", ") : payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    console.log(`[email] ✓ Envoyé à ${payload.to} — messageId: ${info.messageId}`);
    return { ok: true, messageId: info.messageId as string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ✗ Échec envoi à ${payload.to} — ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Vérifie la connexion SMTP. Utile au démarrage ou pour un endpoint de healthcheck.
 */
export async function verifySmtpConnection(): Promise<boolean> {
  try {
    const transport = getTransport();
    await transport.verify();
    console.log("[email] ✓ Connexion SMTP vérifiée");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ✗ Connexion SMTP échouée — ${message}`);
    return false;
  }
}
