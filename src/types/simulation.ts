export interface SimulationInput {
  importId: string;
  dateDebut: string;   // ISO date "YYYY-MM-DD"
  dateFin: string;
  heureDebut: string;  // "HH:MM"
  heureFin: string;
  poste: string;
  codeJs?: string | null;  // code de la JS cible (pour vérification préfixes)
  remplacement: boolean;
  deplacement: boolean;
  posteNuit: boolean;
  commentaire?: string;
}

export type StatutAgent = "CONFORME" | "VIGILANCE" | "NON_CONFORME";

export interface RegleViolation {
  regle: string;
  description: string;
  valeur?: number | string;
  limite?: number | string;
}

export interface RegleRespectee {
  regle: string;
  description: string;
  valeur?: number | string;
}

import type { EffectiveServiceInfo } from "./deplacement";

/**
 * Analyse des Repos Périodiques (RP) encadrant la GPT affectée par la simulation.
 * Concerne uniquement les transitions RP ↔ GPT, pas les repos journaliers inter-JS.
 *
 * V1 : RP simple uniquement (rpSimpleMin = 36h).
 * V2 prévue : RP double/triple selon longueur GPT (hors périmètre V1).
 */
export interface GptRpAnalyse {
  // ── Identité de la GPT post-simulation ────────────────────────────────────
  /** Nombre de JS dans la GPT impactée (après injection) */
  gptLength: number;
  /** "YYYY-MM-DD" — premier jour de la GPT impactée */
  premierJsDate: string;
  /** "YYYY-MM-DD" — dernier jour de la GPT impactée */
  dernierJsDate: string;

  // ── Bornes de repos périodique (événements voisins) ───────────────────────
  /** Fin du dernier JS de la GPT précédente (ISO string). Null = pas de GPT précédente. */
  gptPrecedenteFin: string | null;
  /** Début du premier JS de la GPT suivante (ISO string). Null = pas de GPT suivante. */
  gptSuivanteDebut: string | null;

  // ── Durées RP calculées (minutes) ─────────────────────────────────────────
  /** Gap entre GPT précédente et GPT impactée. Null si pas de GPT précédente. */
  rpAvantGptMin: number | null;
  /** Gap entre GPT impactée et GPT suivante. Null si pas de GPT suivante. */
  rpApresGptMin: number | null;

  // ── Minimums requis (V1 : RP simple uniquement) ───────────────────────────
  /** Toujours rpSimpleMin (2160 min = 36h) en V1. Prévu pour V2 (RP double). */
  rpAvantGptMinRequis: number;
  rpApresGptMinRequis: number;

  // ── Conformité ────────────────────────────────────────────────────────────
  /** Null si données absentes (pas de GPT voisine). */
  rpAvantGptConforme: boolean | null;
  rpApresGptConforme: boolean | null;

  // ── Diagnostic de l'impact ────────────────────────────────────────────────
  /**
   * Synthèse des transitions dégradées ou non conformes après simulation.
   * "AUCUNE" = les deux RP encadrants sont conformes ET non dégradés
   * par rapport au planning original.
   */
  transitionImpactee: "AVANT" | "APRES" | "LES_DEUX" | "AUCUNE";
}

/** Une JS individuelle dans la GPT courante, pour le décomposé TE GPT */
export interface TeGptLigne {
  date: string;           // "YYYY-MM-DD"
  heureDebut: string;
  heureFin: string;
  codeJs: string | null;
  dureeMin: number;
}

export interface DetailCalcul {
  amplitudeMaxAutorisee: number;
  amplitudeImprevu: number;
  /** Raison de l'amplitude max (ex: "agent en déplacement", "poste de nuit") */
  amplitudeRaison: string;
  dureeEffectiveMax: number;
  reposJournalierMin: number;
  dernierPosteDebut: string | null;
  dernierPosteFin: string | null;
  /** Date calendaire du dernier poste (YYYY-MM-DD) */
  dernierPosteDate: string | null;
  reposJournalierDisponible: number | null;
  gptActuel: number;
  gptMax: number;
  /** TE cumulé dans la GPT avant la JS simulée (en minutes) */
  teGptCumulAvant: number;
  /** Détail des JS de la GPT courante (avant la JS simulée), pour le décomposé */
  teGptLignes: TeGptLigne[];
  reposPeriodiqueProchain: string | null;
  violations: RegleViolation[];
  respectees: RegleRespectee[];
  pointsVigilance: string[];   // avertissements non bloquants (GPT min, GPT max avant RP…)
  disponible: boolean;
  /** Informations de déplacement calculées (null si non disponibles / LPA non configurée) */
  deplacementInfo: EffectiveServiceInfo | null;
  /**
   * Analyse des transitions RP autour de la GPT contenant la JS simulée.
   * Null si le planning ne permet pas d'identifier une GPT.
   */
  gptRpAnalyse: GptRpAnalyse | null;
}

export interface ResultatAgentDetail {
  agentId: string;
  nom: string;
  prenom: string;
  matricule: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  statut: StatutAgent;
  scorePertinence: number;
  motifPrincipal: string;
  detail: DetailCalcul;
}

export interface SimulationResultat {
  simulationId: string;
  conformes: ResultatAgentDetail[];
  vigilance: ResultatAgentDetail[];
  nonConformes: ResultatAgentDetail[];
}
