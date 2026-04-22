/**
 * Service de propositions d'habilitations (préfixes JS) après import planning.
 *
 * Principe : pour chaque agent, lister les `codeJs` qu'il a tenus (historique complet,
 * hors NPO) qui ne sont couverts par AUCUN de ses préfixes actuels, puis proposer
 * chaque code tel quel (le plus restrictif possible).
 *
 * Logique idempotente : valider un ajout le fait disparaître des propositions suivantes.
 */
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CodeJsTenu {
  codeJs: string;
  nbJoursTenus: number;
  dernierJour: Date;
}

export interface HabilitationProposal extends CodeJsTenu {}

export interface AgentProposals {
  agentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  habilitationsActuelles: string[];
  propositions: HabilitationProposal[];
}

export interface ValidationInput {
  agentId: string;
  prefixesAAjouter: string[];
}

export interface ValidationResult {
  agentsMisAJour: number;
  prefixesAjoutes: number;
  erreurs: Array<{ agentId: string; message: string }>;
}

// ─── Helpers purs ─────────────────────────────────────────────────────────────

/** Un code est couvert s'il commence par au moins un des préfixes. */
export function isCouvert(codeJs: string, prefixes: string[]): boolean {
  return prefixes.some((p) => p.length > 0 && codeJs.startsWith(p));
}

/** Union dédoublonnée + trim + tri alphabétique. */
export function mergerHabilitations(actuel: string[], ajouts: string[]): string[] {
  const cleaned = [...actuel, ...ajouts]
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
}

/**
 * Calcule les propositions pour un agent donné (logique pure, testable sans DB).
 * Retourne la liste triée par `codeJs` croissant.
 */
export function computeAgentProposals(
  habilitationsActuelles: string[],
  codesJsTenus: CodeJsTenu[],
): HabilitationProposal[] {
  return codesJsTenus
    .filter((c) => !isCouvert(c.codeJs, habilitationsActuelles))
    .sort((a, b) => a.codeJs.localeCompare(b.codeJs));
}
