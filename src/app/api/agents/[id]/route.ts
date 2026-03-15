/**
 * GET    /api/agents/[id] — Détail agent (authentifié)
 * PATCH  /api/agents/[id] — Modifier agent (authentifié)
 * DELETE /api/agents/[id] — Suppression LOGIQUE admin uniquement
 *
 * Règle de gestion :
 * La suppression d'un agent est LOGIQUE (champ deletedAt).
 * Elle est irréversible depuis l'interface mais préserve l'historique.
 * Seul un administrateur peut supprimer un agent.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth, checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id, deletedAt: null },
    include: {
      planningLignes: { orderBy: { dateDebutPop: "asc" }, take: 100 },
    },
  });
  if (!agent) return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  return NextResponse.json({ ...agent, habilitations: JSON.parse(agent.habilitations) as string[] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  const { habilitations, ...rest } = body;

  // Champs autorisés à la modification — on bloque les champs système
  const ALLOWED = [
    "nom", "prenom", "uch", "codeUch", "codeApes", "codeSymboleGrade",
    "codeCollegeGrade", "posteAffectation", "agentReserve",
    "peutFaireNuit", "peutEtreDeplace", "regimeB", "regimeC",
  ];
  const safeData: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in rest) safeData[key] = rest[key];
  }
  if (habilitations !== undefined) {
    safeData.habilitations = JSON.stringify(habilitations);
  }

  const agent = await prisma.agent.update({
    where: { id, deletedAt: null },
    data: safeData,
  });

  await logAudit("UPDATE_AGENT", "Agent", {
    user: auth.user,
    entityId: id,
    details: { fields: Object.keys(safeData) },
  });

  return NextResponse.json({ ...agent, habilitations: JSON.parse(agent.habilitations) as string[] });
}

/**
 * DELETE — Suppression LOGIQUE (soft delete), admin uniquement.
 *
 * Un agent supprimé conserve tout son historique (plannings, résultats).
 * Il n'apparaît plus dans les listes ni dans les simulations futures.
 * Cette action est irréversible depuis l'interface utilisateur.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, matricule: true, nom: true, prenom: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent introuvable ou déjà supprimé." }, { status: 404 });
  }

  // Suppression logique — l'agent reste en base pour l'historique
  await prisma.agent.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedByEmail: auth.user.email,
    },
  });

  await logAudit("DELETE_AGENT", "Agent", {
    user: auth.user,
    entityId: id,
    details: {
      matricule: agent.matricule,
      nom: agent.nom,
      prenom: agent.prenom,
    },
  });

  return NextResponse.json({ success: true });
}
