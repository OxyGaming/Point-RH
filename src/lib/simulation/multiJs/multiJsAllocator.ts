/**
 * Moteur d'allocation multi-JS.
 *
 * Stratégie :
 *   – Greedy : trier les JS par difficulté (moins de candidats = traités en premier)
 *   – Pour chaque JS, essayer les candidats dans l'ordre de score décroissant
 *   – Autoriser un même agent sur plusieurs JS si canAssignJsToAgentInScenario le valide
 *   – Construire le scénario résultant avec métriques et conflits détectés
 */

import type { JsCible } from "@/types/js-simulation";
import type {
  AffectationJs,
  AffectationsParAgent,
  CandidatMultiJs,
  ConflitMultiJs,
  MultiJsScenario,
  RobustesseScenario,
  CandidateScope,
} from "@/types/multi-js-simulation";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import { canAssignJsToAgentInScenario } from "./agentScenarioValidator";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import { detecterConflitsInduits } from "@/lib/simulation/conflictDetector";
import { injecterJsDansPlanning } from "@/lib/simulation/candidateFinder";
import { buildImprevu } from "./multiJsCandidateFinder";
import { combineDateTime } from "@/lib/utils";

let scenarioCounter = 0;

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
  deplacement = false
): MultiJsScenario {
  scenarioCounter++;

  // ─── Tri par difficulté (moins de candidats → traité en premier) ──────────────
  const sortedJs = [...jsCibles].sort((a, b) => {
    const nA = candidatesPerJs.get(a.planningLigneId)?.length ?? 0;
    const nB = candidatesPerJs.get(b.planningLigneId)?.length ?? 0;
    return nA - nB;
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
        deplacement
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
      });

      agentAssignments.set(candidat.agentId, [...existingAssignments, js]);
      assigned = true;
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
    }
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
    if (aff.conflitsInduits.length > 0) {
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

  let score = tauxCouverture; // base = taux de couverture

  // Bonus agents de réserve
  const nbReserve = Array.from(affectations.values()).filter((a) => a.agentReserve).length;
  score += Math.round((nbReserve / Math.max(1, nbCouvertes)) * 10);

  // Pénalité vigilance
  const nbVigilance = Array.from(affectations.values()).filter((a) => a.statut === "VIGILANCE").length;
  score -= nbVigilance * 5;

  // Pénalité conflits
  score -= conflitsGlobaux.filter((c) => c.severity === "BLOQUANT").length * 10;
  score -= conflitsGlobaux.filter((c) => c.severity === "AVERTISSEMENT").length * 3;

  score = Math.min(100, Math.max(0, score));

  // Robustesse
  let robustesse: RobustesseScenario;
  if (tauxCouverture === 100 && nbVigilance === 0) {
    robustesse = "HAUTE";
  } else if (tauxCouverture >= 70) {
    robustesse = "MOYENNE";
  } else {
    robustesse = "FAIBLE";
  }

  return {
    id: `scenario-${scenarioCounter}`,
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
  };
}
