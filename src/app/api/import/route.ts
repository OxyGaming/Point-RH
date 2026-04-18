/**
 * POST /api/import — Import d'un fichier planning (authentifié)
 * GET  /api/import — Liste des imports récents (authentifié, utilisé par planning & simulations)
 *
 * RÈGLE DE GESTION — Persistance des agents :
 * Un import ne supprime JAMAIS les agents existants.
 * Les agents sont créés ou mis à jour (upsert par matricule).
 * Seule une action explicite d'un administrateur peut supprimer un agent.
 */
import { NextRequest, NextResponse } from "next/server";
import { importerPlanning } from "@/services/import.service";
import { checkAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".txt"];
const ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/tab-separated-values",
  "application/octet-stream",
];

function isFileAllowed(file: File): boolean {
  const lower = file.name.toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.type) || file.type === "";
  return extOk && mimeOk;
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!isFileAllowed(file)) {
      return NextResponse.json(
        { error: `Format non supporté. Formats acceptés : ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await importerPlanning(buffer, file.name);

    if (result.success) {
      await logAudit("IMPORT_PLANNING", "PlanningImport", {
        user: auth.user,
        entityId: result.importId,
        details: {
          filename: file.name,
          lignesCreees: result.lignesCreees,
          lignesMisesAJour: result.lignesMisesAJour,
          agentsCreated: result.agentsCreated,
          agentsUpdated: result.agentsUpdated,
        },
      });
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    console.error("[API/import]", err);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { prisma } = await import("@/lib/prisma");
  const imports = await prisma.planningImport.findMany({
    orderBy: { importedAt: "desc" },
    take: 20,
  });
  return NextResponse.json(imports);
}
