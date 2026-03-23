/**
 * Identification des candidats pour chaque JS dans une simulation multi-JS.
 * Réutilise la logique de pré-filtre existante, avec gestion du candidateScope.
 *
 * Garantie : aucune exclusion silencieuse.
 * Chaque agent exclu produit un objet Exclusion structuré dans le tableau `exclusions`.
 */

import { combineDateTime, getDateFinJs } from "@/lib/utils";
import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { JsCible, ImpreuvuConfig, FlexibiliteJs, JsSourceFigee } from "@/types/js-simulation";
import type { CandidatMultiJs, CandidateScope, MultiJsExclusion } from "@/types/multi-js-simulation";
import { isZeroLoadJs, isAbsenceInaptitude } from "@/lib/simulation/jsUtils";
import { scorerCandidat } from "@/lib/simulation/scenarioScorer";
import { isJsDeNuit, diffMinutes } from "@/lib/utils";
import { detecterConflitsInduits } from "@/lib/simulation/conflictDetector";
import { injecterJsDansPlanning, resolveFlexibiliteEvent } from "@/lib/simulation/candidateFinder";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import type { Exclusion } from "@/engine/ruleTypes";

export interface AgentDataMultiJs {
  context: AgentContext;
  events: PlanningEvent[];
}

/** Résultat de trouverCandidatsPourJs : candidats retenus + exclusions tracées */
export interface CandidatsEtExclusions {
  candidats: CandidatMultiJs[];
  exclusions: MultiJsExclusion[];
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
 * Pour une JS donnée, retourne tous les agents candidats triés par score descendant,
 * ainsi que la liste complète des exclusions (une par agent exclu, avec raison et règle).
 *
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
  npoExclusionCodes: string[] = [],
  /** Si true, un agent dont la JS source est DERNIER_RECOURS peut être libéré par figeage */
  autoriserFigeage = false,
  /** Map JsType.code → FlexibiliteJs, requise si autoriserFigeage */
  jsTypeFlexibiliteMap?: Map<string, FlexibiliteJs>
): CandidatsEtExclusions {
  const imprevu = buildImprevu(js, remplacement, deplacement);
  const debutImprevu = combineDateTime(js.date, js.heureDebut);
  const finImprevu = combineDateTime(js.date, js.heureFin);
  const isNuitJs = isJsDeNuit(js.heureDebut, js.heureFin);

  const candidats: CandidatMultiJs[] = [];
  const exclusions: MultiJsExclusion[] = [];

  // Helper local : enregistrer une exclusion structurée avec informations nominatives
  const exclure = (context: AgentContext, raison: string, regle: string): void => {
    exclusions.push({
      agentId:       context.id,
      agentNom:      context.nom,
      agentPrenom:   context.prenom,
      agentMatricule: context.matricule,
      jsId:          js.planningLigneId,
      raison,
      regle,
      niveau: 'BLOQUANT',
    });
  };

  for (const { context, events } of agents) {
    // Exclure l'agent prévu sur cette JS (source — pas de raison à logguer)
    if (context.id === js.agentId) continue;

    // Filtre réserve uniquement
    if (candidateScope === "reserve_only" && !context.agentReserve) {
      exclure(context, "Hors périmètre : simulation limitée aux agents de réserve", "SCOPE_RESERVE");
      continue;
    }

    // Aucun préfixe JS renseigné → exclu
    if (context.prefixesJs.length === 0) {
      exclure(context, "Aucun préfixe JS autorisé renseigné", "PREFIXE_JS");
      continue;
    }

    // Vérifier préfixe JS autorisé
    if (js.codeJs) {
      const autorise = context.prefixesJs.some((p) =>
        js.codeJs!.toUpperCase().startsWith(p.toUpperCase())
      );
      if (!autorise) {
        exclure(
          context,
          `Code JS "${js.codeJs}" non couvert — préfixes autorisés : ${context.prefixesJs.join(", ")}`,
          "PREFIXE_JS"
        );
        continue;
      }
    }

    // Habilitation nuit
    if (isNuitJs && !context.peutFaireNuit) {
      exclure(context, "Non habilité pour poste de nuit", "NUIT_HABILITATION");
      continue;
    }

    // Habilitation déplacement
    if (deplacement && !context.peutEtreDeplace) {
      exclure(context, "Non autorisé pour déplacement (mode manuel)", "DEPLACEMENT_HABILITATION");
      continue;
    }

    // Vérifier absence pour inaptitude (codes configurés par l'admin)
    const absenceInaptitude = events.find(
      (e) => isAbsenceInaptitude(e, npoExclusionCodes) && e.dateDebut < finImprevu && e.dateFin > debutImprevu
    );
    if (absenceInaptitude) {
      exclure(
        context,
        `Absent pour inaptitude (${absenceInaptitude.codeJs ?? absenceInaptitude.typeJs ?? "NPO"})`,
        "ABSENCE_INAPTITUDE"
      );
      continue;
    }

    // L'agent ne doit pas avoir une JS non-Z en conflit horaire
    // Exception : figeage autorisé + JS source DERNIER_RECOURS → agent libérable
    const conflitEvent = events.find((e) => {
      if (e.jsNpo !== "JS") return false;
      if (isZeroLoadJs(e.codeJs)) return false;
      return e.dateDebut < finImprevu && e.dateFin > debutImprevu;
    });

    let eventsBase = events;
    let jsSourceFigeeCandidat: JsSourceFigee | null = null;

    if (conflitEvent) {
      let figeable = false;
      if (autoriserFigeage && jsTypeFlexibiliteMap) {
        const flex = resolveFlexibiliteEvent(conflitEvent, jsTypeFlexibiliteMap);
        if (flex === "DERNIER_RECOURS") {
          figeable = true;
          jsSourceFigeeCandidat = {
            planningLigneId: conflitEvent.planningLigneId ?? "",
            codeJs: conflitEvent.codeJs,
            flexibilite: "DERNIER_RECOURS",
            agentId: context.id,
            justification: `JS ${conflitEvent.codeJs ?? "source"} (DERNIER_RECOURS) figée — ${context.nom} ${context.prenom} libéré vers ${js.codeJs ?? "JS cible"} le ${js.date}`,
          };
          eventsBase = events.filter((e) => e !== conflitEvent);
        }
      }
      if (!figeable) {
        exclure(
          context,
          `Déjà en service pendant l'imprévu (${conflitEvent.codeJs ?? conflitEvent.heureDebut}–${conflitEvent.heureFin})`,
          "CONFLIT_HORAIRE"
        );
        continue;
      }
    }

    // JS Z : obtenir la JS Z d'origine si présente (sur eventsBase)
    const jsZOrigine = eventsBase.find(
      (e) =>
        e.jsNpo === "JS" &&
        isZeroLoadJs(e.codeJs) &&
        e.dateDebut < finImprevu &&
        e.dateFin > debutImprevu
    ) ?? null;
    const surJsZ = jsZOrigine !== null;

    const eventsEffectifs = surJsZ
      ? eventsBase.filter((e) => e !== jsZOrigine)
      : eventsBase;

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

    if (resultat.statut === "NON_CONFORME") {
      // L'agent est exclu par une règle métier fine — on trace la raison principale
      exclure(context, resultat.motifPrincipal, resultat.detail.violations[0]?.regle ?? "REGLE_METIER");
      continue;
    }

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
      jsSourceFigee: jsSourceFigeeCandidat,
    });
  }

  // Tri : DIRECT avant VIGILANCE, puis par score décroissant, puis réserve en premier
  candidats.sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === "DIRECT" ? -1 : 1;
    if (a.agentReserve !== b.agentReserve) return a.agentReserve ? -1 : 1;
    return b.score - a.score;
  });

  return { candidats, exclusions };
}
