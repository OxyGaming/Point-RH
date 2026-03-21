/**
 * GET  /api/agents — Liste agents actifs (authentifié)
 * POST /api/agents — Créer agent (authentifié)
 *
 * Les agents avec deletedAt non null (supprimés logiquement) sont exclus.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });
  return NextResponse.json(
    agents.map((a) => ({ ...a, habilitations: JSON.parse(a.habilitations) as string[] }))
  );
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json() as Record<string, unknown>;
  const { matricule, nom, prenom, ...rest } = body as {
    matricule?: string;
    nom?: string;
    prenom?: string;
    [key: string]: unknown;
  };

  if (!matricule || !nom || !prenom) {
    return NextResponse.json({ error: "matricule, nom et prenom sont requis" }, { status: 400 });
  }

  const agent = await prisma.agent.create({
    data: {
      matricule: String(matricule),
      nom: String(nom),
      prenom: String(prenom),
      habilitations: JSON.stringify((rest as { habilitations?: string[] }).habilitations ?? []),
    },
  });

  return NextResponse.json(
    { ...agent, habilitations: JSON.parse(agent.habilitations) as string[] },
    { status: 201 }
  );
}
