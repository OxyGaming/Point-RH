/**
 * Types pour la simulation multi-JS (grève, perturbation majeure, absences multiples)
 */

import type { JsCible, ConflitInduit } from "./js-simulation";

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
  heureDebut: string;
  heureFin: string;
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
