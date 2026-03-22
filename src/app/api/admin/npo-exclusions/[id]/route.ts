/**
 * PATCH  /api/admin/npo-exclusions/[id] — Modifier libellé ou basculer actif
 * DELETE /api/admin/npo-exclusions/[id] — Supprimer le code
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json() as { libelle?: string; actif?: boolean };

  const data: Record<string, unknown> = {};
  if (body.libelle !== undefined) data.libelle = body.libelle.trim();
  if (body.actif !== undefined) data.actif = Boolean(body.actif);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à modifier." }, { status: 400 });
  }

  try {
    const updated = await prisma.npoExclusionCode.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Code introuvable." }, { status: 404 });
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
    await prisma.npoExclusionCode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Code introuvable." }, { status: 404 });
  }
}
