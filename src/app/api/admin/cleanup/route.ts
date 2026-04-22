/**
 * POST /api/admin/cleanup — Purge des données de planning obsolètes.
 *
 * Sécurité : JWT administrateur requis (checkAdmin).
 *
 * Déclencheurs :
 *   - UI : bouton "Lancer la purge" sur /admin/parametrage (usage courant).
 *   - Cron (optionnel, non déployé) : appel HTTP authentifié, p.ex.
 *       curl -s -X POST https://<host>/api/admin/cleanup \
 *         -H "Authorization: Bearer <jwt-admin>"
 *
 * Effets :
 *   - supprime les PlanningLigne dont dateFinPop < aujourd'hui - 6 mois ;
 *   - purge les PlanningImport antérieurs au seuil et sans ligne associée ;
 *   - ne touche jamais aux agents (rémanence garantie) ;
 *   - idempotent : peut être rejoué sans effet de bord.
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
