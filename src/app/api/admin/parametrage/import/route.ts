/**
 * POST /api/admin/parametrage/import
 *
 * Import des données de paramétrage depuis un fichier Excel.
 * Accès réservé aux administrateurs.
 * Journalise l'action dans l'audit log.
 *
 * GARANTIES :
 *   - Ne touche jamais aux données de planning
 *   - Les agents absents ne sont pas supprimés
 *   - Rapport détaillé retourné (créations, mises à jour, erreurs)
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { importParametrage } from "@/services/parametrage/import.service";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_EXTENSIONS = [".xlsx"];
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

function isFileAllowed(file: File): boolean {
  const lower = file.name.toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.type) || file.type === "";
  return extOk && mimeOk;
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!isFileAllowed(file)) {
      return NextResponse.json(
        { error: "Format non supporté. Seuls les fichiers .xlsx sont acceptés pour l'import de paramétrage." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await importParametrage(buffer);

    await logAudit("IMPORT_PARAMETRAGE", "Parametrage", {
      user: auth.user,
      details: {
        filename: file.name,
        ...result.stats,
        success: result.success,
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[API/parametrage/import]", err);
    return NextResponse.json({ error: "Erreur lors de l'import du paramétrage" }, { status: 500 });
  }
}
