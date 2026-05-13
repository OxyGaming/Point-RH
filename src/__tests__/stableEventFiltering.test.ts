/**
 * Tests du helper de filtrage stable des PlanningEvent (C6).
 *
 * Vérifient que `excludeEvent` :
 *   - filtre par planningLigneId quand disponible (robuste aux clones)
 *   - retombe sur référence pour les events synthétiques sans ID
 *   - ne supprime pas les events qui ont un autre planningLigneId
 *
 * Cas pivot : un event est cloné quelque part dans le pipeline (spread,
 * structuredClone, recopie via {...e}). Référence différente, même
 * planningLigneId. Le filtre par référence (`e !== target`) laissait l'une
 * des deux instances dans la liste — bug silencieux qui faussait les
 * calculs RH (overlap, GPT, repos). Le nouveau filtre par ID supprime
 * exactement la cible métier (et tout clone du même planningLigneId).
 */

import { excludeEvent } from "@/lib/simulation/eventFilter";
import type { PlanningEvent } from "@/engine/rules";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEvent(
  planningLigneId: string | undefined,
  heureDebut: string,
  heureFin: string,
  codeJs: string | null = "GIV001",
): PlanningEvent {
  const dateDebut = new Date("2024-03-20T00:00:00Z");
  const [hD, mD] = heureDebut.split(":").map(Number);
  dateDebut.setUTCHours(hD, mD, 0, 0);
  const dateFin = new Date("2024-03-20T00:00:00Z");
  const [hF, mF] = heureFin.split(":").map(Number);
  dateFin.setUTCHours(hF, mF, 0, 0);
  return {
    dateDebut,
    dateFin,
    heureDebut,
    heureFin,
    amplitudeMin: 480,
    dureeEffectiveMin: 480,
    jsNpo: "JS",
    codeJs,
    typeJs: null,
    planningLigneId,
  };
}

// ─── excludeEvent ─────────────────────────────────────────────────────────────

describe("excludeEvent — filtrage stable par planningLigneId", () => {
  it("filtre par planningLigneId quand disponible sur la cible", () => {
    const a = makeEvent("js-1", "06:00", "14:00");
    const b = makeEvent("js-2", "08:00", "16:00");
    const c = makeEvent("js-3", "10:00", "18:00");

    const result = excludeEvent([a, b, c], b);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.planningLigneId)).toEqual(["js-1", "js-3"]);
  });

  it("CAS PIVOT — supprime l'event ET tous ses clones (même planningLigneId, références différentes)", () => {
    const original = makeEvent("js-1", "06:00", "14:00");
    // Clone : même planningLigneId, mais c'est un objet distinct (===) — par
    // exemple via {...e}, structuredClone, ou recopie manuelle dans une pipeline
    const cloneA = { ...original };
    const cloneB = { ...original };
    const autre = makeEvent("js-2", "08:00", "16:00");

    // Sanity : ce sont bien 4 objets distincts mais 2 IDs métier
    expect(cloneA).not.toBe(original);
    expect(cloneB).not.toBe(original);
    expect(cloneA).not.toBe(cloneB);
    expect(cloneA.planningLigneId).toBe(original.planningLigneId);

    const liste = [original, autre, cloneA, cloneB];

    // L'ancien filtre `e !== original` aurait gardé cloneA + cloneB + autre = 3 items.
    // Le nouveau filtre par ID supprime original + cloneA + cloneB.
    const result = excludeEvent(liste, original);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(autre);
  });

  it("équivalence : excludeEvent(liste, clone) supprime AUSSI l'original (symétrie)", () => {
    const original = makeEvent("js-1", "06:00", "14:00");
    const clone = { ...original };
    const autre = makeEvent("js-2", "08:00", "16:00");

    // Cibler le clone — le filtre par ID supprime quand même l'original
    const result = excludeEvent([original, autre, clone], clone);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(autre);
  });

  it("ne touche pas aux events qui ont un autre planningLigneId", () => {
    const a = makeEvent("js-1", "06:00", "14:00");
    const b = makeEvent("js-2", "08:00", "16:00");

    const result = excludeEvent([a, b], a);

    expect(result).toHaveLength(1);
    expect(result[0].planningLigneId).toBe("js-2");
  });

  it("cible sans planningLigneId → fallback identité de référence (comportement legacy)", () => {
    // Event synthétique (ex: JS injectée par injecterJsDansPlanning) — pas d'ID DB
    const synthetique = makeEvent(undefined, "10:00", "18:00", "SYNTH");
    const persiste = makeEvent("js-1", "06:00", "14:00");

    const result = excludeEvent([synthetique, persiste], synthetique);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(persiste);
  });

  it("cible sans ID + clone du synthétique → le clone reste (fallback strict par référence)", () => {
    // Sans planningLigneId, le filtrage tombe sur la référence — un clone du
    // synthétique n'est pas considéré comme la même cible. Ce comportement est
    // intentionnel : sans ID il n'y a aucune identité métier sur laquelle
    // s'appuyer.
    const synthetique = makeEvent(undefined, "10:00", "18:00", "SYNTH");
    const cloneSynthetique = { ...synthetique };

    const result = excludeEvent([synthetique, cloneSynthetique], synthetique);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(cloneSynthetique);
  });

  it("liste vide → liste vide", () => {
    const a = makeEvent("js-1", "06:00", "14:00");
    expect(excludeEvent([], a)).toEqual([]);
  });

  it("cible absente de la liste → liste inchangée (par valeurs)", () => {
    const a = makeEvent("js-1", "06:00", "14:00");
    const b = makeEvent("js-2", "08:00", "16:00");
    const cible = makeEvent("js-99", "20:00", "22:00");

    const result = excludeEvent([a, b], cible);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.planningLigneId)).toEqual(["js-1", "js-2"]);
  });
});
