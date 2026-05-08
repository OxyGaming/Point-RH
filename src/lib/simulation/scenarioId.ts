/**
 * Génération d'identifiants de scénario uniques et thread-safe.
 *
 * Le compteur global précédemment utilisé dans `scenarioBuilder.ts`
 * (`let scenarioCounter = 0;`) avait deux défauts :
 *
 *   1. Réinitialisé au début de `construireScenarios`, il produisait des IDs
 *      identiques (`scenario-1`, `scenario-2`…) entre les passes "sansFigeage"
 *      et "avecFigeage" du single-JS — les deux blocs partageaient les mêmes
 *      identifiants côté UI.
 *   2. Non thread-safe : si deux requêtes API se chevauchaient (Node.js
 *      mono-thread mais avec `await` qui rendent la main), les compteurs
 *      s'entrelaçaient et produisaient des IDs incohérents.
 *
 * Format : `scenario-${ms36}-${rand5}` — timestamp en base 36 + 5 caractères
 * aléatoires, suffisant pour des collisions impossibles à observer en pratique
 * (probabilité < 1 / 60 millions sur deux appels dans la même milliseconde).
 *
 * Le frontend traite l'ID comme un identifiant opaque (pas de parsing
 * numérique) — vérifié par audit avant introduction de ce helper.
 */

export function generateScenarioId(): string {
  return `scenario-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
