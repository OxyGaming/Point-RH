/**
 * GET    /api/js-types/[id] — Détail JsType
 * PATCH  /api/js-types/[id] — Modifier un JsType
 * DELETE /api/js-types/[id] — Supprimer un JsType
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth, checkAdmin } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const jsType = await prisma.jsType.findUnique({
    where: { id },
    include: {
      lpaJsTypes: { include: { lpa: true } },
      _count: { select: { agentDeplacementRules: true } },
    },
  });

  if (!jsType) return NextResponse.json({ error: "JsType introuvable" }, { status: 404 });
  return NextResponse.json(jsType);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const ALLOWED = [
    "code", "libelle", "heureDebutStandard", "heureFinStandard",
    "dureeStandard", "estNuit", "regime", "actif", "flexibilite",
  ];
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) {
      data[key] = key === "code" && typeof body.code === "string"
        ? body.code.trim().toUpperCase()
        : body[key];
    }
  }

  try {
    const jsType = await prisma.jsType.update({ where: { id }, data });
    return NextResponse.json(jsType);
  } catch {
    return NextResponse.json({ error: "JsType introuvable ou code déjà utilisé" }, { status: 409 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    await prisma.jsType.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "JsType introuvable" }, { status: 404 });
  }
}
