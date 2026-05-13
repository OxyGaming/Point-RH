/**
 * Tests d'équivalence stricte entre la boucle séquentielle
 * `injecterJsDansPlanning` et la variante batch `injecterJsListeDansPlanning`
 * (P6).
 *
 * L'invariant à préserver est :
 *   for inj in injections: events = injecterJsDansPlanning(events, inj)
 *     ===
 *   injecterJsListeDansPlanning(events, injections)
 *
 * Le contenu ET l'ordre du résultat doivent être strictement identiques.
 */

import {
  injecterJsDansPlanning,
  injecterJsListeDansPlanning,
} from "@/lib/simulation/candidateFinder";
import type { JsCible, ImpreuvuConfig } from "@/types/js-simulation";
import type { PlanningEvent } from "@/engine/rules";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJs(planningLigneId: string, date: string, heureDebut: string, heureFin: string, codeJs = "GIV001"): JsCible {
  return {
    planningLigneId,
    agentId:        "agt-source",
    agentNom:       "Src",
    agentPrenom:    "A",
    agentMatricule: "S",
    date,
    heureDebut,
    heureFin,
    amplitudeMin:   480,
    codeJs,
    typeJs:         null,
    isNuit:         false,
    importId:       "imp-1",
    flexibilite:    "OBLIGATOIRE",
  };
}

function makeImprevu(heureDebut: string, heureFin: string): ImpreuvuConfig {
  return {
    partiel:         false,
    heureDebutReel:  heureDebut,
    heureFinEstimee: heureFin,
    deplacement:     false,
    remplacement:    true,
  };
}

function makeEvent(
  planningLigneId: string,
  date: string,
  heureDebut: string,
  heureFin: string,
  opts: { jsNpo?: "JS" | "NPO"; codeJs?: string | null } = {},
): PlanningEvent {
  const dateDebut = new Date(date);
  const [hD, mD] = heureDebut.split(":").map(Number);
  dateDebut.setUTCHours(hD, mD, 0, 0);
  const dateFin = new Date(date);
  const [hF, mF] = heureFin.split(":").map(Number);
  dateFin.setUTCHours(hF, mF, 0, 0);
  if (dateFin <= dateDebut) dateFin.setUTCDate(dateFin.getUTCDate() + 1);
  return {
    dateDebut,
    dateFin,
    heureDebut,
    heureFin,
    amplitudeMin: 480,
    dureeEffectiveMin: 480,
    jsNpo: opts.jsNpo ?? "JS",
    codeJs: opts.codeJs ?? "GIV001",
    typeJs: null,
    planningLigneId,
  };
}

/** Simule la boucle séquentielle pour générer la valeur de référence. */
function loopRef(
  events: PlanningEvent[],
  injections: Array<{ jsCible: JsCible; imprevu: ImpreuvuConfig }>,
): PlanningEvent[] {
  let acc = events;
  for (const { jsCible, imprevu } of injections) {
    acc = injecterJsDansPlanning(acc, jsCible, imprevu);
  }
  return acc;
}

/** Compare deux PlanningEvent[] par contenu signifiant ET ordre. */
function eqEvents(a: PlanningEvent[], b: PlanningEvent[]): void {
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i].dateDebut.getTime()).toBe(b[i].dateDebut.getTime());
    expect(a[i].dateFin.getTime()).toBe(b[i].dateFin.getTime());
    expect(a[i].heureDebut).toBe(b[i].heureDebut);
    expect(a[i].heureFin).toBe(b[i].heureFin);
    expect(a[i].jsNpo).toBe(b[i].jsNpo);
    expect(a[i].codeJs).toBe(b[i].codeJs);
    expect(a[i].typeJs).toBe(b[i].typeJs);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("injecterJsListeDansPlanning — équivalence stricte avec la boucle", () => {
  it("0 injection → events strictement inchangé (référence préservée)", () => {
    const events = [
      makeEvent("e1", "2024-03-19", "06:00", "14:00"),
      makeEvent("e2", "2024-03-21", "08:00", "16:00"),
    ];
    const result = injecterJsListeDansPlanning(events, []);
    expect(result).toBe(events); // same reference, no copy
  });

  it("1 injection → identique à injecterJsDansPlanning simple", () => {
    const events = [
      makeEvent("e1", "2024-03-19", "06:00", "14:00"),
      makeEvent("e2", "2024-03-21", "08:00", "16:00"),
    ];
    const js = makeJs("js-20", "2024-03-20", "10:00", "18:00");
    const imp = makeImprevu("10:00", "18:00");

    const ref = injecterJsDansPlanning(events, js, imp);
    const batch = injecterJsListeDansPlanning(events, [{ jsCible: js, imprevu: imp }]);
    eqEvents(batch, ref);
  });

  it("3 injections sans chevauchement → ordre final identique à la boucle", () => {
    const events = [
      makeEvent("e1", "2024-03-18", "06:00", "14:00"),
      makeEvent("e2", "2024-03-25", "08:00", "16:00"),
    ];
    const injections = [
      { jsCible: makeJs("js-20", "2024-03-20", "06:00", "14:00"), imprevu: makeImprevu("06:00", "14:00") },
      { jsCible: makeJs("js-22", "2024-03-22", "08:00", "16:00"), imprevu: makeImprevu("08:00", "16:00") },
      { jsCible: makeJs("js-24", "2024-03-24", "10:00", "18:00"), imprevu: makeImprevu("10:00", "18:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
    // Sanity check ordre chronologique
    expect(batch.map((e) => e.dateDebut.toISOString().slice(0, 10))).toEqual([
      "2024-03-18", "2024-03-20", "2024-03-22", "2024-03-24", "2024-03-25",
    ]);
  });

  it("injection qui chevauche un event JS existant → l'event est viré (batch comme boucle)", () => {
    const events = [
      makeEvent("e1", "2024-03-19", "06:00", "14:00"),
      makeEvent("e2", "2024-03-20", "08:00", "16:00"), // sera viré par l'injection
      makeEvent("e3", "2024-03-21", "10:00", "18:00"),
    ];
    const injections = [
      { jsCible: makeJs("js-20", "2024-03-20", "09:00", "17:00"), imprevu: makeImprevu("09:00", "17:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
    // Le batch doit garder e1, e3, et la JS injectée — pas e2
    expect(batch.map((e) => e.planningLigneId ?? "INJ")).toEqual(["e1", "INJ", "e3"]);
  });

  it("injection chevauche un NPO C → C viré (cohérence GPT)", () => {
    const events = [
      makeEvent("c1", "2024-03-20", "00:00", "23:59", { jsNpo: "NPO", codeJs: "C" }),
      makeEvent("e2", "2024-03-22", "08:00", "16:00"),
    ];
    const injections = [
      { jsCible: makeJs("js-20", "2024-03-20", "08:00", "16:00"), imprevu: makeImprevu("08:00", "16:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
    // C absent, JS présente, e2 présent
    expect(batch.find((e) => e.codeJs === "C")).toBeUndefined();
    expect(batch.find((e) => e.codeJs === "GIV001")).toBeDefined();
  });

  it("injection chevauche un RP (jsNpo=NPO, codeJs non-C) → RP CONSERVÉ (pas un jour travaillé)", () => {
    const events = [
      makeEvent("rp", "2024-03-20", "00:00", "23:59", { jsNpo: "NPO", codeJs: "RP" }),
    ];
    const injections = [
      { jsCible: makeJs("js-20", "2024-03-20", "08:00", "16:00"), imprevu: makeImprevu("08:00", "16:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
    // RP toujours là, JS aussi
    expect(batch.find((e) => e.codeJs === "RP")).toBeDefined();
    expect(batch.find((e) => e.codeJs === "GIV001")).toBeDefined();
  });

  it("CAS PIVOT — 2 injections qui se chevauchent : la dernière gagne (sémantique LIFO préservée)", () => {
    const events = [makeEvent("e1", "2024-03-19", "06:00", "14:00")];
    const injections = [
      { jsCible: makeJs("js-A", "2024-03-20", "08:00", "16:00", "AAA"), imprevu: makeImprevu("08:00", "16:00") },
      { jsCible: makeJs("js-B", "2024-03-20", "10:00", "18:00", "BBB"), imprevu: makeImprevu("10:00", "18:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
    // js-A virée par js-B (la 2ème vire la 1ère dans la boucle ; idem en batch)
    expect(batch.find((e) => e.codeJs === "AAA")).toBeUndefined();
    expect(batch.find((e) => e.codeJs === "BBB")).toBeDefined();
  });

  it("CAS PIVOT — 5 injections dans le désordre temporel → tri final unique cohérent avec la boucle", () => {
    const events = [
      makeEvent("base1", "2024-03-15", "06:00", "14:00"),
      makeEvent("base2", "2024-03-30", "08:00", "16:00"),
    ];
    const injections = [
      { jsCible: makeJs("j25", "2024-03-25", "06:00", "14:00", "J25"), imprevu: makeImprevu("06:00", "14:00") },
      { jsCible: makeJs("j17", "2024-03-17", "08:00", "16:00", "J17"), imprevu: makeImprevu("08:00", "16:00") },
      { jsCible: makeJs("j22", "2024-03-22", "10:00", "18:00", "J22"), imprevu: makeImprevu("10:00", "18:00") },
      { jsCible: makeJs("j19", "2024-03-19", "06:00", "14:00", "J19"), imprevu: makeImprevu("06:00", "14:00") },
      { jsCible: makeJs("j27", "2024-03-27", "08:00", "16:00", "J27"), imprevu: makeImprevu("08:00", "16:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
    // Ordre chronologique strict respecté
    const dates = batch.map((e) => e.dateDebut.toISOString().slice(0, 10));
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("planning réaliste : 3 JS dispersées + base ~10 events → ordre identique", () => {
    const events: PlanningEvent[] = [];
    for (let d = 10; d <= 28; d += 2) {
      events.push(
        makeEvent(
          `base-${d}`,
          `2024-03-${d.toString().padStart(2, "0")}`,
          "06:00",
          "14:00",
        ),
      );
    }
    const injections = [
      { jsCible: makeJs("inj-15", "2024-03-15", "10:00", "18:00", "INJ1"), imprevu: makeImprevu("10:00", "18:00") },
      { jsCible: makeJs("inj-21", "2024-03-21", "10:00", "18:00", "INJ2"), imprevu: makeImprevu("10:00", "18:00") },
      { jsCible: makeJs("inj-27", "2024-03-27", "10:00", "18:00", "INJ3"), imprevu: makeImprevu("10:00", "18:00") },
    ];

    const ref = loopRef(events, injections);
    const batch = injecterJsListeDansPlanning(events, injections);
    eqEvents(batch, ref);
  });
});
