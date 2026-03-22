/**
 * GET /api/parametrage/template
 * Téléchargement du modèle Excel vide (ADMIN uniquement).
 * Fournit un fichier .xlsx pré-rempli avec les en-têtes et une ligne exemple.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { genererModeleParametrage } from "@/services/parametrage/exportParametrage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const buffer = genererModeleParametrage();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="modele_parametrage.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[API/parametrage/template]", err);
    return NextResponse.json({ error: "Erreur lors de la génération du modèle." }, { status: 500 });
  }
}
