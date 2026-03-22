/**
 * GET /api/agents/deleted — Liste des agents supprimés logiquement (admin uniquement)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const agents = await prisma.agent.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      uch: true,
      posteAffectation: true,
      codeSymboleGrade: true,
      habilitations: true,
      deletedAt: true,
      deletedByEmail: true,
    },
  });

  return NextResponse.json(
    agents.map((a) => ({
      ...a,
      habilitations: JSON.parse(a.habilitations) as string[],
      deletedAt: a.deletedAt?.toISOString() ?? null,
    }))
  );
}
