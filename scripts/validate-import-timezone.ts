/**
 * Script de validation manuelle — étape 2 (timezone-aware import).
 *
 * Construit un mini-fichier TXT inspiré de cas réels SNCF (issus de la base
 * actuelle, pré-fix), le passe dans le pipeline d'import (parseTxtRows +
 * normalizeRows + jourPlanningFromDate), et affiche un rapport visuel pour
 * validation manuelle de la convention temporelle.
 *
 * Usage :
 *   npx tsx scripts/validate-import-timezone.mts
 *
 * Aucun effet sur la base — calcul pur en mémoire.
 *
 * Convention attendue après le fix de l'étape 2 :
 *   - DATE DEBUT/FIN POP du fichier = jour calendaire Paris
 *   - HEURE DEBUT/FIN POP du fichier = heure Paris ("HH:MM")
 *   → dateDebutPop / dateFinPop générés = instant UTC absolu
 *   → jourPlanning = minuit Paris du jour de prise (en UTC)
 *
 * Validation principale : "12:30 Paris été" → dateDebutPop se termine en T10:30:00.000Z
 */

import { parseTxtRows } from "../src/services/import/parseTxt";
import { normalizeRows } from "../src/services/import/normalizeRows";
import { jourPlanningFromDate } from "../src/services/import.service";
import { formatDateParis, formatTimeParis } from "../src/lib/timezone";

// ─── Mini-fichier source : 5 cas typiques inspirés de la base ────────────────
//
// Format TXT SNCF tab-separated (\t).
// Cas inclus :
//   1. JS de jour été — Brouillat GIV005R 02/05/2026 12:30→20:30
//   2. JS de jour été — Brouillat GIC015 03/05/2026 12:20→20:20
//   3. JS de nuit été — Poncet GIC006R 03/05→04/05 20:30→04:30 (cross-midnight)
//   4. NPO RP été — Brouillat 04/05/2026 06:00→15:00
//   5. JS de jour hiver — Brouillat GIC015 15/12/2026 12:20→20:20

const HEADERS = [
  "UCH",
  "CODE UCH",
  "NOM",
  "PRENOM",
  "CODE IMMATRICULATION",
  "CODE APES",
  "CODE SYMBOLE GRADE",
  "CODE COLLEGE GRADE",
  "DATE DEBUT POP / NPO",
  "HEURE DEBUT POP / NPO",
  "HEURE FIN POP / NPO",
  "DATE FIN POP / NPO",
  "AMPLITUDE POP / NPO (100E/HEURE)",
  "AMPLITUDE POP / NPO (HH:MM)",
  "DUREE EFFECTIVE POP (100E/HEURE)",
  "DUREE EFFECTIVE POP (HH:MM)",
  "JS / NPO",
  "CODE JS / CODE NPO",
  "TYPE JS / FAM. NPO",
  "VALEUR NPO",
  "UCH JS",
  "CODE UCH JS",
  "CODE ROULEMENT JS",
  "NUMERO JS",
];

const ROWS_DATA: Array<Record<string, string>> = [
  {
    "UCH": "RIVE DROITE NORD",
    "CODE UCH": "933705",
    "NOM": "BROUILLAT",
    "PRENOM": "DOMINIQUE",
    "CODE IMMATRICULATION": "6505266S",
    "DATE DEBUT POP / NPO": "02/05/2026",
    "HEURE DEBUT POP / NPO": "12:30",
    "HEURE FIN POP / NPO": "20:30",
    "DATE FIN POP / NPO": "02/05/2026",
    "JS / NPO": "JS",
    "CODE JS / CODE NPO": "GIV005R",
  },
  {
    "UCH": "RIVE DROITE NORD",
    "CODE UCH": "933705",
    "NOM": "BROUILLAT",
    "PRENOM": "DOMINIQUE",
    "CODE IMMATRICULATION": "6505266S",
    "DATE DEBUT POP / NPO": "03/05/2026",
    "HEURE DEBUT POP / NPO": "12:20",
    "HEURE FIN POP / NPO": "20:20",
    "DATE FIN POP / NPO": "03/05/2026",
    "JS / NPO": "JS",
    "CODE JS / CODE NPO": "GIC015",
  },
  {
    "UCH": "RIVE DROITE NORD",
    "CODE UCH": "933705",
    "NOM": "PONCET",
    "PRENOM": "THIERRY",
    "CODE IMMATRICULATION": "7211574T",
    "DATE DEBUT POP / NPO": "03/05/2026",
    "HEURE DEBUT POP / NPO": "20:30",
    "HEURE FIN POP / NPO": "04:30",
    "DATE FIN POP / NPO": "04/05/2026",
    "JS / NPO": "JS",
    "CODE JS / CODE NPO": "GIC006R",
  },
  {
    "UCH": "RIVE DROITE NORD",
    "CODE UCH": "933705",
    "NOM": "BROUILLAT",
    "PRENOM": "DOMINIQUE",
    "CODE IMMATRICULATION": "6505266S",
    "DATE DEBUT POP / NPO": "04/05/2026",
    "HEURE DEBUT POP / NPO": "06:00",
    "HEURE FIN POP / NPO": "15:00",
    "DATE FIN POP / NPO": "04/05/2026",
    "JS / NPO": "NPO",
    "CODE JS / CODE NPO": "RP",
  },
  {
    "UCH": "RIVE DROITE NORD",
    "CODE UCH": "933705",
    "NOM": "BROUILLAT",
    "PRENOM": "DOMINIQUE",
    "CODE IMMATRICULATION": "6505266S",
    "DATE DEBUT POP / NPO": "15/12/2026",
    "HEURE DEBUT POP / NPO": "12:20",
    "HEURE FIN POP / NPO": "20:20",
    "DATE FIN POP / NPO": "15/12/2026",
    "JS / NPO": "JS",
    "CODE JS / CODE NPO": "GIC015",
  },
];

// ─── Construction du buffer TXT ───────────────────────────────────────────────

function buildTxtBuffer(): Buffer {
  const lines = [HEADERS.join("\t")];
  for (const row of ROWS_DATA) {
    lines.push(HEADERS.map((h) => row[h] ?? "").join("\t"));
  }
  return Buffer.from(lines.join("\n"), "utf-8");
}

// ─── Exécution + rapport ──────────────────────────────────────────────────────

function main(): void {
  console.log("─".repeat(80));
  console.log("Validation pipeline d'import — Phase 1.A étape 2");
  console.log("─".repeat(80));
  console.log();

  const buffer = buildTxtBuffer();
  const { rows, headers } = parseTxtRows(buffer);
  const { lignes, erreurs } = normalizeRows(rows, headers);

  if (erreurs.length > 0) {
    console.log("⚠ Erreurs de normalisation :");
    for (const e of erreurs) console.log(`  Ligne ${e.ligne} (${e.champ}): ${e.message}`);
    console.log();
  }

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const src = ROWS_DATA[i];
    const jp = jourPlanningFromDate(l.dateDebutPop);
    const offsetDebut = (l.dateDebutPop.getTime() - new Date(l.dateDebutPop.toISOString().slice(0, 10)).getTime()) / 3600000;

    console.log(`Cas ${i + 1} — ${src["NOM"]} ${src["CODE JS / CODE NPO"]}`);
    console.log(`  ENTRÉE (fichier) :`);
    console.log(`    DATE DEBUT POP    = ${src["DATE DEBUT POP / NPO"]}`);
    console.log(`    HEURE DEBUT POP   = ${src["HEURE DEBUT POP / NPO"]}`);
    console.log(`    HEURE FIN POP     = ${src["HEURE FIN POP / NPO"]}`);
    console.log(`    DATE FIN POP      = ${src["DATE FIN POP / NPO"]}`);
    console.log(`  SORTIE (pipeline) :`);
    console.log(`    dateDebutPop UTC  = ${l.dateDebutPop.toISOString()}`);
    console.log(`    dateDebutPop Paris= ${formatDateParis(l.dateDebutPop)} ${formatTimeParis(l.dateDebutPop)}`);
    console.log(`    dateFinPop UTC    = ${l.dateFinPop.toISOString()}`);
    console.log(`    dateFinPop Paris  = ${formatDateParis(l.dateFinPop)} ${formatTimeParis(l.dateFinPop)}`);
    console.log(`    jourPlanning UTC  = ${jp.toISOString()}`);
    console.log(`    jourPlanning Paris= ${formatDateParis(jp)} ${formatTimeParis(jp)} (= minuit Paris du jour de prise)`);
    console.log();
  }

  // ─── Vérifications automatiques sur les cas clés ────────────────────────────
  console.log("─".repeat(80));
  console.log("Vérifications automatiques");
  console.log("─".repeat(80));

  const checks: Array<{ ok: boolean; label: string }> = [];

  // Cas 1 : Brouillat 02/05 12:30 Paris été = 10:30 UTC
  checks.push({
    ok: lignes[0].dateDebutPop.toISOString() === "2026-05-02T10:30:00.000Z",
    label: 'Cas 1 (été 12:30 Paris) → dateDebutPop = "2026-05-02T10:30:00.000Z"',
  });

  // Cas 3 : Poncet GIC006R nuit — début 03/05 20:30 Paris été = 18:30 UTC
  checks.push({
    ok: lignes[2].dateDebutPop.toISOString() === "2026-05-03T18:30:00.000Z",
    label: 'Cas 3 (nuit 20:30 Paris été du 03/05) → dateDebutPop = "2026-05-03T18:30:00.000Z"',
  });

  // Cas 3 : Poncet GIC006R nuit — fin 04/05 04:30 Paris été = 02:30 UTC
  checks.push({
    ok: lignes[2].dateFinPop.toISOString() === "2026-05-04T02:30:00.000Z",
    label: 'Cas 3 (nuit fin 04:30 Paris été du 04/05) → dateFinPop = "2026-05-04T02:30:00.000Z"',
  });

  // Cas 5 : hiver 12:20 Paris hiver = 11:20 UTC
  checks.push({
    ok: lignes[4].dateDebutPop.toISOString() === "2026-12-15T11:20:00.000Z",
    label: 'Cas 5 (hiver 12:20 Paris) → dateDebutPop = "2026-12-15T11:20:00.000Z"',
  });

  // Cohérence jourPlanning : tous doivent être à 22:00 UTC (été) ou 23:00 UTC (hiver)
  const jp1 = jourPlanningFromDate(lignes[0].dateDebutPop);
  checks.push({
    ok: jp1.toISOString() === "2026-05-01T22:00:00.000Z",
    label: 'Cas 1 jourPlanning = "2026-05-01T22:00:00.000Z" (= minuit Paris du 02/05 été)',
  });

  const jp3 = jourPlanningFromDate(lignes[2].dateDebutPop);
  checks.push({
    ok: jp3.toISOString() === "2026-05-02T22:00:00.000Z",
    label: 'Cas 3 jourPlanning = "2026-05-02T22:00:00.000Z" (= minuit Paris du 03/05, jour de PRISE)',
  });

  const jp5 = jourPlanningFromDate(lignes[4].dateDebutPop);
  checks.push({
    ok: jp5.toISOString() === "2026-12-14T23:00:00.000Z",
    label: 'Cas 5 jourPlanning = "2026-12-14T23:00:00.000Z" (= minuit Paris du 15/12 hiver)',
  });

  // Suppress unused warning for offsetDebut — utile en debug
  void 0;

  let allOk = true;
  for (const c of checks) {
    const sigil = c.ok ? "✓" : "✗";
    console.log(`  ${sigil} ${c.label}`);
    if (!c.ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log("✓ Toutes les vérifications passent — convention timezone respectée.");
    console.log();
    console.log("À faire ensuite : valider visuellement les blocs ci-dessus contre");
    console.log("ce que tu attends pour ton fichier source SNCF réel. Si la");
    console.log("convention diverge (ex: DATE = jour comptable au lieu de jour de");
    console.log("prise), on adaptera avant l'étape 3 (migration).");
  } else {
    console.log("✗ Certaines vérifications échouent — voir détails ci-dessus.");
    process.exit(1);
  }
}

main();
