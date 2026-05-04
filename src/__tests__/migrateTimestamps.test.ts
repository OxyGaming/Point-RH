/**
 * Tests de la logique pure de migration des timestamps (étape 3).
 *
 * Couvre :
 *   - Détection "déjà migré" (timestamps post-fix)
 *   - Migration JS de jour été (UTC+2)
 *   - Migration JS de jour hiver (UTC+1)
 *   - Migration JS de nuit cross-midnight été
 *   - Migration JS de nuit cross-midnight hiver
 *   - Idempotence (2 passes consécutives → la 2ᵉ ne change rien)
 *   - Cas limites (heures identiques, NPO)
 */

import {
  migrerLigne,
  estDejaMigree,
  verifierIdempotence,
  type LigneMigration,
} from "@/lib/migration/migrateTimestamps";

// ─── Helpers de fixture ──────────────────────────────────────────────────────

/**
 * Construit une ligne pré-fix simulant l'état actuel de la base.
 * Convention pré-fix observée :
 *   - dateDebutPop = jour calendaire UTC midnight (ex: "2026-05-03T00:00:00Z")
 *   - dateFinPop   = idem (ou jour suivant si nuit)
 *   - jourPlanning = minuit Paris du jour calendaire (ex: "2026-05-02T22:00:00Z" été)
 *   - heureDebutPop / heureFinPop = strings Paris pures
 */
function ligneprefixJourEte(jour: string, hd: string, hf: string): LigneMigration {
  return {
    id: `test-${jour}-${hd}`,
    // UTC midnight du jour calendaire (= ce que stockait l'ancien pipeline)
    dateDebutPop: new Date(`${jour}T00:00:00.000Z`),
    dateFinPop: new Date(`${jour}T00:00:00.000Z`),
    // Minuit Paris du jour (été UTC+2 → 22:00 UTC du jour précédent)
    jourPlanning: new Date(
      new Date(`${jour}T00:00:00.000Z`).getTime() - 2 * 3600 * 1000
    ),
    heureDebutPop: hd,
    heureFinPop: hf,
  };
}

function lignePrefixJourHiver(jour: string, hd: string, hf: string): LigneMigration {
  return {
    id: `test-${jour}-${hd}`,
    dateDebutPop: new Date(`${jour}T00:00:00.000Z`),
    dateFinPop: new Date(`${jour}T00:00:00.000Z`),
    // Minuit Paris hiver UTC+1 → 23:00 UTC du jour précédent
    jourPlanning: new Date(
      new Date(`${jour}T00:00:00.000Z`).getTime() - 1 * 3600 * 1000
    ),
    heureDebutPop: hd,
    heureFinPop: hf,
  };
}

/** Pour les nuits cross-midnight : dateFin = jour suivant. */
function lignePrefixNuitEte(
  jourDebut: string,
  jourFin: string,
  hd: string,
  hf: string
): LigneMigration {
  return {
    id: `test-nuit-${jourDebut}`,
    dateDebutPop: new Date(`${jourDebut}T00:00:00.000Z`),
    dateFinPop: new Date(`${jourFin}T00:00:00.000Z`),
    jourPlanning: new Date(
      new Date(`${jourDebut}T00:00:00.000Z`).getTime() - 2 * 3600 * 1000
    ),
    heureDebutPop: hd,
    heureFinPop: hf,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("estDejaMigree", () => {
  it("ligne post-fix (heures Paris cohérentes avec UTC) → true", () => {
    // 12:30 Paris été = 10:30 UTC
    const ligne: LigneMigration = {
      id: "x",
      dateDebutPop: new Date("2026-05-03T10:30:00.000Z"),
      dateFinPop: new Date("2026-05-03T18:30:00.000Z"),
      jourPlanning: new Date("2026-05-02T22:00:00.000Z"),
      heureDebutPop: "12:30",
      heureFinPop: "20:30",
    };
    expect(estDejaMigree(ligne)).toBe(true);
  });

  it("ligne pré-fix (UTC midnight) → false", () => {
    const ligne = ligneprefixJourEte("2026-05-03", "12:30", "20:30");
    expect(estDejaMigree(ligne)).toBe(false);
  });

  it("ligne hiver post-fix → true", () => {
    // 12:30 Paris hiver = 11:30 UTC
    const ligne: LigneMigration = {
      id: "x",
      dateDebutPop: new Date("2026-12-15T11:30:00.000Z"),
      dateFinPop: new Date("2026-12-15T19:30:00.000Z"),
      jourPlanning: new Date("2026-12-14T23:00:00.000Z"),
      heureDebutPop: "12:30",
      heureFinPop: "20:30",
    };
    expect(estDejaMigree(ligne)).toBe(true);
  });
});

describe("migrerLigne — JS de jour été", () => {
  it("12:30 → 20:30 le 03/05 (UTC+2) produit les bons UTC", () => {
    const ligne = ligneprefixJourEte("2026-05-03", "12:30", "20:30");
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-05-03T10:30:00.000Z");
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-05-03T18:30:00.000Z");
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-05-02T22:00:00.000Z");
    expect(r.jourParis).toBe("2026-05-03");
    expect(r.isNuit).toBe(false);
  });
});

describe("migrerLigne — JS de jour hiver", () => {
  it("12:30 → 20:30 le 15/12 (UTC+1) produit les bons UTC", () => {
    const ligne = lignePrefixJourHiver("2026-12-15", "12:30", "20:30");
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-12-15T11:30:00.000Z");
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-12-15T19:30:00.000Z");
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-12-14T23:00:00.000Z");
    expect(r.isNuit).toBe(false);
  });
});

describe("migrerLigne — JS de nuit cross-midnight été", () => {
  it("20:30 du 03/05 → 04:30 du 04/05 produit les bons UTC", () => {
    // Cas Poncet GIC006R réel
    const ligne = lignePrefixNuitEte(
      "2026-05-03",
      "2026-05-04",
      "20:30",
      "04:30"
    );
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-05-03T18:30:00.000Z");
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-05-04T02:30:00.000Z");
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-05-02T22:00:00.000Z");
    expect(r.jourParis).toBe("2026-05-03");
    expect(r.isNuit).toBe(true);
  });
});

describe("migrerLigne — JS de nuit cross-midnight hiver", () => {
  it("20:30 du 15/12 → 04:30 du 16/12 produit les bons UTC", () => {
    const ligne: LigneMigration = {
      id: "test-nuit-hiver",
      dateDebutPop: new Date("2026-12-15T00:00:00.000Z"),
      dateFinPop: new Date("2026-12-16T00:00:00.000Z"),
      jourPlanning: new Date("2026-12-14T23:00:00.000Z"),
      heureDebutPop: "20:30",
      heureFinPop: "04:30",
    };
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-12-15T19:30:00.000Z");
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-12-16T03:30:00.000Z");
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-12-14T23:00:00.000Z");
    expect(r.isNuit).toBe(true);
  });
});

describe("migrerLigne — déjà migrée", () => {
  it("retourne ALREADY_MIGRATED sans modification", () => {
    const ligne: LigneMigration = {
      id: "x",
      dateDebutPop: new Date("2026-05-03T10:30:00.000Z"),
      dateFinPop: new Date("2026-05-03T18:30:00.000Z"),
      jourPlanning: new Date("2026-05-02T22:00:00.000Z"),
      heureDebutPop: "12:30",
      heureFinPop: "20:30",
    };
    const r = migrerLigne(ligne);
    expect(r.statut).toBe("ALREADY_MIGRATED");
  });
});

describe("verifierIdempotence", () => {
  it("JS de jour été — idempotente", () => {
    const ligne = ligneprefixJourEte("2026-05-03", "12:30", "20:30");
    expect(verifierIdempotence(ligne)).toBe(true);
  });

  it("JS de nuit cross-midnight été — idempotente", () => {
    const ligne = lignePrefixNuitEte("2026-05-03", "2026-05-04", "20:30", "04:30");
    expect(verifierIdempotence(ligne)).toBe(true);
  });

  it("JS de jour hiver — idempotente", () => {
    const ligne = lignePrefixJourHiver("2026-12-15", "12:30", "20:30");
    expect(verifierIdempotence(ligne)).toBe(true);
  });

  it("ligne déjà migrée — reste idempotente (rien ne change)", () => {
    const ligne: LigneMigration = {
      id: "x",
      dateDebutPop: new Date("2026-05-03T10:30:00.000Z"),
      dateFinPop: new Date("2026-05-03T18:30:00.000Z"),
      jourPlanning: new Date("2026-05-02T22:00:00.000Z"),
      heureDebutPop: "12:30",
      heureFinPop: "20:30",
    };
    expect(verifierIdempotence(ligne)).toBe(true);
  });
});

describe("Cas terrain reproduits — Chennouf, Brouillat, Poncet", () => {
  it("Chennouf GIC006R 03/05 nuit (cas terrain)", () => {
    // Reproduit la ligne 12435 du fichier source modif-10.txt :
    // CHENNOUF DATE DEBUT POP=03/05/2026 HEURE=20:30 → DATE FIN=04/05/2026 HEURE=04:30
    const ligne = lignePrefixNuitEte(
      "2026-05-03",
      "2026-05-04",
      "20:30",
      "04:30"
    );
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    // 20:30 Paris été du 03/05 = 18:30 UTC du 03/05
    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-05-03T18:30:00.000Z");
    // 04:30 Paris été du 04/05 = 02:30 UTC du 04/05
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-05-04T02:30:00.000Z");
    // jourPlanning = minuit Paris du 03/05 = 22:00 UTC du 02/05
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-05-02T22:00:00.000Z");
  });

  it("Brouillat GIV005R 02/05 jour (cas terrain)", () => {
    // Reproduit la ligne 11999 : BROUILLAT 02/05/2026 12:30 → 02/05/2026 20:30
    const ligne = ligneprefixJourEte("2026-05-02", "12:30", "20:30");
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-05-02T10:30:00.000Z");
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-05-02T18:30:00.000Z");
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-05-01T22:00:00.000Z");
  });

  it("Poncet GIC006R 02/05 nuit (cas terrain)", () => {
    // Reproduit la ligne 12527 : PONCET 02/05/2026 20:30 → 03/05/2026 04:30
    const ligne = lignePrefixNuitEte(
      "2026-05-02",
      "2026-05-03",
      "20:30",
      "04:30"
    );
    const r = migrerLigne(ligne);

    expect(r.statut).toBe("TO_MIGRATE");
    if (r.statut !== "TO_MIGRATE") return;

    expect(r.nouvelle.dateDebutPop.toISOString()).toBe("2026-05-02T18:30:00.000Z");
    expect(r.nouvelle.dateFinPop.toISOString()).toBe("2026-05-03T02:30:00.000Z");
    expect(r.nouvelle.jourPlanning.toISOString()).toBe("2026-05-01T22:00:00.000Z");
  });
});
