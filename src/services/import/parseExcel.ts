/**
 * Parseur Excel (.xlsx / .xls)
 * Produit des NormRow prêtes pour le normaliseur métier commun.
 */
import * as XLSX from "xlsx";
import type { NormRow } from "./normalizeRows";

/** Limites de structure appliquées après lecture du workbook (garde-fous DoS). */
export const EXCEL_MAX_SHEETS = 20;
export const EXCEL_MAX_ROWS_PER_SHEET = 50_000;

/**
 * Erreur levée quand le fichier dépasse une limite structurelle.
 * Le message porte une formulation finale (FR) adaptée à un renvoi au client.
 */
export class ExcelLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelLimitError";
  }
}

/**
 * Lit un buffer Excel et retourne des lignes normalisées.
 * Chaque NormRow contient :
 *   - display : valeurs formatées (dates en string ISO, nombres formatés)
 *   - raw     : valeurs brutes XLSX (fractions décimales pour les heures,
 *               serial numbers pour les dates)
 */
export function parseExcelRows(buffer: Buffer): { headers: string[]; rows: NormRow[] } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  if (wb.SheetNames.length > EXCEL_MAX_SHEETS) {
    throw new ExcelLimitError(
      `Fichier refusé : ${wb.SheetNames.length} feuilles détectées (maximum autorisé : ${EXCEL_MAX_SHEETS}).`
    );
  }

  const ws = wb.Sheets[wb.SheetNames[0]];

  const formatted = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: false,
    dateNF: "yyyy-mm-dd",
    defval: null,
  });

  if (formatted.length > EXCEL_MAX_ROWS_PER_SHEET) {
    throw new ExcelLimitError(
      `Fichier refusé : ${formatted.length} lignes détectées (maximum autorisé : ${EXCEL_MAX_ROWS_PER_SHEET}).`
    );
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: true,
    defval: null,
  });

  if (formatted.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = Object.keys(formatted[0] ?? {});

  const rows: NormRow[] = formatted.map((displayRow, i) => ({
    source: "excel",
    lineNumber: i + 2, // ligne Excel (1 = en-tête)
    display: displayRow,
    raw: raw[i] ?? {},
  }));

  return { headers, rows };
}
