/**
 * POST /api/parametrage/import
 * Import Excel des données de paramétrage (ADMIN uniquement).
 * Accepte un fichier .xlsx et retourne un rapport détaillé (créations, MAJ, erreurs).
 *
 * RÈGLE DE SÉCURITÉ : ne touche JAMAIS aux données de planning (PlanningImport / PlanningLigne).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { importerParametrage } from "@/services/parametrage/importParametrage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni." }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Format non supporté. Seuls les fichiers .xlsx sont acceptés pour l'import paramétrage." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importerParametrage(buffer);

    if (result.success) {
      await logAudit("IMPORT_PARAMETRAGE", "Parametrage", {
        user: auth.user,
        details: {
          filename: file.name,
          nbCreations: result.nbCreations,
          nbMisesAJour: result.nbMisesAJour,
          nbAvertissements: result.avertissements.length,
        },
      });
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    console.error("[API/parametrage/import]", err);
    return NextResponse.json({ error: "Erreur lors de l'import." }, { status: 500 });
  }
}
