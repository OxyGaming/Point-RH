/**
 * POST   /api/simulations — Lancer une simulation (authentifié)
 * GET    /api/simulations — Liste des simulations (authentifié)
 * DELETE /api/simulations — Purger toutes les simulations (admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { lancerSimulation } from "@/services/simulation.service";
import { prisma } from "@/lib/prisma";
import type { SimulationInput } from "@/types/simulation";
import { checkAuth, checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as SimulationInput;
    const { importId, dateDebut, dateFin, heureDebut, heureFin, poste } = body;

    if (!importId || !dateDebut || !dateFin || !heureDebut || !heureFin || !poste) {
      return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
    }

    const resultat = await lancerSimulation(body);
    return NextResponse.json(resultat, { status: 201 });
  } catch (err) {
    console.error("[API/simulations]", err);
    return NextResponse.json({ error: "Erreur lors de la simulation" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { count } = await prisma.simulation.deleteMany({});
    await logAudit("PURGE_SIMULATIONS", "Simulation", {
      user: auth.user,
      details: { count },
    });
    return NextResponse.json({ deleted: count });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const simulations = await prisma.simulation.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { resultats: true } },
    },
  });
  return NextResponse.json(simulations);
}
