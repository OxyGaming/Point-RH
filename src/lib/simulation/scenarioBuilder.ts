/**
 * Étape 4+5 — Construction et scoring des scénarios
 * Génère les scénarios de réorganisation à partir des candidats et de leurs conflits.
 */

import { resoudreTousConflits } from "./cascadeResolver";
import { scorerScenario, determinerConformiteFinale } from "./scenarioScorer";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { CandidatResult, Scenario, ModificationPlanning } from "@/types/js-simulation";
import type { JsCible, ImpreuvuConfig } from "@/types/js-simulation";
import type { LpaContext } from "@/types/deplacement";
import { DEFAULT_WORK_RULES_MINUTES, type WorkRulesMinutes } from "@/lib/rules/workRules";

let scenarioCounter = 0;

/**
 * Construit les scénarios à partir des candidats ayant des conflits résolvables.
 */
export function construireScenarios(
  candidats: CandidatResult[],
  jsCible: JsCible,
  imprevu: ImpreuvuConfig,
  tousAgents: { context: AgentContext; events: PlanningEvent[] }[],
  lpaContext?: LpaContext,
  rules: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES
): Scenario[] {
  scenarioCounter = 0;
  const scenarios: Scenario[] = [];

  // Scénario pour chaque candidat direct sans conflits
  const directsSansConflit = candidats
    .filter((c) => c.statut === "DIRECT" && c.nbConflits === 0)
    .slice(0, 2);

  for (const candidat of directsSansConflit) {
    const s = buildScenarioDirect(candidat, jsCible, imprevu);
    scenarios.push(s);
  }

  // Scénarios avec résolution en cascade pour candidats avec conflits
  const avecConflits = candidats
    .filter((c) => (c.statut === "DIRECT" || c.statut === "VIGILANCE") && c.nbConflits > 0)
    .slice(0, 3);

  for (const candidat of avecConflits) {
    const autresAgents = tousAgents.filter((a) => a.context.id !== candidat.agentId);
    const conflitsResolvables = candidat.conflitsInduits.filter((c) => c.resolvable);

    // Récupérer le planning de ce candidat avec la JS injectée
    const agentPlanning = tousAgents.find((a) => a.context.id === candidat.agentId);
    if (!agentPlanning) continue;

    const { modifications, impactsCascade, nbResolu, profondeurMax } = resoudreTousConflits(
      conflitsResolvables,
      agentPlanning.events,
      autresAgents,
      [],        // npoExclusionCodes — non disponibles ici, filtrage déjà fait en amont
      lpaContext,
      rules
    );

    const nbConflitsResidus = candidat.nbConflits - nbResolu;
    const conformiteFinale = determinerConformiteFinale(candidat.statut, nbConflitsResidus);

    const modPrincipale: ModificationPlanning = {
      agentId: candidat.agentId,
      agentNom: candidat.nom,
      agentPrenom: candidat.prenom,
      action: "REPRENDRE_JS",
      description: `${candidat.nom} ${candidat.prenom} reprend la JS du ${jsCible.date} ${jsCible.heureDebut}-${jsCible.heureFin}`,
      violations: candidat.detail.violations,
      conforme: candidat.statut === "DIRECT",
      motif: candidat.statut !== "DIRECT" ? candidat.motifPrincipal : null,
      detail: candidat.detail,
      heureDebutEffective: candidat.detail.deplacementInfo?.heureDebutEffective ?? null,
      heureFinEffective:   candidat.detail.deplacementInfo?.heureFinEffective   ?? null,
    };

    const allModifications = [modPrincipale, ...modifications];
    const score = scorerScenario(conformiteFinale, allModifications.length, profondeurMax, nbConflitsResidus);

    scenarioCounter++;
    const scenario: Scenario = {
      id: `scenario-${scenarioCounter}`,
      titre: buildScenarioTitre(candidat, modifications),
      score,
      agentPrincipalId: candidat.agentId,
      agentPrincipalNom: candidat.nom,
      agentPrincipalPrenom: candidat.prenom,
      modifications: allModifications,
      impactsCascade,
      conformiteFinale,
      nbModifications: allModifications.length,
      profondeurCascade: profondeurMax,
      justification: buildJustification(candidat, nbResolu, nbConflitsResidus),
      solution: {
        nature: modifications.length > 0 ? "CASCADE" : "DIRECTE",
        ajustement: candidat.jsSourceFigee ? "FIGEAGE_DIRECT" : "AUCUN",
      },
      jsSourceFigee: candidat.jsSourceFigee ?? null,
    };

    scenarios.push(scenario);
  }

  // Trier par score décroissant, limiter à 5 scénarios
  return scenarios
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildScenarioDirect(
  candidat: CandidatResult,
  jsCible: JsCible,
  imprevu: ImpreuvuConfig
): Scenario {
  scenarioCounter++;
  const score = scorerScenario("CONFORME", 1, 0, 0);

  const titreZSuffix = candidat.surJsZ ? ` (libéré de JS Z : ${candidat.codeJsZOrigine})` : "";
  const titreFigeageSuffix = candidat.jsSourceFigee
    ? ` [figeage JS ${candidat.jsSourceFigee.codeJs ?? "source"}]`
    : "";
  const justifZ = candidat.surJsZ
    ? ` Agent prévu sur une JS de type Z (${candidat.codeJsZOrigine}) — réaffectation sans besoin de remplacement de la journée d'origine.`
    : "";
  const justifFigeage = candidat.jsSourceFigee
    ? ` JS ${candidat.jsSourceFigee.codeJs ?? "source"} (DERNIER_RECOURS) figée pour libérer l'agent.`
    : "";

  return {
    id: `scenario-${scenarioCounter}`,
    titre: `${candidat.nom} ${candidat.prenom} reprend directement la JS${titreZSuffix}${titreFigeageSuffix}`,
    score,
    agentPrincipalId: candidat.agentId,
    agentPrincipalNom: candidat.nom,
    agentPrincipalPrenom: candidat.prenom,
    modifications: [
      {
        agentId: candidat.agentId,
        agentNom: candidat.nom,
        agentPrenom: candidat.prenom,
        action: "REPRENDRE_JS",
        description: `${candidat.nom} ${candidat.prenom} reprend la JS du ${jsCible.date} ${jsCible.heureDebut}-${jsCible.heureFin} — aucun impact sur le planning`,
        violations: [],
        conforme: true,
        detail: candidat.detail,
        heureDebutEffective: candidat.detail.deplacementInfo?.heureDebutEffective ?? null,
        heureFinEffective:   candidat.detail.deplacementInfo?.heureFinEffective   ?? null,
      },
    ],
    impactsCascade: [],
    conformiteFinale: "CONFORME",
    nbModifications: 1,
    profondeurCascade: 0,
    justification: `Solution idéale — ${candidat.nom} est disponible et toutes les règles sont respectées.${justifZ}${justifFigeage}`,
    solution: {
      nature: "DIRECTE",
      ajustement: candidat.jsSourceFigee ? "FIGEAGE_DIRECT" : "AUCUN",
    },
    jsSourceFigee: candidat.jsSourceFigee ?? null,
  };
}

function buildScenarioTitre(
  candidat: CandidatResult,
  modifications: ModificationPlanning[]
): string {
  if (modifications.length === 0) {
    return `${candidat.nom} ${candidat.prenom} reprend la JS`;
  }
  const agents = modifications.map((m) => `${m.agentNom} ${m.agentPrenom}`).join(", ");
  return `${candidat.nom} reprend la JS · ${agents} en réorganisation`;
}

function buildJustification(
  candidat: CandidatResult,
  nbResolu: number,
  nbResidus: number
): string {
  const parts: string[] = [
    `${candidat.nom} ${candidat.prenom} est identifié comme ${candidat.statut === "DIRECT" ? "conforme" : "avec vigilance"}.`,
  ];

  if (candidat.nbConflits > 0) {
    parts.push(`${candidat.nbConflits} conflit(s) induit(s) détecté(s).`);
    if (nbResolu > 0) parts.push(`${nbResolu} résolu(s) en cascade.`);
    if (nbResidus > 0) parts.push(`${nbResidus} conflit(s) non résolvable(s).`);
  }

  return parts.join(" ");
}
