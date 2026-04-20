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
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Garde-fou DoS : taille max du fichier uploadé (paramétrage). */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Rate-limit imports : 10 requêtes/minute/utilisateur, aligné sur les endpoints d'import/simulation. */
const IMPORT_RATE_LIMIT = { max: 10, windowMs: 60 * 1000 };

/** MIME types admis pour un .xlsx/.xls. Le `""` et `application/octet-stream` couvrent les clients qui n'envoient rien. */
const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "",
]);

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const rl = rateLimit("import-param", auth.user.id, IMPORT_RATE_LIMIT);
  if (!rl.ok) {
    const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Trop d'imports lancés. Réessayez dans une minute." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

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

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier incohérent avec l'extension. Seuls les fichiers Excel sont acceptés." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const maxMb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
      return NextResponse.json(
        { error: `Fichier trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} Mo). Taille maximale : ${maxMb} Mo.` },
        { status: 413 }
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
