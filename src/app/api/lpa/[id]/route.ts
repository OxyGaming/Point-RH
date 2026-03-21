/**
 * GET    /api/lpa/[id] — Détail LPA avec ses JsTypes
 * PATCH  /api/lpa/[id] — Modifier une LPA
 * DELETE /api/lpa/[id] — Supprimer une LPA
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
  const lpa = await prisma.lpa.findUnique({
    where: { id },
    include: {
      lpaJsTypes: {
        include: { jsType: true },
        orderBy: { jsType: { code: "asc" } },
      },
      _count: { select: { agents: true } },
    },
  });

  if (!lpa) return NextResponse.json({ error: "LPA introuvable" }, { status: 404 });
  return NextResponse.json(lpa);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json() as { code?: string; libelle?: string; actif?: boolean };

  const data: Record<string, unknown> = {};
  if (body.code !== undefined) data.code = body.code.trim().toUpperCase();
  if (body.libelle !== undefined) data.libelle = body.libelle.trim();
  if (body.actif !== undefined) data.actif = body.actif;

  try {
    const lpa = await prisma.lpa.update({ where: { id }, data });
    return NextResponse.json(lpa);
  } catch {
    return NextResponse.json({ error: "LPA introuvable ou code déjà utilisé" }, { status: 409 });
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
    await prisma.lpa.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "LPA introuvable" }, { status: 404 });
  }
}
