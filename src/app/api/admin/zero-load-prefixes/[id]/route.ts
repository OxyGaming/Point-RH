/**
 * PATCH  /api/admin/zero-load-prefixes/[id] — Modifier libellé ou basculer actif
 * DELETE /api/admin/zero-load-prefixes/[id] — Supprimer le préfixe
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await req.json()) as { libelle?: string; actif?: boolean };

  const data: Record<string, unknown> = {};
  if (body.libelle !== undefined) data.libelle = body.libelle.trim();
  if (body.actif !== undefined) data.actif = Boolean(body.actif);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à modifier." }, { status: 400 });
  }

  try {
    const updated = await prisma.zeroLoadPrefix.update({ where: { id }, data });
    await logAudit("UPDATE_ZERO_LOAD_PREFIX", "ZeroLoadPrefix", {
      user: auth.user,
      entityId: id,
      details: data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Préfixe introuvable." }, { status: 404 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const deleted = await prisma.zeroLoadPrefix.delete({ where: { id } });
    await logAudit("DELETE_ZERO_LOAD_PREFIX", "ZeroLoadPrefix", {
      user: auth.user,
      entityId: id,
      details: { prefixe: deleted.prefixe, libelle: deleted.libelle },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Préfixe introuvable." }, { status: 404 });
  }
}
