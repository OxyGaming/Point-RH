/**
 * POST /api/agents/[id]/restore — Réintégration d'un agent supprimé logiquement (admin uniquement)
 *
 * Remet deletedAt et deletedByEmail à null, rendant l'agent à nouveau actif
 * dans toutes les listes et simulations.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, matricule: true, nom: true, prenom: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent introuvable." }, { status: 404 });
  }

  if (!agent.deletedAt) {
    return NextResponse.json({ error: "Cet agent n'est pas supprimé." }, { status: 400 });
  }

  await prisma.agent.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedByEmail: null,
    },
  });

  await logAudit("RESTORE_AGENT", "Agent", {
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
