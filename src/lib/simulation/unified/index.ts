/**
 * Solveur de cascade unifié — point d'entrée public.
 *
 * NON BRANCHÉ dans l'allocator pour l'instant. Voir solveur.ts pour les
 * fonctions principales et types.ts pour les types.
 *
 * Stratégie de migration progressive :
 *   Étape 1 (en cours) — coexistence silencieuse, dev + tests isolés
 *   Étape 2 — mode shadow : exécution en parallèle de l'existant pour audit
 *   Étape 3 — bascule UI derrière feature flag
 *   Étape 4 — suppression de chaineRemplacement.ts + cascadeResolver.ts
 */

export * from "./types";
export {
  resoudreBesoin,
  enumererSolutions,
  besoinRacineFromJs,
  aplatirResolution,
  profondeurMaxResolution,
  planningEffectif,
} from "./solveur";
export {
  evaluerImpactComplet,
  mapViolationsToConsequences,
  eventToJsCible,
} from "./evaluation";
export {
  creerEtatInitial,
  enrichirEtat,
  hashEtat,
  cacheKey,
} from "./etat";
