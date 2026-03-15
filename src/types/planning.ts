export type JsNpo = "JS" | "NPO";

export type TypeJs =
  | "FIX"
  | "DIS"
  | "RNF"
  | "CHE"
  | "CSE"
  | "ACC"
  | "FPF"
  | "Non utilisé"
  | "Congé-repos"
  | "Absence méd sf AT"
  | string;

export interface PlanningLigneRaw {
  uch: string | null;
  codeUch: string | null;
  nom: string;
  prenom: string;
  matricule: string;
  codeApes: string | null;
  codeSymboleGrade: string | null;
  codeCollegeGrade: number | null;
  dateDebutPop: Date;
  heureDebutPop: string; // "HH:MM"
  heureFinPop: string;   // "HH:MM"
  dateFinPop: Date;
  amplitudeCentesimal: number | null;
  amplitudeHHMM: string | null;
  dureeEffectiveCent: number | null;
  dureeEffectiveHHMM: string | null;
  jsNpo: JsNpo;
  codeJs: string | null;
  typeJs: TypeJs | null;
  valeurNpo: number | null;
  uchJs: string | null;
  codeUchJs: string | null;
  codeRoulementJs: string | null;
  numeroJs: string | null;
}

export interface ImportResult {
  success: boolean;
  importId?: string;
  nbLignes: number;
  nbAgents: number;
  fileType?: "excel" | "txt";
  erreurs: ImportErreur[];
}

export interface ImportErreur {
  ligne: number;
  champ?: string;
  message: string;
}

export interface PlanningAgentTimeline {
  agentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  lignes: PlanningLigneEnriched[];
}

export interface PlanningLigneEnriched {
  id: string;
  dateDebut: Date;
  dateFin: Date;
  heureDebut: string;
  heureFin: string;
  amplitudeMin: number;
  dureeEffectiveMin: number | null;
  jsNpo: JsNpo;
  codeJs: string | null;
  typeJs: string | null;
  isNuit: boolean;
}
