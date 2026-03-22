/**
 * POST /api/cron/remind-pending
 *
 * Système de relance — notifie les admins pour chaque demande d'inscription
 * toujours PENDING après X heures sans traitement.
 *
 * ── Déclenchement ─────────────────────────────────────────────────────────────
 * Appel toutes les heures (ou à la fréquence souhaitée) :
 *   curl -X POST http://localhost:3000/api/cron/remind-pending \
 *        -H "Authorization: Bearer <CRON_SECRET>"
 *
 * ── Logique anti-spam ─────────────────────────────────────────────────────────
 * Une relance est envoyée uniquement si :
 *   1. La demande est encore PENDING
 *   2. Elle a été créée il y a plus de REMIND_AFTER_HOURS heures
 *   3. Aucune relance (REMIND_PENDING) n'a été envoyée dans les dernières
 *      REMIND_AFTER_HOURS heures pour ce même utilisateur
 *
 * Variable d'environnement :
 *   REMIND_AFTER_HOURS (défaut : 24) — délai avant relance en heures
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import {
  buildRemindPendingHtml,
  buildRemindPendingText,
} from "@/lib/emailTemplates";

export async function POST(req: NextRequest) {
  // ── Authentification ───────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Configuration manquante." }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const remindAfterHours = parseInt(process.env.REMIND_AFTER_HOURS ?? "24", 10);
  const threshold = new Date(Date.now() - remindAfterHours * 60 * 60 * 1000);

  // ── Demandes PENDING non traitées depuis X heures ──────────────────────────
  const pendingUsers = await prisma.user.findMany({
    where: {
      registrationStatus: "PENDING",
      createdAt: { lte: threshold },
    },
    select: {
      id: true,
      name: true,
      email: true,
      registrationComment: true,
      createdAt: true,
    },
  });

  if (pendingUsers.length === 0) {
    return NextResponse.json({ remindSent: 0, message: "Aucune demande en attente à relancer." });
  }

  // ── Admins destinataires ───────────────────────────────────────────────────
  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true },
  });

  if (adminUsers.length === 0) {
    return NextResponse.json({ remindSent: 0, message: "Aucun admin actif trouvé." });
  }

  const adminEmails = adminUsers.map((a) => a.email);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const adminUrl = `${appUrl}/admin`;
  const totalPending = pendingUsers.length;

  let remindSent = 0;
  let remindSkipped = 0;

  for (const user of pendingUsers) {
    // Anti-spam : vérifier si on a déjà relancé dans la fenêtre REMIND_AFTER_HOURS
    const recentRemind = await prisma.emailNotificationLog.findFirst({
      where: {
        type: "REMIND_PENDING",
        targetId: user.id,
        status: "SENT",
        createdAt: { gte: threshold },
      },
    });

    if (recentRemind) {
      remindSkipped++;
      continue;
    }

    const templateData = {
      userName: user.name,
      userEmail: user.email,
      motif: user.registrationComment ?? "(non précisé)",
      createdAt: user.createdAt,
      adminUrl,
      pendingCount: totalPending,
      remindAfterHours,
    };

    // Envoi à tous les admins
    await Promise.all(
      adminEmails.map(async (adminEmail) => {
        const result = await sendEmail({
          to: adminEmail,
          subject: `[Point RH] Rappel — ${user.name} attend une réponse depuis +${remindAfterHours}h`,
          html: buildRemindPendingHtml(templateData),
          text: buildRemindPendingText(templateData),
        });

        await prisma.emailNotificationLog.create({
          data: {
            type: "REMIND_PENDING",
            targetId: user.id,
            sentTo: adminEmail,
            status: result.ok ? "SENT" : "FAILED",
            error: result.ok ? null : result.error,
          },
        });
      })
    );

    remindSent++;
    console.log(`[cron/remind] Relance envoyée pour userId=${user.id} (${user.email})`);
  }

  return NextResponse.json({
    remindSent,
    remindSkipped,
    totalPending,
    message: `${remindSent} relance(s) envoyée(s), ${remindSkipped} ignorée(s) (déjà relancées récemment).`,
  });
}
