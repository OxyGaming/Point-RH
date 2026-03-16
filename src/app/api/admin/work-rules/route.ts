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

    // Construire un objet valeurs complet (défauts + nouvelles valeurs)
    const mergedValues: Record<string, number> = {};
    for (const [key, meta] of Object.entries(WORK_RULES_METADATA)) {
      mergedValues[key] = meta.defaultValue;
    }
    const existingRules = await prisma.workRule.findMany();
    for (const r of existingRules) {
      if (r.key in mergedValues) mergedValues[r.key] = r.value;
    }
    for (const rule of body.rules) {
      if (rule.key in WORK_RULES_METADATA) mergedValues[rule.key] = rule.value;
    }

    // Validation individuelle (min/max)
    const validationErrors: string[] = [];
    for (const rule of body.rules) {
      if (!(rule.key in WORK_RULES_METADATA)) continue;
      if (typeof rule.value !== "number" || !isFinite(rule.value)) {
        validationErrors.push(`${rule.key} : valeur non numérique`);
        continue;
      }
      const meta = WORK_RULES_METADATA[rule.key];
      if (meta.min !== undefined && rule.value < meta.min)
        validationErrors.push(`${meta.label} : valeur minimale ${meta.min} ${meta.unit}`);
      if (meta.max !== undefined && rule.value > meta.max)
        validationErrors.push(`${meta.label} : valeur maximale ${meta.max} ${meta.unit}`);
    }

    // Validation de cohérence entre règles
    const v = (key: string) => mergedValues[key] ?? 0;
    if (v("reposJournalier.reduitReserve") >= v("reposJournalier.standard"))
      validationErrors.push("Le repos réduit réserve doit être inférieur au repos standard");
    if (v("reposJournalier.standard") >= v("reposJournalier.apresNuit"))
      validationErrors.push("Le repos après nuit doit être supérieur au repos standard");
    if (v("gpt.maxAvantRP") >= v("gpt.max"))
      validationErrors.push("GPT max avant RP doit être strictement inférieur au GPT maximum");
    if (v("gpt.min") > v("gpt.max"))
      validationErrors.push("GPT minimum ne peut pas dépasser GPT maximum");
    if (v("reposPeriodique.simple") >= v("reposPeriodique.double"))
      validationErrors.push("RP double doit être supérieur au RP simple");
    if (v("reposPeriodique.double") >= v("reposPeriodique.triple"))
      validationErrors.push("RP triple doit être supérieur au RP double");

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(" | ") }, { status: 422 });
    }

    // Sauvegarde
    for (const rule of body.rules) {
      if (!(rule.key in WORK_RULES_METADATA)) continue;
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
