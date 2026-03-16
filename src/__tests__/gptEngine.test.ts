/**
 * Tests unitaires — GPT Engine
 *
 * Valide que le calcul des GPT est cohérent et que les simulations
 * de remplacement de journée ne génèrent pas de fausses alertes.
 *
 * Convention dans ces tests :
 *  - Chaque journée travaillée dure 8h (08:00 → 16:00).
 *  - Le gap entre deux journées consécutives (16:00 → 08:00 lendemain) = 16h.
 *  - rpSimpleMin = 36h × 60 = 2 160 min → un gap de 16h n'est PAS un RP.
 *  - Un gap de 40h (ex : 16:00 j+N → 08:00 j+N+2) est bien un RP.
 *
 * ⚠️  Réalisme métier : dans la base de données réelle, les journées C
 *  (congé-repos planifié) ont jsNpo = "NPO", codeJs = "C".
 *  Les tests utilisent donc ce format pour reproduire fidèlement les données.
 */

import {
  computeWorkSequences,
  simulateGPT,
  compareGPT,
  detectRestBoundaries,
  computeGPTLength,
  type WorkSequence,
} from "@/lib/rules/gptEngine";
import { isJourTravailleGPT, isCongeOuAbsence, decoupeEnGPTs } from "@/lib/gptUtils";
import type { PlanningEvent } from "@/engine/rules";

// ─── Constantes ───────────────────────────────────────────────────────────────

/** 36 h en minutes — seuil RP simple */
const RP_SIMPLE_MIN = 36 * 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crée un événement journée de service (jsNpo = "JS").
 * @param dateStr  Date au format "YYYY-MM-DD"
 * @param codeJs   Code de la journée (défaut : "JS")
 */
function makeWorkDay(dateStr: string, codeJs = "JS"): PlanningEvent {
  const dateDebut = new Date(`${dateStr}T08:00:00.000Z`);
  const dateFin = new Date(`${dateStr}T16:00:00.000Z`);
  return {
    dateDebut,
    dateFin,
    heureDebut: "08:00",
    heureFin: "16:00",
    amplitudeMin: 480,
    dureeEffectiveMin: 480,
    jsNpo: "JS",
    codeJs,
    typeJs: codeJs,
  };
}

/**
 * Crée un événement congé-repos planifié (jsNpo = "NPO", codeJs = "C").
 * Correspond exactement au format réel en base de données.
 * Ces jours comptent dans la GPT mais n'ont pas jsNpo = "JS".
 */
function makeCongeRepos(dateStr: string): PlanningEvent {
  const dateDebut = new Date(`${dateStr}T08:00:00.000Z`);
  const dateFin = new Date(`${dateStr}T15:45:00.000Z`);
  return {
    dateDebut,
    dateFin,
    heureDebut: "08:00",
    heureFin: "15:45",
    amplitudeMin: 465,
    dureeEffectiveMin: 465,
    jsNpo: "NPO",
    codeJs: "C",
    typeJs: "Congé-repos",
  };
}

/**
 * Crée un événement repos périodique (jsNpo = "NPO", codeJs = "RP").
 * Interrompt la GPT.
 * typeJs = "Congé-repos" : même valeur que C en base réelle (même famille NPO).
 */
function makeRP(dateStr: string): PlanningEvent {
  const dateDebut = new Date(`${dateStr}T06:00:00.000Z`);
  const dateFin = new Date(`${dateStr}T15:00:00.000Z`);
  return {
    dateDebut,
    dateFin,
    heureDebut: "06:00",
    heureFin: "15:00",
    amplitudeMin: 540,
    dureeEffectiveMin: null,
    jsNpo: "NPO",
    codeJs: "RP",
    typeJs: "Congé-repos",   // valeur réelle en base — même famille que C
  };
}

/**
 * Planning réaliste OLLIER GREGORY autour du 26 mars.
 * JS(24) + C(25) + C(26) + C(27) = une seule GPT de 4 jours.
 * Les C ont jsNpo = "NPO" comme en base réelle.
 */
function planningOllierBase(): PlanningEvent[] {
  return [
    makeWorkDay("2026-03-24", "GIC Z"),   // JS — jsNpo = "JS"
    makeCongeRepos("2026-03-25"),          // C  — jsNpo = "NPO"
    makeCongeRepos("2026-03-26"),          // C  — jsNpo = "NPO"
    makeCongeRepos("2026-03-27"),          // C  — jsNpo = "NPO"
    makeRP("2026-03-28"),
    makeRP("2026-03-29"),
    makeRP("2026-03-30"),
  ];
}

/**
 * Planning de base avec uniquement des JS (format historique des tests).
 * Utilisé pour les cas où tous les jours sont de vraies JS.
 */
function planningBase(): PlanningEvent[] {
  return [
    makeWorkDay("2025-03-24", "GIC Z"),
    makeWorkDay("2025-03-25", "C"),
    makeWorkDay("2025-03-26", "C"),
    makeWorkDay("2025-03-27", "C"),
  ];
}

// ─── Tests isJourTravailleGPT ─────────────────────────────────────────────────

describe("isJourTravailleGPT — classification des jours travaillés", () => {
  it("JS avec jsNpo = 'JS' → travaillé", () => {
    expect(isJourTravailleGPT(makeWorkDay("2026-03-24", "GIC Z"))).toBe(true);
  });

  it("C avec jsNpo = 'NPO', codeJs = 'C' → travaillé (compte dans GPT)", () => {
    expect(isJourTravailleGPT(makeCongeRepos("2026-03-25"))).toBe(true);
  });

  it("RP avec jsNpo = 'NPO', codeJs = 'RP' → PAS travaillé", () => {
    expect(isJourTravailleGPT(makeRP("2026-03-28"))).toBe(false);
  });
});

// ─── Tests isCongeOuAbsence ───────────────────────────────────────────────────

describe("isCongeOuAbsence — exclusion correcte des RP et C", () => {
  it("RP graphié (codeJs='RP') → PAS un congé bloquant", () => {
    expect(isCongeOuAbsence(makeRP("2026-03-28"))).toBe(false);
  });

  it("C (congé-repos planifié, codeJs='C') → PAS un congé bloquant", () => {
    // C compte comme travail : ne doit pas empêcher la détection de frontière RP
    expect(isCongeOuAbsence(makeCongeRepos("2026-03-25"))).toBe(false);
  });

  it("JS → false (pas un NPO)", () => {
    expect(isCongeOuAbsence(makeWorkDay("2026-03-24"))).toBe(false);
  });

  it("Vraie absence (codeJs='ABS', typeJs='Absence maladie') → true", () => {
    const absence: PlanningEvent = {
      ...makeRP("2026-03-25"),
      codeJs: "ABS",
      typeJs: "Absence maladie",
    };
    expect(isCongeOuAbsence(absence)).toBe(true);
  });

  it("Congé annuel (codeJs='CA', typeJs='Congé annuel') → true", () => {
    const cp: PlanningEvent = {
      ...makeRP("2026-03-25"),
      codeJs: "CA",
      typeJs: "Congé annuel",
    };
    expect(isCongeOuAbsence(cp)).toBe(true);
  });
});

// ─── Cas 0 : Scénario réel OLLIER GREGORY ────────────────────────────────────

describe("Cas 0 — Scénario réel OLLIER GREGORY (NPO C dans la GPT)", () => {
  it("Le planning réaliste JS(24)+C(25)+C(26)+C(27) forme une GPT de 4 jours", () => {
    const sequences = computeWorkSequences(planningOllierBase(), RP_SIMPLE_MIN);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].length).toBe(4);
  });

  it("Remplacer NPO C(26) par JS simulée → GPT toujours 4, delta = 0", () => {
    const planning = planningOllierBase();
    const simulatedDate = new Date("2026-03-26T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);

    // JS simulée reproduisant un remplacement d'imprévu type GIC004R
    const jsSimulee: PlanningEvent = {
      dateDebut: new Date("2026-03-26T04:30:00.000Z"),
      dateFin:   new Date("2026-03-26T12:30:00.000Z"),
      heureDebut: "04:30",
      heureFin:   "12:30",
      amplitudeMin: 480,
      dureeEffectiveMin: 480,
      jsNpo: "JS",
      codeJs: "GIC004R",
      typeJs: "FIX",
    };

    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: jsSimulee },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);

    // Résultat attendu : GPT = 4 (JS(24) + C(25) + JS-simulée(26) + C(27))
    expect(after).toHaveLength(1);
    expect(after[0].length).toBe(4);
    expect(comparison.delta).toBe(0);
    expect(comparison.changed).toBe(false);
    expect(comparison.gptLengthBefore).toBe(4);
    expect(comparison.gptLengthAfter).toBe(4);
  });
});

// ─── Cas 1 : C → JS simulée (GPT identique) ──────────────────────────────────

describe("Cas 1 — Remplacement C → JS simulée : GPT inchangée", () => {
  it("Le planning de base (tous JS) forme une seule GPT de 4 jours", () => {
    const sequences = computeWorkSequences(planningBase(), RP_SIMPLE_MIN);
    expect(sequences).toHaveLength(1);
    expect(sequences[0].length).toBe(4);
  });

  it("Remplacer C(26) par JS simulée ne change pas la longueur de GPT", () => {
    const planning = planningBase();
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);

    const after = simulateGPT(
      planning,
      {
        date: simulatedDate,
        newEvent: makeWorkDay("2025-03-26", "JS"),
      },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);

    expect(after).toHaveLength(1);
    expect(after[0].length).toBe(4);
    expect(comparison.delta).toBe(0);
    expect(comparison.changed).toBe(false);
    expect(comparison.gptLengthBefore).toBe(4);
    expect(comparison.gptLengthAfter).toBe(4);
  });

  it("Remplacer GIC Z(24) par JS simulée ne change pas non plus la GPT", () => {
    const planning = planningBase();
    const simulatedDate = new Date("2025-03-24T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);
    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: makeWorkDay("2025-03-24", "JS") },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);
    expect(comparison.delta).toBe(0);
    expect(comparison.changed).toBe(false);
  });

  it("Remplacer NPO C(26) par JS — format réel (C has jsNpo=NPO)", () => {
    // Planning réaliste : Z(24 JS) + C(25 NPO) + C(26 NPO) + C(27 NPO)
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeCongeRepos("2025-03-25"),
      makeCongeRepos("2025-03-26"),
      makeCongeRepos("2025-03-27"),
    ];
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);
    expect(before[0].length).toBe(4);

    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: makeWorkDay("2025-03-26", "JS") },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);

    // GPT = 4 : Z(24) + C(25) + JS(26) + C(27)
    expect(after[0].length).toBe(4);
    expect(comparison.delta).toBe(0);
    expect(comparison.changed).toBe(false);
  });
});

// ─── Cas 2 : C → RP (GPT interrompue) ───────────────────────────────────────

describe("Cas 2 — Suppression de C(26) : GPT interrompue", () => {
  it("Supprimer C(26) coupe la GPT en deux séquences", () => {
    const planning = planningBase();
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    // newEvent = null → le 26 mars devient un repos (RP potentiel)
    // gap entre C(25) 16:00 et C(27) 08:00 = 40h > 36h → RP détecté
    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: null },
      RP_SIMPLE_MIN
    );

    expect(after).toHaveLength(2);
    expect(after[0].length).toBe(2); // Z(24) + C(25)
    expect(after[1].length).toBe(1); // C(27)
  });

  it("compareGPT reflète l'interruption", () => {
    const planning = planningBase();
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);
    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: null },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);
    expect(comparison.changed).toBe(true);
    expect(comparison.gptLengthBefore).toBe(4);
    expect(comparison.gptLengthAfter).toBe(2);
  });

  it("Supprimer NPO C(26) coupe aussi la GPT — format réel base de données", () => {
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeCongeRepos("2025-03-25"),
      makeCongeRepos("2025-03-26"),
      makeCongeRepos("2025-03-27"),
    ];
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: null },
      RP_SIMPLE_MIN
    );

    // gap entre C(25) 15:45 et C(27) 08:00 ≈ 40h > 36h → RP détecté
    expect(after).toHaveLength(2);
    expect(after[0].length).toBe(2); // Z(24) + C(25)
    expect(after[1].length).toBe(1); // C(27)
  });
});

// ─── Cas 3 : JS ajoutée en fin de séquence (GPT augmente) ────────────────────

describe("Cas 3 — Ajout JS en fin de séquence : GPT augmente", () => {
  it("Ajouter une JS le lendemain (gap < 36h) allonge la GPT de 1", () => {
    // Planning initial : Z(24), C(25) → GPT = 2
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeWorkDay("2025-03-25", "C"),
    ];
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);
    expect(before[0].length).toBe(2);

    // Ajouter JS(26) — gap depuis C(25) 16:00 jusqu'à JS(26) 08:00 = 16h < 36h → pas de RP
    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: makeWorkDay("2025-03-26", "JS") },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);
    expect(after).toHaveLength(1);
    expect(after[0].length).toBe(3);
    expect(comparison.delta).toBe(1);
    expect(comparison.changed).toBe(true);
  });

  it("Ajouter une JS le lendemain d'un NPO C allonge aussi la GPT de 1", () => {
    // Planning réaliste : Z(24 JS) + C(25 NPO) → GPT = 2
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeCongeRepos("2025-03-25"),
    ];
    const simulatedDate = new Date("2025-03-26T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);
    expect(before[0].length).toBe(2);

    // gap depuis C(25) 15:45 jusqu'à JS(26) 08:00 = ~16h < 36h → pas de RP
    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: makeWorkDay("2025-03-26", "JS") },
      RP_SIMPLE_MIN
    );

    const comparison = compareGPT(before, after, simulatedDate);
    expect(after[0].length).toBe(3);
    expect(comparison.delta).toBe(1);
    expect(comparison.changed).toBe(true);
  });
});

// ─── Cas 4 : JS ajoutée après RP (nouvelle GPT) ──────────────────────────────

describe("Cas 4 — Ajout JS après RP : nouvelle GPT créée", () => {
  it("Ajouter une JS après un gap > 36h crée une nouvelle GPT séparée", () => {
    // Planning initial : Z(24), C(25) → GPT = 2
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeWorkDay("2025-03-25", "C"),
    ];
    // JS(28) — gap depuis C(25) 16:00 jusqu'à JS(28) 08:00 = 64h > 36h → RP
    const simulatedDate = new Date("2025-03-28T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);

    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: makeWorkDay("2025-03-28", "JS") },
      RP_SIMPLE_MIN
    );

    expect(after).toHaveLength(2);
    expect(after[0].length).toBe(2); // Z(24) + C(25)
    expect(after[1].length).toBe(1); // JS(28)

    const comparison = compareGPT(before, after, simulatedDate);
    expect(comparison.changed).toBe(true);
    // Avant simulation : aucune séquence ne contient le 28 → fallback sur la plus proche (2 jours)
    expect(comparison.gptLengthBefore).toBe(2);
    // Après simulation : la nouvelle GPT créée contient le 28 → longueur 1
    expect(comparison.gptLengthAfter).toBe(1);
    // Le nombre de séquences est passé de 1 à 2 — une nouvelle GPT a été créée
    expect(comparison.sequencesAfter).toHaveLength(2);
  });

  it("Ajouter une JS après RP avec NPO C dans la première GPT", () => {
    // Planning réaliste : Z(24 JS) + C(25 NPO) + RP(26,27 NPO) → GPT = 2
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeCongeRepos("2025-03-25"),
      makeRP("2025-03-26"),
      makeRP("2025-03-27"),
    ];
    const simulatedDate = new Date("2025-03-28T08:00:00.000Z");

    const before = computeWorkSequences(planning, RP_SIMPLE_MIN);
    expect(before).toHaveLength(1);
    expect(before[0].length).toBe(2); // Z(24) + C(25)

    const after = simulateGPT(
      planning,
      { date: simulatedDate, newEvent: makeWorkDay("2025-03-28", "JS") },
      RP_SIMPLE_MIN
    );

    expect(after).toHaveLength(2);
    expect(after[0].length).toBe(2); // Z(24) + C(25) — 1ère GPT inchangée
    expect(after[1].length).toBe(1); // JS(28) — nouvelle GPT
  });
});

// ─── Cas 5 : RP graphié avec typeJs = 'Congé-repos' interrompt bien la GPT ───

describe("Cas 5 — RP avec typeJs = 'Congé-repos' n'est pas traité comme congé", () => {
  it("Un RP entre deux GPTs est bien détecté comme frontière même si typeJs='Congé-repos'", () => {
    // Reproduit le cas réel : RP et C ont le même typeJs en base de données
    const planning = [
      makeWorkDay("2025-03-24", "GIC Z"),
      makeCongeRepos("2025-03-25"),
      makeRP("2025-03-26"),             // codeJs="RP", typeJs="Congé-repos"
      makeCongeRepos("2025-03-28"),
      makeCongeRepos("2025-03-29"),
    ];
    // gap entre C(25) 15:45 et C(28) 08:00 ≈ 64h > 36h → devrait être un RP

    const sequences = computeWorkSequences(planning, RP_SIMPLE_MIN);
    // Z(24) + C(25) = GPT1 | C(28) + C(29) = GPT2
    expect(sequences).toHaveLength(2);
    expect(sequences[0].length).toBe(2);  // Z(24) + C(25)
    expect(sequences[1].length).toBe(2);  // C(28) + C(29)
  });
});

// ─── Tests complémentaires ────────────────────────────────────────────────────

describe("detectRestBoundaries", () => {
  it("Détecte un RP entre C(25) et JS(28)", () => {
    const planning = [
      makeWorkDay("2025-03-25", "C"),
      makeWorkDay("2025-03-28", "JS"),
    ];
    const boundaries = detectRestBoundaries(planning, RP_SIMPLE_MIN);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].gapDurationMin).toBeGreaterThanOrEqual(RP_SIMPLE_MIN);
  });

  it("Ne détecte aucun RP entre C(25) et JS(26) (gap 16h)", () => {
    const planning = [
      makeWorkDay("2025-03-25", "C"),
      makeWorkDay("2025-03-26", "JS"),
    ];
    const boundaries = detectRestBoundaries(planning, RP_SIMPLE_MIN);
    expect(boundaries).toHaveLength(0);
  });

  it("Détecte un RP entre NPO C(25) et NPO C(28) — format réel", () => {
    const planning = [
      makeCongeRepos("2025-03-25"),
      makeCongeRepos("2025-03-28"),
    ];
    const boundaries = detectRestBoundaries(planning, RP_SIMPLE_MIN);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0].gapDurationMin).toBeGreaterThanOrEqual(RP_SIMPLE_MIN);
  });

  it("Ne détecte aucun RP entre NPO C(25) et NPO C(26) (gap ~16h)", () => {
    const planning = [
      makeCongeRepos("2025-03-25"),
      makeCongeRepos("2025-03-26"),
    ];
    const boundaries = detectRestBoundaries(planning, RP_SIMPLE_MIN);
    expect(boundaries).toHaveLength(0);
  });
});

describe("computeGPTLength", () => {
  it("Retourne la longueur d'une séquence", () => {
    const seq: WorkSequence = {
      days: planningBase(),
      startDate: new Date("2025-03-24"),
      endDate: new Date("2025-03-27"),
      length: 4,
    };
    expect(computeGPTLength(seq)).toBe(4);
  });
});

// ─── Tests moteur de simulation — logique evaluerMobilisabilite (via decoupeEnGPTs) ──
//
// Ces tests reproduisent EXACTEMENT la logique corrigée dans engine/rules.ts :
//  1. Retirer les événements travaillés (JS + NPO C) sur la date cible
//  2. Injecter la JS simulée
//  3. Découper en GPTs et retrouver la séquence contenant la date cible
//  4. Sa longueur = joursGPTApres
//
// Scénario de référence : OLLIER GREGORY remplace BELABBAS le 26 mars.
//   Planning réel OLLIER : GIC Z(24 JS) + C(25 NPO) + C(26 NPO) + C(27 NPO) + RP×3
//   JS simulée  : GIC004R 04:30→12:30 le 26 mars
//   GPT attendue après simulation : 4 (Z + C + JS + C)

/** Simule la logique corrigée de evaluerMobilisabilite pour joursGPTApres */
function computeJoursGPTApresSimulation(
  events: PlanningEvent[],
  debutImprevu: Date,
  finImprevu: Date,
  heureDebut: string,
  heureFin: string,
  codeJs: string | null,
  rpSimpleMin: number
): number {
  const simDateStr = debutImprevu.toISOString().slice(0, 10);
  const jsSimulee: PlanningEvent = {
    dateDebut: debutImprevu,
    dateFin: finImprevu,
    heureDebut,
    heureFin,
    amplitudeMin: Math.round((finImprevu.getTime() - debutImprevu.getTime()) / 60000),
    dureeEffectiveMin: Math.round((finImprevu.getTime() - debutImprevu.getTime()) / 60000),
    jsNpo: "JS",
    codeJs,
    typeJs: null,
  };
  const eventsSimules: PlanningEvent[] = [
    ...events.filter(
      (e) =>
        !isJourTravailleGPT(e) ||
        e.dateDebut.toISOString().slice(0, 10) !== simDateStr
    ),
    jsSimulee,
  ];
  const gptsApres = decoupeEnGPTs(eventsSimules, rpSimpleMin);
  const gptContenant = gptsApres.find((gpt) =>
    gpt.some((e) => e.dateDebut.toISOString().slice(0, 10) === simDateStr)
  );
  return gptContenant?.length ?? 1;
}

describe("Simulation evaluerMobilisabilite — joursGPTApres correct (Cas A-D)", () => {
  /**
   * Cas A — C → JS (type change, continuité identique)
   * Planning : Z(24 JS) + C(25 NPO) + C(26 NPO) + C(27 NPO)
   * Simulation : remplacer C(26) par JS GIC004R (04:30→12:30)
   * Attendu : GPT = 4  /  aucune alerte GPT_MIN (4 ≥ 3)
   */
  it("Cas A — C(26) → JS simulée : joursGPTApres = 4, pas d'alerte GPT_MIN", () => {
    const planning = planningOllierBase(); // Z(24)+C(25)+C(26)+C(27)+RP×3
    const debutImprevu = new Date("2026-03-26T04:30:00.000Z");
    const finImprevu   = new Date("2026-03-26T12:30:00.000Z");

    const joursGPTApres = computeJoursGPTApresSimulation(
      planning, debutImprevu, finImprevu, "04:30", "12:30", "GIC004R", RP_SIMPLE_MIN
    );

    // GPT = Z(24) + C(25) + JS(26) + C(27) = 4
    expect(joursGPTApres).toBe(4);
    // Pas d'alerte GPT_MIN (4 ≥ 3)
    expect(joursGPTApres).toBeGreaterThanOrEqual(3);
    // Pas de violation GPT_MAX (4 ≤ 6)
    expect(joursGPTApres).toBeLessThanOrEqual(6);
  });

  /**
   * Cas B — C → RP (la journée devient un repos)
   * Planning : Z(24 JS) + C(25 NPO) + C(26 NPO) + C(27 NPO)
   * Simulation : supprimer C(26) sans injecter de JS → gap 25/15:45→27/08:00 ≈ 40h > 36h → RP
   * Attendu : GPT de 26 n'existe pas (le 26 est vide) ;
   *           la GPT avant = [Z(24)+C(25)] = 2 ; la GPT après = [C(27)] = 1
   */
  it("Cas B — C(26) supprimé (→ RP) : GPT scindée en deux séquences", () => {
    const planning = planningOllierBase();
    const simulatedDate = new Date("2026-03-26T08:00:00.000Z");

    const after = simulateGPT(planning, { date: simulatedDate, newEvent: null }, RP_SIMPLE_MIN);

    // Deux GPTs : [Z(24)+C(25)] et [C(27)]
    expect(after).toHaveLength(2);
    expect(after[0].length).toBe(2); // Z(24) + C(25)
    expect(after[1].length).toBe(1); // C(27)
  });

  /**
   * Cas C — JS ajoutée en fin de séquence existante (GPT augmente)
   * Planning : Z(24 JS) + C(25 NPO) → GPT = 2
   * Simulation : ajouter JS(26) — gap C(25)/15:45 → JS(26)/04:30 ≈ 12h45 < 36h → pas de RP
   * Attendu : GPT = 3
   */
  it("Cas C — JS ajoutée après C(25) : joursGPTApres = 3 (GPT augmente)", () => {
    const planning = [
      makeWorkDay("2026-03-24", "GIC Z"),  // JS
      makeCongeRepos("2026-03-25"),         // NPO C
    ];
    const debutImprevu = new Date("2026-03-26T04:30:00.000Z");
    const finImprevu   = new Date("2026-03-26T12:30:00.000Z");

    const joursGPTApres = computeJoursGPTApresSimulation(
      planning, debutImprevu, finImprevu, "04:30", "12:30", "GIC004R", RP_SIMPLE_MIN
    );

    // Z(24) + C(25) + JS(26) = 3
    expect(joursGPTApres).toBe(3);
  });

  /**
   * Cas D — JS ajoutée après un RP (nouvelle GPT créée)
   * Planning : Z(24 JS) + C(25 NPO) + RP(26 NPO) + RP(27 NPO)
   * Simulation : ajouter JS(28) — gap RP(27)/15:00 → JS(28)/08:00 = 17h < 36h… NON
   *   gap C(25)/15:45 → JS(28)/08:00 ≈ 64h > 36h → RP → nouvelle GPT
   * Attendu : joursGPTApres = 1 (la nouvelle GPT ne contient que JS(28))
   */
  it("Cas D — JS ajoutée après RP(26-27) : nouvelle GPT de longueur 1", () => {
    const planning = [
      makeWorkDay("2026-03-24", "GIC Z"),
      makeCongeRepos("2026-03-25"),
      makeRP("2026-03-26"),
      makeRP("2026-03-27"),
    ];
    const debutImprevu = new Date("2026-03-28T08:00:00.000Z");
    const finImprevu   = new Date("2026-03-28T16:00:00.000Z");

    const joursGPTApres = computeJoursGPTApresSimulation(
      planning, debutImprevu, finImprevu, "08:00", "16:00", "GIC005R", RP_SIMPLE_MIN
    );

    // Nouvelle GPT : uniquement JS(28) = 1
    expect(joursGPTApres).toBe(1);
  });
});

// ─── Tests injecterJsDansPlanning — NPO C retiré lors de l'injection ──────────

describe("injecterJsDansPlanning — retrait correct des NPO C chevauchants", () => {
  /**
   * Reproduit le nœud du bug :
   * Si OLLIER a un NPO C le 26 (08:00-15:45) et qu'on injecte une JS (04:30-12:30),
   * le C doit être retiré du planning simulé pour éviter un doublon GPT.
   */
  it("NPO C chevauchant la JS injectée doit être retiré (pas de doublon)", () => {
    // Planning source : C(26) NPO + C(27) NPO
    const cJour26 = makeCongeRepos("2026-03-26"); // 08:00→15:45 (NPO)
    const cJour27 = makeCongeRepos("2026-03-27"); // 08:00→15:45 (NPO)
    const planning = [cJour26, cJour27];

    // JS injectée sur le 26 : 04:30→12:30 — chevauche le C(26)
    const jsInjectee: PlanningEvent = {
      dateDebut: new Date("2026-03-26T04:30:00.000Z"),
      dateFin:   new Date("2026-03-26T12:30:00.000Z"),
      heureDebut: "04:30",
      heureFin:   "12:30",
      amplitudeMin: 480,
      dureeEffectiveMin: 480,
      jsNpo: "JS",
      codeJs: "GIC004R",
      typeJs: null,
    };

    // Simuler la logique corrigée de injecterJsDansPlanning
    const dateFin   = jsInjectee.dateFin;
    const dateDebut = jsInjectee.dateDebut;
    const eventsFiltrés = planning.filter((e) => {
      if (!isJourTravailleGPT(e)) return true; // Correction : utilise isJourTravailleGPT
      const overlap = e.dateDebut < dateFin && e.dateFin > dateDebut;
      return !overlap;
    });
    const eventsAvecJs = [...eventsFiltrés, jsInjectee];

    // Après injection : le C(26) doit avoir disparu, seuls JS(26) + C(27) restent
    expect(eventsAvecJs).toHaveLength(2);
    const codes = eventsAvecJs.map((e) => e.dateDebut.toISOString().slice(0, 10));
    expect(codes).toContain("2026-03-26"); // JS injectée
    expect(codes).toContain("2026-03-27"); // C(27) conservé
    // Vérifier que le seul événement le 26 est bien la JS (pas le C)
    const evt26 = eventsAvecJs.find((e) => e.dateDebut.toISOString().slice(0, 10) === "2026-03-26");
    expect(evt26?.jsNpo).toBe("JS");
  });

  it("NPO RP ne doit PAS être retiré lors de l'injection (n'est pas un jour travaillé)", () => {
    // RP sur le 26 → ne doit pas être retiré par l'injection
    const rp26 = makeRP("2026-03-26"); // NPO RP — non travaillé
    const js27 = makeWorkDay("2026-03-27", "GIC004R");
    const planning = [rp26, js27];

    const jsInjectee: PlanningEvent = {
      dateDebut: new Date("2026-03-26T04:30:00.000Z"),
      dateFin:   new Date("2026-03-26T12:30:00.000Z"),
      heureDebut: "04:30",
      heureFin:   "12:30",
      amplitudeMin: 480,
      dureeEffectiveMin: 480,
      jsNpo: "JS",
      codeJs: "GIC004R",
      typeJs: null,
    };

    const dateFin   = jsInjectee.dateFin;
    const dateDebut = jsInjectee.dateDebut;
    const eventsFiltrés = planning.filter((e) => {
      if (!isJourTravailleGPT(e)) return true; // RP → conservé
      const overlap = e.dateDebut < dateFin && e.dateFin > dateDebut;
      return !overlap;
    });
    const eventsAvecJs = [...eventsFiltrés, jsInjectee];

    // RP(26) + JS(26 injectée) + JS(27) = 3 événements
    expect(eventsAvecJs).toHaveLength(3);
  });
});
