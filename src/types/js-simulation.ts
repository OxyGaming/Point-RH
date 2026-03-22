import type { DetailCalcul, RegleViolation } from "./simulation";

// ─── JS Cible ────────────────────────────────────────────────────────────────

export interface JsCible {
  planningLigneId: string;
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  date: string;       // "YYYY-MM-DD"
  heureDebut: string; // "HH:MM" — horaires du planning de l'agent (peuvent inclure son trajet)
  heureFin: string;   // "HH:MM"
  /** Horaires standard du JsType de référence (indépendants du trajet de l'agent initial) */
  heureDebutJsType?: string; // "HH:MM"
  heureFinJsType?: string;   // "HH:MM"
  amplitudeMin: number;
  codeJs: string | null;
  typeJs: string | null;
  isNuit: boolean;
  importId: string;
}

// ─── Contexte simulation ──────────────────────────────────────────────────────

export interface ImpreuvuConfig {
  partiel: boolean;
  heureDebutReel: string;   // peut différer de la JS cible si partiel
  heureFinEstimee: string;
  deplacement: boolean;
  remplacement: boolean;    // true = agent remplaçant (règles spéciales)
  commentaire?: string;
}

export interface JsSimulationRequest {
  jsCible: JsCible;
  imprevu: ImpreuvuConfig;
}

// ─── Conflit induit ────────────────────────────────────────────────────────────

export type TypeConflit =
  | "REPOS_INSUFFISANT"
  | "AMPLITUDE_DEPASSEE"
  | "GPT_MAX"
  | "TE_DEPASSE"
  | "NUIT_CONSEC";

export interface ConflitInduit {
  planningLigneId: string | null;
  date: string;
  heureDebut?: string;
  heureFin?: string;
  type: TypeConflit;
  description: string;
  regleCode: string;
  resolvable: boolean;
}

// ─── Candidat ──────────────────────────────────────────────────────────────────

export type StatutCandidat = "DIRECT" | "VIGILANCE" | "REFUSE";

export interface CandidatResult {
  agentId: string;
  nom: string;
  prenom: string;
  matricule: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  /** Agent prévu sur une JS de type Z (sans charge réelle) au moment de l'imprévu */
  surJsZ: boolean;
  /** Code de la JS Z d'origine (ex: "GIV Z") */
  codeJsZOrigine: string | null;
  statut: StatutCandidat;
  scorePertinence: number;
  motifPrincipal: string;
  detail: DetailCalcul;
  conflitsInduits: ConflitInduit[];
  nbConflits: number;
}

// ─── Modification planning ─────────────────────────────────────────────────────

export type ActionPlanning =
  | "REPRENDRE_JS"      // agent reprend la JS cible
  | "ECHANGER_JS"       // échange de JS entre deux agents
  | "DECALER_NPO"       // décaler un repos
  | "RESOUDRE_CONFLIT"; // résolution d'un conflit induit

export interface ModificationPlanning {
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  action: ActionPlanning;
  description: string;
  violations: RegleViolation[];
  conforme: boolean;
}

// ─── Impact en cascade ─────────────────────────────────────────────────────────

export type SeveriteImpact = "INFO" | "AVERTISSEMENT" | "BLOQUANT";

export interface ImpactCascade {
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  description: string;
  regle: string;
  severity: SeveriteImpact;
  date: string;
}

// ─── Scénario ─────────────────────────────────────────────────────────────────

export type ConformiteFinale = "CONFORME" | "VIGILANCE" | "NON_CONFORME";

export interface Scenario {
  id: string;
  titre: string;
  score: number;
  agentPrincipalId: string;
  agentPrincipalNom: string;
  agentPrincipalPrenom: string;
  modifications: ModificationPlanning[];
  impactsCascade: ImpactCascade[];
  conformiteFinale: ConformiteFinale;
  nbModifications: number;
  profondeurCascade: number;
  justification: string;
}

// ─── Résultat global ──────────────────────────────────────────────────────────

export interface JsSimulationResultat {
  jsCible: JsCible;
  imprevu: ImpreuvuConfig;
  directsUtilisables: CandidatResult[];
  vigilance: CandidatResult[];
  refuses: CandidatResult[];
  scenarios: Scenario[];
  nbAgentsAnalyses: number;
}
