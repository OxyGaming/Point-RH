/**
 * Chargement dynamique des règles depuis la base de données.
 * Ce module est SERVEUR UNIQUEMENT (utilise Prisma/SQLite).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WORK_RULES,
  DEFAULT_WORK_RULES_MINUTES,
  rulesHeuresToMinutes,
  type WorkRules,
  type WorkRulesMinutes,
} from "@/lib/rules/workRules";

/**
 * Charge les règles depuis la base de données.
 * Retourne les valeurs par défaut converties en minutes si la base est vide.
 */
export async function loadWorkRules(): Promise<WorkRulesMinutes> {
  try {
    const dbRules = await prisma.workRule.findMany();

    if (dbRules.length === 0) return DEFAULT_WORK_RULES_MINUTES;

    const merged: WorkRules = {
      amplitude: { ...DEFAULT_WORK_RULES.amplitude },
      travailEffectif: { ...DEFAULT_WORK_RULES.travailEffectif },
      reposJournalier: { ...DEFAULT_WORK_RULES.reposJournalier },
      reposPeriodique: { ...DEFAULT_WORK_RULES.reposPeriodique },
      pause: { ...DEFAULT_WORK_RULES.pause },
      gpt: { ...DEFAULT_WORK_RULES.gpt },
    };

    for (const rule of dbRules) {
      const dotIndex = rule.key.indexOf(".");
      if (dotIndex === -1) continue;
      const category = rule.key.slice(0, dotIndex) as keyof WorkRules;
      const key = rule.key.slice(dotIndex + 1);
      if (category in merged && key in (merged[category] as object)) {
        (merged[category] as Record<string, number>)[key] = rule.value;
      }
    }

    return rulesHeuresToMinutes(merged);
  } catch {
    return DEFAULT_WORK_RULES_MINUTES;
  }
}
