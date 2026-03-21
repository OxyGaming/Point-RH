/**
 * GET  /api/agents/[id]/deplacement-rules — Règles déplacement de l'agent
 * POST /api/agents/[id]/deplacement-rules — Créer une règle
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { id: agentId } = await params;

  const rules = await prisma.agentJsDeplacementRule.findMany({
    where: { agentId },
    include: { jsType: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(rules);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { id: agentId } = await params;
  const body = await req.json() as {
    jsTypeId?: string | null;
    prefixeJs?: string | null;
    horsLpa?: boolean | null;
    tempsTrajetAllerMinutes?: number;
    tempsTrajetRetourMinutes?: number;
  };

  if (!body.jsTypeId && !body.prefixeJs) {
    return NextResponse.json({ error: "jsTypeId ou prefixeJs est obligatoire" }, { status: 400 });
  }

  const rule = await prisma.agentJsDeplacementRule.create({
    data: {
      agentId,
      jsTypeId: body.jsTypeId ?? null,
      prefixeJs: body.prefixeJs?.trim().toUpperCase() ?? null,
      horsLpa: body.horsLpa ?? null,
      tempsTrajetAllerMinutes: body.tempsTrajetAllerMinutes ?? 0,
      tempsTrajetRetourMinutes: body.tempsTrajetRetourMinutes ?? 0,
    },
    include: { jsType: true },
  });

  return NextResponse.json(rule, { status: 201 });
}
