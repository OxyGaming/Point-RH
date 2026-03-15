/**
 * Mapping et validation des en-têtes de planning
 *
 * La normalisation est robuste : insensible à la casse, aux accents,
 * aux espaces multiples, aux caractères spéciaux.
 */
import type { PlanningLigneRaw } from "@/types/planning";

// ─── Normalisation des en-têtes ───────────────────────────────────────────────

/**
 * Normalise un nom de colonne pour la comparaison :
 * - majuscules
 * - suppression des accents (é→e, è→e…)
 * - collapse des espaces multiples
 * - trim
 */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // supprime les diacritiques
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim();
}

// ─── Mapping colonnes → champs internes ──────────────────────────────────────

/** Mapping : nom de colonne (non normalisé) → clé PlanningLigneRaw */
export const COL_MAP: Record<string, keyof PlanningLigneRaw> = {
  "UCH":                                    "uch",
  "CODE UCH":                               "codeUch",
  "NOM":                                    "nom",
  "PRENOM":                                 "prenom",
  "CODE IMMATRICULATION":                   "matricule",
  "CODE APES":                              "codeApes",
  "CODE SYMBOLE GRADE":                     "codeSymboleGrade",
  "CODE COLLEGE GRADE":                     "codeCollegeGrade",
  "DATE DEBUT POP / NPO":                   "dateDebutPop",
  "HEURE DEBUT POP / NPO":                  "heureDebutPop",
  "HEURE FIN POP / NPO":                    "heureFinPop",
  "DATE FIN POP / NPO":                     "dateFinPop",
  "AMPLITUDE POP / NPO (100E/HEURE)":       "amplitudeCentesimal",
  "AMPLITUDE POP / NPO (HH:MM)":            "amplitudeHHMM",
  "DUREE EFFECTIVE POP (100E/HEURE)":       "dureeEffectiveCent",
  "DUREE EFFECTIVE POP (HH:MM)":            "dureeEffectiveHHMM",
  "JS / NPO":                               "jsNpo",
  "CODE JS / CODE NPO":                     "codeJs",
  "TYPE JS / FAM. NPO":                     "typeJs",
  "VALEUR NPO":                             "valeurNpo",
  "UCH JS":                                 "uchJs",
  "CODE UCH JS":                            "codeUchJs",
  "CODE ROULEMENT JS":                      "codeRoulementJs",
  "NUMERO JS":                              "numeroJs",
};

/** Map normalisée : normalizeHeader(colonne) → champ interne (pré-calculée) */
export const NORMALIZED_COL_MAP: Map<string, keyof PlanningLigneRaw> = new Map(
  Object.entries(COL_MAP).map(([col, field]) => [normalizeHeader(col), field])
);

// ─── Colonnes obligatoires ────────────────────────────────────────────────────

/** Noms de colonnes obligatoires (en version normalisée) */
export const REQUIRED_NORMALIZED: string[] = [
  normalizeHeader("NOM"),
  normalizeHeader("CODE IMMATRICULATION"),
  normalizeHeader("DATE DEBUT POP / NPO"),
  normalizeHeader("JS / NPO"),
];

// ─── Validation des en-têtes ──────────────────────────────────────────────────

export interface HeaderValidation {
  valid: boolean;
  missing: string[];       // colonnes obligatoires manquantes (nom humain)
  unknownCount: number;    // nb de colonnes non reconnues (info)
  mappedCount: number;     // nb de colonnes reconnues
}

/**
 * Valide les en-têtes d'un fichier importé.
 * Retourne la liste des colonnes obligatoires manquantes.
 */
export function validateHeaders(rawHeaders: string[]): HeaderValidation {
  const normalized = rawHeaders.map(normalizeHeader);
  const normalizedSet = new Set(normalized);

  const missing: string[] = [];
  for (const req of REQUIRED_NORMALIZED) {
    if (!normalizedSet.has(req)) {
      // Retrouver le nom humain correspondant
      const humanName = Object.keys(COL_MAP).find(
        (k) => normalizeHeader(k) === req
      ) ?? req;
      missing.push(humanName);
    }
  }

  const mappedCount = normalized.filter((h) => NORMALIZED_COL_MAP.has(h)).length;
  const unknownCount = normalized.length - mappedCount;

  return {
    valid: missing.length === 0,
    missing,
    unknownCount,
    mappedCount,
  };
}

/**
 * Construit la map inverse : champ interne → en-tête réel trouvé dans les données.
 * Utilisée par le normaliseur pour localiser chaque colonne dans la source.
 */
export function buildFieldToHeaderMap(
  actualHeaders: string[]
): Map<keyof PlanningLigneRaw, string> {
  const map = new Map<keyof PlanningLigneRaw, string>();
  for (const actual of actualHeaders) {
    const fieldKey = NORMALIZED_COL_MAP.get(normalizeHeader(actual));
    if (fieldKey) {
      map.set(fieldKey, actual);
    }
  }
  return map;
}
