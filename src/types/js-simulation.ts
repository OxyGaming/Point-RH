import type { DetailCalcul, RegleViolation } from "./simulation";
import type { ScoreBreakdownCandidat } from "@/lib/simulation/scenarioScorer";
import type { LogEntry } from "@/engine/logger";

// ─── Flexibilité des JS ───────────────────────────────────────────────────────

/**
 * Degré de priorité d'un type de JS dans la simulation.
 * Configuré sur JsType dans l'écran "Types JS".
 * - OBLIGATOIRE    : la JS doit être couverte ; pénalité maximale si non couverte.
 * - DERNIER_RECOURS: non-couverture moins pénalisée ; l'agent planifié sur cette
 *                   JS peut être figé pour en libérer un autre (si autoriserFigeage).
 */
export type FlexibiliteJs = "OBLIGATOIRE" | "DERNIER_RECOURS";

// ─── Types de solution ────────────────────────────────────────────────────────

/** Nature de la solution retenue pour couvrir une JS. */
export type NatureSolution = "DIRECTE" | "CASCADE";
// DIRECTE  → l'agent est directement disponible (libre ou réserve)
// CASCADE  → l'agent avait une autre JS ; un remplaçant couvre cette JS d'origine

/** Ajustement appliqué à la JS source de l'agent remplaçant. */
export type AjustementSolution =
  | "AUCUN"             // agent était libre — aucune JS figée
  | "FIGEAGE_DIRECT"    // la JS source de l'agent principal est figée (DERNIER_RECOURS)
  | "FIGEAGE_INDIRECT"; // la JS source d'un agent de cascade est figée

export interface SolutionJs {
  nature:     NatureSolution;
  ajustement: AjustementSolution;
}

/**
 * Informations sur la JS source figée pour libérer un agent.
 * Non null ssi ajustement !== 'AUCUN'.
 * En V1 : toujours rattachée à une JS DERNIER_RECOURS.
 */
export interface JsSourceFigee {
  planningLigneId: string;
  codeJs:          string | null;
  flexibilite:     FlexibiliteJs;  // toujours 'DERNIER_RECOURS' en V1
  agentId:         string;         // agent dont la JS a été figée
  justification:   string;         // ex: "JS GIV002 (DERNIER_RECOURS) figée — agent libéré vers GIV001 le 2024-03-20"
}

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
  /** Priorité de couverture — propagée depuis JsType.flexibilite. Défaut : OBLIGATOIRE. */
  flexibilite: FlexibiliteJs;
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
  /**
   * Si true, le moteur peut libérer un agent planifié sur une JS DERNIER_RECOURS
   * en la figeant, pour le proposer comme candidat.
   * Défaut false — comportement identique à aujourd'hui si non fourni.
   */
  autoriserFigeage?: boolean;
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
  /**
   * Décomposition détaillée du score (transparence).
   * Chaque composante (violations, conflits, bonus, pénalités) est exposée.
   */
  scoreBreakdown: ScoreBreakdownCandidat;
  motifPrincipal: string;
  detail: DetailCalcul;
  conflitsInduits: ConflitInduit[];
  nbConflits: number;
  /**
   * JS source figée pour libérer cet agent (FIGEAGE_DIRECT).
   * null si l'agent était libre — aucun figeage appliqué.
   * Le score candidat n'est pas affecté par la présence de ce champ.
   */
  jsSourceFigee?: JsSourceFigee | null;
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
  /** Nature et ajustement de la solution retenue pour ce scénario. */
  solution: SolutionJs;
  /**
   * JS source figée pour libérer l'agent principal.
   * null si ajustement === 'AUCUN' (aucun figeage dans ce scénario).
   */
  jsSourceFigee: JsSourceFigee | null;
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
  /**
   * Traces horodatées de toutes les décisions du moteur pour cette simulation.
   * Utile pour l'audit, le debug et l'explicabilité des résultats.
   */
  auditLog: LogEntry[];
}
