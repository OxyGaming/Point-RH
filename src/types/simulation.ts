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

export interface DetailCalcul {
  amplitudeMaxAutorisee: number;
  amplitudeImprevu: number;
  dureeEffectiveMax: number;
  reposJournalierMin: number;
  dernierPosteDebut: string | null;
  dernierPosteFin: string | null;
  reposJournalierDisponible: number | null;
  gptActuel: number;
  gptMax: number;
  reposPeriodiqueProchain: string | null;
  violations: RegleViolation[];
  respectees: RegleRespectee[];
  disponible: boolean;
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
