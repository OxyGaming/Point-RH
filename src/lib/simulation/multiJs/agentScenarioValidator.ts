/**
 * Validation de la compatibilité d'une nouvelle affectation pour un agent
 * dans le contexte d'un scénario multi-JS déjà en cours de construction.
 *
 * Règle métier clé : un agent peut se voir affecter plusieurs JS dans un même
 * scénario si et seulement si :
 *   1. Aucune des JS ne se chevauche temporellement
 *   2. L'ensemble de ses affectations cumulées reste conforme aux règles RH
 */

import { combineDateTime, diffMinutes, isJsDeNuit, getDateFinJs } from "@/lib/utils";
import { evaluerMobilisabilite } from "@/engine/rules";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { JsCible } from "@/types/js-simulation";
import { injecterJsDansPlanning } from "@/lib/simulation/candidateFinder";
import { buildImprevu } from "./multiJsCandidateFinder";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import type { EffectiveServiceInfo } from "@/types/deplacement";

/**
 * Résultat de la vérification d'une nouvelle affectation.
 */
export interface CompatibiliteResult {
  compatible: boolean;
  statut: "DIRECT" | "VIGILANCE" | "INCOMPATIBLE";
  motif: string;
}

/**
 * Vérifie si un agent peut recevoir une nouvelle JS (newJs) dans un scénario
 * où il a déjà des affectations (jsDejaAffectees).
 *
 * @param agentData         Contexte de l'agent + son planning de base (hors scénario)
 * @param newJs             La nouvelle JS à affecter
 * @param jsDejaAffectees   Les JS déjà affectées à cet agent dans le scénario en cours
 * @param rules             Règles de travail actives
 * @param remplacement      Contexte de remplacement (true par défaut)
 * @param deplacement       Contexte de déplacement (false par défaut)
 */
export function canAssignJsToAgentInScenario(
  agentData: AgentDataMultiJs,
  newJs: JsCible,
  jsDejaAffectees: JsCible[],
  rules: WorkRulesMinutes,
  remplacement = true,
  deplacement = false,
  effectiveServiceMap?: Map<string, EffectiveServiceInfo>
): CompatibiliteResult {
  const newStart = combineDateTime(newJs.date, newJs.heureDebut);
  const newEnd = combineDateTime(newJs.date, newJs.heureFin);

  // ─── 1. Vérifier chevauchements horaires avec les JS déjà affectées ──────────
  for (const existing of jsDejaAffectees) {
    const eStart = combineDateTime(existing.date, existing.heureDebut);
    const eEnd = combineDateTime(existing.date, existing.heureFin);

    if (eStart < newEnd && eEnd > newStart) {
      return {
        compatible: false,
        statut: "INCOMPATIBLE",
        motif: `Chevauchement horaire avec ${existing.codeJs ?? "JS"} du ${existing.date} (${existing.heureDebut}–${existing.heureFin})`,
      };
    }
  }

  // ─── 2. Construire le planning simulé : base + toutes les JS déjà affectées ──
  let eventsSimules = [...agentData.events];
  for (const jsAffectee of jsDejaAffectees) {
    const imprevuAffectee = buildImprevu(jsAffectee, remplacement, deplacement);
    eventsSimules = injecterJsDansPlanning(eventsSimules, jsAffectee, imprevuAffectee);
  }

  // ─── 3. Évaluer la nouvelle JS sur ce planning simulé ────────────────────────
  const imprevuNew = buildImprevu(newJs, remplacement, deplacement);
  const isNuitJs = isJsDeNuit(newJs.heureDebut, newJs.heureFin);

  // Service effectif LPA-based
  const effectiveService = effectiveServiceMap?.get(`${agentData.context.id}:${newJs.planningLigneId}`) ?? null;
  const heureDebutSim = effectiveService && !effectiveService.indeterminable
    ? effectiveService.heureDebutEffective
    : imprevuNew.heureDebutReel;
  const heureFinSim = effectiveService && !effectiveService.indeterminable
    ? effectiveService.heureFinEffective
    : imprevuNew.heureFinEstimee;
  const deplacementEffectif = effectiveService && effectiveService.estEnDeplacement !== null
    ? effectiveService.estEnDeplacement
    : imprevuNew.deplacement;

  const simulationInput = {
    importId: newJs.importId,
    dateDebut: newJs.date,
    dateFin: getDateFinJs(newJs.date, heureDebutSim, heureFinSim),
    heureDebut: heureDebutSim,
    heureFin: heureFinSim,
    poste: newJs.codeJs ?? "JS",
    codeJs: newJs.codeJs,
    remplacement: imprevuNew.remplacement,
    deplacement: deplacementEffectif,
    posteNuit: isNuitJs || newJs.isNuit,
  };

  const resultat = evaluerMobilisabilite(
    agentData.context,
    eventsSimules,
    simulationInput,
    rules,
    effectiveService
  );

  if (resultat.statut === "NON_CONFORME") {
    return {
      compatible: false,
      statut: "INCOMPATIBLE",
      motif: resultat.motifPrincipal,
    };
  }

  return {
    compatible: true,
    statut: resultat.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
    motif: resultat.motifPrincipal,
  };
}
