/**
 * Solveur de cascade unifié — types
 *
 * Unifie les deux mécanismes historiques :
 *  - chaîne de remplacement (conflit horaire) — chaineRemplacement.ts
 *  - cascade conflits induits (repos, GPT, TE…) — cascadeResolver.ts
 *
 * Tout impact d'une affectation, peu importe sa nature, devient un nouveau
 * Besoin résolu par la même boucle. Permet d'exposer des solutions complètes
 * mixtes du type :
 *   Imprévu (Poncet) → Chennouf
 *   BAD015R de Chennouf → Brouillat (conflit horaire)
 *   GIC015 de Brouillat → Leguay (conflit horaire)
 *
 * Les fichiers historiques restent intouchés tant que le solveur n'est pas
 * validé. Voir solveur.ts pour le point d'entrée principal.
 */

import type { JsCible } from "@/types/js-simulation";
import type { AgentContext } from "@/engine/rules";
import type { DetailCalcul } from "@/types/simulation";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { LpaContext } from "@/types/deplacement";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { AgentCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";

// ─── Conséquences ────────────────────────────────────────────────────────────

/**
 * Catégorise pourquoi une nouvelle JS doit être libérée pour qu'un agent
 * puisse prendre le besoin courant.
 */
export type ConsequenceType =
  | "HORAIRE_CONFLICT"   // L'agent a déjà une JS qui chevauche le créneau
  | "INDUCED_REPOS"      // Repos journalier insuffisant après prise
  | "INDUCED_GPT"        // Dépassement GPT max sur la GPT en cours
  | "INDUCED_TE_48H"     // Cumul TE 48h dépassé
  | "INDUCED_AMPLITUDE"  // Amplitude individuelle dépassée
  | "INDUCED_RP"         // Repos périodique violé
  | "INDUCED_NUITS";     // 2+ GPT nuit consécutives interdites

/**
 * Une conséquence d'une affectation — référence explicitement la JS impactée
 * (qui devient un nouveau Besoin de niveau N+1).
 *
 * Si la conséquence n'a pas de jsImpactee identifiable (planningLigneId), elle
 * est qualifiée de NON_RECUPERABLE et la candidature est rejetée — pas de
 * Besoin orphelin.
 */
export interface Consequence {
  type: ConsequenceType;
  jsImpactee: JsCible;
  description: string;
  /** Métadonnées de traçabilité (audit / debug). */
  meta?: {
    reposDisponibleMin?: number;
    reposRequisMin?: number;
    gptActuel?: number;
    gptMax?: number;
    teCumule48hMin?: number;
    amplitudeImprevuMin?: number;
    amplitudeMaxMin?: number;
  };
}

// ─── Besoin ──────────────────────────────────────────────────────────────────

export type BesoinOrigine =
  | { type: "RACINE" }
  | {
      type: "LIBERATION";
      parentBesoinId: string;          // qui a généré ce besoin
      agentLibere: string;             // dont on libère la JS
      consequenceType: ConsequenceType;
    };

/**
 * Une JS à couvrir. Racine = imprévu initial. LIBERATION = besoin dérivé
 * d'une affectation qui a généré une conséquence.
 */
export interface Besoin {
  /**
   * Identifiant stable et déterministe — même JS produit toujours le même id.
   * Format : jsCible.planningLigneId si non null, sinon `${date}_${heureDebut}_${codeJs}`.
   */
  id: string;
  jsCible: JsCible;
  origine: BesoinOrigine;
  niveau: number;                      // 0 = racine
}

/** Construit un id stable pour un Besoin à partir de sa JS cible. */
export function besoinIdFromJs(js: JsCible): string {
  return js.planningLigneId !== null && js.planningLigneId !== ""
    ? `pli:${js.planningLigneId}`
    : `slot:${js.date}_${js.heureDebut}_${js.codeJs ?? "?"}`;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Un nœud de l'arbre de résolution. consequences = [] = feuille (agent libre
 * ou affectation sans impact aval). sousResolutions est en correspondance 1:1
 * avec consequences (sousResolutions[i] résout consequences[i].jsImpactee).
 */
export interface Resolution {
  besoin: Besoin;
  agent: AgentContext;
  /** Statut RH de l'agent sur la JS du besoin (après libération des conséquences). */
  statut: "DIRECT" | "VIGILANCE";
  /** Score métier (0-100) calculé via scorerCandidat. Utilisé pour dériver
   *  le niveauRisque global de la solution. */
  score: number;
  /** Détail audit des règles évaluées. */
  detail: DetailCalcul;
  consequences: Consequence[];
  sousResolutions: Resolution[];
}

// ─── Solution ────────────────────────────────────────────────────────────────

/**
 * Indicateur de risque global d'une solution. Hiérarchie croissante :
 *  - OK            : toutes les résolutions sont DIRECT et à score métier élevé
 *  - VIGILANCE     : au moins une feuille en VIGILANCE (statut RH dégradé)
 *  - DECONSEILLEE  : au moins un agent à score métier très bas (≤ seuil) —
 *                    techniquement valide mais lourdement déconseillé. Sortie
 *                    typique du mode "exhaustif" qui expose des alternatives
 *                    terrain documentées plutôt que recommandées.
 *  - INCOMPLETE    : au moins une branche n'a pas trouvé de feuille
 *
 * (`complete: true, niveauRisque: DECONSEILLEE` est un cas valide — la
 * solution est exposable au décideur, mais clairement marquée.)
 */
export type NiveauRisque = "OK" | "VIGILANCE" | "DECONSEILLEE" | "INCOMPLETE";

/** Seuil en dessous duquel le score d'un agent fait basculer la solution
 *  vers niveauRisque=DECONSEILLEE. Calibré sur scorerCandidat (0–100). */
export const SEUIL_SCORE_DECONSEILLE = 30;

export interface Solution {
  resolutionRacine: Resolution;
  /**
   * Aplatissement DFS post-ordre : feuilles d'abord, racine en dernier.
   * Ordre d'application sur le planning si on retient cette solution.
   */
  resolutionsAplaties: Resolution[];
  /** True ssi toute branche se termine sur une feuille (consequences = []). */
  complete: boolean;
  /** True ssi au moins une feuille a statut VIGILANCE (solution dégradée). */
  hasVigilance: boolean;
  niveauRisque: NiveauRisque;
  profondeurMax: number;
  budgetConsomme: number;
  /** Tous les agents engagés dans la solution — exclusion inter-solutions. */
  agentsEngages: ReadonlySet<string>;
}

// ─── EtatCascade ─────────────────────────────────────────────────────────────

/**
 * Contexte mutable d'une branche de résolution.
 *
 * Convention de mutation :
 *  - les champs `readonly` sont figés au démarrage (constantes du scénario)
 *  - les Sets/Maps de branche sont CLONÉS par enrichirEtat à chaque récursion
 *  - le budget et le cache sont PARTAGÉS (mutables) entre toutes les branches
 *    pour que le coût total reste borné même en cas d'exploration arborescente
 */
export interface EtatCascade {
  // ─── Constantes du scénario ────────────────────────────────────
  readonly agentsMap: ReadonlyMap<string, AgentDataMultiJs>;
  readonly index: AgentCoverageIndex;
  readonly rules: WorkRulesMinutes;
  readonly lpaContext?: LpaContext;
  readonly npoExclusionCodes: readonly string[];
  readonly remplacement: boolean;
  readonly deplacement: boolean;
  readonly importId: string;
  readonly profondeurMax: number;       // 4 par défaut

  // ─── État de branche (cloné à chaque récursion) ───────────────
  /** JS prises par chaque agent dans la branche courante (planningLigneId comme id). */
  affectationsCourantes: Map<string, JsCible[]>;
  /** planningLigneId des JS retirées du planning original dans la branche. */
  jsLibereesDansBranche: Set<string>;
  /** Anti-cycle : agents déjà mobilisés dans la branche. */
  agentsEngagesBranche: Set<string>;
  /** Anti-cycle : besoins déjà en cours dans la branche (besoin.id). */
  besoinsEnCoursBranche: Set<string>;

  // ─── Globaux partagés (mutables) ──────────────────────────────
  budget: { remaining: number };
  /** Cache (agentId, besoinId, hashEtat) → ImpactEvaluation. */
  cache: Map<string, ImpactEvaluation>;
}

// ─── ImpactEvaluation ────────────────────────────────────────────────────────

/**
 * Sortie de evaluerImpactComplet — l'agent peut-il prendre le besoin, et si
 * oui, à quelles conditions (libération de quelles JS).
 */
export interface ImpactEvaluation {
  faisable: boolean;
  /** Si faisable=false : raison fatale (HABILITATION, NPO, NON_RECUPERABLE…). */
  raisonRejet?: string;
  /** Statut RH une fois conséquences libérées (ne s'applique que si faisable). */
  statut: "DIRECT" | "VIGILANCE";
  detail: DetailCalcul;
  /** Liste des JS à libérer pour rendre la prise possible — chacune devient un Besoin. */
  consequences: Consequence[];
}

// ─── Résultats du solveur ────────────────────────────────────────────────────

export type ResolutionEchecRaison =
  | "BUDGET"
  | "PROFONDEUR"
  | "AUCUN_CANDIDAT"
  | "CYCLE"
  | "INCOMPLET";

export type ResolutionResult =
  | { ok: true; resolution: Resolution }
  | { ok: false; raison: ResolutionEchecRaison; detail?: string };

export interface ResolutionOptions {
  /** Plafond du nombre de candidats explorés à ce niveau. Cap combinatoire. */
  maxCandidatsAuNiveau?: number;       // défaut : 8
  /**
   * Tri des candidats.
   *  - STANDARD     : tri stable par agentId (diagnostic / tests).
   *  - RESERVE_PRIO : réservistes d'abord puis agentId.
   *  - SCORE_LEGACY : aligné sur le score métier de l'allocator legacy
   *    (DIRECT/VIGILANCE → réserve → score décroissant). Coût supplémentaire
   *    négligeable car les évaluations sont mises en cache.
   */
  tri?: "STANDARD" | "RESERVE_PRIO" | "SCORE_LEGACY";   // défaut : SCORE_LEGACY
  /**
   * Mode d'exploration :
   *  - PREMIER_TROUVE : retourne dès qu'une branche complète est trouvée (greedy)
   *  - EXHAUSTIF      : explore tous les candidats — utilisé via enumererSolutions
   */
  mode?: "PREMIER_TROUVE" | "EXHAUSTIF"; // défaut : PREMIER_TROUVE
}

// ─── Constantes ──────────────────────────────────────────────────────────────

export const SOLVER_DEFAULTS = {
  CASCADE_MAX_DEPTH: 4,
  CASCADE_EVAL_BUDGET: 12000,
  MAX_CANDIDATS_PAR_NIVEAU: 8,
  MAX_SOLUTIONS_ENUMEREES: 5,
} as const;
