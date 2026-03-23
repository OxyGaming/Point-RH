/**
 * Moteur d'allocation multi-JS.
 *
 * Stratégie :
 *   – Greedy : trier les JS par difficulté (moins de candidats = traités en premier)
 *   – Pour chaque JS, essayer les candidats dans l'ordre de score décroissant
 *   – Autoriser un même agent sur plusieurs JS si canAssignJsToAgentInScenario le valide
 *   – Construire le scénario résultant avec métriques et conflits détectés
 */

import type { JsCible, FlexibiliteJs } from "@/types/js-simulation";
import type {
  AffectationJs,
  AffectationsParAgent,
  CandidatMultiJs,
  ConflitMultiJs,
  ExclusionsParJs,
  MultiJsScenario,
  RobustesseScenario,
  CandidateScope,
  JsOriginaleAgent,
} from "@/types/multi-js-simulation";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import { canAssignJsToAgentInScenario } from "./agentScenarioValidator";
import { POIDS_SCORE_SCENARIO_MULTI } from "@/lib/simulation/scenarioScorer";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import { detecterConflitsInduits } from "@/lib/simulation/conflictDetector";
import { injecterJsDansPlanning } from "@/lib/simulation/candidateFinder";
import { resoudreTousConflits } from "@/lib/simulation/cascadeResolver";
import { buildImprevu } from "./multiJsCandidateFinder";
import { combineDateTime } from "@/lib/utils";
import { isZeroLoadJs } from "@/lib/simulation/jsUtils";
import type { EffectiveServiceInfo, LpaContext } from "@/types/deplacement";
import type { PlanningEvent } from "@/engine/rules";
import type { Exclusion } from "@/engine/ruleTypes";
import type { MultiJsExclusion } from "@/types/multi-js-simulation";
import type { LogCollector } from "@/engine/logger";

/**
 * Génère un identifiant de scénario unique et thread-safe.
 * Pas de compteur global — chaque appel produit un ID distinct
 * même en cas d'exécutions parallèles.
 */
function generateScenarioId(): string {
  return `scenario-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Détermine ce que l'agent remplaçant avait initialement prévu
 * dans son planning au créneau de la JS à couvrir.
 */
function determinerJsOriginale(
  events: PlanningEvent[],
  js: JsCible,
  agentReserve: boolean
): JsOriginaleAgent {
  const debutJs = combineDateTime(js.date, js.heureDebut);
  const finJs   = combineDateTime(js.date, js.heureFin);

  const event = events.find(
    (e) => e.jsNpo === "JS" && e.dateDebut < finJs && e.dateFin > debutJs
  );

  if (!event) {
    return agentReserve
      ? { type: "RESERVE", codeJs: null, heureDebut: null, heureFin: null, description: "Agent de réserve — disponible" }
      : { type: "LIBRE",   codeJs: null, heureDebut: null, heureFin: null, description: "Aucune JS prévue" };
  }

  if (isZeroLoadJs(event.codeJs)) {
    return {
      type: "JS_Z",
      codeJs: event.codeJs,
      heureDebut: event.heureDebut,
      heureFin:   event.heureFin,
      description: `JS sans charge : ${event.codeJs ?? "—"} (${event.heureDebut}–${event.heureFin})`,
    };
  }

  return {
    type: "JS",
    codeJs:    event.codeJs,
    heureDebut: event.heureDebut,
    heureFin:   event.heureFin,
    description: `JS prévue : ${event.codeJs ?? "—"} (${event.heureDebut}–${event.heureFin})`,
  };
}

/**
 * Point d'entrée principal : construit un scénario d'allocation pour un ensemble de JS.
 */
export function allouerJsMultiple(
  jsCibles: JsCible[],
  candidatesPerJs: Map<string, CandidatMultiJs[]>,
  agentsMap: Map<string, AgentDataMultiJs>,
  rules: WorkRulesMinutes,
  candidateScope: CandidateScope,
  titre: string,
  description: string,
  remplacement = true,
  deplacement = false,
  effectiveServiceMap?: Map<string, EffectiveServiceInfo>,
  npoExclusionCodes: string[] = [],
  /** Exclusions pré-calculées par JS (depuis trouverCandidatsPourJs) */
  exclusionsPerJs: Map<string, MultiJsExclusion[]> = new Map(),
  /** Contexte LPA pour calcul déplacement dynamique dans les résolutions cascade */
  lpaContext?: LpaContext,
  /** Logger de traçabilité — optionnel, aucun log si absent */
  logger?: LogCollector
): MultiJsScenario {
  // Helper : priorité de flexibilité pour le tri des JS cibles
  const flexPrio = (f: FlexibiliteJs) => f === "OBLIGATOIRE" ? 0 : 1;
  const id = generateScenarioId();

  // ─── Tri des JS cibles ────────────────────────────────────────────────────────
  // Priorité 1 : flexibilité (OBLIGATOIRE avant DERNIER_RECOURS — couvrir l'essentiel en premier)
  // Priorité 2 : difficulté (moins de candidats → traité en premier, à criticité égale)
  const sortedJs = [...jsCibles].sort((a, b) => {
    const flexDiff = flexPrio(a.flexibilite) - flexPrio(b.flexibilite);
    if (flexDiff !== 0) return flexDiff;
    const nA = candidatesPerJs.get(a.planningLigneId)?.length ?? 0;
    const nB = candidatesPerJs.get(b.planningLigneId)?.length ?? 0;
    return nA - nB;
  });

  logger?.info("MULTI_JS_ORDERED_BY_FLEX", {
    data: {
      scenarioId: id,
      ordre: sortedJs.map((js) => ({
        id: js.planningLigneId,
        codeJs: js.codeJs,
        flexibilite: js.flexibilite,
        nbCandidats: candidatesPerJs.get(js.planningLigneId)?.length ?? 0,
      })),
    },
  });

  // ─── État du scénario en construction ────────────────────────────────────────
  /** jsId → AffectationJs */
  const affectations = new Map<string, AffectationJs>();
  /** agentId → JS déjà affectées dans ce scénario */
  const agentAssignments = new Map<string, JsCible[]>();
  const conflitsGlobaux: ConflitMultiJs[] = [];

  // ─── Allocation greedy ────────────────────────────────────────────────────────
  for (const js of sortedJs) {
    const candidates = candidatesPerJs.get(js.planningLigneId) ?? [];

    if (candidates.length === 0) {
      conflitsGlobaux.push({
        type: "AUCUN_CANDIDAT",
        description: `Aucun candidat disponible pour ${js.codeJs ?? "JS"} du ${js.date} (${js.heureDebut}–${js.heureFin})`,
        jsId: js.planningLigneId,
        severity: "BLOQUANT",
      });
      logger?.warn("MULTI_JS_NOT_COVERED", {
        jsId: js.planningLigneId,
        data: { scenarioId: id, codeJs: js.codeJs, nbCandidatesExamined: 0 },
      });
      continue;
    }

    let assigned = false;

    for (const candidat of candidates) {
      const agentData = agentsMap.get(candidat.agentId);
      if (!agentData) continue;

      const existingAssignments = agentAssignments.get(candidat.agentId) ?? [];

      const { compatible, statut, motif } = canAssignJsToAgentInScenario(
        agentData,
        js,
        existingAssignments,
        rules,
        remplacement,
        deplacement,
        effectiveServiceMap
      );

      if (!compatible) continue;

      // ─── Calculer les conflits induits pour cette affectation ───────────────
      const imprevu = buildImprevu(js, remplacement, deplacement);
      const finImprevu = combineDateTime(js.date, js.heureFin);

      // Construire le planning simulé avec les JS déjà affectées
      let eventsSimules = [...agentData.events];
      for (const jsAff of existingAssignments) {
        const imprevuAff = buildImprevu(jsAff, remplacement, deplacement);
        eventsSimules = injecterJsDansPlanning(eventsSimules, jsAff, imprevuAff);
      }
      const eventsAvecJs = injecterJsDansPlanning(eventsSimules, js, imprevu);
      const conflitsInduits = detecterConflitsInduits(
        eventsAvecJs,
        finImprevu,
        agentData.context.agentReserve,
        imprevu.remplacement,
        rules
      );

      const statutFinal: "DIRECT" | "VIGILANCE" =
        conflitsInduits.length > 0 ? "VIGILANCE" : (statut as "DIRECT" | "VIGILANCE");

      // ─── Enregistrer l'affectation ──────────────────────────────────────────
      const jsSourceFigeeAff = candidat.jsSourceFigee ?? null;
      affectations.set(js.planningLigneId, {
        jsId: js.planningLigneId,
        jsCible: js,
        agentId: candidat.agentId,
        agentNom: candidat.nom,
        agentPrenom: candidat.prenom,
        agentMatricule: candidat.matricule,
        agentReserve: candidat.agentReserve,
        statut: statutFinal,
        score: candidat.score,
        justification: motif,
        conflitsInduits,
        jsOriginaleAgent: determinerJsOriginale(
          agentData!.events,
          js,
          candidat.agentReserve
        ),
        // Initialisés à vide, remplis lors de la passe cascade ci-dessous
        cascadeModifications: [],
        cascadeImpacts: [],
        nbCascadesResolues: 0,
        nbCascadesNonResolues: 0,
        solution: {
          nature: "DIRECTE",
          ajustement: jsSourceFigeeAff ? "FIGEAGE_DIRECT" : "AUCUN",
        },
        jsSourceFigee: jsSourceFigeeAff,
      });

      if (jsSourceFigeeAff) {
        logger?.info("MULTI_FIGEAGE_APPLIED", {
          jsId: js.planningLigneId,
          agentId: candidat.agentId,
          data: {
            scenarioId: id,
            codeJsCible: js.codeJs,
            jsSourceFigeeCode: jsSourceFigeeAff.codeJs,
            jsSourceFigeeId: jsSourceFigeeAff.planningLigneId,
          },
        });
      }

      agentAssignments.set(candidat.agentId, [...existingAssignments, js]);
      assigned = true;

      logger?.info("MULTI_ASSIGNMENT_DONE", {
        jsId: js.planningLigneId,
        agentId: candidat.agentId,
        data: { scenarioId: id, codeJs: js.codeJs, statut: statutFinal, score: candidat.score },
      });

      break;
    }

    if (!assigned) {
      // Tous les candidats ont été bloqués par les règles RH dans ce scénario
      conflitsGlobaux.push({
        type: "AUCUN_CANDIDAT",
        description: `Aucun agent compatible pour ${js.codeJs ?? "JS"} du ${js.date} (${js.heureDebut}–${js.heureFin}) après vérification des contraintes RH`,
        jsId: js.planningLigneId,
        severity: "BLOQUANT",
      });

      logger?.warn("MULTI_JS_NOT_COVERED", {
        jsId: js.planningLigneId,
        data: { scenarioId: id, codeJs: js.codeJs, nbCandidatesExamined: candidates.length },
      });
    }
  }

  // ─── Post-passe : réaffectation 2-opt pour JS non couvertes ──────────────────
  // Pour chaque JS non couverte, on tente un swap : si un agent déjà affecté
  // pourrait couvrir la JS non couverte ET qu'un autre agent libre peut couvrir
  // la JS que cet agent laisserait derrière lui, on effectue l'échange.
  // Cette passe améliore la couverture sans toucher à la logique greedy principale.
  const jsNonCouvertesAvantSwap = sortedJs.filter(
    (js) => !affectations.has(js.planningLigneId)
  );

  for (const jsNonCouverte of jsNonCouvertesAvantSwap) {
    // Vérifier si la JS vient d'être couverte par un swap précédent
    if (affectations.has(jsNonCouverte.planningLigneId)) continue;

    let swapReussi = false;

    // Parcourir les JS déjà affectées pour trouver un candidat potentiel
    for (const [jsAffecteeId, affExistante] of affectations) {
      if (swapReussi) break;

      const agentData = agentsMap.get(affExistante.agentId);
      if (!agentData) continue;

      // L'agent actuellement affecté à jsAffectee peut-il couvrir jsNonCouverte ?
      const assignmentsActuels = agentAssignments.get(affExistante.agentId) ?? [];
      // Simuler : retirer jsAffectee de ses assignments, ajouter jsNonCouverte
      const assignmentsSansJsAffectee = assignmentsActuels.filter(
        (j) => j.planningLigneId !== jsAffecteeId
      );
      const { compatible: peutFaireNonCouverte } = canAssignJsToAgentInScenario(
        agentData,
        jsNonCouverte,
        assignmentsSansJsAffectee,
        rules,
        remplacement,
        deplacement,
        effectiveServiceMap
      );
      if (!peutFaireNonCouverte) continue;

      // Un autre agent libre peut-il couvrir jsAffectee à la place ?
      const jsAffecteeCible = sortedJs.find((j) => j.planningLigneId === jsAffecteeId);
      if (!jsAffecteeCible) continue;

      let agentRemplacant: string | null = null;
      const candidatsJsAffectee = (candidatesPerJs.get(jsAffecteeId) ?? [])
        .filter((c) => c.agentId !== affExistante.agentId && !agentAssignments.has(c.agentId));

      for (const autreCandidat of candidatsJsAffectee) {
        const autreAgentData = agentsMap.get(autreCandidat.agentId);
        if (!autreAgentData) continue;

        const { compatible } = canAssignJsToAgentInScenario(
          autreAgentData,
          jsAffecteeCible,
          [],
          rules,
          remplacement,
          deplacement,
          effectiveServiceMap
        );
        if (compatible) {
          agentRemplacant = autreCandidat.agentId;
          break;
        }
      }

      if (!agentRemplacant) continue;

      // ─── Swap validé ─────────────────────────────────────────────────────────
      // 1. Réaffecter l'agent existant → jsNonCouverte
      const imprevu = buildImprevu(jsNonCouverte, remplacement, deplacement);
      const finImprevu = combineDateTime(jsNonCouverte.date, jsNonCouverte.heureFin);
      const eventsAvecJs = injecterJsDansPlanning(agentData.events, jsNonCouverte, imprevu);
      const conflitsInduits = detecterConflitsInduits(
        eventsAvecJs,
        finImprevu,
        agentData.context.agentReserve,
        imprevu.remplacement,
        rules
      );

      affectations.set(jsNonCouverte.planningLigneId, {
        jsId:          jsNonCouverte.planningLigneId,
        jsCible:       jsNonCouverte,
        agentId:       affExistante.agentId,
        agentNom:      affExistante.agentNom,
        agentPrenom:   affExistante.agentPrenom,
        agentMatricule: affExistante.agentMatricule,
        agentReserve:  affExistante.agentReserve,
        statut:        conflitsInduits.length > 0 ? "VIGILANCE" : "DIRECT",
        score:         affExistante.score,
        justification: `Réaffecté via swap 2-opt (libéré de ${jsAffecteeCible.codeJs ?? jsAffecteeId})`,
        conflitsInduits,
        jsOriginaleAgent: determinerJsOriginale(agentData.events, jsNonCouverte, agentData.context.agentReserve),
        cascadeModifications: [],
        cascadeImpacts: [],
        nbCascadesResolues: 0,
        nbCascadesNonResolues: 0,
        // Phase 1 — valeurs neutres ; la logique de figeage sera implémentée en Phase 2
        solution: { nature: "CASCADE", ajustement: "AUCUN" },
        jsSourceFigee: null,
      });

      // 2. Réaffecter l'agent remplaçant → jsAffectee
      const agentRemplacantData = agentsMap.get(agentRemplacant)!;
      const imprevuAff = buildImprevu(jsAffecteeCible, remplacement, deplacement);
      const finImprevuAff = combineDateTime(jsAffecteeCible.date, jsAffecteeCible.heureFin);
      const eventsAvecJsAff = injecterJsDansPlanning(agentRemplacantData.events, jsAffecteeCible, imprevuAff);
      const conflitsInd = detecterConflitsInduits(
        eventsAvecJsAff,
        finImprevuAff,
        agentRemplacantData.context.agentReserve,
        imprevuAff.remplacement,
        rules
      );
      const candidatRemplagant = (candidatesPerJs.get(jsAffecteeId) ?? []).find(
        (c) => c.agentId === agentRemplacant
      );

      affectations.set(jsAffecteeId, {
        jsId:          jsAffecteeId,
        jsCible:       jsAffecteeCible,
        agentId:       agentRemplacant,
        agentNom:      agentRemplacantData.context.nom,
        agentPrenom:   agentRemplacantData.context.prenom,
        agentMatricule: agentRemplacantData.context.matricule,
        agentReserve:  agentRemplacantData.context.agentReserve,
        statut:        conflitsInd.length > 0 ? "VIGILANCE" : "DIRECT",
        score:         candidatRemplagant?.score ?? 0,
        justification: `Affecté via swap 2-opt (remplace ${affExistante.agentNom} ${affExistante.agentPrenom})`,
        conflitsInduits: conflitsInd,
        jsOriginaleAgent: determinerJsOriginale(agentRemplacantData.events, jsAffecteeCible, agentRemplacantData.context.agentReserve),
        cascadeModifications: [],
        cascadeImpacts: [],
        nbCascadesResolues: 0,
        nbCascadesNonResolues: 0,
        // Phase 1 — valeurs neutres ; la logique de figeage sera implémentée en Phase 2
        solution: { nature: "DIRECTE", ajustement: "AUCUN" },
        jsSourceFigee: null,
      });

      // 3. Mettre à jour agentAssignments
      agentAssignments.set(affExistante.agentId, [
        ...assignmentsSansJsAffectee,
        jsNonCouverte,
      ]);
      agentAssignments.set(agentRemplacant, [jsAffecteeCible]);

      // 4. Supprimer l'ancien conflit AUCUN_CANDIDAT si présent
      const idxConflit = conflitsGlobaux.findIndex(
        (c) => c.jsId === jsNonCouverte.planningLigneId && c.type === "AUCUN_CANDIDAT"
      );
      if (idxConflit >= 0) conflitsGlobaux.splice(idxConflit, 1);

      logger?.info("MULTI_SWAP_APPLIED", {
        jsId: jsNonCouverte.planningLigneId,
        agentId: affExistante.agentId,
        data: {
          scenarioId: id,
          jsLibereId: jsAffecteeId,
          agentRemplacantId: agentRemplacant,
        },
      });

      swapReussi = true;
    }

    if (!swapReussi) {
      logger?.info("MULTI_SWAP_SKIPPED", {
        jsId: jsNonCouverte.planningLigneId,
        data: { scenarioId: id, raison: "Aucun swap 2-opt valide trouvé" },
      });
    }
  }

  // ─── Passe en cascade ─────────────────────────────────────────────────────────
  // Pour chaque affectation avec conflitsInduits résolvables, tenter de trouver
  // un agent tiers (non encore engagé dans le scénario) pour couvrir la JS
  // conflictuelle libérée par la mobilisation de l'agent affecté.
  for (const [jsId, aff] of affectations) {
    const conflitsResolvables = aff.conflitsInduits.filter((c) => c.resolvable);

    if (conflitsResolvables.length === 0) continue;

    const agentData = agentsMap.get(aff.agentId);
    if (!agentData) continue;

    // Construire le planning simulé de l'agent : base + toutes ses JS déjà affectées
    // (agentAssignments contient la JS courante, ajoutée ligne 134)
    const existingAssignments = agentAssignments.get(aff.agentId) ?? [];
    let eventsSimules = [...agentData.events];
    for (const jsAff of existingAssignments) {
      const imprevuAff = buildImprevu(jsAff, remplacement, deplacement);
      eventsSimules = injecterJsDansPlanning(eventsSimules, jsAff, imprevuAff);
    }

    // Agents candidats pour la cascade : exclure les agents déjà engagés
    // dans le scénario, et respecter le scope (reserve_only = réservistes uniquement)
    const agentsCascade = Array.from(agentsMap.values()).filter(
      (a) =>
        !agentAssignments.has(a.context.id) &&
        (candidateScope !== "reserve_only" || a.context.agentReserve)
    );

    const { modifications, impactsCascade, nbResolu } = resoudreTousConflits(
      conflitsResolvables,
      eventsSimules,
      agentsCascade,
      npoExclusionCodes,
      lpaContext,   // calcul LPA-based pour les agents de la cascade
      rules
    );

    const nbNonResolu = conflitsResolvables.length - nbResolu;

    // Mettre à jour le statut si tous les conflits résolvables sont traités
    // ET qu'il n'existe pas de conflits non-résolvables (GPT_MAX, etc.)
    const aNonResolvables = aff.conflitsInduits.some((c) => !c.resolvable);
    const nouveauStatut: "DIRECT" | "VIGILANCE" =
      nbNonResolu === 0 && !aNonResolvables ? "DIRECT" : "VIGILANCE";

    affectations.set(jsId, {
      ...aff,
      statut: nouveauStatut,
      cascadeModifications: modifications,
      cascadeImpacts: impactsCascade,
      nbCascadesResolues: nbResolu,
      nbCascadesNonResolues: nbNonResolu,
    });

    logger?.info("MULTI_CASCADE_DONE", {
      jsId,
      agentId: aff.agentId,
      data: { scenarioId: id, nbResolu, nbNonResolu, nouveauStatut },
    });
  }

  // ─── JS non couvertes ─────────────────────────────────────────────────────────
  const jsNonCouvertes = jsCibles.filter(
    (js) => !affectations.has(js.planningLigneId)
  );

  // ─── Récapitulatif par agent ──────────────────────────────────────────────────
  const affectationsParAgentMap = new Map<string, AffectationsParAgent>();

  for (const [, aff] of affectations) {
    if (!affectationsParAgentMap.has(aff.agentId)) {
      affectationsParAgentMap.set(aff.agentId, {
        agentId: aff.agentId,
        agentNom: aff.agentNom,
        agentPrenom: aff.agentPrenom,
        agentMatricule: aff.agentMatricule,
        agentReserve: aff.agentReserve,
        jsAssignees: [],
        nbJs: 0,
        conformiteGlobale: "CONFORME",
      });
    }

    const entry = affectationsParAgentMap.get(aff.agentId)!;
    entry.jsAssignees.push(aff);
    entry.nbJs++;

    if (aff.statut === "VIGILANCE" && entry.conformiteGlobale === "CONFORME") {
      entry.conformiteGlobale = "VIGILANCE";
    }
    // NON_CONFORME uniquement si des conflits restent non résolus après cascade
    if (aff.conflitsInduits.length > 0 && aff.nbCascadesNonResolues > 0) {
      entry.conformiteGlobale = "NON_CONFORME";
    }
  }

  // Trier les JS de chaque agent chronologiquement
  for (const [, entry] of affectationsParAgentMap) {
    entry.jsAssignees.sort((a, b) =>
      a.jsCible.date.localeCompare(b.jsCible.date) ||
      a.jsCible.heureDebut.localeCompare(b.jsCible.heureDebut)
    );
  }

  const affectationsParAgent = Array.from(affectationsParAgentMap.values()).sort(
    (a, b) => b.nbJs - a.nbJs
  );

  // ─── Score global du scénario ─────────────────────────────────────────────────
  const nbCouvertes = affectations.size;
  const nbTotal = jsCibles.length;
  const tauxCouverture = nbTotal > 0 ? Math.round((nbCouvertes / nbTotal) * 100) : 0;

  // Base = taux de couverture pondéré
  let score = Math.round(tauxCouverture * POIDS_SCORE_SCENARIO_MULTI.poidsCouverture);

  // Bonus agents de réserve (ratio pondéré)
  const nbReserve = Array.from(affectations.values()).filter((a) => a.agentReserve).length;
  score += Math.round((nbReserve / Math.max(1, nbCouvertes)) * POIDS_SCORE_SCENARIO_MULTI.bonusMaxReserve);

  // Pénalité vigilance
  const nbVigilance = Array.from(affectations.values()).filter((a) => a.statut === "VIGILANCE").length;
  score -= nbVigilance * POIDS_SCORE_SCENARIO_MULTI.penaliteParVigilance;

  // Pénalité JS non couvertes — différenciée selon flexibilité
  // Les JS OBLIGATOIRE non couvertes sont plus pénalisées que les DERNIER_RECOURS.
  // On n'utilise pas conflitsGlobaux.BLOQUANT pour éviter le double-comptage avec jsNonCouvertes.
  const nbNonCouvertesOblig = jsNonCouvertes.filter((js) => js.flexibilite !== "DERNIER_RECOURS").length;
  const nbNonCouvertesDR    = jsNonCouvertes.filter((js) => js.flexibilite === "DERNIER_RECOURS").length;
  score -= nbNonCouvertesOblig * POIDS_SCORE_SCENARIO_MULTI.penaliteConflitBloquant;
  score -= nbNonCouvertesDR   * POIDS_SCORE_SCENARIO_MULTI.penaliteJsDernierRecours;

  // Pénalité des autres conflits bloquants (hors AUCUN_CANDIDAT déjà comptés ci-dessus)
  score -= conflitsGlobaux.filter((c) => c.severity === "BLOQUANT" && c.type !== "AUCUN_CANDIDAT").length * POIDS_SCORE_SCENARIO_MULTI.penaliteConflitBloquant;
  score -= conflitsGlobaux.filter((c) => c.severity === "AVERTISSEMENT").length * POIDS_SCORE_SCENARIO_MULTI.penaliteConflitAvert;

  // Pénalité figeage (coût d'un figeage sur le score scénario, pas sur le score candidat)
  const nbFigeages = Array.from(affectations.values()).filter((a) => a.jsSourceFigee !== null).length;
  score -= nbFigeages * POIDS_SCORE_SCENARIO_MULTI.penaliteParFigeage;

  score = Math.min(100, Math.max(0, score));

  // ─── Agrégats cascade ─────────────────────────────────────────────────────────
  let nbCascadesResoluesTotal = 0;
  let nbCascadesNonResoluesTotal = 0;
  for (const aff of affectations.values()) {
    nbCascadesResoluesTotal += aff.nbCascadesResolues;
    nbCascadesNonResoluesTotal += aff.nbCascadesNonResolues;
  }

  // Robustesse
  let robustesse: RobustesseScenario;
  if (tauxCouverture === 100 && nbVigilance === 0) {
    robustesse = "HAUTE";
  } else if (tauxCouverture >= 70) {
    robustesse = "MOYENNE";
  } else {
    robustesse = "FAIBLE";
  }

  // ─── Consolidation des exclusions par JS ──────────────────────────────────────
  // On expose toutes les exclusions pré-calculées (pré-filtre) dans le scénario,
  // ce qui permet à l'UI et aux logs d'expliquer chaque décision d'exclusion.
  const exclusionsParJs: ExclusionsParJs[] = jsCibles.map((js) => ({
    jsId:      js.planningLigneId,
    codeJs:    js.codeJs,
    date:      js.date,
    heureDebut: js.heureDebut,
    heureFin:  js.heureFin,
    exclusions: exclusionsPerJs.get(js.planningLigneId) ?? [],
  }));

  return {
    id,
    titre,
    description,
    score,
    candidateScope,
    affectations: Array.from(affectations.values()).sort(
      (a, b) =>
        a.jsCible.date.localeCompare(b.jsCible.date) ||
        a.jsCible.heureDebut.localeCompare(b.jsCible.heureDebut)
    ),
    jsNonCouvertes,
    affectationsParAgent,
    conflitsDetectes: conflitsGlobaux,
    nbJsCouvertes: nbCouvertes,
    nbJsNonCouvertes: jsNonCouvertes.length,
    nbAgentsMobilises: affectationsParAgentMap.size,
    robustesse,
    tauxCouverture,
    nbCascadesResolues: nbCascadesResoluesTotal,
    nbCascadesNonResolues: nbCascadesNonResoluesTotal,
    exclusionsParJs,
  };
}
