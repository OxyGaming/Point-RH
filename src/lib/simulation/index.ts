/**
 * Orchestrateur principal du moteur de simulation JS
 * Étapes : pré-filtre → simulation → conflits → cascade → scénarios
 */

import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import { combineDateTime, diffMinutes, isJsDeNuit } from "@/lib/utils";
import { loadWorkRules } from "@/lib/rules/workRulesLoader";
import { preFilterCandidats, injecterJsDansPlanning } from "./candidateFinder";
import { detecterConflitsInduits } from "./conflictDetector";
import { construireScenarios } from "./scenarioBuilder";
import { scorerCandidat } from "./scenarioScorer";
import { isZeroLoadJs } from "./jsUtils";
import type { JsSimulationRequest, JsSimulationResultat, CandidatResult, StatutCandidat } from "@/types/js-simulation";

export interface AgentDataForSimulation {
  context: AgentContext;
  events: PlanningEvent[];
}

export async function executerSimulationJS(
  request: JsSimulationRequest,
  agents: AgentDataForSimulation[]
): Promise<JsSimulationResultat> {
  const { jsCible, imprevu } = request;

  // Charger les règles dynamiques (fallback sur défauts si base vide)
  const rules = await loadWorkRules();

  // ─── Étape 1 : pré-filtre ────────────────────────────────────────────────────
  const agentInitialId = jsCible.agentId;
  const { eligible, exclus } = preFilterCandidats(agents, jsCible, imprevu, agentInitialId);

  // ─── Étape 2 : simulation pour chaque candidat ───────────────────────────────
  const candidats: CandidatResult[] = [];

  const debutImprevu = combineDateTime(jsCible.date, imprevu.heureDebutReel);
  const finImprevu = combineDateTime(jsCible.date, imprevu.heureFinEstimee);
  const amplitudeImprevu = Math.max(0, diffMinutes(debutImprevu, finImprevu));

  const isNuitImprevu = isJsDeNuit(imprevu.heureDebutReel, imprevu.heureFinEstimee);

  for (const { context, events } of eligible) {
    // ─── Détection JS Z ────────────────────────────────────────────────────────
    // Un agent sur une JS Z au moment de l'imprévu peut être réaffecté sans cascade.
    const jsZOrigine = events.find(
      (e) =>
        e.jsNpo === "JS" &&
        isZeroLoadJs(e.codeJs) &&
        e.dateDebut < finImprevu &&
        e.dateFin > debutImprevu
    ) ?? null;
    const surJsZ = jsZOrigine !== null;

    const simulationInput = {
      importId: jsCible.importId,
      dateDebut: jsCible.date,
      dateFin: jsCible.date,
      heureDebut: imprevu.heureDebutReel,
      heureFin: imprevu.heureFinEstimee,
      poste: jsCible.codeJs ?? "JS",
      codeJs: jsCible.codeJs,
      remplacement: imprevu.remplacement,
      deplacement: imprevu.deplacement,
      posteNuit: isNuitImprevu || jsCible.isNuit,
    };

    // Pour les agents en JS Z : exclure la JS Z du planning avant évaluation
    // (elle est "consommée" par la réaffectation, pas de conflit à générer sur elle)
    const eventsEffectifs = surJsZ
      ? events.filter((e) => e !== jsZOrigine)
      : events;

    const resultat = evaluerMobilisabilite(context, eventsEffectifs, simulationInput, rules);

    // ─── Étape 3 : détection des conflits induits ──────────────────────────────
    const eventsAvecJs = injecterJsDansPlanning(eventsEffectifs, jsCible, imprevu);
    const conflitsInduits = detecterConflitsInduits(
      eventsAvecJs,
      finImprevu,
      context.agentReserve,
      imprevu.remplacement,
      rules
    );

    const statut: StatutCandidat =
      resultat.statut === "NON_CONFORME"
        ? "REFUSE"
        : resultat.statut === "VIGILANCE" || conflitsInduits.length > 0
        ? "VIGILANCE"
        : "DIRECT";

    // Motif principal : mention JS Z si applicable
    const motifJsZ = surJsZ
      ? `JS de type Z (${jsZOrigine!.codeJs}) — réaffectation sans remplacement de la journée d'origine`
      : null;

    const motifPrincipal =
      statut === "REFUSE"
        ? resultat.motifPrincipal
        : conflitsInduits.length > 0
        ? conflitsInduits[0].description
        : motifJsZ ?? resultat.motifPrincipal;

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
      motifPrincipal,
      detail: resultat.detail,
      conflitsInduits,
      nbConflits: conflitsInduits.length,
    };

    const scorePertinence = scorerCandidat(candidatPartiel);
    candidats.push({ ...candidatPartiel, scorePertinence });
  }

  // Ajouter les exclus comme refusés
  for (const { agent, raison } of exclus) {
    const simulationInput = {
      importId: jsCible.importId,
      dateDebut: jsCible.date,
      dateFin: jsCible.date,
      heureDebut: imprevu.heureDebutReel,
      heureFin: imprevu.heureFinEstimee,
      poste: jsCible.codeJs ?? "JS",
      codeJs: jsCible.codeJs,
      remplacement: imprevu.remplacement,
      deplacement: imprevu.deplacement,
      posteNuit: isNuitImprevu || jsCible.isNuit,
    };
    const resultat = evaluerMobilisabilite(agent.context, agent.events, simulationInput);

    candidats.push({
      agentId: agent.context.id,
      nom: agent.context.nom,
      prenom: agent.context.prenom,
      matricule: agent.context.matricule,
      posteAffectation: agent.context.posteAffectation,
      agentReserve: agent.context.agentReserve,
      surJsZ: false,
      codeJsZOrigine: null,
      statut: "REFUSE",
      scorePertinence: 0,
      motifPrincipal: raison,
      detail: resultat.detail,
      conflitsInduits: [],
      nbConflits: 0,
    });
  }

  // ─── Étape 4+5 : scénarios de réorganisation ─────────────────────────────────
  const scenarios = construireScenarios(
    candidats.filter((c) => c.statut !== "REFUSE"),
    jsCible,
    imprevu,
    agents.filter((a) => a.context.id !== agentInitialId)
  );

  // ─── Tri final ─────────────────────────────────────────────────────────────────
  candidats.sort((a, b) => b.scorePertinence - a.scorePertinence);

  return {
    jsCible,
    imprevu,
    directsUtilisables: candidats.filter((c) => c.statut === "DIRECT"),
    vigilance: candidats.filter((c) => c.statut === "VIGILANCE"),
    refuses: candidats.filter((c) => c.statut === "REFUSE"),
    scenarios,
    nbAgentsAnalyses: agents.length - 1, // exclut l'agent initial
  };
}
