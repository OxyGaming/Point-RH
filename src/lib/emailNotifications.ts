/**
 * Notifications email — logique métier.
 *
 * Ce fichier fournit deux niveaux d'utilisation :
 *
 * ── VERSION SIMPLE (sans queue) ──────────────────────────────────────────────
 *   notifyAdminsNewPendingRegistration(user)
 *   → Envoi immédiat et fire-and-forget.
 *   → Idéal pour commencer : un seul appel après la création en base.
 *   → Déduplication via EmailNotificationLog pour éviter les doublons.
 *
 * ── VERSION QUEUE (fiabilisée) ───────────────────────────────────────────────
 *   enqueueRegistrationNotification(user)
 *   → Crée un EmailJob en base, puis retourne immédiatement.
 *   → L'envoi réel est délégué au cron /api/cron/process-email-queue.
 *   → Plus fiable : retry automatique, traçabilité complète.
 *
 * Choisissez une version et utilisez-la dans register/route.ts.
 */
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import {
  buildPendingRegistrationHtml,
  buildPendingRegistrationText,
} from "./emailTemplates";

// ── Types internes ────────────────────────────────────────────────────────────

interface UserInfo {
  id: string;
  name: string;
  email: string;
  registrationComment: string | null;
  createdAt: Date;
}

// ── Helpers communs ───────────────────────────────────────────────────────────

/** Récupère tous les admins actifs en base. */
async function getAdminEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true },
  });
  return admins.map((a) => a.email);
}

/** Vérifie si une notification de ce type a déjà été envoyée pour cet utilisateur. */
async function alreadyNotified(type: string, targetId: string): Promise<boolean> {
  const existing = await prisma.emailNotificationLog.findFirst({
    where: { type, targetId, status: "SENT" },
  });
  return existing !== null;
}

/** Persiste le résultat d'un envoi dans le journal. */
async function logNotification(
  type: string,
  targetId: string,
  sentTo: string,
  status: "SENT" | "FAILED",
  error?: string
) {
  await prisma.emailNotificationLog.create({
    data: { type, targetId, sentTo, status, error: error ?? null },
  });
}

function getAdminUrl(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/admin`;
}

// ── VERSION SIMPLE ────────────────────────────────────────────────────────────

/**
 * Notifie immédiatement tous les administrateurs d'une nouvelle demande en attente.
 *
 * Usage dans register/route.ts :
 *   // Fire-and-forget — ne bloque pas la réponse HTTP
 *   notifyAdminsNewPendingRegistration(user).catch(console.error);
 *
 * Protection anti-doublon : si la notification a déjà été envoyée avec succès
 * pour cet userId, la fonction retourne sans rien envoyer.
 */
export async function notifyAdminsNewPendingRegistration(user: UserInfo): Promise<void> {
  const TYPE = "PENDING_REGISTRATION";

  // Anti-doublon : on vérifie avant d'envoyer
  if (await alreadyNotified(TYPE, user.id)) {
    console.log(`[email] Notification déjà envoyée pour userId=${user.id}, ignorée.`);
    return;
  }

  const adminEmails = await getAdminEmails();
  if (adminEmails.length === 0) {
    console.warn("[email] Aucun admin actif trouvé — notification annulée.");
    return;
  }

  const adminUrl = getAdminUrl();
  const templateData = {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    motif: user.registrationComment ?? "(non précisé)",
    createdAt: user.createdAt,
    adminUrl,
  };

  // Envoi à chaque admin (en parallèle)
  await Promise.all(
    adminEmails.map(async (adminEmail) => {
      const result = await sendEmail({
        to: adminEmail,
        subject: `[Point RH] Nouvelle demande d'inscription — ${user.name}`,
        html: buildPendingRegistrationHtml(templateData),
        text: buildPendingRegistrationText(templateData),
      });

      await logNotification(
        TYPE,
        user.id,
        adminEmail,
        result.ok ? "SENT" : "FAILED",
        result.ok ? undefined : result.error
      );
    })
  );
}

// ── VERSION QUEUE ─────────────────────────────────────────────────────────────

/**
 * Crée un job en base pour notifier les admins (version fiabilisée).
 *
 * Usage dans register/route.ts :
 *   await enqueueRegistrationNotification(user);
 *   // L'envoi sera effectué par le cron /api/cron/process-email-queue
 *
 * Avantages sur la version simple :
 *   - Retry automatique jusqu'à MAX_ATTEMPTS en cas d'échec SMTP
 *   - Traçabilité complète (status, lastError, processedAt)
 *   - L'endpoint de registration répond plus vite (pas d'attente SMTP)
 */
export async function enqueueRegistrationNotification(user: UserInfo): Promise<void> {
  // Anti-doublon : pas de double job pour le même utilisateur
  const existing = await prisma.emailJob.findFirst({
    where: {
      type: "PENDING_REGISTRATION",
      payload: { contains: user.id },
      status: { in: ["PENDING", "SENT"] },
    },
  });
  if (existing) {
    console.log(`[email-queue] Job déjà existant pour userId=${user.id}, ignoré.`);
    return;
  }

  await prisma.emailJob.create({
    data: {
      type: "PENDING_REGISTRATION",
      payload: JSON.stringify({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        motif: user.registrationComment ?? "(non précisé)",
        createdAt: user.createdAt.toISOString(),
      }),
      status: "PENDING",
    },
  });

  console.log(`[email-queue] Job créé pour userId=${user.id}`);
}

// ── Traitement d'un job (utilisé par le cron) ─────────────────────────────────

const MAX_ATTEMPTS = 3;

/**
 * Traite un EmailJob de type PENDING_REGISTRATION.
 * Appelé par le processeur de queue dans /api/cron/process-email-queue.
 */
export async function processRegistrationJob(jobId: string): Promise<void> {
  const job = await prisma.emailJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "SENT") return;

  if (job.attempts >= MAX_ATTEMPTS) {
    await prisma.emailJob.update({
      where: { id: jobId },
      data: { status: "FAILED", lastError: "Nombre maximum de tentatives atteint." },
    });
    return;
  }

  // Marque comme en cours pour éviter le double-traitement
  await prisma.emailJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  try {
    const payload = JSON.parse(job.payload) as {
      userId: string;
      userName: string;
      userEmail: string;
      motif: string;
      createdAt: string;
    };

    const adminEmails = await getAdminEmails();
    if (adminEmails.length === 0) {
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { status: "FAILED", lastError: "Aucun admin actif trouvé." },
      });
      return;
    }

    const templateData = {
      userId: payload.userId,
      userName: payload.userName,
      userEmail: payload.userEmail,
      motif: payload.motif,
      createdAt: new Date(payload.createdAt),
      adminUrl: getAdminUrl(),
    };

    let allSent = true;

    await Promise.all(
      adminEmails.map(async (adminEmail) => {
        const result = await sendEmail({
          to: adminEmail,
          subject: `[Point RH] Nouvelle demande d'inscription — ${payload.userName}`,
          html: buildPendingRegistrationHtml(templateData),
          text: buildPendingRegistrationText(templateData),
        });

        await logNotification(
          "PENDING_REGISTRATION",
          payload.userId,
          adminEmail,
          result.ok ? "SENT" : "FAILED",
          result.ok ? undefined : result.error
        );

        if (!result.ok) allSent = false;
      })
    );

    await prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: allSent ? "SENT" : "FAILED",
        lastError: allSent ? null : "Échec d'envoi vers au moins un destinataire.",
        processedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: job.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        lastError: message,
      },
    });
  }
}
