/**
 * POST /api/cron/process-email-queue
 *
 * Processeur de file d'attente d'emails (version queue fiabilisée).
 *
 * ── Comment déclencher ────────────────────────────────────────────────────────
 * Option A — Appel manuel depuis un terminal ou outil :
 *   curl -X POST http://localhost:3000/api/cron/process-email-queue \
 *        -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Option B — Cron système (Windows Task Scheduler / Linux cron) :
 *   Toutes les 5 minutes : curl -X POST http://localhost:3000/api/cron/...
 *
 * Option C — Vercel Cron Jobs (si déployé sur Vercel) :
 *   vercel.json > { "crons": [{ "path": "/api/cron/process-email-queue", "schedule": "every 5 minutes" }] }
 *
 * ── Sécurité ─────────────────────────────────────────────────────────────────
 * L'endpoint est protégé par un Bearer token (variable CRON_SECRET).
 * Ne jamais exposer CRON_SECRET côté client.
 *
 * ── Comportement ─────────────────────────────────────────────────────────────
 * - Récupère tous les jobs PENDING dont scheduledAt ≤ maintenant
 * - Traite chaque job (envoi + log + retry si échec)
 * - Retourne un résumé { processed, success, failed }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processRegistrationJob } from "@/lib/emailNotifications";

// Nombre max de jobs traités par exécution (évite les timeouts)
const BATCH_SIZE = 20;

export async function POST(req: NextRequest) {
  // ── Authentification ───────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET non défini — endpoint désactivé.");
    return NextResponse.json({ error: "Configuration manquante." }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  // ── Récupération des jobs en attente ───────────────────────────────────────
  const jobs = await prisma.emailJob.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, type: true },
  });

  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0, success: 0, failed: 0 });
  }

  let success = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (job.type === "PENDING_REGISTRATION") {
        await processRegistrationJob(job.id);
      }
      // Ajouter d'autres types ici : "REMIND_PENDING", "WELCOME", etc.

      const updated = await prisma.emailJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (updated?.status === "SENT") success++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`[cron] Erreur traitement job ${job.id}:`, err);
    }
  }

  console.log(`[cron] Queue traitée : ${success} envoyés, ${failed} échoués.`);

  return NextResponse.json({ processed: jobs.length, success, failed });
}
