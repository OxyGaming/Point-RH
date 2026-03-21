/**
 * GET  /api/lpa — Liste des LPA (authentifié)
 * POST /api/lpa — Créer une LPA (authentifié)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const lpas = await prisma.lpa.findMany({
    orderBy: { code: "asc" },
    include: {
      lpaJsTypes: {
        include: { jsType: true },
        orderBy: { jsType: { code: "asc" } },
      },
      _count: { select: { agents: true } },
    },
  });

  return NextResponse.json(lpas);
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json() as { code?: string; libelle?: string };

  if (!body.code?.trim() || !body.libelle?.trim()) {
    return NextResponse.json({ error: "code et libelle sont obligatoires" }, { status: 400 });
  }

  try {
    const lpa = await prisma.lpa.create({
      data: {
        code: body.code.trim().toUpperCase(),
        libelle: body.libelle.trim(),
      },
    });
    return NextResponse.json(lpa, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Code LPA déjà utilisé" }, { status: 409 });
  }
}
