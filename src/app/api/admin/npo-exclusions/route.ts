/**
 * GET  /api/admin/npo-exclusions — Liste tous les codes (admin uniquement)
 * POST /api/admin/npo-exclusions — Crée un nouveau code
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/session";
import { loadNpoExclusionCodes } from "@/lib/simulation/npoExclusionLoader";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  // Déclenche l'auto-seed si la table est vide
  await loadNpoExclusionCodes();

  const codes = await prisma.npoExclusionCode.findMany({
    orderBy: { code: "asc" },
  });

  return NextResponse.json(codes);
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json() as { code?: string; libelle?: string };
  const code = (body.code ?? "").trim().toUpperCase();
  const libelle = (body.libelle ?? "").trim();

  if (!code) {
    return NextResponse.json({ error: "Le code est requis." }, { status: 400 });
  }
  if (!libelle) {
    return NextResponse.json({ error: "Le libellé est requis." }, { status: 400 });
  }

  try {
    const created = await prisma.npoExclusionCode.create({
      data: { code, libelle, actif: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: `Le code "${code}" existe déjà.` },
      { status: 409 }
    );
  }
}
