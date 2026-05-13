/**
 * Helper partagé du pré-filtre déplacement — règle LPA-aware unique consommée
 * par les deux pré-filtres (single-JS et multi-JS).
 *
 * RAISON D'ÊTRE : sans ce wrapper, single-JS consultait l'effectiveServiceMap
 * (et laissait passer l'agent si LPA pouvait juger l'amplitude), alors que
 * multi-JS bloquait dès `imprevu.deplacement && !peutEtreDeplace` — pas de
 * bug visible tant que multi-JS est appelé avec `deplacement=false` par
 * défaut, mais incohérence latente. Dès qu'un caller passe `deplacement=true`,
 * divergence C4.
 *
 * Sémantique (alignée sur l'ancien candidateFinder:79-96) :
 *   1. Pas de déplacement demandé → jamais bloquant.
 *   2. LPA a tranché (`estEnDeplacement !== null`) → jamais bloquant ici :
 *      l'amplitude résultante sera évaluée par evaluerMobilisabilite. Une
 *      JS hors LPA est autorisée — le trajet est ajouté à l'amplitude.
 *   3. Sinon (LPA indéterminable, fallback manuel) → bloquant si l'agent
 *      n'est pas habilité au déplacement manuel.
 */

import type { AgentContext } from "@/engine/rules";
import type { EffectiveServiceInfo } from "@/types/deplacement";

export function isDeplacementManuelBloquant(
  context: AgentContext,
  imprevuDeplacement: boolean,
  effSvc: EffectiveServiceInfo | undefined,
): boolean {
  if (!imprevuDeplacement) return false;
  if (effSvc && effSvc.estEnDeplacement !== null) {
    // LPA a tranché — laisser l'évaluation fine juger l'amplitude résultante
    return false;
  }
  return !context.peutEtreDeplace;
}
