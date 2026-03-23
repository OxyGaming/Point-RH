/**
 * Étape 5 — Scoring des scénarios et des candidats
 *
 * Deux scores distincts, non comparables entre eux :
 *
 *   scoreCandidat  (0–100) — qualité individuelle d'un agent pour une JS.
 *     → "Cet agent est-il un bon candidat pour cette JS ?"
 *     → Utilisé dans les deux modes (simple et multiple).
 *     → Champ : scorePertinence (simple) / score (multi).
 *
 *   scoreScenario  (0–100) — qualité globale d'un scénario de réorganisation.
 *     → "Ce scénario couvre-t-il bien l'événement avec un minimum de perturbations ?"
 *     → Simple  : basé sur conformité, profondeur cascade, conflits résiduels.
 *     → Multiple : basé sur taux de couverture, ratio vigilance, conflits bloquants.
 */

import type { CandidatResult, Scenario, ConformiteFinale } from "@/types/js-simulation";

// ─── scoreCandidat — poids (somme indicative, pas normalisée) ──────────────────

const POIDS_SCORE_CANDIDAT = {
  /** Pénalité par violation bloquante (règle RH non respectée) */
  violationBloquante:   25,
  /** Pénalité par conflit induit sur le planning de l'agent */
  conflitInduit:        15,
  /** Bonus agent de réserve (prévu pour ce rôle) */
  bonusReserve:         10,
  /** Bonus JS Z (réaffectation sans cascade nécessaire) */
  bonusJsZ:             15,
  /** Pénalité si marge de repos < 2h (agent "juste" disponible) */
  margReposInsuffisante: 10, // max appliqué
  /** Pénalité GPT chargé (> 80% du max) */
  gptCharge80:          10,
  /** Pénalité GPT très chargé (> 90% du max) */
  gptCharge90:          10,
} as const;

// ─── scoreScenario simple — poids ─────────────────────────────────────────────

const POIDS_SCORE_SCENARIO_SIMPLE = {
  penaliteVigilance:    20,
  penaliteNonConforme:  60,
  penaliteParModif:      8,
  penaliteParCascade:   10,
  penaliteConflitResidu: 20,
} as const;

// ─── Détail du scoreCandidat ──────────────────────────────────────────────────

export interface ScoreBreakdownCandidat {
  base:                number;
  penaliteViolations:  number;
  penaliteConflits:    number;
  bonusReserve:        number;
  bonusJsZ:            number;
  penaliteMargeRepos:  number;
  penaliteGpt:         number;
  total:               number;
}

// ─── scoreCandidat ────────────────────────────────────────────────────────────

/**
 * Score entre 0 et 100 pour un candidat individuel.
 * Plus le score est élevé, plus l'agent est prioritaire pour cette JS.
 *
 * Formule :
 *   base = 100
 *   - violations × 25
 *   - conflitsInduits × 15
 *   + agentReserve ? +10
 *   + surJsZ ? +15
 *   - marge repos < 2h → jusqu'à -10
 *   - GPT > 80% → -10 ; GPT > 90% → -10 supplémentaire
 */
export function scorerCandidat(candidat: Omit<CandidatResult, "scorePertinence" | "scoreBreakdown">): number {
  return scorerCandidatDetail(candidat).total;
}

/**
 * Variante de scorerCandidat retournant le détail de chaque composante.
 * Utile pour l'UI (transparence du score) et les tests.
 */
export function scorerCandidatDetail(
  candidat: Omit<CandidatResult, "scorePertinence" | "scoreBreakdown">
): ScoreBreakdownCandidat {
  const base = 100;

  const penaliteViolations = candidat.detail.violations.length * POIDS_SCORE_CANDIDAT.violationBloquante;
  const penaliteConflits   = candidat.nbConflits * POIDS_SCORE_CANDIDAT.conflitInduit;
  const bonusReserve       = candidat.agentReserve ? POIDS_SCORE_CANDIDAT.bonusReserve : 0;
  const bonusJsZ           = candidat.surJsZ       ? POIDS_SCORE_CANDIDAT.bonusJsZ    : 0;

  // Pénalité progressive si marge de repos < 2h (120 min)
  let penaliteMargeRepos = 0;
  if (candidat.detail.reposJournalierDisponible !== null) {
    const marge = candidat.detail.reposJournalierDisponible - candidat.detail.reposJournalierMin;
    if (marge < 120) {
      penaliteMargeRepos = Math.round((120 - marge) / 12); // max ≈ 10 pts
    }
  }

  // Pénalité GPT chargé
  const gptRatio = candidat.detail.gptActuel / candidat.detail.gptMax;
  let penaliteGpt = 0;
  if (gptRatio > 0.9) penaliteGpt += POIDS_SCORE_CANDIDAT.gptCharge90;
  if (gptRatio > 0.8) penaliteGpt += POIDS_SCORE_CANDIDAT.gptCharge80;

  const total = Math.min(100, Math.max(0,
    base
    - penaliteViolations
    - penaliteConflits
    + bonusReserve
    + bonusJsZ
    - penaliteMargeRepos
    - penaliteGpt
  ));

  return {
    base,
    penaliteViolations,
    penaliteConflits,
    bonusReserve,
    bonusJsZ,
    penaliteMargeRepos,
    penaliteGpt,
    total,
  };
}

// ─── scoreScenario — mode simple ──────────────────────────────────────────────

/**
 * Score entre 0 et 100 pour un scénario de réorganisation (mode simple).
 *
 * Ce score mesure la QUALITÉ GLOBALE du scénario :
 *   - conformité finale (aucune violation résiduelle ?)
 *   - nombre de modifications nécessaires (cascade profonde = perturbant)
 *   - conflits résiduels non résolus
 *
 * NON comparable au scoreCandidat : les deux scores ont des échelles différentes.
 *
 * Formule :
 *   base = 100
 *   - VIGILANCE → -20
 *   - NON_CONFORME → -60
 *   - modifications × 8
 *   - profondeur cascade × 10
 *   - conflits résiduels × 20
 */
export function scorerScenario(
  conformiteFinale: ConformiteFinale,
  nbModifications: number,
  profondeurCascade: number,
  nbConflitsNonResolu: number
): number {
  let score = 100;

  if (conformiteFinale === "VIGILANCE")   score -= POIDS_SCORE_SCENARIO_SIMPLE.penaliteVigilance;
  if (conformiteFinale === "NON_CONFORME") score -= POIDS_SCORE_SCENARIO_SIMPLE.penaliteNonConforme;

  score -= nbModifications   * POIDS_SCORE_SCENARIO_SIMPLE.penaliteParModif;
  score -= profondeurCascade * POIDS_SCORE_SCENARIO_SIMPLE.penaliteParCascade;
  score -= nbConflitsNonResolu * POIDS_SCORE_SCENARIO_SIMPLE.penaliteConflitResidu;

  return Math.min(100, Math.max(0, score));
}

// ─── scoreScenario — mode multiple ────────────────────────────────────────────

/**
 * Poids pour le scoreScenario en mode multi-JS.
 *
 * Ce score mesure la COUVERTURE et la ROBUSTESSE du scénario :
 *   - taux de couverture (JS couvertes / JS totales)
 *   - ratio agents de réserve utilisés (mobilisation "normale")
 *   - ratio affectations VIGILANCE (perturbations résiduelles)
 *   - conflits bloquants non résolus
 *
 * NON comparable au scoreCandidat individuel.
 */
export const POIDS_SCORE_SCENARIO_MULTI = {
  /** Poids de la couverture dans le score global (en %) */
  poidsCouverture:       1.0,  // base = tauxCouverture (0–100)
  /** Bonus max pour ratio réserve (agents prévus pour ça) */
  bonusMaxReserve:       10,
  /** Pénalité par affectation VIGILANCE */
  penaliteParVigilance:   5,
  /** Pénalité par JS OBLIGATOIRE non couverte */
  penaliteConflitBloquant: 10,
  /** Pénalité par JS DERNIER_RECOURS non couverte (réduite) */
  penaliteJsDernierRecours: 5,
  /** Pénalité par conflit AVERTISSEMENT */
  penaliteConflitAvert:   3,
  /** Coût par figeage appliqué (impact sur le score scénario, pas le score candidat) */
  penaliteParFigeage:     3,
} as const;

// ─── Conformité finale ────────────────────────────────────────────────────────

export function determinerConformiteFinale(
  candidatStatut: "DIRECT" | "VIGILANCE" | "REFUSE",
  nbConflitsResidus: number
): ConformiteFinale {
  if (candidatStatut === "REFUSE" || nbConflitsResidus > 0) return "NON_CONFORME";
  if (candidatStatut === "VIGILANCE") return "VIGILANCE";
  return "CONFORME";
}
