/**
 * Tests unitaires — fenêtre de chargement du planning consolidé.
 *
 * Vérifie le calcul des bornes (marges 35j amont / 21j aval) et la conversion
 * timezone (`jourPlanning` = minuit Paris en UTC), y compris autour des
 * transitions DST (cohérence avec importTimezone.test.ts).
 */

import {
  fenetreSimulation,
  MARGE_AMONT_JOURS,
  MARGE_AVAL_JOURS,
} from "@/lib/simulation/planningWindow";
import { minuitParisEnUtc } from "@/lib/timezone";

describe("fenetreSimulation", () => {
  it("applique les marges par défaut 35j amont / 21j aval", () => {
    expect(MARGE_AMONT_JOURS).toBe(35);
    expect(MARGE_AVAL_JOURS).toBe(21);
  });

  it("une seule date cible — été (UTC+2)", () => {
    const f = fenetreSimulation(["2026-06-15"]);
    // 2026-06-15 − 35j = 2026-05-11 ; + 21j = 2026-07-06
    expect(f.gte).toEqual(minuitParisEnUtc("2026-05-11"));
    expect(f.lte).toEqual(minuitParisEnUtc("2026-07-06"));
    // minuit Paris en été = 22:00 UTC la veille
    expect(f.gte.toISOString()).toBe("2026-05-10T22:00:00.000Z");
    expect(f.lte.toISOString()).toBe("2026-07-05T22:00:00.000Z");
  });

  it("plusieurs dates — la fenêtre s'étend du min au max", () => {
    const f = fenetreSimulation(["2026-06-20", "2026-06-10", "2026-06-15"]);
    expect(f.gte).toEqual(minuitParisEnUtc("2026-05-06")); // 06-10 − 35j
    expect(f.lte).toEqual(minuitParisEnUtc("2026-07-11")); // 06-20 + 21j
  });

  it("la fenêtre contient toujours le jourPlanning des JS cibles", () => {
    const f = fenetreSimulation(["2026-06-15"]);
    const jpCible = minuitParisEnUtc("2026-06-15");
    expect(f.gte.getTime()).toBeLessThanOrEqual(jpCible.getTime());
    expect(f.lte.getTime()).toBeGreaterThanOrEqual(jpCible.getTime());
  });

  it("traverse la transition DST de printemps (29/03/2026) sans décalage", () => {
    // cible 2026-04-20 → −35j = 2026-03-16 (hiver UTC+1), +21j = 2026-05-11 (été UTC+2)
    const f = fenetreSimulation(["2026-04-20"]);
    expect(f.gte.toISOString()).toBe("2026-03-15T23:00:00.000Z"); // minuit Paris hiver
    expect(f.lte.toISOString()).toBe("2026-05-10T22:00:00.000Z"); // minuit Paris été
  });

  it("ignore les dates invalides et conserve les dates valides", () => {
    const f = fenetreSimulation(["", "pas-une-date", "2026-06-15"]);
    expect(f.gte).toEqual(minuitParisEnUtc("2026-05-11"));
    expect(f.lte).toEqual(minuitParisEnUtc("2026-07-06"));
  });

  it("lève une erreur si aucune date valide n'est fournie", () => {
    expect(() => fenetreSimulation([])).toThrow();
    expect(() => fenetreSimulation(["", "xx", "2026/06/15"])).toThrow();
  });
});
