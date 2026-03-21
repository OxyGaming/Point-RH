/**
 * GET /api/parametrage/export
 * Export Excel des données de paramétrage (ADMIN uniquement).
 * Génère et renvoie un fichier .xlsx avec 5 onglets : Agents, JS_Types, LPA, LPA_JS_Types, Agent_JS_Deplacement.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { genererExportParametrage } from "@/services/parametrage/exportParametrage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const buffer = await genererExportParametrage();

    const filename = `parametrage_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await logAudit("EXPORT_PARAMETRAGE", "Parametrage", {
      user: auth.user,
      details: { filename },
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[API/parametrage/export]", err);
    return NextResponse.json({ error: "Erreur lors de la génération de l'export." }, { status: 500 });
  }
}
