/**
 * GET    /api/admin/work-rules — Retourne les valeurs courantes (admin)
 * PUT    /api/admin/work-rules — Sauvegarde les règles (admin)
 * DELETE /api/admin/work-rules — Réinitialise aux valeurs par défaut (admin)
 *
 * SÉCURITÉ : toutes les méthodes nécessitent le rôle ADMIN.
 * Le middleware bloque déjà /api/admin/* pour les non-admin.
 * Le checkAdmin() ici est une défense en profondeur.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { WORK_RULES_METADATA } from "@/lib/rules/workRules";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const dbRules = await prisma.workRule.findMany();

    const values: Record<string, number> = {};
    for (const [key, meta] of Object.entries(WORK_RULES_METADATA)) {
      values[key] = meta.defaultValue;
    }
    for (const rule of dbRules) {
      if (rule.key in WORK_RULES_METADATA) {
        values[rule.key] = rule.value;
      }
    }

    return NextResponse.json({ values, metadata: WORK_RULES_METADATA });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json() as { rules: { key: string; value: number }[] };

    if (!Array.isArray(body.rules)) {
      return NextResponse.json({ error: "Format invalide" }, { status: 400 });
    }

    for (const rule of body.rules) {
      if (!(rule.key in WORK_RULES_METADATA)) continue;
      // Validation : valeur numérique positive
      if (typeof rule.value !== "number" || rule.value < 0 || !isFinite(rule.value)) continue;

      const category = WORK_RULES_METADATA[rule.key].category;
      await prisma.workRule.upsert({
        where: { key: rule.key },
        update: { value: rule.value, category },
        create: { key: rule.key, value: rule.value, category },
      });
    }

    await logAudit("UPDATE_WORK_RULES", "WorkRule", {
      user: auth.user,
      details: { count: body.rules.length },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    await prisma.workRule.deleteMany();

    await logAudit("RESET_WORK_RULES", "WorkRule", { user: auth.user });

    return NextResponse.json({ success: true, message: "Règles réinitialisées aux valeurs par défaut" });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
