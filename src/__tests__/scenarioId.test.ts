/**
 * Tests du helper d'identifiant de scénario.
 *
 * Couvre l'unicité (anti-doublons) et le format attendu.
 * Régression visée : `scenarioCounter` global qui produisait des IDs identiques
 * entre les passes "sansFigeage" et "avecFigeage" du single-JS.
 */

import { generateScenarioId } from "@/lib/simulation/scenarioId";

describe("generateScenarioId", () => {
  it("retourne une chaîne au format scenario-<base36>-<rand>", () => {
    const id = generateScenarioId();
    expect(id).toMatch(/^scenario-[0-9a-z]+-[0-9a-z]{1,5}$/);
  });

  it("produit des IDs distincts sur 1000 appels successifs (synchrone)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateScenarioId());
    }
    // Tolérance théorique : Math.random() peut collisionner, mais sur 1000
    // appels avec timestamp+rand5 c'est < 1/100M en pratique.
    expect(ids.size).toBe(1000);
  });

  it("produit des IDs distincts entre deux appels en série rapprochée", () => {
    // Régression directe du bug scenarioCounter : sansFigeage puis avecFigeage
    // produisaient les mêmes IDs (scenario-1, scenario-2…).
    const idsBatch1 = Array.from({ length: 5 }, () => generateScenarioId());
    const idsBatch2 = Array.from({ length: 5 }, () => generateScenarioId());
    const all = new Set([...idsBatch1, ...idsBatch2]);
    expect(all.size).toBe(10);
  });
});
