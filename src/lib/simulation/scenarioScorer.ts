/**
 * Étape 5 — Scoring des scénarios et des candidats
 */

import type { CandidatResult, Scenario, ConformiteFinale } from "@/types/js-simulation";

// ─── Score candidat ────────────────────────────────────────────────────────────

/**
 * Score entre 0 et 100 pour un candidat direct.
 * Plus le score est élevé, plus l'agent est prioritaire.
 */
export function scorerCandidat(candidat: Omit<CandidatResult, "scorePertinence">): number {
  let score = 100;

  // Pénalité violations
  score -= candidat.detail.violations.length * 25;

  // Pénalité conflits induits
  score -= candidat.nbConflits * 15;

  // Bonus agent de réserve (prévu pour ça)
  if (candidat.agentReserve) score += 10;

  // Bonus JS Z : réaffectation sans cascade = solution plus simple
  if (candidat.surJsZ) score += 15;

  // Pénalité si repos juste suffisant (marge < 2h)
  if (candidat.detail.reposJournalierDisponible !== null) {
    const marge = candidat.detail.reposJournalierDisponible - candidat.detail.reposJournalierMin;
    if (marge < 120) score -= Math.round((120 - marge) / 12);
  }

  // Pénalité GPT chargé
  const gptRatio = candidat.detail.gptActuel / candidat.detail.gptMax;
  if (gptRatio > 0.8) score -= 10;
  if (gptRatio > 0.9) score -= 10;

  return Math.min(100, Math.max(0, score));
}

// ─── Score scénario ────────────────────────────────────────────────────────────

/**
 * Score entre 0 et 100 pour un scénario de réorganisation.
 */
export function scorerScenario(
  conformiteFinale: ConformiteFinale,
  nbModifications: number,
  profondeurCascade: number,
  nbConflitsNonResolu: number
): number {
  let score = 100;

  if (conformiteFinale === "VIGILANCE") score -= 20;
  if (conformiteFinale === "NON_CONFORME") score -= 60;

  score -= nbModifications * 8;
  score -= profondeurCascade * 10;
  score -= nbConflitsNonResolu * 20;

  return Math.min(100, Math.max(0, score));
}

// ─── Conformité finale ──────────────────────────────────────────────────────────

export function determinerConformiteFinale(
  candidatStatut: "DIRECT" | "VIGILANCE" | "REFUSE",
  nbConflitsResidus: number
): ConformiteFinale {
  if (candidatStatut === "REFUSE" || nbConflitsResidus > 0) return "NON_CONFORME";
  if (candidatStatut === "VIGILANCE") return "VIGILANCE";
  return "CONFORME";
}
