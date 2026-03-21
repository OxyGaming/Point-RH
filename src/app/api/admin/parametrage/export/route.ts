/**
 * GET /api/admin/parametrage/export
 *
 * Export des données de paramétrage en fichier Excel.
 * Accès réservé aux administrateurs.
 * Journalise l'action dans l'audit log.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { exportParametrage } from "@/services/parametrage/export.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const result = await exportParametrage();

    await logAudit("EXPORT_PARAMETRAGE", "Parametrage", {
      user: auth.user,
      details: result.stats,
    });

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.buffer.length),
        "X-Export-Stats": JSON.stringify(result.stats),
      },
    });
  } catch (err) {
    console.error("[API/parametrage/export]", err);
    return NextResponse.json({ error: "Erreur lors de la génération de l'export" }, { status: 500 });
  }
}
