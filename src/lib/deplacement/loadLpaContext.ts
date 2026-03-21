/**
 * Chargement du contexte LPA depuis la base de données.
 * Ce contexte est passé à computeEffectiveService pour chaque calcul.
 *
 * loadLpaContext() est typiquement appelé une seule fois par requête API
 * (avant de boucler sur les agents candidats), pour minimiser les allers-retours DB.
 */

import { prisma } from "@/lib/prisma";
import type { LpaContext, LpaData, JsTypeData, AgentDeplacementRuleData } from "@/types/deplacement";

/**
 * Charge l'intégralité du référentiel LPA / JsType et les règles déplacement
 * des agents spécifiés (ou de tous les agents si agentIds est omis).
 */
export async function loadLpaContext(agentIds?: string[]): Promise<LpaContext> {
  // Charger toutes les LPA actives avec leurs JsTypes associés
  const lpasRaw = await prisma.lpa.findMany({
    where: { actif: true },
    include: {
      lpaJsTypes: {
        select: { jsTypeId: true },
      },
    },
    orderBy: { code: "asc" },
  });

  const lpas: LpaData[] = lpasRaw.map((l) => ({
    id: l.id,
    code: l.code,
    libelle: l.libelle,
    actif: l.actif,
    jsTypeIds: new Set(l.lpaJsTypes.map((ljt) => ljt.jsTypeId)),
  }));

  // Charger tous les JsTypes actifs
  const jsTypesRaw = await prisma.jsType.findMany({
    where: { actif: true },
    orderBy: { code: "asc" },
  });

  const jsTypes: JsTypeData[] = jsTypesRaw.map((jt) => ({
    id: jt.id,
    code: jt.code,
    libelle: jt.libelle,
    heureDebutStandard: jt.heureDebutStandard,
    heureFinStandard: jt.heureFinStandard,
    dureeStandard: jt.dureeStandard,
    estNuit: jt.estNuit,
    regime: jt.regime,
    actif: jt.actif,
  }));

  // Charger les règles déplacement
  const whereClause = agentIds
    ? { agentId: { in: agentIds }, actif: true }
    : { actif: true };

  const rulesRaw = await prisma.agentJsDeplacementRule.findMany({
    where: whereClause,
    orderBy: [{ agentId: "asc" }, { jsTypeId: "asc" }],
  });

  const agentRulesMap = new Map<string, AgentDeplacementRuleData[]>();
  for (const r of rulesRaw) {
    const rule: AgentDeplacementRuleData = {
      id: r.id,
      agentId: r.agentId,
      jsTypeId: r.jsTypeId,
      prefixeJs: r.prefixeJs,
      horsLpa: r.horsLpa,
      tempsTrajetAllerMinutes: r.tempsTrajetAllerMinutes,
      tempsTrajetRetourMinutes: r.tempsTrajetRetourMinutes,
      actif: r.actif,
    };
    if (!agentRulesMap.has(r.agentId)) {
      agentRulesMap.set(r.agentId, []);
    }
    agentRulesMap.get(r.agentId)!.push(rule);
  }

  return { lpas, jsTypes, agentRulesMap };
}
