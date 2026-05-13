/**
 * Helper de filtrage stable des PlanningEvent.
 *
 * RAISON D'ÊTRE : le filtrage par référence (`events.filter(e => e !== target)`)
 * casse dès qu'un événement est cloné quelque part dans le pipeline (spread,
 * structuredClone, recopie via `{...e}`). L'event « cible » et son clone
 * deviennent deux objets distincts qui représentent la même ligne de planning
 * métier — le filtre par référence ne supprime qu'une des deux instances et
 * laisse l'autre dans la liste, ce qui fausse silencieusement les calculs RH
 * (overlap, GPT, repos).
 *
 * `planningLigneId` est l'identifiant unique d'une PlanningLigne côté DB.
 * Tant qu'on respecte le contrat « un planningLigneId par event dans une
 * liste donnée », filtrer par ID supprime exactement la cible et ses
 * éventuels clones.
 *
 * Pour les events synthétiques (tests, JS injectées via
 * `injecterJsDansPlanning`, etc.) qui n'ont pas de `planningLigneId`, on
 * retombe sur le comportement legacy par référence — pas de régression.
 */

import type { PlanningEvent } from "@/engine/rules";

export function excludeEvent(
  events: PlanningEvent[],
  target: PlanningEvent,
): PlanningEvent[] {
  const targetId = target.planningLigneId;
  if (targetId) {
    return events.filter((e) => e.planningLigneId !== targetId);
  }
  // Pas d'ID sur la cible → fallback référence (events synthétiques, tests)
  return events.filter((e) => e !== target);
}
