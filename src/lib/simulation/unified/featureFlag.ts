/**
 * Gate du solveur unifié en mode "primary".
 *
 * Le solveur unifié coexiste avec le moteur historique sous deux flags :
 *   - UNIFIED_SHADOW=1            : exécution parallèle, rapport en logs uniquement
 *   - FEATURE_UNIFIED_PRIMARY=1   : exposition du rapport unifié côté UI
 *
 * Tant que les divergences C1/C2 (REGLES_FATALES vs REGLES_BLOQUANTES) ne sont
 * pas arbitrées et alignées avec le moteur historique, l'activation de
 * FEATURE_UNIFIED_PRIMARY produirait des résultats UI silencieusement plus
 * stricts (MIN_REGIME_BC, GPT_NUIT_CONSECUTIVES) que le legacy. On exige donc
 * un second flag explicite UNIFIED_PRIMARY_ALIGNMENT_DONE pour activer le
 * mode primary, indiquant que l'arbitrage a eu lieu.
 *
 * Voir docs/unified-solver-divergences.md pour la liste des divergences à
 * arbitrer avant de fixer UNIFIED_PRIMARY_ALIGNMENT_DONE=1.
 *
 * Le mode shadow (UNIFIED_SHADOW=1) reste activable indépendamment et n'est
 * pas concerné — il n'expose rien à l'UI, juste des logs serveur.
 */

let warnEmitted = false;

/**
 * Retourne true si le rapport unifié doit être exposé à l'UI dans la réponse
 * API. Émet un warning serveur (une fois par process) si FEATURE_UNIFIED_PRIMARY
 * est positionné sans le drapeau d'alignement.
 */
export function isUnifiedPrimaryEnabled(): boolean {
  const featureRequested = process.env.FEATURE_UNIFIED_PRIMARY === "1";
  if (!featureRequested) return false;

  const alignmentDone = process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE === "1";
  if (alignmentDone) return true;

  if (!warnEmitted) {
    warnEmitted = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[unified] FEATURE_UNIFIED_PRIMARY=1 ignored — divergences C1/C2 not yet arbitrated. " +
        "Set UNIFIED_PRIMARY_ALIGNMENT_DONE=1 once REGLES_FATALES is aligned with REGLES_BLOQUANTES " +
        "(see docs/unified-solver-divergences.md)."
    );
  }
  return false;
}

/**
 * Retourne true si le solveur unifié doit s'exécuter en mode shadow (logs
 * uniquement, pas d'exposition UI). Inclut le cas où FEATURE_UNIFIED_PRIMARY
 * a été demandé : on émet le rapport en logs même si on n'a pas le droit de
 * le surfacer côté UI, pour conserver le signal d'observation.
 */
export function isUnifiedShadowEnabled(): boolean {
  return (
    process.env.UNIFIED_SHADOW === "1" ||
    process.env.FEATURE_UNIFIED_PRIMARY === "1"
  );
}

/**
 * Réinitialise le flag de warning. Réservé aux tests — permet de vérifier
 * l'émission du warn sur plusieurs scénarios sans pollution inter-tests.
 */
export function _resetUnifiedFlagWarnForTests(): void {
  warnEmitted = false;
}
