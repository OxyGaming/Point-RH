/**
 * Normalisation métier commune Excel + TXT
 *
 * Transforme les NormRow (brutes, source-agnostiques) en PlanningLigneRaw
 * typées et validées.
 *
 * Gère :
 *   - Dates Excel (serial number, Date object, "yyyy-mm-dd")
 *   - Dates TXT   ("dd/MM/yyyy")
 *   - Heures Excel (fraction décimale, Date object)
 *   - Heures TXT   ("HH:MM:SS" ou "HH:MM")
 *   - Nombres (string "123" → number pour TXT, number direct pour Excel)
 */
import * as XLSX from "xlsx";
import type { PlanningLigneRaw, ImportErreur, JsNpo } from "@/types/planning";
import { buildFieldToHeaderMap } from "./headers";
import { combineDateTimeParis, formatDateParis } from "@/lib/timezone";

// ─── Type intermédiaire ───────────────────────────────────────────────────────

/** Représentation unifiée d'une ligne parsée (Excel ou TXT) */
export interface NormRow {
  source: "excel" | "txt";
  lineNumber: number;
  display: Record<string, unknown>; // valeurs formatées / strings
  raw: Record<string, unknown>;     // valeurs brutes (fractions Excel ; = display pour TXT)
}

// ─── Conversions ──────────────────────────────────────────────────────────────

/** Convertit toute valeur en Date : serial Excel, Date object, ISO, dd/MM/yyyy */
function parseAnyDate(val: unknown): Date | null {
  if (!val && val !== 0) return null;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  if (typeof val === "number") {
    // Serial date Excel
    try {
      const d = XLSX.SSF.parse_date_code(val);
      if (!d) return null;
      return new Date(Date.UTC(d.y, d.m - 1, d.d));
    } catch {
      return null;
    }
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Format dd/MM/yyyy (TXT)
    const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (ddmmyyyy) {
      const d = parseInt(ddmmyyyy[1], 10);
      const m = parseInt(ddmmyyyy[2], 10);
      const y = parseInt(ddmmyyyy[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return new Date(Date.UTC(y, m - 1, d));
      }
    }

    // Format yyyy-mm-dd (Excel formaté) ou ISO
    const iso = new Date(trimmed);
    return isNaN(iso.getTime()) ? null : iso;
  }

  return null;
}

/** Convertit toute valeur en "HH:MM" */
function parseAnyTime(val: unknown): string {
  if (!val && val !== 0) return "00:00";

  if (val instanceof Date) {
    const h = val.getUTCHours().toString().padStart(2, "0");
    const m = val.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  if (typeof val === "number") {
    // Fraction Excel : 0.25 = 06:00
    const totalSec = Math.round(val * 86400);
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  if (typeof val === "string") {
    // "HH:MM:SS" → "HH:MM"  |  "HH:MM" → "HH:MM"
    const trimmed = val.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed.slice(0, 5).padStart(5, "0");
    }
    return "00:00";
  }

  return "00:00";
}

/** Parse un entier depuis string ou number */
function parseIntOrNull(val: unknown): number | null {
  if (typeof val === "number") return Number.isInteger(val) ? val : Math.round(val);
  if (typeof val === "string" && val.trim()) {
    const n = parseInt(val.trim(), 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

/** Parse un float depuis string ou number */
function parseFloatOrNull(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.trim()) {
    const n = parseFloat(val.trim().replace(",", "."));
    return isNaN(n) ? null : n;
  }
  return null;
}

/** Extrait une string, retourne null si vide */
function str(val: unknown): string | null {
  const s = String(val ?? "").trim();
  return s === "" || s === "null" ? null : s;
}

// ─── Normalisation principale ─────────────────────────────────────────────────

export interface NormalizeResult {
  lignes: (PlanningLigneRaw & { _rowNum: number })[];
  erreurs: ImportErreur[];
}

/**
 * Normalise un tableau de NormRow vers des PlanningLigneRaw typées.
 * Valide les champs obligatoires et collecte les erreurs sans interrompre.
 *
 * @param rows    Lignes parsées (source Excel ou TXT)
 * @param headers En-têtes bruts du fichier (dans leur ordre d'origine)
 */
export function normalizeRows(rows: NormRow[], headers: string[]): NormalizeResult {
  const erreurs: ImportErreur[] = [];
  const lignes: (PlanningLigneRaw & { _rowNum: number })[] = [];

  // Construire la map : champ interne → en-tête réel dans les données
  const f2h = buildFieldToHeaderMap(headers);

  /** Récupère la valeur d'un champ (display ou raw selon le type de champ) */
  const getDisplay = (row: NormRow, field: keyof PlanningLigneRaw): unknown => {
    const header = f2h.get(field);
    return header !== undefined ? row.display[header] : null;
  };

  /** Pour les champs temps (heures, amplitude HHMM) : utilise raw sur Excel */
  const getRaw = (row: NormRow, field: keyof PlanningLigneRaw): unknown => {
    const header = f2h.get(field);
    if (header === undefined) return null;
    return row.source === "excel" ? row.raw[header] : row.display[header];
  };

  for (const row of rows) {
    const n = row.lineNumber;

    const matricule = str(getDisplay(row, "matricule"));
    const nom = str(getDisplay(row, "nom"));
    const jsNpoRaw = str(getDisplay(row, "jsNpo"))?.toUpperCase();

    if (!matricule) {
      erreurs.push({ ligne: n, champ: "CODE IMMATRICULATION", message: "Matricule manquant" });
      continue;
    }
    if (!nom) {
      erreurs.push({ ligne: n, champ: "NOM", message: "Nom manquant" });
      continue;
    }

    const dateDebutBrute = parseAnyDate(getDisplay(row, "dateDebutPop"));
    if (!dateDebutBrute) {
      erreurs.push({ ligne: n, champ: "DATE DEBUT POP / NPO", message: "Date de début invalide ou manquante" });
      continue;
    }

    const dateFinBrute = parseAnyDate(getDisplay(row, "dateFinPop")) ?? dateDebutBrute;

    const heureDebut = parseAnyTime(getRaw(row, "heureDebutPop"));
    const heureFin   = parseAnyTime(getRaw(row, "heureFinPop"));

    // ─── Convention temporelle (cf. rapport Phase 1.A étape 2) ─────────────
    //
    // Le fichier source SNCF contient :
    //   - DATE DEBUT/FIN POP = jour calendaire Paris (string "dd/MM/yyyy" ou
    //     serial Excel décodé en jour calendaire)
    //   - HEURE DEBUT/FIN POP = heure Paris ("HH:MM")
    //
    // Convention cible : `dateDebutPop` / `dateFinPop` stockés en base
    // représentent l'instant UTC absolu de prise/fin de service. On les
    // construit en combinant le jour Paris extrait de la valeur brute parsée
    // avec l'heure Paris via `combineDateTimeParis` (timezone-aware, gère DST).
    //
    // Note : `parseAnyDate` retourne un Date UTC midnight pour représenter le
    // jour calendaire (convention héritée du parsing Excel/TXT). On extrait
    // donc le jour Paris via `formatDateParis` qui fait la conversion Paris.
    const jourDebutParis = formatDateParis(dateDebutBrute);
    const jourFinParis   = formatDateParis(dateFinBrute);
    const dateDebut = combineDateTimeParis(jourDebutParis, heureDebut);
    const dateFin   = combineDateTimeParis(jourFinParis,   heureFin);
    const ampHHMM    = parseAnyTime(getRaw(row, "amplitudeHHMM")) || null;
    const dureeHHMM  = parseAnyTime(getRaw(row, "dureeEffectiveHHMM")) || null;

    const jsNpo: JsNpo = jsNpoRaw === "JS" ? "JS" : "NPO";

    lignes.push({
      _rowNum: n,
      uch:               str(getDisplay(row, "uch")),
      codeUch:           str(getDisplay(row, "codeUch")),
      nom,
      prenom:            str(getDisplay(row, "prenom")) ?? "",
      matricule,
      codeApes:          str(getDisplay(row, "codeApes")),
      codeSymboleGrade:  str(getDisplay(row, "codeSymboleGrade")),
      codeCollegeGrade:  parseIntOrNull(getDisplay(row, "codeCollegeGrade")),
      dateDebutPop:      dateDebut,
      heureDebutPop:     heureDebut,
      heureFinPop:       heureFin,
      dateFinPop:        dateFin,
      amplitudeCentesimal:  parseIntOrNull(getRaw(row, "amplitudeCentesimal")),
      amplitudeHHMM:     ampHHMM,
      dureeEffectiveCent:   parseIntOrNull(getRaw(row, "dureeEffectiveCent")),
      dureeEffectiveHHMM:   dureeHHMM,
      jsNpo,
      codeJs:            str(getDisplay(row, "codeJs")),
      typeJs:            str(getDisplay(row, "typeJs")),
      valeurNpo:         parseFloatOrNull(getDisplay(row, "valeurNpo")),
      uchJs:             str(getDisplay(row, "uchJs")),
      codeUchJs:         str(getDisplay(row, "codeUchJs")),
      codeRoulementJs:   str(getDisplay(row, "codeRoulementJs")),
      numeroJs:          str(getDisplay(row, "numeroJs")),
    });
  }

  return { lignes, erreurs };
}
