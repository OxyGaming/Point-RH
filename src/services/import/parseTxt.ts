/**
 * Parseur TXT tabulé (.txt)
 * Produit des NormRow prêtes pour le normaliseur métier commun.
 *
 * Format attendu :
 *   - Encodage UTF-8
 *   - Séparateur : tabulation (\t)
 *   - Première ligne non vide = en-têtes
 *   - Dates : dd/MM/yyyy  (ex: 24/10/2026)
 *   - Heures : HH:MM:SS   (ex: 06:00:00) ou HH:MM
 *   - Cellules vides autorisées
 */
import type { NormRow } from "./normalizeRows";

/**
 * Lit un buffer TXT UTF-8 tabulé et retourne des lignes normalisées.
 * Pour les fichiers TXT, display === raw (tout est string).
 * Le normaliseur commun gère la conversion des strings → Date/number.
 */
export function parseTxtRows(buffer: Buffer): { headers: string[]; rows: NormRow[] } {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  // Trouver la première ligne non vide (= en-têtes)
  const headerLineIndex = lines.findIndex((l) => l.trim().length > 0);
  if (headerLineIndex === -1) {
    return { headers: [], rows: [] };
  }

  const headers = lines[headerLineIndex]
    .split("\t")
    .map((h) => h.trim());

  const rows: NormRow[] = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // ignorer les lignes vides

    const cells = line.split("\t");

    // Construire l'objet avec toutes les colonnes
    const display: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const raw = (cells[j] ?? "").trim();
      // Conserver null pour les cellules vides (cohérent avec Excel defval: null)
      display[header] = raw === "" ? null : raw;
    }

    rows.push({
      source: "txt",
      lineNumber: i + 1, // numéro de ligne dans le fichier TXT
      display,
      raw: display, // pour TXT : raw === display (tout est string)
    });
  }

  return { headers, rows };
}
