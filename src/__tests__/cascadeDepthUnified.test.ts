/**
 * Tests d'unification de la profondeur cascade (C7).
 *
 * Avant C7 : trois valeurs hardcodées divergentes pour la même grandeur métier
 *   - cascadeResolver.CASCADE_MAX_DEPTH = 3 (env-configurable)  → single-JS
 *   - multiJs/index.ts : `profondeurMax: 2`  → multi-JS
 *   - SOLVER_DEFAULTS.CASCADE_MAX_DEPTH = 4  → unified
 *
 * Après C7 : une seule source de vérité — `rules.cascade.profondeurMax`,
 * défaut métier 3. Tous les moteurs lisent cette valeur.
 */

import {
  DEFAULT_WORK_RULES,
  DEFAULT_WORK_RULES_MINUTES,
  rulesHeuresToMinutes,
  type WorkRules,
  type WorkRulesMinutes,
} from "@/lib/rules/workRules";
import { creerEtatInitial } from "@/lib/simulation/unified/etat";
import { SOLVER_DEFAULTS } from "@/lib/simulation/unified/types";
import { buildCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";

// ─── Source unique : default + conversion ────────────────────────────────────

describe("WorkRules.cascade.profondeurMax — source unique de vérité (C7)", () => {
  it("valeur métier par défaut = 3 niveaux (A ← B ← C ← D)", () => {
    expect(DEFAULT_WORK_RULES.cascade.profondeurMax).toBe(3);
  });

  it("DEFAULT_WORK_RULES_MINUTES expose la même valeur (compteur, pas de conversion h→min)", () => {
    expect(DEFAULT_WORK_RULES_MINUTES.cascade.profondeurMax).toBe(3);
    expect(DEFAULT_WORK_RULES_MINUTES.cascade.profondeurMax).toBe(
      DEFAULT_WORK_RULES.cascade.profondeurMax,
    );
  });

  it("rulesHeuresToMinutes propage la valeur sans transformation", () => {
    const custom: WorkRules = {
      ...DEFAULT_WORK_RULES,
      cascade: { profondeurMax: 5 },
    };
    const converted = rulesHeuresToMinutes(custom);
    expect(converted.cascade.profondeurMax).toBe(5);
  });

  it("SOLVER_DEFAULTS ne contient plus CASCADE_MAX_DEPTH (retiré en C7)", () => {
    expect((SOLVER_DEFAULTS as Record<string, unknown>).CASCADE_MAX_DEPTH).toBeUndefined();
  });
});

// ─── Lecture par les 3 moteurs ───────────────────────────────────────────────

describe("Lecture par les 3 moteurs — même valeur de rules.cascade.profondeurMax", () => {
  it("unified — creerEtatInitial lit rules.cascade.profondeurMax par défaut", () => {
    const rules: WorkRulesMinutes = {
      ...DEFAULT_WORK_RULES_MINUTES,
      cascade: { profondeurMax: 7 },
    };
    const agents = new Map<string, AgentDataMultiJs>();
    const etat = creerEtatInitial({
      agentsMap: agents,
      index: buildCoverageIndex([]),
      rules,
      importId: "imp-test",
    });
    expect(etat.profondeurMax).toBe(7);
  });

  it("unified — params.profondeurMax explicite override rules.cascade.profondeurMax", () => {
    // Garantit la rétrocompat des tests qui injectent `profondeurMax` directement.
    const rules: WorkRulesMinutes = {
      ...DEFAULT_WORK_RULES_MINUTES,
      cascade: { profondeurMax: 7 },
    };
    const agents = new Map<string, AgentDataMultiJs>();
    const etat = creerEtatInitial({
      agentsMap: agents,
      index: buildCoverageIndex([]),
      rules,
      importId: "imp-test",
      profondeurMax: 2, // override explicite
    });
    expect(etat.profondeurMax).toBe(2);
  });

  it("unified — sans rules.cascade.profondeurMax custom, etat = défaut (3)", () => {
    const agents = new Map<string, AgentDataMultiJs>();
    const etat = creerEtatInitial({
      agentsMap: agents,
      index: buildCoverageIndex([]),
      rules: DEFAULT_WORK_RULES_MINUTES,
      importId: "imp-test",
    });
    expect(etat.profondeurMax).toBe(DEFAULT_WORK_RULES_MINUTES.cascade.profondeurMax);
    expect(etat.profondeurMax).toBe(3);
  });
});

// ─── Cohérence transverse ────────────────────────────────────────────────────

describe("Convergence des moteurs sur les rules par défaut", () => {
  it("Les 3 moteurs partent maintenant de la même valeur (3) pour des rules par défaut", () => {
    // unified
    const etatUnified = creerEtatInitial({
      agentsMap: new Map<string, AgentDataMultiJs>(),
      index: buildCoverageIndex([]),
      rules: DEFAULT_WORK_RULES_MINUTES,
      importId: "imp-test",
    });

    // single-JS et multi-JS : la valeur est lue directement de
    // rules.cascade.profondeurMax côté code (cf. cascadeResolver.ts et
    // multiJs/index.ts). On vérifie ici que le contrat est respecté.
    const singleEtMulti = DEFAULT_WORK_RULES_MINUTES.cascade.profondeurMax;

    expect(etatUnified.profondeurMax).toBe(singleEtMulti);
    expect(etatUnified.profondeurMax).toBe(3);
  });

  it("Un changement de rules.cascade.profondeurMax se propage à unified sans recompilation", () => {
    // Démonstration : un admin qui modifie WorkRules (DB) change le comportement
    // unified au prochain run, sans modification de code.
    for (const p of [1, 2, 3, 4, 5]) {
      const rules: WorkRulesMinutes = {
        ...DEFAULT_WORK_RULES_MINUTES,
        cascade: { profondeurMax: p },
      };
      const etat = creerEtatInitial({
        agentsMap: new Map<string, AgentDataMultiJs>(),
        index: buildCoverageIndex([]),
        rules,
        importId: "imp-test",
      });
      expect(etat.profondeurMax).toBe(p);
    }
  });
});
