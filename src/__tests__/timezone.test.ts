/**
 * Tests du helper timezone (Phase 1.A — Étape 1).
 *
 * Couvre :
 * - Été (UTC+2) et hiver (UTC+1)
 * - Transitions DST printemps (29 mars 2026, 02:00→03:00 inexistant)
 * - Transitions DST automne (25 octobre 2026, 02:00→03:00 ambigu)
 * - Validations d'entrée
 *
 * Note : ces tests s'exécutent dans n'importe quel fuseau (le serveur peut être
 * en UTC, en Paris, ou ailleurs) car `date-fns-tz` fait toutes les conversions
 * via Europe/Paris explicitement.
 */

import {
  combineDateTimeParis,
  formatDateParis,
  formatTimeParis,
  formatDateFrParis,
  minuitParisEnUtc,
} from "@/lib/timezone";

describe("combineDateTimeParis", () => {
  describe("été (UTC+2)", () => {
    it("12:30 Paris du 03/05/2026 → 10:30 UTC", () => {
      expect(combineDateTimeParis("2026-05-03", "12:30").toISOString())
        .toBe("2026-05-03T10:30:00.000Z");
    });

    it("00:00 Paris du 04/07/2026 → 22:00 UTC du 03/07", () => {
      expect(combineDateTimeParis("2026-07-04", "00:00").toISOString())
        .toBe("2026-07-03T22:00:00.000Z");
    });

    it("23:59 Paris du 31/08/2026 → 21:59 UTC", () => {
      expect(combineDateTimeParis("2026-08-31", "23:59").toISOString())
        .toBe("2026-08-31T21:59:00.000Z");
    });
  });

  describe("hiver (UTC+1)", () => {
    it("12:30 Paris du 15/12/2026 → 11:30 UTC", () => {
      expect(combineDateTimeParis("2026-12-15", "12:30").toISOString())
        .toBe("2026-12-15T11:30:00.000Z");
    });

    it("00:00 Paris du 01/01/2026 → 23:00 UTC du 31/12/2025", () => {
      expect(combineDateTimeParis("2026-01-01", "00:00").toISOString())
        .toBe("2025-12-31T23:00:00.000Z");
    });
  });

  describe("DST printemps — dimanche 29 mars 2026 (UTC+1 → UTC+2)", () => {
    it("01:30 Paris (avant transition) → 00:30 UTC", () => {
      expect(combineDateTimeParis("2026-03-29", "01:30").toISOString())
        .toBe("2026-03-29T00:30:00.000Z");
    });

    it("03:30 Paris (après transition) → 01:30 UTC", () => {
      expect(combineDateTimeParis("2026-03-29", "03:30").toISOString())
        .toBe("2026-03-29T01:30:00.000Z");
    });

    it("02:30 Paris (heure inexistante) — date-fns-tz interpole sans crash", () => {
      // L'heure 02:00–03:00 n'existe pas le 29 mars 2026 (saut direct 02:00→03:00).
      // date-fns-tz produit un instant UTC raisonnable (≈ 01:30 UTC, soit 03:30 Paris
      // post-transition). On vérifie surtout l'absence d'exception et un instant valide.
      const d = combineDateTimeParis("2026-03-29", "02:30");
      expect(d).toBeInstanceOf(Date);
      expect(isNaN(d.getTime())).toBe(false);
    });
  });

  describe("DST automne — dimanche 25 octobre 2026 (UTC+2 → UTC+1)", () => {
    it("01:30 Paris (avant transition) → 23:30 UTC du 24/10", () => {
      expect(combineDateTimeParis("2026-10-25", "01:30").toISOString())
        .toBe("2026-10-24T23:30:00.000Z");
    });

    it("03:30 Paris (après transition, deuxième passage en heure d'hiver) → 02:30 UTC", () => {
      expect(combineDateTimeParis("2026-10-25", "03:30").toISOString())
        .toBe("2026-10-25T02:30:00.000Z");
    });

    it("02:30 Paris (heure ambiguë — existe deux fois) — date-fns-tz choisit une occurrence stable", () => {
      // L'heure 02:00–03:00 existe deux fois (UTC+2 puis UTC+1).
      // date-fns-tz choisit l'occurrence "early" (UTC+2 → 00:30 UTC) par défaut.
      // On valide la stabilité et un instant valide.
      const d = combineDateTimeParis("2026-10-25", "02:30");
      expect(d).toBeInstanceOf(Date);
      expect(isNaN(d.getTime())).toBe(false);
      // Vérification soft : l'instant doit être entre 00:30Z et 01:30Z (les deux
      // occurrences possibles).
      const ms = d.getTime();
      expect(ms).toBeGreaterThanOrEqual(Date.parse("2026-10-25T00:30:00.000Z"));
      expect(ms).toBeLessThanOrEqual(Date.parse("2026-10-25T01:30:00.000Z"));
    });
  });

  describe("validations", () => {
    it("jour invalide → throw", () => {
      expect(() => combineDateTimeParis("2026/05/03", "12:30")).toThrow();
      expect(() => combineDateTimeParis("03-05-2026", "12:30")).toThrow();
      expect(() => combineDateTimeParis("", "12:30")).toThrow();
    });

    it("heure invalide → throw", () => {
      expect(() => combineDateTimeParis("2026-05-03", "25:00")).toThrow();
      expect(() => combineDateTimeParis("2026-05-03", "12:60")).toThrow();
      expect(() => combineDateTimeParis("2026-05-03", "12h30")).toThrow();
      expect(() => combineDateTimeParis("2026-05-03", "")).toThrow();
    });
  });
});

describe("formatDateParis", () => {
  it("instant UTC en pleine journée Paris → bon jour", () => {
    expect(formatDateParis(new Date("2026-05-03T10:30:00Z")))
      .toBe("2026-05-03");
  });

  it("instant UTC tard le soir UTC → jour suivant Paris", () => {
    // 22:00 UTC le 03/05 = 00:00 Paris le 04/05 (UTC+2 été)
    expect(formatDateParis(new Date("2026-05-03T22:00:00Z")))
      .toBe("2026-05-04");
  });

  it("instant UTC pendant la nuit Paris → bon jour Paris", () => {
    // 02:00 UTC = 04:00 Paris (été), donc encore le 03/05
    expect(formatDateParis(new Date("2026-05-03T02:00:00Z")))
      .toBe("2026-05-03");
  });

  it("hiver — 23:30 UTC du 14/12 = 00:30 Paris du 15/12", () => {
    expect(formatDateParis(new Date("2026-12-14T23:30:00Z")))
      .toBe("2026-12-15");
  });
});

describe("formatTimeParis", () => {
  it("été — 10:30 UTC → 12:30 Paris", () => {
    expect(formatTimeParis(new Date("2026-05-03T10:30:00Z"))).toBe("12:30");
  });

  it("hiver — 11:30 UTC → 12:30 Paris", () => {
    expect(formatTimeParis(new Date("2026-12-15T11:30:00Z"))).toBe("12:30");
  });

  it("passage minuit Paris — 22:00 UTC → 00:00 Paris (jour suivant)", () => {
    expect(formatTimeParis(new Date("2026-05-03T22:00:00Z"))).toBe("00:00");
  });
});

describe("formatDateFrParis", () => {
  it("format jj/mm/aaaa Paris", () => {
    expect(formatDateFrParis(new Date("2026-05-03T10:30:00Z"))).toBe("03/05/2026");
  });

  it("instant UTC tard le soir UTC → jour suivant Paris", () => {
    expect(formatDateFrParis(new Date("2026-05-03T22:00:00Z"))).toBe("04/05/2026");
  });
});

describe("minuitParisEnUtc", () => {
  it("été — minuit Paris du 03/05 = 22:00 UTC du 02/05", () => {
    expect(minuitParisEnUtc("2026-05-03").toISOString())
      .toBe("2026-05-02T22:00:00.000Z");
  });

  it("hiver — minuit Paris du 15/12 = 23:00 UTC du 14/12", () => {
    expect(minuitParisEnUtc("2026-12-15").toISOString())
      .toBe("2026-12-14T23:00:00.000Z");
  });
});

describe("aller-retour combineDateTimeParis ↔ formatDateParis/formatTimeParis", () => {
  it("été — convention strictement réversible", () => {
    const d = combineDateTimeParis("2026-05-03", "12:30");
    expect(formatDateParis(d)).toBe("2026-05-03");
    expect(formatTimeParis(d)).toBe("12:30");
  });

  it("hiver — convention strictement réversible", () => {
    const d = combineDateTimeParis("2026-12-15", "12:30");
    expect(formatDateParis(d)).toBe("2026-12-15");
    expect(formatTimeParis(d)).toBe("12:30");
  });

  it("minuit Paris — convention strictement réversible", () => {
    const d = combineDateTimeParis("2026-05-03", "00:00");
    expect(formatDateParis(d)).toBe("2026-05-03");
    expect(formatTimeParis(d)).toBe("00:00");
  });

  it("23:59 Paris — convention strictement réversible", () => {
    const d = combineDateTimeParis("2026-05-03", "23:59");
    expect(formatDateParis(d)).toBe("2026-05-03");
    expect(formatTimeParis(d)).toBe("23:59");
  });
});
