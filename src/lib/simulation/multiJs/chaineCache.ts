/**
 * Index de couverture pour le mode Cascade.
 *
 * Pré-filtre rapide : pour une JS donnée (codeJs, nuit, déplacement requis),
 * retourne en O(1) le sous-ensemble d'agents qui passent les contraintes
 * structurelles (préfixe d'habilitation, peutFaireNuit, peutEtreDeplace).
 *
 * Cet index ne fait PAS l'évaluation RH cumulée (amplitude, repos, GPT…) —
 * cette vérification reste à la charge du caller via canAssignJsToAgentInScenario.
 * Son rôle est uniquement d'éviter d'évaluer 230 agents quand 5 d'entre eux
 * seulement ont l'habilitation requise.
 */

import type { AgentDataMultiJs } from "./multiJsCandidateFinder";

export interface AgentCoverageIndex {
  /** Map des préfixes JS (uppercase) → set d'agentId habilités. */
  byPrefix: Map<string, Set<string>>;
  /** Sous-ensemble peutFaireNuit = true. */
  nightCapable: Set<string>;
  /** Sous-ensemble peutEtreDeplace = true. */
  movable: Set<string>;
  /** Tous les agents indexés (utile pour les itérations bornées). */
  allAgents: Set<string>;
}

/**
 * Construit l'index de couverture une seule fois pour un scénario.
 * Coût : O(N agents × P préfixes) — typique : 230 × 3 = 690 opérations.
 */
export function buildCoverageIndex(agents: AgentDataMultiJs[]): AgentCoverageIndex {
  const byPrefix = new Map<string, Set<string>>();
  const nightCapable = new Set<string>();
  const movable = new Set<string>();
  const allAgents = new Set<string>();

  for (const { context } of agents) {
    allAgents.add(context.id);
    if (context.peutFaireNuit) nightCapable.add(context.id);
    if (context.peutEtreDeplace) movable.add(context.id);

    for (const prefix of context.prefixesJs) {
      const key = prefix.trim().toUpperCase();
      if (key.length === 0) continue;
      const set = byPrefix.get(key) ?? new Set<string>();
      set.add(context.id);
      byPrefix.set(key, set);
    }
  }

  return { byPrefix, nightCapable, movable, allAgents };
}

/**
 * Retourne les agents qui passent le pré-filtre structurel pour une JS donnée.
 * Combine : habilitation préfixe (au moins un préfixe couvre codeJs) ET nuit
 * (si JS de nuit) ET déplacement (si requis par le mode).
 *
 * Si codeJs est null, aucun filtre préfixe — tous les agents sont retournés.
 *
 * Complexité : O(P) où P = nb de préfixes connus dans l'index, indépendant
 * du nombre d'agents.
 */
export function findEligibleAgentsForJs(
  index: AgentCoverageIndex,
  codeJs: string | null,
  isNuit: boolean,
  requiresDeplacement: boolean
): Set<string> {
  // 1. Filtre habilitation : union des sets des préfixes qui couvrent codeJs
  let eligible: Set<string>;
  if (codeJs === null) {
    eligible = new Set(index.allAgents);
  } else {
    const code = codeJs.toUpperCase();
    eligible = new Set<string>();
    for (const [prefix, set] of index.byPrefix) {
      if (code.startsWith(prefix)) {
        for (const id of set) eligible.add(id);
      }
    }
  }

  // 2. Filtre nuit
  if (isNuit) {
    const filtered = new Set<string>();
    for (const id of eligible) {
      if (index.nightCapable.has(id)) filtered.add(id);
    }
    eligible = filtered;
  }

  // 3. Filtre déplacement
  if (requiresDeplacement) {
    const filtered = new Set<string>();
    for (const id of eligible) {
      if (index.movable.has(id)) filtered.add(id);
    }
    eligible = filtered;
  }

  return eligible;
}
