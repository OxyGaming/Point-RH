/**
 * Tests unitaires — Scoring des scénarios et des candidats
 *
 * Couvre :
 *  - scorerCandidat : formule de base, pénalités, bonus
 *  - scorerCandidatDetail : décomposition des composantes
 *  - scorerScenario : conformité, modifications, cascade, conflits résiduels
 *  - Distinction scoreCandidat (qualité individuelle) / scoreScenario (qualité globale)
 *  - Plafonnement [0, 100]
 */

import {
  scorerCandidat,
  scorerCandidatDetail,
  scorerScenario,
  determinerConformiteFinale,
} from "@/lib/simulation/scenarioScorer";
import type { CandidatResult } from "@/types/js-simulation";
import type { RegleViolation } from "@/types/simulation";

// ─── Builder candidat minimal ─────────────────────────────────────────────────

function buildCandidat(
  overrides: Partial<Omit<CandidatResult, "scorePertinence" | "scoreBreakdown">> = {}
): Omit<CandidatResult, "scorePertinence" | "scoreBreakdown"> {
  return {
    agentId:      "agent-1",
    nom:          "Dupont",
    prenom:       "Jean",
    matricule:    "M001",
    posteAffectation: null,
    agentReserve: false,
    surJsZ:       false,
    codeJsZOrigine: null,
    statut:       "DIRECT",
    motifPrincipal: "",
    nbConflits:   0,
    conflitsInduits: [],
    detail: {
      amplitudeMaxAutorisee:     660,
      amplitudeImprevu:          480,
      amplitudeRaison:           "cas général",
      dureeEffectiveMax:         480,
      reposJournalierMin:        720,
      dernierPosteDebut:         null,
      dernierPosteFin:           null,
      dernierPosteDate:          null,
      reposJournalierDisponible: null,
      gptActuel:                 2,
      gptMax:                    6,
      teGptCumulAvant:           0,
      teGptLignes:               [],
      reposPeriodiqueProchain:   null,
      violations:                [],
      respectees:                [],
      pointsVigilance:           [],
      disponible:                true,
      deplacementInfo:           null,
      gptRpAnalyse:              null,
    },
    ...overrides,
  };
}

function makeViolation(regle: string): RegleViolation {
  return { regle, description: `Violation ${regle}` };
}

// ─── 1. Agent parfait → score 100 ────────────────────────────────────────────

describe("scorerCandidat — agent parfait", () => {
  it("aucune violation ni conflit → score = 100", () => {
    const candidat = buildCandidat();
    expect(scorerCandidat(candidat)).toBe(100);
  });
});

// ─── 2. Pénalités violations ──────────────────────────────────────────────────

describe("scorerCandidat — pénalités violations", () => {
  it("1 violation bloquante → score -= 25", () => {
    const candidat = buildCandidat({
      detail: {
        ...buildCandidat().detail,
        violations: [makeViolation("REPOS_JOURNALIER")],
      },
    });
    expect(scorerCandidat(candidat)).toBe(75);
  });

  it("3 violations bloquantes → score = 25", () => {
    const candidat = buildCandidat({
      detail: {
        ...buildCandidat().detail,
        violations: [
          makeViolation("REPOS_JOURNALIER"),
          makeViolation("AMPLITUDE"),
          makeViolation("GPT_MAX"),
        ],
      },
    });
    expect(scorerCandidat(candidat)).toBe(25);
  });

  it("5 violations → score clampé à 0 (pas négatif)", () => {
    const candidat = buildCandidat({
      detail: {
        ...buildCandidat().detail,
        violations: Array(5).fill(makeViolation("REPOS_JOURNALIER")),
      },
    });
    expect(scorerCandidat(candidat)).toBe(0);
  });
});

// ─── 3. Pénalité conflits induits ─────────────────────────────────────────────

describe("scorerCandidat — pénalité conflits induits", () => {
  it("2 conflits induits → score -= 30", () => {
    const candidat = buildCandidat({ nbConflits: 2 });
    expect(scorerCandidat(candidat)).toBe(70);
  });
});

// ─── 4. Bonus ─────────────────────────────────────────────────────────────────

describe("scorerCandidat — bonus", () => {
  it("agentReserve=true → score clampé à 100 (base + 10)", () => {
    const candidat = buildCandidat({ agentReserve: true });
    expect(scorerCandidat(candidat)).toBe(100);
  });

  it("surJsZ=true → score clampé à 100 (base + 15)", () => {
    const candidat = buildCandidat({ surJsZ: true });
    expect(scorerCandidat(candidat)).toBe(100);
  });

  it("1 violation + agentReserve → 100 - 25 + 10 = 85", () => {
    const candidat = buildCandidat({
      agentReserve: true,
      detail: {
        ...buildCandidat().detail,
        violations: [makeViolation("REPOS_JOURNALIER")],
      },
    });
    expect(scorerCandidat(candidat)).toBe(85);
  });
});

// ─── 5. Pénalité marge repos ──────────────────────────────────────────────────

describe("scorerCandidat — pénalité marge repos", () => {
  it("marge repos = 0 min → pénalité = round(120/12) = 10", () => {
    const candidat = buildCandidat({
      detail: {
        ...buildCandidat().detail,
        reposJournalierMin: 720,
        reposJournalierDisponible: 720, // marge = 0
      },
    });
    expect(scorerCandidat(candidat)).toBe(90);
  });

  it("marge repos >= 120 min → pas de pénalité", () => {
    const candidat = buildCandidat({
      detail: {
        ...buildCandidat().detail,
        reposJournalierMin: 720,
        reposJournalierDisponible: 840, // marge = 120 min
      },
    });
    expect(scorerCandidat(candidat)).toBe(100);
  });

  it("reposJournalierDisponible = null → pas de pénalité marge", () => {
    const candidat = buildCandidat({
      detail: { ...buildCandidat().detail, reposJournalierDisponible: null },
    });
    expect(scorerCandidat(candidat)).toBe(100);
  });
});

// ─── 6. Pénalité GPT chargé ──────────────────────────────────────────────────

describe("scorerCandidat — pénalité GPT chargé", () => {
  it("GPT ratio > 90% → -20 (cumul 80% + 90%)", () => {
    const candidat = buildCandidat({
      detail: { ...buildCandidat().detail, gptActuel: 6, gptMax: 6 }, // ratio = 1.0
    });
    expect(scorerCandidat(candidat)).toBe(80);
  });

  it("GPT ratio entre 80% et 90% → -10", () => {
    const candidat = buildCandidat({
      detail: { ...buildCandidat().detail, gptActuel: 5, gptMax: 6 }, // ratio ≈ 0.833
    });
    expect(scorerCandidat(candidat)).toBe(90);
  });

  it("GPT ratio <= 80% → pas de pénalité GPT", () => {
    const candidat = buildCandidat({
      detail: { ...buildCandidat().detail, gptActuel: 2, gptMax: 6 }, // ratio ≈ 0.33
    });
    expect(scorerCandidat(candidat)).toBe(100);
  });
});

// ─── 7. scorerCandidatDetail — décomposition ──────────────────────────────────

describe("scorerCandidatDetail — breakdown", () => {
  it("retourne toutes les composantes correctement", () => {
    const candidat = buildCandidat({
      agentReserve: true,
      nbConflits: 1,
      detail: {
        ...buildCandidat().detail,
        violations: [makeViolation("AMPLITUDE")],
        reposJournalierMin: 720,
        reposJournalierDisponible: 780, // marge = 60 min < 120 → pénalité = round(60/12) = 5
        gptActuel: 5,
        gptMax: 6, // ratio > 0.8 → -10
      },
    });

    const breakdown = scorerCandidatDetail(candidat);

    expect(breakdown.base).toBe(100);
    expect(breakdown.penaliteViolations).toBe(25);    // 1 × 25
    expect(breakdown.penaliteConflits).toBe(15);      // 1 × 15
    expect(breakdown.bonusReserve).toBe(10);
    expect(breakdown.bonusJsZ).toBe(0);
    expect(breakdown.penaliteMargeRepos).toBe(5);     // round(60/12) = 5
    expect(breakdown.penaliteGpt).toBe(10);           // >0.8 seulement
    expect(breakdown.total).toBe(
      Math.max(0, 100 - 25 - 15 + 10 + 0 - 5 - 10)
    ); // = 55
  });
});

// ─── 8. scorerScenario — mode simple ─────────────────────────────────────────

describe("scorerScenario — mode simple", () => {
  it("CONFORME, 0 modifs, 0 cascade, 0 conflits → score = 100", () => {
    expect(scorerScenario("CONFORME", 0, 0, 0)).toBe(100);
  });

  it("VIGILANCE → score -= 20", () => {
    expect(scorerScenario("VIGILANCE", 0, 0, 0)).toBe(80);
  });

  it("NON_CONFORME → score -= 60", () => {
    expect(scorerScenario("NON_CONFORME", 0, 0, 0)).toBe(40);
  });

  it("2 modifications → score -= 16", () => {
    expect(scorerScenario("CONFORME", 2, 0, 0)).toBe(84);
  });

  it("3 niveaux de cascade → score -= 30", () => {
    expect(scorerScenario("CONFORME", 0, 3, 0)).toBe(70);
  });

  it("1 conflit résiduel → score -= 20", () => {
    expect(scorerScenario("CONFORME", 0, 0, 1)).toBe(80);
  });

  it("cumul : NON_CONFORME + 2 modifs + 1 cascade + 1 conflit → score clampé à 0", () => {
    // 100 - 60 - 16 - 10 - 20 = -6 → clampé à 0
    expect(scorerScenario("NON_CONFORME", 2, 1, 1)).toBe(0);
  });
});

// ─── 9. determinerConformiteFinale ───────────────────────────────────────────

describe("determinerConformiteFinale", () => {
  it("DIRECT + 0 conflits → CONFORME", () => {
    expect(determinerConformiteFinale("DIRECT", 0)).toBe("CONFORME");
  });

  it("VIGILANCE + 0 conflits → VIGILANCE", () => {
    expect(determinerConformiteFinale("VIGILANCE", 0)).toBe("VIGILANCE");
  });

  it("REFUSE → NON_CONFORME", () => {
    expect(determinerConformiteFinale("REFUSE", 0)).toBe("NON_CONFORME");
  });

  it("DIRECT + conflits résiduels → NON_CONFORME", () => {
    expect(determinerConformiteFinale("DIRECT", 2)).toBe("NON_CONFORME");
  });
});
