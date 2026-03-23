/**
 * Tests unitaires — Détecteur de conflits induits
 *
 * Couvre :
 *  - Repos insuffisant après JS injectée → REPOS_INSUFFISANT
 *  - Supplément +20 min appliqué à toutes les transitions (correction #5)
 *  - Repos suffisant → aucun conflit
 *  - GPT_MAX → conflit non résolvable
 *  - Détection correcte avec poste de nuit (14h requis)
 */

import { detecterConflitsInduits } from "@/lib/simulation/conflictDetector";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { PlanningEvent } from "@/engine/rules";

const rules = DEFAULT_WORK_RULES_MINUTES;

// ─── Builder ──────────────────────────────────────────────────────────────────

function makeEvent(
  dateIso: string,
  heureDebut: string,
  heureFin: string,
  opts: {
    jsNpo?: "JS" | "NPO";
    codeJs?: string | null;
    dureeEffectiveMin?: number | null;
  } = {}
): PlanningEvent {
  const [hD, mD] = heureDebut.split(":").map(Number);
  const [hF, mF] = heureFin.split(":").map(Number);

  const debut = new Date(dateIso);
  debut.setHours(hD, mD, 0, 0);

  const fin = new Date(dateIso);
  fin.setHours(hF, mF, 0, 0);
  // Gérer le passage minuit (heureFin < heureDebut)
  if (fin <= debut) fin.setDate(fin.getDate() + 1);

  return {
    dateDebut:         debut,
    dateFin:           fin,
    heureDebut,
    heureFin,
    amplitudeMin:      Math.round((fin.getTime() - debut.getTime()) / 60000),
    dureeEffectiveMin: opts.dureeEffectiveMin ?? null,
    jsNpo:             opts.jsNpo  ?? "JS",
    codeJs:            opts.codeJs ?? "GIV001",
    typeJs:            null,
  };
}

// ─── 1. Repos insuffisant → conflit REPOS_INSUFFISANT ─────────────────────────

describe("detecterConflitsInduits — repos insuffisant", () => {
  it("repos < 12h entre JS injectée et JS suivante → conflit REPOS_INSUFFISANT", () => {
    // JS injectée : 06h–14h J+0
    const jsInjectee = makeEvent("2024-03-20", "06:00", "14:00");
    // JS suivante  : 20h J+0 (seulement 6h de repos)
    const jsSuivante = makeEvent("2024-03-20", "20:00", "04:00");

    const events = [jsInjectee, jsSuivante];
    const finJs  = jsInjectee.dateFin;

    const conflits = detecterConflitsInduits(events, finJs, false, true, rules);

    expect(conflits.some(c => c.type === "REPOS_INSUFFISANT")).toBe(true);
    expect(conflits[0].resolvable).toBe(true);
  });

  it("repos >= 12h → aucun conflit REPOS_INSUFFISANT", () => {
    // JS injectée : 06h–14h J+0
    const jsInjectee = makeEvent("2024-03-20", "06:00", "14:00");
    // JS suivante  : 06h J+1 (16h de repos — suffisant)
    const jsSuivante = makeEvent("2024-03-21", "06:00", "14:00");

    const events = [jsInjectee, jsSuivante];
    const finJs  = jsInjectee.dateFin;

    const conflits = detecterConflitsInduits(events, finJs, false, false, rules);

    expect(conflits.some(c => c.type === "REPOS_INSUFFISANT")).toBe(false);
  });
});

// ─── 2. Supplément +20 min — toutes les transitions (correction #5) ───────────

describe("detecterConflitsInduits — supplément +20 min", () => {
  it("JS injectée avec TE > 6h → repos requis suivant augmenté de +20 min", () => {
    const seuilTE  = rules.pause.seuilTE;          // 360 min
    const supplement = rules.pause.supplementSansCoupure; // 20 min
    const reposBase  = rules.reposJournalier.standard;    // 720 min (12h)
    const reposAttendu = reposBase + supplement;          // 740 min

    // JS injectée : 8h de durée effective (> 6h) — finit à 16h
    const jsInjectee = makeEvent("2024-03-20", "08:00", "16:00", {
      dureeEffectiveMin: seuilTE + 60, // 420 min (7h)
    });

    // JS suivante : commence 12h après la fin = 04h J+1 (repos = 720 min)
    // Avec supplément : repos requis = 740 min → 720 < 740 → conflit attendu
    const jsSuivante = makeEvent("2024-03-21", "04:00", "12:00");

    const events = [jsInjectee, jsSuivante];
    const finJs  = jsInjectee.dateFin;

    const conflits = detecterConflitsInduits(events, finJs, false, false, rules);

    // Le conflit doit mentionner le supplément +20 min
    const conflitRepos = conflits.find(c => c.type === "REPOS_INSUFFISANT");
    expect(conflitRepos).toBeDefined();
    expect(conflitRepos?.description).toContain("+20");
  });

  it("JS injectée avec TE <= 6h → pas de supplément, repos requis = standard", () => {
    const seuilTE  = rules.pause.seuilTE; // 360 min
    const reposBase = rules.reposJournalier.standard; // 720 min

    // JS injectée : 6h de durée effective (= seuil, pas au-dessus)
    const jsInjectee = makeEvent("2024-03-20", "08:00", "16:00", {
      dureeEffectiveMin: seuilTE, // exactement 6h
    });

    // JS suivante : repos exact = 720 min (12h pile)
    // Sans supplément : 720 >= 720 → pas de conflit
    const jsSuivante = makeEvent("2024-03-21", "04:00", "12:00");

    const events = [jsInjectee, jsSuivante];
    const finJs  = jsInjectee.dateFin;

    const conflits = detecterConflitsInduits(events, finJs, false, false, rules);

    // Pas de conflit repos (repos = min requis, pas de supplément)
    expect(conflits.some(c => c.type === "REPOS_INSUFFISANT")).toBe(false);
  });

  it("poste de nuit précédent → repos requis = 14h (supplément nuit prioritaire)", () => {
    // JS injectée : poste de nuit 22h–06h (chevauche période nocturne > 2h30)
    const jsInjectee = makeEvent("2024-03-20", "22:00", "06:00", {
      dureeEffectiveMin: 480, // > 6h
    });

    // JS suivante : commence 12h après la fin J+1 = 18h (repos = 12h)
    // Avec nuit : repos requis = 14h → 12h < 14h → conflit attendu
    const jsSuivante = makeEvent("2024-03-21", "18:00", "02:00");

    const events = [jsInjectee, jsSuivante];
    const finJs  = jsInjectee.dateFin;

    const conflits = detecterConflitsInduits(events, finJs, false, false, rules);

    const conflitRepos = conflits.find(c => c.type === "REPOS_INSUFFISANT");
    expect(conflitRepos).toBeDefined();
    expect(conflitRepos?.description).toContain("post-nuit");
  });
});

// ─── 3. GPT_MAX — conflit non résolvable ──────────────────────────────────────

describe("detecterConflitsInduits — GPT_MAX", () => {
  it("7 JS consécutives → conflit GPT_MAX non résolvable", () => {
    // Construire 7 jours consécutifs (JS de 8h, gap de 16h entre chaque)
    const events: PlanningEvent[] = [];
    for (let i = 0; i < 7; i++) {
      const date   = new Date("2024-03-20");
      date.setDate(date.getDate() + i);
      const iso    = date.toISOString().slice(0, 10);
      events.push(makeEvent(iso, "08:00", "16:00"));
    }

    // La JS injectée est la 7ème → devrait déclencher GPT_MAX (max = 6)
    const jsInjectee = events[6];
    const finJs      = jsInjectee.dateFin;

    const conflits = detecterConflitsInduits(events, finJs, false, false, rules);

    expect(conflits.some(c => c.type === "GPT_MAX")).toBe(true);
    expect(conflits.find(c => c.type === "GPT_MAX")?.resolvable).toBe(false);
  });
});

// ─── 4. Agent de réserve — repos réduit (10h) ─────────────────────────────────

describe("detecterConflitsInduits — réserve", () => {
  it("agent réserve + remplacement → repos requis = 10h (600 min)", () => {
    const reposReduit = rules.reposJournalier.reduitReserve; // 600 min

    // JS injectée : finit à 16h
    const jsInjectee = makeEvent("2024-03-20", "08:00", "16:00", {
      dureeEffectiveMin: 300, // 5h <= 6h → pas de supplément
    });

    // JS suivante : commence 11h après (pas assez pour 12h standard, mais ok pour 10h réserve)
    // 16h + 10h = 02h le lendemain → JS à 02h30 → repos = 10h30 (630 min > 600 min réserve)
    const jsSuivante = makeEvent("2024-03-21", "02:30", "10:30");

    const events = [jsInjectee, jsSuivante];
    const finJs  = jsInjectee.dateFin;

    // agentReserve=true, remplacement=true → repos réduit applicable
    const conflits = detecterConflitsInduits(events, finJs, true, true, rules);

    // 630 min >= 600 min → pas de conflit avec le repos réduit réserve
    expect(conflits.some(c => c.type === "REPOS_INSUFFISANT")).toBe(false);
  });
});
