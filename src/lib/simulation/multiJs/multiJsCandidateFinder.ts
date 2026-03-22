/**
 * Identification des candidats pour chaque JS dans une simulation multi-JS.
 * Réutilise la logique de pré-filtre existante, avec gestion du candidateScope.
 */

import { combineDateTime, getDateFinJs } from "@/lib/utils";
import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { JsCible, ImpreuvuConfig } from "@/types/js-simulation";
import type { CandidatMultiJs, CandidateScope } from "@/types/multi-js-simulation";
import { isZeroLoadJs, isAbsenceInaptitude } from "@/lib/simulation/jsUtils";
import { scorerCandidat } from "@/lib/simulation/scenarioScorer";
import { isJsDeNuit, diffMinutes } from "@/lib/utils";
import { detecterConflitsInduits } from "@/lib/simulation/conflictDetector";
import { injecterJsDansPlanning } from "@/lib/simulation/candidateFinder";
import type { EffectiveServiceInfo } from "@/types/deplacement";

export interface AgentDataMultiJs {
  context: AgentContext;
  events: PlanningEvent[];
}

/**
 * Construit un ImpreuvuConfig par défaut pour une JS cible dans la simulation multi-JS.
 * Utilise les horaires standard du JsType si disponibles (indépendants du trajet de l'agent initial).
 */
export function buildImprevu(js: JsCible, remplacement = true, deplacement = false): ImpreuvuConfig {
  return {
    partiel: false,
    // Priorité aux horaires standard du JsType : ils ne contiennent pas le temps de trajet
    // de l'agent initial, contrairement aux horaires du planning (heureDebut/heureFin).
    heureDebutReel: js.heureDebutJsType ?? js.heureDebut,
    heureFinEstimee: js.heureFinJsType ?? js.heureFin,
    deplacement,
    remplacement,
  };
}

/**
 * Pour une JS donnée, retourne tous les agents candidats triés par score descendant.
 * Filtre selon candidateScope : "reserve_only" ne retient que les agents de réserve.
 */
export function trouverCandidatsPourJs(
  js: JsCible,
  agents: AgentDataMultiJs[],
  candidateScope: CandidateScope,
  rules: WorkRulesMinutes,
  remplacement = true,
  deplacement = false,
  effectiveServiceMap?: Map<string, EffectiveServiceInfo>,
  npoExclusionCodes: string[] = []
): CandidatMultiJs[] {
  const imprevu = buildImprevu(js, remplacement, deplacement);
  const debutImprevu = combineDateTime(js.date, js.heureDebut);
  const finImprevu = combineDateTime(js.date, js.heureFin);
  const isNuitJs = isJsDeNuit(js.heureDebut, js.heureFin);

  const candidats: CandidatMultiJs[] = [];

  for (const { context, events } of agents) {
    // Exclure l'agent prévu sur cette JS
    if (context.id === js.agentId) continue;

    // Filtre réserve uniquement
    if (candidateScope === "reserve_only" && !context.agentReserve) continue;

    // Aucun préfixe JS renseigné → exclu
    if (context.prefixesJs.length === 0) continue;

    // Vérifier préfixe JS autorisé
    if (js.codeJs) {
      const autorise = context.prefixesJs.some((p) =>
        js.codeJs!.toUpperCase().startsWith(p.toUpperCase())
      );
      if (!autorise) continue;
    }

    // Habilitation nuit
    if (isNuitJs && !context.peutFaireNuit) continue;

    // Habilitation déplacement
    if (deplacement && !context.peutEtreDeplace) continue;

    // Vérifier absence pour inaptitude (codes configurés par l'admin)
    const absenceInaptitude = events.find(
      (e) => isAbsenceInaptitude(e, npoExclusionCodes) && e.dateDebut < finImprevu && e.dateFin > debutImprevu
    );
    if (absenceInaptitude) continue;

    // L'agent ne doit pas avoir une JS non-Z en conflit horaire
    const conflit = events.find((e) => {
      if (e.jsNpo !== "JS") return false;
      if (isZeroLoadJs(e.codeJs)) return false;
      return e.dateDebut < finImprevu && e.dateFin > debutImprevu;
    });
    if (conflit) continue;

    // JS Z : obtenir la JS Z d'origine si présente
    const jsZOrigine = events.find(
      (e) =>
        e.jsNpo === "JS" &&
        isZeroLoadJs(e.codeJs) &&
        e.dateDebut < finImprevu &&
        e.dateFin > debutImprevu
    ) ?? null;
    const surJsZ = jsZOrigine !== null;

    const eventsEffectifs = surJsZ
      ? events.filter((e) => e !== jsZOrigine)
      : events;

    // ─── Service effectif LPA-based ────────────────────────────────────────────
    const effectiveService = effectiveServiceMap?.get(`${context.id}:${js.planningLigneId}`) ?? null;
    // Utiliser toujours heureDebutEffective quand disponible : même quand indeterminable=true,
    // cette valeur est basée sur les horaires standard du JsType (pas sur le trajet de l'agent initial).
    const heureDebutSim = effectiveService
      ? effectiveService.heureDebutEffective
      : imprevu.heureDebutReel;
    const heureFinSim = effectiveService
      ? effectiveService.heureFinEffective
      : imprevu.heureFinEstimee;
    const deplacementEffectif = effectiveService && effectiveService.estEnDeplacement !== null
      ? effectiveService.estEnDeplacement
      : imprevu.deplacement;

    const simulationInput = {
      importId: js.importId,
      dateDebut: js.date,
      dateFin: getDateFinJs(js.date, heureDebutSim, heureFinSim),
      heureDebut: heureDebutSim,
      heureFin: heureFinSim,
      poste: js.codeJs ?? "JS",
      codeJs: js.codeJs,
      remplacement: imprevu.remplacement,
      deplacement: deplacementEffectif,
      posteNuit: isNuitJs || js.isNuit,
    };

    const resultat = evaluerMobilisabilite(context, eventsEffectifs, simulationInput, rules, effectiveService);
    if (resultat.statut === "NON_CONFORME") continue;

    // Conflits induits
    const eventsAvecJs = injecterJsDansPlanning(eventsEffectifs, js, imprevu);
    const conflitsInduits = detecterConflitsInduits(
      eventsAvecJs,
      finImprevu,
      context.agentReserve,
      imprevu.remplacement,
      rules
    );

    const statut: "DIRECT" | "VIGILANCE" =
      resultat.statut === "VIGILANCE" || conflitsInduits.length > 0
        ? "VIGILANCE"
        : "DIRECT";

    const candidatPartiel = {
      agentId: context.id,
      nom: context.nom,
      prenom: context.prenom,
      matricule: context.matricule,
      posteAffectation: context.posteAffectation,
      agentReserve: context.agentReserve,
      surJsZ,
      codeJsZOrigine: jsZOrigine?.codeJs ?? null,
      statut,
      motifPrincipal: resultat.motifPrincipal,
      detail: resultat.detail,
      conflitsInduits,
      nbConflits: conflitsInduits.length,
    };
    const score = scorerCandidat(candidatPartiel);

    candidats.push({
      agentId: context.id,
      nom: context.nom,
      prenom: context.prenom,
      matricule: context.matricule,
      posteAffectation: context.posteAffectation,
      agentReserve: context.agentReserve,
      score,
      statut,
      motif: resultat.motifPrincipal,
      conflitsInduits,
    });
  }

  // Tri : DIRECT avant VIGILANCE, puis par score décroissant, puis réserve en premier
  return candidats.sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === "DIRECT" ? -1 : 1;
    if (a.agentReserve !== b.agentReserve) return a.agentReserve ? -1 : 1;
    return b.score - a.score;
  });
}
