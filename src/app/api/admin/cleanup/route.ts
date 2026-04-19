/**
 * POST /api/admin/cleanup — Nettoyage des données de planning obsolètes
 *
 * Réservé aux administrateurs. Peut être appelé :
 *   - manuellement depuis l'interface d'administration
 *   - par un cron serveur : curl -s -X POST https://<host>/api/admin/cleanup \
 *       -H "Authorization: Bearer <jwt-admin>"
 *
 * Supprime les lignes de planning dont la date de fin est antérieure à M-3
 * et purge les entrées du journal PlanningImport devenues orphelines.
 * Ne touche jamais aux agents.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { cleanupOldPlanningData } from "@/services/planningCleanup.service";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const result = await cleanupOldPlanningData();

    await logAudit("CLEANUP_PLANNING", "PlanningLigne", {
      user: auth.user,
      details: {
        cutoff: result.cutoff.toISOString(),
        lignesDeleted: result.lignesDeleted,
        importsDeleted: result.importsDeleted,
      },
    });

    return NextResponse.json({
      success: true,
      cutoff: result.cutoff.toISOString(),
      lignesDeleted: result.lignesDeleted,
      importsDeleted: result.importsDeleted,
    });
  } catch (err) {
    console.error("[API/admin/cleanup]", err);
    return NextResponse.json({ error: "Erreur lors du nettoyage" }, { status: 500 });
  }
}
