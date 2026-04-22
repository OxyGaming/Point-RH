/**
 * GET /api/habilitations/propositions — propositions d'habilitations (admin only).
 * Calcule à la demande à partir de l'historique PlanningLigne.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { calculerPropositionsHabilitations } from "@/services/habilitation-proposals.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const agents = await calculerPropositionsHabilitations();
    const totalPropositions = agents.reduce((sum, a) => sum + a.propositions.length, 0);
    return NextResponse.json({
      agents,
      totalAgents: agents.length,
      totalPropositions,
    });
  } catch (err) {
    console.error("[API/habilitations/propositions GET]", err);
    return NextResponse.json(
      { error: "Erreur lors du calcul des propositions." },
      { status: 500 },
    );
  }
}
