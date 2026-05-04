/**
 * Tests d'intégration import — convention temporelle (Phase 1.A étape 2).
 *
 * Vérifie que le pipeline d'import produit bien :
 *   - `dateDebutPop` / `dateFinPop` en UTC absolu (instant réel de prise/fin
 *     de service en heure Paris, converti via combineDateTimeParis)
 *   - `jourPlanning` = minuit Paris du jour de prise (UTC) — clé métier
 *
 * Couvre :
 *   - JS de jour été (UTC+2)
 *   - JS de jour hiver (UTC+1)
 *   - JS de nuit qui passe minuit (avec DATE FIN POP = J+1)
 *   - NPO RP (jour pur)
 *   - Transitions DST printemps (29 mars 2026) et automne (25 octobre 2026)
 *
 * Ne touche pas à la base : tests purement sur `normalizeRows` + `jourPlanningFromDate`.
 */

import { normalizeRows, type NormRow } from "@/services/import/normalizeRows";
import { jourPlanningFromDate } from "@/services/import.service";

// Headers SNCF utilisés (subset minimal pour les tests — autres champs ignorés)
const HEADERS = [
  "UCH",
  "CODE UCH",
  "NOM",
  "PRENOM",
  "CODE IMMATRICULATION",
  "DATE DEBUT POP / NPO",
  "HEURE DEBUT POP / NPO",
  "HEURE FIN POP / NPO",
  "DATE FIN POP / NPO",
  "JS / NPO",
  "CODE JS / CODE NPO",
];

function makeRow(overrides: Partial<Record<string, unknown>>): NormRow {
  const display = {
    "UCH": "RIVE DROITE",
    "CODE UCH": "933705",
    "NOM": "DUPONT",
    "PRENOM": "JEAN",
    "CODE IMMATRICULATION": "1234567A",
    "DATE DEBUT POP / NPO": "03/05/2026",
    "HEURE DEBUT POP / NPO": "12:30",
    "HEURE FIN POP / NPO": "20:30",
    "DATE FIN POP / NPO": "03/05/2026",
    "JS / NPO": "JS",
    "CODE JS / CODE NPO": "GIV001",
    ...overrides,
  };
  return {
    source: "txt",
    lineNumber: 1,
    display,
    raw: display, // identique en TXT
  };
}

describe("normalizeRows — dateDebutPop/dateFinPop en UTC absolu", () => {
  describe("JS de jour — été (UTC+2)", () => {
    it("12:30 → 20:30 le 03/05/2026 produit les bons UTC", () => {
      const row = makeRow({});
      const { lignes, erreurs } = normalizeRows([row], HEADERS);

      expect(erreurs).toEqual([]);
      expect(lignes).toHaveLength(1);
      const l = lignes[0];
      // 12:30 Paris été = 10:30 UTC
      expect(l.dateDebutPop.toISOString()).toBe("2026-05-03T10:30:00.000Z");
      // 20:30 Paris été = 18:30 UTC
      expect(l.dateFinPop.toISOString()).toBe("2026-05-03T18:30:00.000Z");
      expect(l.heureDebutPop).toBe("12:30");
      expect(l.heureFinPop).toBe("20:30");
    });
  });

  describe("JS de jour — hiver (UTC+1)", () => {
    it("12:30 → 20:30 le 15/12/2026 produit les bons UTC", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "15/12/2026",
        "DATE FIN POP / NPO": "15/12/2026",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      // 12:30 Paris hiver = 11:30 UTC
      expect(l.dateDebutPop.toISOString()).toBe("2026-12-15T11:30:00.000Z");
      expect(l.dateFinPop.toISOString()).toBe("2026-12-15T19:30:00.000Z");
    });
  });

  describe("JS de nuit qui passe minuit — été", () => {
    it("20:30 03/05 → 04:30 04/05 produit les bons UTC", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "03/05/2026",
        "HEURE DEBUT POP / NPO": "20:30",
        "HEURE FIN POP / NPO": "04:30",
        "DATE FIN POP / NPO": "04/05/2026",
        "CODE JS / CODE NPO": "GIC006R",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      // 20:30 Paris été du 03/05 = 18:30 UTC du 03/05
      expect(l.dateDebutPop.toISOString()).toBe("2026-05-03T18:30:00.000Z");
      // 04:30 Paris été du 04/05 = 02:30 UTC du 04/05
      expect(l.dateFinPop.toISOString()).toBe("2026-05-04T02:30:00.000Z");
      // dateFin > dateDebut (cohérence basique)
      expect(l.dateFinPop.getTime()).toBeGreaterThan(l.dateDebutPop.getTime());
    });
  });

  describe("JS de nuit qui passe minuit — hiver", () => {
    it("20:30 15/12 → 04:30 16/12 produit les bons UTC", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "15/12/2026",
        "HEURE DEBUT POP / NPO": "20:30",
        "HEURE FIN POP / NPO": "04:30",
        "DATE FIN POP / NPO": "16/12/2026",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      // 20:30 Paris hiver du 15/12 = 19:30 UTC du 15/12
      expect(l.dateDebutPop.toISOString()).toBe("2026-12-15T19:30:00.000Z");
      // 04:30 Paris hiver du 16/12 = 03:30 UTC du 16/12
      expect(l.dateFinPop.toISOString()).toBe("2026-12-16T03:30:00.000Z");
    });
  });

  describe("NPO RP — jour pur", () => {
    it("06:00 → 15:00 le 02/05/2026 produit les bons UTC", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "02/05/2026",
        "HEURE DEBUT POP / NPO": "06:00",
        "HEURE FIN POP / NPO": "15:00",
        "DATE FIN POP / NPO": "02/05/2026",
        "JS / NPO": "NPO",
        "CODE JS / CODE NPO": "RP",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      expect(l.jsNpo).toBe("NPO");
      // 06:00 Paris été = 04:00 UTC
      expect(l.dateDebutPop.toISOString()).toBe("2026-05-02T04:00:00.000Z");
      // 15:00 Paris été = 13:00 UTC
      expect(l.dateFinPop.toISOString()).toBe("2026-05-02T13:00:00.000Z");
    });
  });

  describe("Transition DST printemps — dimanche 29 mars 2026", () => {
    it("JS qui finit avant la transition (01:00 Paris UTC+1)", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "28/03/2026",
        "HEURE DEBUT POP / NPO": "20:00",
        "HEURE FIN POP / NPO": "01:00",
        "DATE FIN POP / NPO": "29/03/2026",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      // 20:00 Paris UTC+1 du 28/03 = 19:00 UTC
      expect(l.dateDebutPop.toISOString()).toBe("2026-03-28T19:00:00.000Z");
      // 01:00 Paris UTC+1 du 29/03 (avant transition) = 00:00 UTC
      expect(l.dateFinPop.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    });

    it("JS qui finit après la transition (04:00 Paris UTC+2)", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "28/03/2026",
        "HEURE DEBUT POP / NPO": "20:00",
        "HEURE FIN POP / NPO": "04:00",
        "DATE FIN POP / NPO": "29/03/2026",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      // 04:00 Paris UTC+2 du 29/03 (après transition) = 02:00 UTC
      expect(l.dateFinPop.toISOString()).toBe("2026-03-29T02:00:00.000Z");
      // L'amplitude visible : 19:00 UTC du 28 → 02:00 UTC du 29 = 7 h
      // (7h en réel parce que la nuit a "perdu" 1h)
      const ampMs = l.dateFinPop.getTime() - l.dateDebutPop.getTime();
      expect(Math.round(ampMs / 3600000)).toBe(7);
    });
  });

  describe("Transition DST automne — dimanche 25 octobre 2026", () => {
    it("JS de nuit qui traverse la transition retour (UTC+2 → UTC+1)", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "24/10/2026",
        "HEURE DEBUT POP / NPO": "20:00",
        "HEURE FIN POP / NPO": "04:00",
        "DATE FIN POP / NPO": "25/10/2026",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      // 20:00 Paris UTC+2 du 24/10 = 18:00 UTC
      expect(l.dateDebutPop.toISOString()).toBe("2026-10-24T18:00:00.000Z");
      // 04:00 Paris UTC+1 du 25/10 (après transition retour) = 03:00 UTC
      expect(l.dateFinPop.toISOString()).toBe("2026-10-25T03:00:00.000Z");
      // Amplitude réelle : 18:00 UTC → 03:00 UTC le lendemain = 9h
      // (9h car la nuit a "gagné" 1h supplémentaire)
      const ampMs = l.dateFinPop.getTime() - l.dateDebutPop.getTime();
      expect(Math.round(ampMs / 3600000)).toBe(9);
    });
  });

  describe("Format de date alternatif (Excel ISO yyyy-mm-dd)", () => {
    it("ISO 2026-05-03 produit les mêmes UTC que 03/05/2026", () => {
      const row = makeRow({
        "DATE DEBUT POP / NPO": "2026-05-03",
        "DATE FIN POP / NPO": "2026-05-03",
      });
      const { lignes } = normalizeRows([row], HEADERS);
      const l = lignes[0];
      expect(l.dateDebutPop.toISOString()).toBe("2026-05-03T10:30:00.000Z");
    });
  });
});

describe("jourPlanningFromDate — clé métier minuit Paris", () => {
  it("été — 12:30 UTC du 03/05 → minuit Paris du 03/05 = 22:00 UTC du 02/05", () => {
    // dateDebutPop = 12:30 UTC = 14:30 Paris été du 03/05
    const dateDebutPop = new Date("2026-05-03T12:30:00.000Z");
    expect(jourPlanningFromDate(dateDebutPop).toISOString())
      .toBe("2026-05-02T22:00:00.000Z");
  });

  it("hiver — 12:30 UTC du 15/12 → minuit Paris du 15/12 = 23:00 UTC du 14/12", () => {
    const dateDebutPop = new Date("2026-12-15T12:30:00.000Z");
    expect(jourPlanningFromDate(dateDebutPop).toISOString())
      .toBe("2026-12-14T23:00:00.000Z");
  });

  it("JS de nuit (instant 18:30 UTC du 03/05 = 20:30 Paris du 03/05) → jour Paris = 03/05", () => {
    // Cas Poncet GIC006R nouvelle convention : prise réelle 03/05 20:30 Paris
    const dateDebutPop = new Date("2026-05-03T18:30:00.000Z");
    expect(jourPlanningFromDate(dateDebutPop).toISOString())
      .toBe("2026-05-02T22:00:00.000Z"); // = minuit Paris du 03/05
  });

  it("instant tard le soir UTC (22:30 UTC du 03/05) tombe le jour SUIVANT Paris", () => {
    // 22:30 UTC du 03/05 = 00:30 Paris été du 04/05 → jourPlanning = minuit Paris du 04/05
    const dateDebutPop = new Date("2026-05-03T22:30:00.000Z");
    expect(jourPlanningFromDate(dateDebutPop).toISOString())
      .toBe("2026-05-03T22:00:00.000Z"); // = minuit Paris du 04/05
  });

  it("plus de double-shift DST (regression test sur l'ancien bug)", () => {
    // L'ancienne implémentation toZonedTime + fromZonedTime appliquait
    // 2× le décalage et produisait jourPlanning = minuit Paris - 1 jour.
    // Vérification : on doit retomber sur minuit Paris exact.
    const cases = [
      { iso: "2026-01-15T12:00:00Z", attendu: "2026-01-14T23:00:00.000Z" }, // hiver
      { iso: "2026-07-15T12:00:00Z", attendu: "2026-07-14T22:00:00.000Z" }, // été
      { iso: "2026-04-01T12:00:00Z", attendu: "2026-03-31T22:00:00.000Z" }, // post-DST printemps
      { iso: "2026-11-01T12:00:00Z", attendu: "2026-10-31T23:00:00.000Z" }, // post-DST automne
    ];
    for (const c of cases) {
      expect(jourPlanningFromDate(new Date(c.iso)).toISOString()).toBe(c.attendu);
    }
  });
});

describe("Cohérence dateDebutPop ↔ jourPlanning", () => {
  it("après import, jourPlanningFromDate(dateDebutPop) = minuit Paris du jour de prise", () => {
    // JS de jour 03/05 12:30 Paris
    const row = makeRow({});
    const { lignes } = normalizeRows([row], HEADERS);
    const dateDebutPop = lignes[0].dateDebutPop;
    const jp = jourPlanningFromDate(dateDebutPop);
    // jourPlanning = minuit Paris du 03/05 (= 22:00 UTC du 02/05 en été)
    expect(jp.toISOString()).toBe("2026-05-02T22:00:00.000Z");
  });

  it("JS de nuit — jourPlanning suit le jour de PRISE (= 03/05), pas celui de fin", () => {
    const row = makeRow({
      "DATE DEBUT POP / NPO": "03/05/2026",
      "HEURE DEBUT POP / NPO": "20:30",
      "HEURE FIN POP / NPO": "04:30",
      "DATE FIN POP / NPO": "04/05/2026",
    });
    const { lignes } = normalizeRows([row], HEADERS);
    const jp = jourPlanningFromDate(lignes[0].dateDebutPop);
    expect(jp.toISOString()).toBe("2026-05-02T22:00:00.000Z"); // minuit Paris du 03/05
  });
});
