/**
 * PATCH  /api/agents/[id]/deplacement-rules/[ruleId] — Modifier une règle
 * DELETE /api/agents/[id]/deplacement-rules/[ruleId] — Supprimer une règle
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { ruleId } = await params;
  const body = await req.json() as Record<string, unknown>;

  const ALLOWED = [
    "jsTypeId", "prefixeJs", "horsLpa",
    "tempsTrajetAllerMinutes", "tempsTrajetRetourMinutes", "actif",
  ];
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) {
      data[key] = key === "prefixeJs" && typeof body.prefixeJs === "string"
        ? body.prefixeJs.trim().toUpperCase()
        : body[key];
    }
  }

  try {
    const rule = await prisma.agentJsDeplacementRule.update({
      where: { id: ruleId },
      data,
      include: { jsType: true },
    });
    return NextResponse.json(rule);
  } catch {
    return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { ruleId } = await params;
  try {
    await prisma.agentJsDeplacementRule.delete({ where: { id: ruleId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Règle introuvable" }, { status: 404 });
  }
}
