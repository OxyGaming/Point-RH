/**
 * Orchestrateur de la simulation multi-JS.
 *
 * Calcule toujours les 4 scénarios en parallèle :
 *   – Réserve uniquement, sans figeage
 *   – Réserve uniquement, avec figeage DERNIER_RECOURS
 *   – Tous agents, sans figeage
 *   – Tous agents, avec figeage DERNIER_RECOURS
 */

import { loadWorkRules } from "@/lib/rules/workRulesLoader";
import { loadNpoExclusionCodes } from "@/lib/simulation/npoExclusionLoader";
import { loadZeroLoadPrefixes } from "@/lib/simulation/zeroLoadPrefixLoader";
import { loadJsTypeFlexibiliteMap } from "@/lib/simulation/jsTypeFlexibiliteLoader";
import type { JsCible } from "@/types/js-simulation";
import type { MultiJsSimulationResultat, CandidateScope } from "@/types/multi-js-simulation";
import { trouverCandidatsPourJs } from "./multiJsCandidateFinder";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import type { MultiJsExclusion } from "@/types/multi-js-simulation";
import { allouerJsMultiple } from "./multiJsAllocator";
import { buildCoverageIndex } from "./chaineCache";
import type { ChaineContexte } from "./chaineRemplacement";
import { loadLpaContext } from "@/lib/deplacement/loadLpaContext";
import { computeEffectiveService } from "@/lib/deplacement/computeEffectiveService";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import { createLogger } from "@/engine/logger";
import { isUnifiedPrimaryEnabled, isUnifiedShadowEnabled } from "@/lib/simulation/unified/featureFlag";
import { runShadowComparison, emitShadowReport, adapterShadowReportPourUI } from "@/lib/simulation/unified/shadow";
import type { UnifiedReportUI, AffectationJs, MultiJsScenario } from "@/types/multi-js-simulation";

export type { AgentDataMultiJs };

export async function executerSimulationMultiJs(
  jsSelectionnees: JsCible[],
  agents: AgentDataMultiJs[],
  _candidateScope: CandidateScope = "reserve_only", // conservé pour compatibilité, ignoré
  remplacement = true,
  deplacement = false,
  _autoriserFigeage = false // conservé pour compatibilité, ignoré
): Promise<MultiJsSimulationResultat> {
  const logger = createLogger();

  logger.info("MULTI_SIMULATION_START", {
    data: { nbJs: jsSelectionnees.length, nbAgents: agents.length, remplacement, deplacement },
  });

  // ─── Chargement parallèle du contexte (règles, codes, LPA, flexibilité) ──────
  // Ces 5 loaders sont indépendants — Promise.all évite ~30-50 ms cumulés.
  const agentIds = agents.map((a) => a.context.id);
  const tLoad = Date.now();
  const [rules, npoExclusionCodes, zeroLoadPrefixes, jsTypeFlexibiliteMap, lpaContext] = await Promise.all([
    loadWorkRules(),
    loadNpoExclusionCodes(),
    loadZeroLoadPrefixes(),
    loadJsTypeFlexibiliteMap(),
    loadLpaContext(agentIds),
  ]);
  console.log(`[multi-sim-trace] CONTEXT_PARALLEL_LOAD ${Date.now() - tLoad}ms`);

  const agentsMap = new Map(agents.map((a) => [a.context.id, a]));

  // Pré-calcul du service effectif (partagé entre tous les scénarios)
  const effectiveServiceMap = new Map<string, EffectiveServiceInfo>();
  for (const { context } of agents) {
    for (const js of jsSelectionnees) {
      if (context.id === js.agentId) continue;
      const key = `${context.id}:${js.planningLigneId}`;
      effectiveServiceMap.set(
        key,
        computeEffectiveService(
          { id: context.id, lpaBaseId: context.lpaBaseId, peutEtreDeplace: context.peutEtreDeplace },
          { codeJs: js.codeJs, typeJs: js.typeJs, heureDebut: js.heureDebutJsType ?? js.heureDebut, heureFin: js.heureFinJsType ?? js.heureFin, estNuit: js.isNuit },
          lpaContext,
          { remplacement }
        )
      );
    }
  }

  // ─── Index de couverture partagé entre les scénarios Cascade ─────────────────
  const coverageIndex = buildCoverageIndex(agents);
  const importIdSimu = jsSelectionnees[0]?.importId ?? "import-simu";

  // ─── Constructeur de scénario paramétrable ────────────────────────────────────
  function construireScenario(
    scope: CandidateScope,
    avecFigeage: boolean,
    titre: string,
    description: string,
    avecCascade = false
  ) {
    const candidatesPerJs = new Map<string, ReturnType<typeof trouverCandidatsPourJs>["candidats"]>();
    const exclusionsPerJs = new Map<string, MultiJsExclusion[]>();

    for (const js of jsSelectionnees) {
      const { candidats, exclusions } = trouverCandidatsPourJs(
        js, agents, scope, rules, remplacement, deplacement,
        effectiveServiceMap, npoExclusionCodes,
        avecFigeage, avecFigeage ? jsTypeFlexibiliteMap : undefined,
        zeroLoadPrefixes
      );
      candidatesPerJs.set(js.planningLigneId, candidats);
      exclusionsPerJs.set(js.planningLigneId, exclusions);
    }

    let cascadeContext: ChaineContexte | null = null;
    if (avecCascade) {
      // Budget dynamique : 3000 évaluations en base, dégressif au-delà de 10 JS cibles
      // pour borner le pire-cas (de l'ordre de O(N agents × profondeur × nb JS)).
      const nbJsCibles = jsSelectionnees.length;
      const budgetBase = nbJsCibles <= 10 ? 3000 : Math.max(800, Math.round(3000 * 10 / nbJsCibles));
      cascadeContext = {
        agentsMap,
        index: coverageIndex,
        rules,
        remplacement,
        deplacement,
        effectiveServiceMap,
        zeroLoadPrefixes,
        agentAssignments: new Map(),
        profondeurMax: 2,
        budget: { remaining: budgetBase },
        importId: importIdSimu,
      };
    }

    return allouerJsMultiple(
      jsSelectionnees, candidatesPerJs, agentsMap, rules, scope,
      titre, description, remplacement, deplacement,
      effectiveServiceMap, npoExclusionCodes, exclusionsPerJs, lpaContext, logger,
      zeroLoadPrefixes, cascadeContext, exclusionsPerJs
    );
  }

  // ─── 8 scénarios — matrice complète (périmètre × levier) ─────────────────────
  // Axe 1 : périmètre (Réserve / Tous agents)
  // Axe 2 : levier (Direct / Figeage / Cascade / Cascade+Figeage)
  const scenarioReserveOnly = construireScenario(
    "reserve_only", false,
    "Réserve — Direct",
    "Couverture limitée aux agents de réserve, sans figeage."
  );
  const scenarioReserveOnlyFigeage = construireScenario(
    "reserve_only", true,
    "Réserve + Figeage",
    "Couverture réserve avec libération des agents sur JS DERNIER_RECOURS."
  );
  const scenarioReserveOnlyCascade = construireScenario(
    "reserve_only", false,
    "Réserve — Cascade",
    "Couverture limitée aux agents de réserve, avec chaînes de remplacement entre réservistes.",
    true
  );
  const scenarioReserveOnlyCascadeFigeage = construireScenario(
    "reserve_only", true,
    "Réserve + Cascade + Figeage",
    "Couverture réserve maximale : chaînes de remplacement entre réservistes combinées au figeage DERNIER_RECOURS.",
    true
  );
  const scenarioTousAgents = construireScenario(
    "all_agents", false,
    "Tous agents — Direct",
    "Couverture ouverte à tous les agents éligibles, sans figeage."
  );
  const scenarioTousAgentsFigeage = construireScenario(
    "all_agents", true,
    "Tous agents + Figeage",
    "Couverture maximale : tous agents + libération DERNIER_RECOURS."
  );
  const scenarioTousAgentsCascade = construireScenario(
    "all_agents", false,
    "Tous agents — Cascade",
    "Couverture par chaîne de remplacement : un agent occupé est libéré en faisant reprendre sa JS source par un autre agent.",
    true
  );
  const scenarioTousAgentsCascadeFigeage = construireScenario(
    "all_agents", true,
    "Tous agents + Cascade + Figeage",
    "Couverture maximale : chaînes de remplacement combinées au figeage DERNIER_RECOURS.",
    true
  );

  const scenarios = [
    scenarioReserveOnly,
    scenarioReserveOnlyFigeage,
    scenarioReserveOnlyCascade,
    scenarioReserveOnlyCascadeFigeage,
    scenarioTousAgents,
    scenarioTousAgentsFigeage,
    scenarioTousAgentsCascade,
    scenarioTousAgentsCascadeFigeage,
  ].sort((a, b) => b.score - a.score);

  const meilleur = scenarios[0] ?? null;

  // ─── Solveur unifié — un seul run par appel multi-JS (P3) ────────────────────
  //  - UNIFIED_SHADOW=1                       : rapport en logs serveur uniquement
  //  - FEATURE_UNIFIED_PRIMARY=1
  //    + UNIFIED_PRIMARY_ALIGNMENT_DONE=1     : rapport en logs + exposition UI
  //  - FEATURE_UNIFIED_PRIMARY=1 sans alignment : run shadow + warning (cf.
  //    docs/unified-solver-divergences.md).
  //
  // Avant P3, le shadow tournait 4× (un par scénario cascade) — 100 % redondant
  // car les 4 partagent les mêmes JS racines et le même solveur. On choisit ici
  // le scénario cascade au meilleur score comme référence legacy et on lance
  // runShadowComparison une seule fois.
  let unifiedReport: UnifiedReportUI | undefined;
  if (isUnifiedShadowEnabled()) {
    const cascadeRef = [
      scenarioReserveOnlyCascade,
      scenarioReserveOnlyCascadeFigeage,
      scenarioTousAgentsCascade,
      scenarioTousAgentsCascadeFigeage,
    ].reduce<MultiJsScenario>((best, current) => (current.score > best.score ? current : best), scenarioTousAgentsCascade);

    try {
      // Trouver la JS du 03/05 si elle est sélectionnée — racine de la séquence
      // forcée Chennouf → Brouillat → Leguay (diagnostic ciblé en mode thorough).
      const jsRacineSeq = jsSelectionnees.find(
        (j) => j.codeJs === "GIC006R" && j.date === "2026-05-03",
      ) ?? null;
      const thorough = process.env.UNIFIED_THOROUGH === "1";

      const legacyAffectations = new Map<string, AffectationJs>(
        cascadeRef.affectations.map((a) => [a.jsId, a]),
      );

      const report = runShadowComparison({
        scenarioId:     cascadeRef.id,
        scenarioTitre:  cascadeRef.titre,
        jsCibles:       jsSelectionnees,
        legacyAffectations,
        agentsMap,
        index:          coverageIndex,
        rules,
        lpaContext,
        npoExclusionCodes,
        importId:       importIdSimu,
        remplacement,
        deplacement,
        maxSolutionsParJs: thorough ? 12 : 5,
        budgetParJs:       thorough ? 12000 : 3000,
        exhaustif:         thorough,
        sequenceCibleNoms: ["CHENNOUF", "BROUILLAT", "LEGUAY"],
        diagnosticTargetN1:           thorough ? "CHENNOUF" : null,
        diagnosticAgentsACompararer:  thorough ? ["BROUILLAT", "CHAMINADE", "OLLIER"] : [],
        diagnosticAgentN2:            thorough ? "BROUILLAT" : undefined,
        diagnosticAgentsN3:           thorough ? ["LEGUAY", "PINQUE", "MENDI", "ACHILLE"] : [],
        sequenceForceeJsRacine:       thorough ? jsRacineSeq : null,
        sequenceForceeASim: (thorough && jsRacineSeq)
          ? [
              { agentName: "CHENNOUF",  jsCodeAttendu: "GIC006R" },
              { agentName: "BROUILLAT", jsCodeAttendu: "BAD015R" },
              { agentName: "LEGUAY",    jsCodeAttendu: "GIC015"  },
            ]
          : undefined,
      });
      emitShadowReport(report, logger);

      if (isUnifiedPrimaryEnabled()) {
        unifiedReport = adapterShadowReportPourUI(report);
      }
    } catch (err) {
      // Le solveur unifié ne doit JAMAIS interrompre le scénario legacy.
      // eslint-disable-next-line no-console
      console.error("[UNIFIED] erreur (ignorée pour préserver le legacy):", err);
    }
  }

  // Métriques cascade : nb total de chaînes construites sur les 4 scénarios Cascade
  const nbChainesCascade =
    (scenarioReserveOnlyCascade.affectations.filter((a) => a.chaineRemplacement !== null).length) +
    (scenarioReserveOnlyCascadeFigeage.affectations.filter((a) => a.chaineRemplacement !== null).length) +
    (scenarioTousAgentsCascade.affectations.filter((a) => a.chaineRemplacement !== null).length) +
    (scenarioTousAgentsCascadeFigeage.affectations.filter((a) => a.chaineRemplacement !== null).length);

  logger.info("MULTI_SIMULATION_END", {
    data: {
      nbScenarios: scenarios.length,
      meilleurScore: meilleur?.score ?? null,
      meilleurTauxCouverture: meilleur?.tauxCouverture ?? null,
      nbChainesCascade,
    },
  });

  return {
    jsSelectionnees,
    nbJsSelectionnees: jsSelectionnees.length,
    scenarios,
    scenarioMeilleur: meilleur,
    scenarioReserveOnly,
    scenarioReserveOnlyFigeage,
    scenarioReserveOnlyCascade,
    scenarioReserveOnlyCascadeFigeage,
    scenarioTousAgents,
    scenarioTousAgentsFigeage,
    scenarioTousAgentsCascade,
    scenarioTousAgentsCascadeFigeage,
    nbAgentsAnalyses: agents.length,
    auditLog: logger.all(),
    unifiedReport,
  };
}
