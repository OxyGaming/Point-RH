/**
 * GET  /api/admin/zero-load-prefixes — Liste tous les préfixes (admin uniquement)
 * POST /api/admin/zero-load-prefixes — Crée un nouveau préfixe
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const prefixes = await prisma.zeroLoadPrefix.findMany({
    orderBy: { prefixe: "asc" },
  });

  return NextResponse.json(prefixes);
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as { prefixe?: string; libelle?: string };
  const prefixe = (body.prefixe ?? "").trim().toUpperCase();
  const libelle = (body.libelle ?? "").trim();

  if (!prefixe) {
    return NextResponse.json({ error: "Le préfixe est requis." }, { status: 400 });
  }
  if (!libelle) {
    return NextResponse.json({ error: "Le libellé est requis." }, { status: 400 });
  }

  try {
    const created = await prisma.zeroLoadPrefix.create({
      data: { prefixe, libelle, actif: true },
    });

    await logAudit("CREATE_ZERO_LOAD_PREFIX", "ZeroLoadPrefix", {
      user: auth.user,
      entityId: created.id,
      details: { prefixe, libelle },
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: `Le préfixe "${prefixe}" existe déjà.` },
      { status: 409 },
    );
  }
}
