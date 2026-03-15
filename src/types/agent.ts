export interface AgentData {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  uch: string | null;
  codeUch: string | null;
  codeApes: string | null;
  codeSymboleGrade: string | null;
  codeCollegeGrade: number | null;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  regimeB: boolean;
  regimeC: boolean;
  habilitations: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentCreateInput {
  matricule: string;
  nom: string;
  prenom: string;
  uch?: string;
  codeUch?: string;
  codeApes?: string;
  codeSymboleGrade?: string;
  codeCollegeGrade?: number;
  posteAffectation?: string;
  agentReserve?: boolean;
  peutFaireNuit?: boolean;
  peutEtreDeplace?: boolean;
  regimeB?: boolean;
  regimeC?: boolean;
  habilitations?: string[];
}

export interface AgentUpdateInput extends Partial<AgentCreateInput> {}
