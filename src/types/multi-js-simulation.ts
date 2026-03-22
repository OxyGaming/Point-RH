/**
 * Types pour la simulation multi-JS (grève, perturbation majeure, absences multiples)
 */

import type { JsCible, ConflitInduit, ModificationPlanning, ImpactCascade } from "./js-simulation";

// ─── Mode de simulation ───────────────────────────────────────────────────────

/** Périmètre des agents candidats pour la simulation */
export type CandidateScope = "reserve_only" | "all_agents";

// ─── Requête ──────────────────────────────────────────────────────────────────

export interface MultiJsSimulationRequest {
  importId: string;
  jsSelectionnees: JsCible[];
  candidateScope: CandidateScope;
  deplacement?: boolean;
  remplacement?: boolean;
}

// ─── Candidat interne (avant allocation) ─────────────────────────────────────

export interface CandidatMultiJs {
  agentId: string;
  nom: string;
  prenom: string;
  matricule: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  score: number;
  statut: "DIRECT" | "VIGILANCE";
  motif: string;
  conflitsInduits: ConflitInduit[];
}

// ─── Situation initiale de l'agent remplaçant ────────────────────────────────

/** Ce que l'agent remplaçant avait initialement dans son planning au créneau couvert */
export type TypeSituationInitiale = "LIBRE" | "RESERVE" | "JS_Z" | "JS";

export interface JsOriginaleAgent {
  type: TypeSituationInitiale;
  /** Code JS d'origine (null si LIBRE ou RESERVE) */
  codeJs: string | null;
  /** Heures d'origine (renseignées si JS ou JS_Z) */
  heureDebut: string | null;
  heureFin: string | null;
  /** Libellé lisible affiché dans l'UI */
  description: string;
}

// ─── Affectation d'une JS à un agent dans le scénario ────────────────────────

export interface AffectationJs {
  jsId: string;            // planningLigneId de la JS cible
  jsCible: JsCible;
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  agentReserve: boolean;
  statut: "DIRECT" | "VIGILANCE";
  score: number;
  justification: string;
  conflitsInduits: ConflitInduit[];
  /** Situation initiale de l'agent remplaçant au créneau couvert */
  jsOriginaleAgent: JsOriginaleAgent;
  /** Agents mobilisés en cascade pour couvrir les conflits induits */
  cascadeModifications: ModificationPlanning[];
  /** Impacts cascade résiduels (vigilances, bloquants non résolus) */
  cascadeImpacts: ImpactCascade[];
  /** Nombre de conflits induits résolus par cascade */
  nbCascadesResolues: number;
  /** Nombre de conflits induits non résolus malgré la tentative cascade */
  nbCascadesNonResolues: number;
}

// ─── Conflit détecté dans le scénario global ─────────────────────────────────

export type TypeConflitMultiJs =
  | "CHEVAUCHEMENT_HORAIRE"
  | "AMPLITUDE_DEPASSEE"
  | "REPOS_JOURNALIER"
  | "GPT_MAX"
  | "TE_GPT"
  | "NUIT_CONSECUTIVES"
  | "PREFIXE_INTERDIT"
  | "HABILITATION_MANQUANTE"
  | "AUCUN_CANDIDAT";

export interface ConflitMultiJs {
  type: TypeConflitMultiJs;
  description: string;
  jsId?: string;
  agentId?: string;
  severity: "INFO" | "AVERTISSEMENT" | "BLOQUANT";
}

// ─── Récapitulatif par agent ──────────────────────────────────────────────────

export interface AffectationsParAgent {
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  agentReserve: boolean;
  jsAssignees: AffectationJs[];
  nbJs: number;
  conformiteGlobale: "CONFORME" | "VIGILANCE" | "NON_CONFORME";
}

// ─── Scénario global ─────────────────────────────────────────────────────────

export type RobustesseScenario = "HAUTE" | "MOYENNE" | "FAIBLE";

export interface MultiJsScenario {
  id: string;
  titre: string;
  description: string;
  score: number;
  candidateScope: CandidateScope;
  affectations: AffectationJs[];
  jsNonCouvertes: JsCible[];
  affectationsParAgent: AffectationsParAgent[];
  conflitsDetectes: ConflitMultiJs[];
  nbJsCouvertes: number;
  nbJsNonCouvertes: number;
  nbAgentsMobilises: number;
  robustesse: RobustesseScenario;
  tauxCouverture: number; // 0-100 %
  /** Nombre total de conflits induits résolus en cascade sur toutes les affectations */
  nbCascadesResolues: number;
  /** Nombre total de conflits induits non résolus malgré cascade sur toutes les affectations */
  nbCascadesNonResolues: number;
}

// ─── Résultat global de la simulation multi-JS ───────────────────────────────

export interface MultiJsSimulationResultat {
  jsSelectionnees: JsCible[];
  nbJsSelectionnees: number;
  scenarios: MultiJsScenario[];
  /** Meilleur scénario (score le plus élevé) */
  scenarioMeilleur: MultiJsScenario | null;
  /** Scénario réserve uniquement (disponible si le mode était "all_agents") */
  scenarioReserveOnly: MultiJsScenario | null;
  /** Scénario tous agents (disponible si le mode était "reserve_only") */
  scenarioTousAgents: MultiJsScenario | null;
  /** Nombre total d'agents analysés */
  nbAgentsAnalyses: number;
}

// ─── Ligne JS pour l'affichage timeline ──────────────────────────────────────

export interface JsTimeline {
  planningLigneId: string;
  importId: string;
  date: string;            // "YYYY-MM-DD"
  heureDebut: string;      // horaires du planning de l'agent (peuvent inclure son trajet)
  heureFin: string;
  /** Horaires standard du JsType de référence (indépendants du trajet de l'agent initial) */
  heureDebutJsType?: string; // "HH:MM"
  heureFinJsType?: string;   // "HH:MM"
  amplitudeMin: number;
  codeJs: string | null;
  typeJs: string | null;
  isNuit: boolean;
  isZ: boolean;            // JS sans charge réelle
  agentId: string | null;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  posteAffectation: string | null;
  uch: string | null;
  numeroJs: string | null;
  prefixeJs: string | null;  // ex: "GIV", "GIC", "PEY"
}
