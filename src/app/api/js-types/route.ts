/**
 * GET  /api/js-types — Liste des JsTypes (authentifié)
 * POST /api/js-types — Créer un JsType (authentifié)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth, checkAdmin } from "@/lib/session";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const jsTypes = await prisma.jsType.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: { select: { lpaJsTypes: true } },
    },
  });

  return NextResponse.json(jsTypes);
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json() as {
    code?: string;
    libelle?: string;
    heureDebutStandard?: string;
    heureFinStandard?: string;
    dureeStandard?: number;
    estNuit?: boolean;
    regime?: string | null;
    flexibilite?: "OBLIGATOIRE" | "DERNIER_RECOURS";
  };

  if (!body.code?.trim() || !body.libelle?.trim()) {
    return NextResponse.json({ error: "code et libelle sont obligatoires" }, { status: 400 });
  }
  if (!body.heureDebutStandard || !body.heureFinStandard) {
    return NextResponse.json({ error: "heureDebutStandard et heureFinStandard sont obligatoires" }, { status: 400 });
  }
  if (body.dureeStandard === undefined || body.dureeStandard <= 0) {
    return NextResponse.json({ error: "dureeStandard est obligatoire et doit être > 0" }, { status: 400 });
  }

  try {
    const jsType = await prisma.jsType.create({
      data: {
        code: body.code.trim().toUpperCase(),
        libelle: body.libelle.trim(),
        heureDebutStandard: body.heureDebutStandard,
        heureFinStandard: body.heureFinStandard,
        dureeStandard: body.dureeStandard,
        estNuit: body.estNuit ?? false,
        regime: body.regime ?? null,
        flexibilite: body.flexibilite ?? "OBLIGATOIRE",
      },
    });
    return NextResponse.json(jsType, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Code JsType déjà utilisé" }, { status: 409 });
  }
}
