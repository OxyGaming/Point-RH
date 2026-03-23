/**
 * Tests unitaires — analyserRpAutourGpt
 *
 * Convention :
 *  - JS standard : 08:00 → 16:00 (amplitude 8h)
 *  - Gap entre deux JS consécutifs (J+1) : 16:00→08:00 = 16h — PAS un RP (< 36h)
 *  - Gap de 40h (J+2, de 16:00 à 08:00 surlendemain) — RP valide (≥ 36h)
 *  - Gap de 64h (J+3, de 16:00 à 08:00 trois jours après) — RP valide
 *  - rpSimpleMin = 36 × 60 = 2 160 min
 *
 * Rappel moteur :
 *  Un gap < rpSimpleMin entre deux JS → computeWorkSequences les fusionne dans
 *  la MÊME GPT. Il est donc impossible d'avoir rpAvantGptMin < 36h : ce cas
 *  produit une fusion et retourne rpAvantGptMin = null (pas de GPT précédente
 *  séparée). Les tests reflètent ce comportement réel.
 */

import { analyserRpAutourGpt } from "@/lib/simulation/gptRpAnalyser";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import type { PlanningEvent } from "@/engine/rules";

// ─── Constantes ───────────────────────────────────────────────────────────────

const RULES = DEFAULT_WORK_RULES_MINUTES;
const RP_SIMPLE_MIN = RULES.reposPeriodique.simple; // 2 160 min = 36h

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** JS standard 08:00→16:00 */
function makeJS(dateStr: string): PlanningEvent {
  return {
    dateDebut: new Date(`${dateStr}T08:00:00.000Z`),
    dateFin:   new Date(`${dateStr}T16:00:00.000Z`),
    heureDebut: "08:00",
    heureFin:   "16:00",
    amplitudeMin: 480,
    dureeEffectiveMin: 480,
    jsNpo: "JS",
    codeJs: "GIV001",
    typeJs: "GIV001",
  };
}

// ─── T1 : JS injectée devient nouveau PREMIER JS de la GPT ───────────────────
// Original : GPT_prev=[J01] |64h RP| GPT_A=[J04,J05]
// Injection J03 : J01.fin(16h)→J03.début(08h) = 40h ≥ 36h → J03 est nouveau 1er JS de GPT_A
// RP avant réduit 64h → 40h (toujours conforme)
// eventsOriginaux permettent de détecter la dégradation → AVANT
test("T1 — JS injectée réduit le RP avant GPT (64h→40h) → transitionImpactee AVANT", () => {
  const original: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT_prev (fin 16:00)
    // RP 64h : 16:00 J01 → 08:00 J04
    makeJS("2024-01-04"), // GPT_A J1
    makeJS("2024-01-05"), // GPT_A J2
    // RP 64h après
    makeJS("2024-01-08"), // GPT_next
  ];

  const simDate = new Date("2024-01-03T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"),
    // RP 40h : 16:00 J01 → 08:00 J03
    makeJS("2024-01-03"), // injectée ← nouveau premier JS de GPT_A
    makeJS("2024-01-04"),
    makeJS("2024-01-05"),
    // RP 64h après
    makeJS("2024-01-08"),
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES, original);

  expect(result).not.toBeNull();
  // RP avant = J01.fin(16h) → J03.début(08h) = 40h = 2400 min ✓
  expect(result!.rpAvantGptMin).toBe(40 * 60);
  expect(result!.rpAvantGptConforme).toBe(true); // ≥ 36h
  // Dégradé : était 64h, maintenant 40h
  expect(result!.transitionImpactee).toBe("AVANT");
  // GPT post-simulation
  expect(result!.premierJsDate).toBe("2024-01-03");
  expect(result!.gptLength).toBe(3); // J03, J04, J05
});

// ─── T2 : JS injectée devient nouveau DERNIER JS de la GPT ───────────────────
// Original : GPT_A=[J04,J05,J06] |64h RP| GPT_next=[J09]
// Injection J07 (J06.fin→J07.début = 16h < 36h → J07 IN GPT_A)
// RP après réduit 64h → 40h (J07.fin→J09.début = 40h)
test("T2 — JS injectée réduit le RP après GPT (64h→40h) → transitionImpactee APRES", () => {
  const original: PlanningEvent[] = [
    makeJS("2024-01-04"),
    makeJS("2024-01-05"),
    makeJS("2024-01-06"), // dernier JS GPT_A (fin 16:00)
    // RP 64h : 16:00 J06 → 08:00 J09
    makeJS("2024-01-09"),
  ];

  // Injection J07 : J06.fin→J07.début = 16h < 36h → J07 rejoint GPT_A
  const simDate = new Date("2024-01-07T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-04"),
    makeJS("2024-01-05"),
    makeJS("2024-01-06"),
    makeJS("2024-01-07"), // injectée ← nouveau dernier JS de GPT_A
    // RP 40h : 16:00 J07 → 08:00 J09
    makeJS("2024-01-09"),
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES, original);

  expect(result).not.toBeNull();
  // RP après = J07.fin(16h) → J09.début(08h) = 40h
  expect(result!.rpApresGptMin).toBe(40 * 60);
  expect(result!.rpApresGptConforme).toBe(true); // ≥ 36h
  // Dégradé : était 64h, maintenant 40h
  expect(result!.transitionImpactee).toBe("APRES");
  expect(result!.dernierJsDate).toBe("2024-01-07");
  expect(result!.gptLength).toBe(4); // J04, J05, J06, J07
});

// ─── T3 : JS injectée fusionne avec la GPT suivante, RP avant dégradé ────────
// Original : GPT_A=[J01,J02,J03] |64h RP| GPT_B=[J06,J07]
// Injection J05 : J03.fin→J05.début = 40h ≥ 36h (nouveau RP) → J05 commence une GPT
//                 J05.fin→J06.début = 16h < 36h → J05 fusionne dans GPT_B
// Résultat : GPT_A intact, GPT_B=[J05,J06,J07]
// simDate=J05, 1er JS original dans GPT_B = J06 → rpAvantOrig était 64h, maintenant 40h → AVANT
test("T3 — JS injectée fusionne avec GPT suivante → RP avant dégradé → AVANT", () => {
  const original: PlanningEvent[] = [
    makeJS("2024-01-01"),
    makeJS("2024-01-02"),
    makeJS("2024-01-03"), // GPT_A (fin 16:00)
    // RP 64h : J03.fin → J06.début
    makeJS("2024-01-06"), // GPT_B J1
    makeJS("2024-01-07"), // GPT_B J2
  ];

  const simDate = new Date("2024-01-05T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"),
    makeJS("2024-01-02"),
    makeJS("2024-01-03"),
    // RP 40h : J03.fin → J05.début
    makeJS("2024-01-05"), // injectée → fusionne avec J06 (16h gap → même GPT)
    makeJS("2024-01-06"),
    makeJS("2024-01-07"),
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES, original);

  expect(result).not.toBeNull();
  // GPT cible : [J05, J06, J07]
  expect(result!.premierJsDate).toBe("2024-01-05");
  expect(result!.gptLength).toBe(3);
  // RP avant de la nouvelle GPT_B = J03.fin→J05.début = 40h
  expect(result!.rpAvantGptMin).toBe(40 * 60);
  expect(result!.rpAvantGptConforme).toBe(true);
  // Dégradé par rapport à l'original (64h→40h)
  expect(result!.transitionImpactee).toBe("AVANT");
});

// ─── T4 : JS au milieu d'une GPT, bornes inchangées, aucune dégradation ──────
// Original : GPT_prev=[J01] |64h RP| GPT_A=[J04,J06] |64h RP| GPT_next=[J09]
// Injection J05 (dans GPT_A, entre J04 et J06 qui se suivaient à 40h)
// J04.fin→J05.début = 16h < 36h → J05 fusionne dans GPT_A
// J05.fin→J06.début = 16h < 36h → J06 reste dans GPT_A
// Résultat : GPT_A=[J04,J05,J06], bornes RP inchangées
test("T4 — JS au milieu de GPT, bornes RP inchangées → AUCUNE", () => {
  const original: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT_prev
    makeJS("2024-01-04"), // GPT_A J1
    makeJS("2024-01-06"), // GPT_A J2 (gap J04→J06 = 40h ≥ 36h → était une frontière GPT ?)
    // Non : 16:00 J04 → 08:00 J06 = 40h ≥ 36h, donc J04 et J06 sont dans DEUX GPTs dans l'original.
    // On doit ajuster pour qu'ils soient dans la même GPT.
    // Utilisons J04→J05 consécutifs (gap 16h < 36h) et injection J05 inchangée.
    makeJS("2024-01-09"), // GPT_next
  ];
  // Note : dans original, J04 et J06 ont un gap de 40h → deux GPTs séparées.
  // Pour avoir J04 et J06 dans la même GPT (avant injection de J05),
  // il faut que le gap J04→J05→J06 soit < 36h.
  // On adapte : original = [J04, J06] comme GPT distinctes → injecter J05 entre les deux.
  // Après injection : GPT=[J04,J05,J06] mais dans l'original il y avait deux GPTs.
  // Ce scénario teste en réalité la fusion J05 avec J06.
  // Refaire avec un vrai "milieu" : original GPT_A=[J04,J05,J06], injection J05 (C→JS).

  // Scénario corrigé : J05 était un NPO-C (compté dans GPT mais horaires conservés).
  // On simule le remplacement C→JS : les bornes de GPT_A sont inchangées.
  const original2: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT_prev
    // RP 64h
    makeJS("2024-01-04"), // GPT_A J1
    {                     // GPT_A J2 — NPO type C (compte dans GPT, non-JS)
      dateDebut: new Date("2024-01-05T08:00:00.000Z"),
      dateFin:   new Date("2024-01-05T16:00:00.000Z"),
      heureDebut: "08:00", heureFin: "16:00",
      amplitudeMin: 480, dureeEffectiveMin: 480,
      jsNpo: "NPO" as const,
      codeJs: "C",
      typeJs: "C",
    },
    makeJS("2024-01-06"), // GPT_A J3
    // RP 64h
    makeJS("2024-01-09"), // GPT_next
  ];

  const simDate = new Date("2024-01-05T08:00:00.000Z");
  // Injection JS à la place du C — même date, les bornes GPT_A sont inchangées
  const simules2: PlanningEvent[] = [
    makeJS("2024-01-01"),
    makeJS("2024-01-04"),
    makeJS("2024-01-05"), // injectée (C → JS)
    makeJS("2024-01-06"),
    makeJS("2024-01-09"),
  ];

  const result = analyserRpAutourGpt(simules2, simDate, RULES, original2);

  expect(result).not.toBeNull();
  expect(result!.premierJsDate).toBe("2024-01-04");
  expect(result!.dernierJsDate).toBe("2024-01-06");
  // RP avant inchangé : J01.fin→J04.début = 64h
  expect(result!.rpAvantGptMin).toBe(64 * 60);
  expect(result!.rpAvantGptConforme).toBe(true);
  // RP après inchangé : J06.fin→J09.début = 64h
  expect(result!.rpApresGptMin).toBe(64 * 60);
  expect(result!.rpApresGptConforme).toBe(true);
  // Aucune dégradation
  expect(result!.transitionImpactee).toBe("AUCUNE");
});

// ─── T5 : RP avant exactement 36h → conforme ────────────────────────────────
// fin GPT_prev = 08:00 J01, début GPT_cible = 20:00 J02 → écart = 36h exactement
test("T5 — RP avant exactement 36h → rpAvantGptConforme true", () => {
  // GPT_prev finit J01 à 08:00, GPT_cible commence J02 à 20:00 → 36h
  const gptPrevFin   = new Date("2024-01-01T08:00:00.000Z");
  const gptCibleDebut = new Date("2024-01-02T20:00:00.000Z");
  expect(
    (gptCibleDebut.getTime() - gptPrevFin.getTime()) / 60000
  ).toBe(RP_SIMPLE_MIN); // sanity check : exactement 36h

  const simDate = gptCibleDebut;
  const simules: PlanningEvent[] = [
    {
      dateDebut: new Date("2024-01-01T00:00:00.000Z"),
      dateFin:   gptPrevFin,
      heureDebut: "00:00", heureFin: "08:00",
      amplitudeMin: 480, dureeEffectiveMin: 480,
      jsNpo: "JS", codeJs: "GIV001", typeJs: "GIV001",
    },
    {
      dateDebut: gptCibleDebut,
      dateFin:   new Date("2024-01-03T04:00:00.000Z"),
      heureDebut: "20:00", heureFin: "04:00",
      amplitudeMin: 480, dureeEffectiveMin: 480,
      jsNpo: "JS", codeJs: "GIV001", typeJs: "GIV001",
    },
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES);

  expect(result).not.toBeNull();
  expect(result!.rpAvantGptMin).toBe(RP_SIMPLE_MIN); // 2160 min = exactement 36h
  expect(result!.rpAvantGptConforme).toBe(true);
});

// ─── T6 : JS injectée fusionne avec GPT précédente → RP après orig disparu ───
// En V1, un gap < 36h provoque la fusion (pas de rpAvantGptMin non-conforme).
// Ce test vérifie que la fusion est détectée via la disparition du RP après la GPT originale.
//
// Original : GPT_prev=[J01] |40h RP| GPT_A=[J03,J04]
// Injection J02 : J01.fin(16h)→J02.début(08h) = 16h < 36h → FUSION
// Résultat : une seule GPT=[J01,J02,J03,J04], rpAvantGptMin=null, rpApresGptMin=null
// Avec eventsOriginaux : anchor = J01 (idx=0 dans sequencesAvant=[J01] et [J03,J04])
// rpApresOrig de GPT_prev=[J01] = 40h, rpApresApres = null → apresDegradé → APRES
test("T6 — Fusion avec GPT précédente détectée via disparition du RP → APRES", () => {
  const original: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT_prev (fin 16:00)
    // RP 40h : 16:00 J01 → 08:00 J03
    makeJS("2024-01-03"), // GPT_A J1
    makeJS("2024-01-04"), // GPT_A J2
  ];

  const simDate = new Date("2024-01-02T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"),
    makeJS("2024-01-02"), // injectée (gap 16h → fusion avec J01)
    makeJS("2024-01-03"),
    makeJS("2024-01-04"),
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES, original);

  expect(result).not.toBeNull();
  // Après fusion : une seule GPT, pas de GPT précédente séparée
  expect(result!.rpAvantGptMin).toBeNull();
  expect(result!.rpAvantGptConforme).toBeNull();
  // Pas de GPT suivante dans ce planning
  expect(result!.rpApresGptMin).toBeNull();
  expect(result!.rpApresGptConforme).toBeNull();
  // La fusion a détruit le RP qui existait après GPT_prev → dégradation détectée
  expect(result!.transitionImpactee).toBe("APRES");
});

// ─── T7 : Pas de GPT précédente ──────────────────────────────────────────────
test("T7 — Pas de GPT précédente → rpAvantGptMin null, rpAvantGptConforme null", () => {
  const simDate = new Date("2024-01-04T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-04"),
    makeJS("2024-01-05"),
    makeJS("2024-01-06"),
    // RP 64h
    makeJS("2024-01-09"),
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES);

  expect(result).not.toBeNull();
  expect(result!.rpAvantGptMin).toBeNull();
  expect(result!.rpAvantGptConforme).toBeNull();
  expect(result!.gptPrecedenteFin).toBeNull();
  // RP après : J06.fin→J09.début = 64h ✓
  expect(result!.rpApresGptMin).toBe(64 * 60);
  expect(result!.rpApresGptConforme).toBe(true);
});

// ─── T8 : Pas de GPT suivante ─────────────────────────────────────────────────
test("T8 — Pas de GPT suivante → rpApresGptMin null, rpApresGptConforme null", () => {
  const simDate = new Date("2024-01-04T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT précédente
    // RP 64h
    makeJS("2024-01-04"),
    makeJS("2024-01-05"),
    makeJS("2024-01-06"),
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES);

  expect(result).not.toBeNull();
  expect(result!.rpApresGptMin).toBeNull();
  expect(result!.rpApresGptConforme).toBeNull();
  expect(result!.gptSuivanteDebut).toBeNull();
  // RP avant : J01.fin→J04.début = 64h ✓
  expect(result!.rpAvantGptMin).toBe(64 * 60);
  expect(result!.rpAvantGptConforme).toBe(true);
});

// ─── T9 : Sans eventsOriginaux — tout conforme → AUCUNE ──────────────────────
// En V1, computeWorkSequences garantit que tout gap entre séquences ≥ 36h.
// Sans référence originale, transitionImpactee = "AUCUNE" (aucune non-conformité possible).
test("T9 — Sans eventsOriginaux, RPs conformes → transitionImpactee AUCUNE", () => {
  const simDate = new Date("2024-01-04T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT_prev (fin 16:00)
    // RP 64h
    makeJS("2024-01-04"), // GPT_cible J1 ← simDate
    makeJS("2024-01-05"), // GPT_cible J2
    makeJS("2024-01-06"), // GPT_cible J3
    // RP 64h
    makeJS("2024-01-09"), // GPT_next
  ];

  // Pas de eventsOriginaux fournis
  const result = analyserRpAutourGpt(simules, simDate, RULES);

  expect(result).not.toBeNull();
  expect(result!.rpAvantGptMin).toBe(64 * 60);   // 64h ✓
  expect(result!.rpAvantGptConforme).toBe(true);
  expect(result!.rpApresGptMin).toBe(64 * 60);   // 64h ✓
  expect(result!.rpApresGptConforme).toBe(true);
  expect(result!.transitionImpactee).toBe("AUCUNE");
});

// ─── T10 : Planning vide → null ───────────────────────────────────────────────
test("T10 — Planning vide → null", () => {
  const result = analyserRpAutourGpt([], new Date("2024-01-04T08:00:00.000Z"), RULES);
  expect(result).toBeNull();
});

// ─── T10b : simDate absente de toute séquence → null ─────────────────────────
test("T10b — simDate absente de toute séquence → null", () => {
  const simDate = new Date("2024-01-10T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"),
    makeJS("2024-01-02"),
  ];
  const result = analyserRpAutourGpt(simules, simDate, RULES);
  expect(result).toBeNull();
});

// ─── T11 : Vérification des champs d'identité ────────────────────────────────
test("T11 — Champs d'identité gptLength, premierJsDate, dernierJsDate, minRequis", () => {
  const simDate = new Date("2024-01-05T08:00:00.000Z");
  const simules: PlanningEvent[] = [
    makeJS("2024-01-01"), // GPT_prev
    // RP 64h
    makeJS("2024-01-04"), // GPT_cible J1
    makeJS("2024-01-05"), // GPT_cible J2 ← simDate
    makeJS("2024-01-06"), // GPT_cible J3
    // RP 64h
    makeJS("2024-01-09"), // GPT_next
  ];

  const result = analyserRpAutourGpt(simules, simDate, RULES);

  expect(result).not.toBeNull();
  expect(result!.gptLength).toBe(3);
  expect(result!.premierJsDate).toBe("2024-01-04");
  expect(result!.dernierJsDate).toBe("2024-01-06");
  expect(result!.rpAvantGptMinRequis).toBe(RP_SIMPLE_MIN);
  expect(result!.rpApresGptMinRequis).toBe(RP_SIMPLE_MIN);
  // Présence des bornes ISO
  expect(result!.gptPrecedenteFin).not.toBeNull();
  expect(result!.gptSuivanteDebut).not.toBeNull();
});
