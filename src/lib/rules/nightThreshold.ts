/**
 * Helper unique pour qualifier une JS de "nuit" à partir des WorkRules actives.
 *
 * RAISON D'ÊTRE : sans ce wrapper, les call-sites doivent reconstruire à la
 * main l'objet `NightOpts` à partir de `rules.periodeNocturne` — risque
 * d'oubli garanti à chaque nouveau site. Le wrapper force le passage des
 * règles, donc un seuil custom (ex. début soirée à 22h) est répercuté
 * partout : pré-filtre des candidats, classification d'un imprévu,
 * pré-filtre indexé unified.
 *
 * Sans cet alignement, le pré-filtre peut classer une JS "nuit" alors que
 * `evaluerMobilisabilite` (qui lit `rules.periodeNocturne` directement) ne
 * la classe plus comme telle — ou l'inverse. Divergence C3.
 */

import { isJsDeNuit } from "@/lib/utils";
import type { WorkRulesMinutes } from "./workRules";

export function isJsDeNuitFromRules(
  heureDebut: string,
  heureFin: string,
  rules: WorkRulesMinutes
): boolean {
  return isJsDeNuit(heureDebut, heureFin, {
    debutSoirMin: rules.periodeNocturne.debutSoir,
    finMatinMin: rules.periodeNocturne.finMatin,
    seuilMin: rules.periodeNocturne.seuilJsNuit,
  });
}
