/**
 * GET    /api/lpa/[id]/js-types — JS types associés à une LPA
 * POST   /api/lpa/[id]/js-types — Associer un JsType à une LPA
 * DELETE /api/lpa/[id]/js-types — Dissocier un JsType (body: { jsTypeId })
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

  const { id: lpaId } = await params;

  const lpaJsTypes = await prisma.lpaJsType.findMany({
    where: { lpaId },
    include: { jsType: true },
    orderBy: { jsType: { code: "asc" } },
  });

  return NextResponse.json(lpaJsTypes.map((ljt) => ljt.jsType));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id: lpaId } = await params;
  const body = await req.json() as { jsTypeId?: string };

  if (!body.jsTypeId) {
    return NextResponse.json({ error: "jsTypeId est obligatoire" }, { status: 400 });
  }

  try {
    const lpaJsType = await prisma.lpaJsType.create({
      data: { lpaId, jsTypeId: body.jsTypeId },
      include: { jsType: true },
    });
    return NextResponse.json(lpaJsType, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Association déjà existante ou ID invalide" }, { status: 409 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id: lpaId } = await params;
  const body = await req.json() as { jsTypeId?: string };

  if (!body.jsTypeId) {
    return NextResponse.json({ error: "jsTypeId est obligatoire" }, { status: 400 });
  }

  try {
    await prisma.lpaJsType.deleteMany({
      where: { lpaId, jsTypeId: body.jsTypeId },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Association introuvable" }, { status: 404 });
  }
}
