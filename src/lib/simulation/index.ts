/**
 * Orchestrateur principal du moteur de simulation JS
 * Étapes : pré-filtre → simulation → conflits → cascade → scénarios
 */

import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import { combineDateTime, diffMinutes, isJsDeNuit, getDateFinJs } from "@/lib/utils";
import { loadWorkRules } from "@/lib/rules/workRulesLoader";
import { preFilterCandidats, injecterJsDansPlanning, trouverCandidatsParFigeage } from "./candidateFinder";
import { loadJsTypeFlexibiliteMap } from "./jsTypeFlexibiliteLoader";
import { detecterConflitsInduits } from "./conflictDetector";
import { construireScenarios } from "./scenarioBuilder";
import { scorerCandidatDetail } from "./scenarioScorer";
import { isZeroLoadJs } from "./jsUtils";
import { loadNpoExclusionCodes } from "./npoExclusionLoader";
import { loadLpaContext } from "@/lib/deplacement/loadLpaContext";
import { computeEffectiveService } from "@/lib/deplacement/computeEffectiveService";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import type { JsSimulationRequest, JsSimulationResultat, JsSimulationResultatDouble, CandidatResult, StatutCandidat } from "@/types/js-simulation";
import { createLogger } from "@/engine/logger";
import type { LogEntry } from "@/engine/logger";

export interface AgentDataForSimulation {
  context: AgentContext;
  events: PlanningEvent[];
}

export async function executerSimulationJS(
  request: JsSimulationRequest,
  agents: AgentDataForSimulation[]
): Promise<JsSimulationResultatDouble> {
  const { jsCible, imprevu } = request;
  const logger = createLogger();

  // Télémétrie granulaire : log avec timestamps pour identifier le hotspot.
  // Imprimé directement sur stdout (pas via logger) pour survivre aux timeouts
  // nginx — chaque log arrive immédiatement même si la requête est coupée côté
  // client (le process Node continue jusqu'à la fin du calcul).
  const t0 = Date.now();
  const mark = (etape: string, extra?: Record<string, unknown>) => {
    const ms = Date.now() - t0;
    const extras = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[sim-trace] +${ms}ms ${etape}${extras}`);
  };
  mark("START", { nbAgents: agents.length });

  logger.info("SIMULATION_START", {
    data: {
      jsCibleId: jsCible.planningLigneId,
      codeJs: jsCible.codeJs,
      date: jsCible.date,
      nbAgents: agents.length,
    },
  });

  // Charger les règles dynamiques (fallback sur défauts si base vide)
  const rules = await loadWorkRules();

  // ─── Chargement des codes NPO exclus des simulations ─────────────────────────
  const npoExclusionCodes = await loadNpoExclusionCodes();

  // ─── Chargement du contexte LPA ──────────────────────────────────────────────
  const agentIds = agents.map((a) => a.context.id);
  const lpaContext = await loadLpaContext(agentIds);
  mark("CONTEXT_LOADED");

  // ─── Calcul du service effectif par agent (LPA-based) ────────────────────────
  // Calculé une fois pour tous les agents (y compris les futurs exclus)
  // pour une utilisation cohérente dans preFilterCandidats et evaluerMobilisabilite.
  const effectiveServiceMap = new Map<string, EffectiveServiceInfo>();
  for (const { context } of agents) {
    if (context.id === jsCible.agentId) continue; // agent initial exclu de la simulation
    const effSvc = computeEffectiveService(
      { id: context.id, lpaBaseId: context.lpaBaseId, peutEtreDeplace: context.peutEtreDeplace },
      {
        codeJs: jsCible.codeJs,
        typeJs: jsCible.typeJs,
        // Partir des horaires standard du JsType — pas de ceux de l'agent initial
        // (qui incluent ses trajets propres). Chaque candidat applique ensuite ses propres trajets.
        heureDebut: jsCible.heureDebutJsType ?? jsCible.heureDebut,
        heureFin:   jsCible.heureFinJsType   ?? jsCible.heureFin,
        estNuit: jsCible.isNuit,
      },
      lpaContext,
      { remplacement: imprevu.remplacement }
    );
    effectiveServiceMap.set(context.id, effSvc);
  }

  mark("EFFECTIVE_SVC_DONE");

  // ─── Étape 1 : pré-filtre ────────────────────────────────────────────────────
  const agentInitialId = jsCible.agentId;
  const { eligible, exclus } = preFilterCandidats(
    agents, jsCible, imprevu, agentInitialId, effectiveServiceMap, npoExclusionCodes
  );
  mark("PREFILTER_DONE", { nbEligible: eligible.length, nbExclus: exclus.length });

  logger.info("PREFILTRAGE_DONE", {
    data: { nbEligible: eligible.length, nbExclus: exclus.length },
  });
  for (const { agent, raison } of exclus) {
    logger.warn("AGENT_EXCLU_PREFILTRAGE", {
      agentId: agent.context.id,
      data: { raison },
    });
  }

  // ─── Étape 2 : simulation pour chaque candidat ───────────────────────────────
  const candidats: CandidatResult[] = [];

  const debutImprevu = combineDateTime(jsCible.date, imprevu.heureDebutReel);
  const finImprevu = combineDateTime(getDateFinJs(jsCible.date, imprevu.heureDebutReel, imprevu.heureFinEstimee), imprevu.heureFinEstimee);
  const amplitudeImprevu = Math.max(0, diffMinutes(debutImprevu, finImprevu));

  const isNuitImprevu = isJsDeNuit(imprevu.heureDebutReel, imprevu.heureFinEstimee);

  for (const { context, events } of eligible) {
    // ─── Détection JS Z ────────────────────────────────────────────────────────
    // Un agent sur une JS Z au moment de l'imprévu peut être réaffecté sans cascade.
    const jsZOrigine = events.find(
      (e) =>
        e.jsNpo === "JS" &&
        isZeroLoadJs(e.codeJs, e.typeJs) &&
        e.dateDebut < finImprevu &&
        e.dateFin > debutImprevu
    ) ?? null;
    const surJsZ = jsZOrigine !== null;

    // ─── Service effectif pour cet agent ───────────────────────────────────────
    const effectiveService = effectiveServiceMap.get(context.id) ?? null;

    // Utiliser toujours heureDebutEffective quand disponible : même quand indeterminable=true,
    // cette valeur est basée sur les horaires standard du JsType (pas sur le trajet de l'agent initial).
    const heureDebutSim = effectiveService
      ? effectiveService.heureDebutEffective
      : imprevu.heureDebutReel;
    const heureFinSim = effectiveService
      ? effectiveService.heureFinEffective
      : imprevu.heureFinEstimee;

    // Le déplacement effectif (LPA-based ou fallback)
    const deplacementEffectif = effectiveService && effectiveService.estEnDeplacement !== null
      ? effectiveService.estEnDeplacement
      : imprevu.deplacement;

    const simulationInput = {
      importId: jsCible.importId,
      dateDebut: jsCible.date,
      dateFin: getDateFinJs(jsCible.date, heureDebutSim, heureFinSim),
      heureDebut: heureDebutSim,
      heureFin: heureFinSim,
      poste: jsCible.codeJs ?? "JS",
      codeJs: jsCible.codeJs,
      remplacement: imprevu.remplacement,
      deplacement: deplacementEffectif,
      posteNuit: isNuitImprevu || jsCible.isNuit,
    };

    // Pour les agents en JS Z : exclure la JS Z du planning avant évaluation
    // (elle est "consommée" par la réaffectation, pas de conflit à générer sur elle)
    const eventsEffectifs = surJsZ
      ? events.filter((e) => e !== jsZOrigine)
      : events;

    const resultat = evaluerMobilisabilite(context, eventsEffectifs, simulationInput, rules, effectiveService);

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

    logger[statut === "REFUSE" ? "warn" : statut === "VIGILANCE" ? "info" : "info"](
      `AGENT_EVALUE_${statut}`,
      {
        agentId: context.id,
        data: {
          statut,
          nbViolations: resultat.detail.violations.length,
          nbConflitsInduits: conflitsInduits.length,
          reposDisponible: resultat.detail.reposJournalierDisponible,
          gptActuel: resultat.detail.gptActuel,
        },
      }
    );

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

    const scoreBreakdown = scorerCandidatDetail(candidatPartiel);
    candidats.push({ ...candidatPartiel, scorePertinence: scoreBreakdown.total, scoreBreakdown });
  }

  mark("ELIGIBLE_LOOP_DONE", { nbCandidats: candidats.length });

  // ─── Étape 2bis : candidats libérés par figeage (DERNIER_RECOURS) ─────────────
  // Toujours calculé (pour les deux résultats sansFigeage / avecFigeage).
  const jsTypeFlexibiliteMap = await loadJsTypeFlexibiliteMap();
  const candidatsFigeage = trouverCandidatsParFigeage(exclus, jsCible, imprevu, jsTypeFlexibiliteMap);

  logger.info("FIGEAGE_CANDIDATS", {
    data: { nbCandidatsFigeage: candidatsFigeage.length },
  });

  const candidatsFigeageEvalues: CandidatResult[] = [];
  const agentsEvaluesViaFigeage = new Set<string>();

  for (const { agent: { context }, eventsAvecFigeage, jsSourceFigee } of candidatsFigeage) {
    const jsZOrigine = eventsAvecFigeage.find(
      (e) =>
        e.jsNpo === "JS" &&
        isZeroLoadJs(e.codeJs, e.typeJs) &&
        e.dateDebut < finImprevu &&
        e.dateFin > debutImprevu
    ) ?? null;
    const surJsZ = jsZOrigine !== null;

    const effectiveService = effectiveServiceMap.get(context.id) ?? null;
    const heureDebutSim = effectiveService ? effectiveService.heureDebutEffective : imprevu.heureDebutReel;
    const heureFinSim   = effectiveService ? effectiveService.heureFinEffective   : imprevu.heureFinEstimee;
    const deplacementEffectif =
      effectiveService && effectiveService.estEnDeplacement !== null
        ? effectiveService.estEnDeplacement
        : imprevu.deplacement;

    const simulationInput = {
      importId: jsCible.importId,
      dateDebut: jsCible.date,
      dateFin: getDateFinJs(jsCible.date, heureDebutSim, heureFinSim),
      heureDebut: heureDebutSim,
      heureFin: heureFinSim,
      poste: jsCible.codeJs ?? "JS",
      codeJs: jsCible.codeJs,
      remplacement: imprevu.remplacement,
      deplacement: deplacementEffectif,
      posteNuit: isNuitImprevu || jsCible.isNuit,
    };

    const eventsEffectifs = surJsZ
      ? eventsAvecFigeage.filter((e) => e !== jsZOrigine)
      : eventsAvecFigeage;

    const resultat = evaluerMobilisabilite(context, eventsEffectifs, simulationInput, rules, effectiveService);

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

    const motifPrincipal =
      statut === "REFUSE"
        ? resultat.motifPrincipal
        : conflitsInduits.length > 0
        ? conflitsInduits[0].description
        : resultat.motifPrincipal;

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
      jsSourceFigee,
    };

    const scoreBreakdown = scorerCandidatDetail(candidatPartiel);
    candidatsFigeageEvalues.push({ ...candidatPartiel, scorePertinence: scoreBreakdown.total, scoreBreakdown });
    agentsEvaluesViaFigeage.add(context.id);
  }

  mark("FIGEAGE_LOOP_DONE", { nbFigeage: candidatsFigeageEvalues.length });

  // ─── Ajouter les exclus comme refusés ────────────────────────────────────────
  const exclusRefuses: CandidatResult[] = [];
  for (const { agent, raison } of exclus) {
    const effectiveService = effectiveServiceMap.get(agent.context.id) ?? null;
    const heureDebutSim = effectiveService ? effectiveService.heureDebutEffective : imprevu.heureDebutReel;
    const heureFinSim   = effectiveService ? effectiveService.heureFinEffective   : imprevu.heureFinEstimee;

    const simulationInput = {
      importId: jsCible.importId,
      dateDebut: jsCible.date,
      dateFin: getDateFinJs(jsCible.date, heureDebutSim, heureFinSim),
      heureDebut: heureDebutSim,
      heureFin: heureFinSim,
      poste: jsCible.codeJs ?? "JS",
      codeJs: jsCible.codeJs,
      remplacement: imprevu.remplacement,
      deplacement: imprevu.deplacement,
      posteNuit: isNuitImprevu || jsCible.isNuit,
    };
    const resultat = evaluerMobilisabilite(agent.context, agent.events, simulationInput, rules, effectiveService);

    exclusRefuses.push({
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
      scoreBreakdown: { base: 100, penaliteViolations: 100, penaliteConflits: 0, bonusReserve: 0, bonusJsZ: 0, penaliteMargeRepos: 0, penaliteGpt: 0, total: 0 },
      motifPrincipal: raison,
      detail: resultat.detail,
      conflitsInduits: [],
      nbConflits: 0,
    });
  }

  mark("EXCLUS_LOOP_DONE", { nbExclus: exclusRefuses.length });

  // ─── Helper : construire un JsSimulationResultat ──────────────────────────────
  function buildResultat(allCandidats: CandidatResult[], tag: string): JsSimulationResultat {
    const tBuild = Date.now();
    const sorted = [...allCandidats].sort((a, b) => b.scorePertinence - a.scorePertinence);
    const directs   = sorted.filter((c) => c.statut === "DIRECT");
    const vigilants = sorted.filter((c) => c.statut === "VIGILANCE");
    const refuses   = sorted.filter((c) => c.statut === "REFUSE");

    const nbAvecConflits = sorted.filter(
      (c) => (c.statut === "DIRECT" || c.statut === "VIGILANCE") && c.nbConflits > 0
    ).length;
    mark(`SCENARIOS_START[${tag}]`, { nbAvecConflits, topN: Math.min(3, nbAvecConflits) });

    const scenarios = construireScenarios(
      sorted.filter((c) => c.statut !== "REFUSE"),
      jsCible,
      imprevu,
      agents.filter((a) => a.context.id !== agentInitialId),
      lpaContext,
      rules
    );
    console.log(`[sim-trace] +${Date.now() - t0}ms SCENARIOS_END[${tag}] (${Date.now() - tBuild}ms pour cette passe, ${scenarios.length} scénarios)`);

    return {
      jsCible,
      imprevu,
      directsUtilisables: directs,
      vigilance: vigilants,
      refuses,
      scenarios,
      nbAgentsAnalyses: agents.length - 1,
      auditLog: logger.all(),
    };
  }

  // ─── Résultat sans figeage ────────────────────────────────────────────────────
  const candidatsSans = [
    ...candidats,
    ...exclusRefuses,
  ];

  // ─── Résultat avec figeage ────────────────────────────────────────────────────
  // Les exclus libérés par figeage remplacent leur entrée "refusé" dans les exclus
  const exclusRefusesRestants = exclusRefuses.filter(
    (r) => !agentsEvaluesViaFigeage.has(r.agentId)
  );
  const candidatsAvec = [
    ...candidats,
    ...candidatsFigeageEvalues,
    ...exclusRefusesRestants,
  ];

  logger.info("SIMULATION_END", {
    data: {
      nbSansFigeage: candidatsSans.length,
      nbAvecFigeage: candidatsAvec.length,
    },
  });

  const result = {
    sansFigeage: buildResultat(candidatsSans, "sans"),
    avecFigeage: buildResultat(candidatsAvec, "avec"),
  };
  mark("RETURN");
  return result;
}
