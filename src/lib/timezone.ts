/**
 * Helpers timezone-aware pour Point RH.
 *
 * Convention temporelle (cible — voir rapport Phase 1.A) :
 *
 *   1. Tout timestamp interne est un UTC absolu — un `Date` représente le
 *      moment réel du calendrier mondial, sans décalage caché.
 *   2. Les heures métier `heureDebutPop`/`heureFinPop` sont des strings "HH:MM"
 *      interprétés en Europe/Paris.
 *   3. `dateDebutPop`/`dateFinPop` représentent l'instant UTC réel de prise/fin
 *      de service, soit la conversion Paris→UTC de (jour calendaire Paris) +
 *      (heure Paris). Pour BAD015R 03/05 12:30 Paris → 2026-05-03T10:30:00Z (été UTC+2).
 *   4. Tous les affichages UI doivent reformater explicitement en Europe/Paris
 *      via les helpers de ce module.
 *
 * Ce module centralise **toutes** les conversions Paris ↔ UTC pour éviter la
 * dispersion d'options `timeZone: "Europe/Paris"` partout dans le codebase.
 */

import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const PARIS_TZ = "Europe/Paris";

/** Validation paranoïaque : "HH:MM" sur 24h. */
function assertHeureValide(heure: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) {
    throw new Error(`Heure invalide (attendu "HH:MM" 24h) : "${heure}"`);
  }
}

/** Validation paranoïaque : "YYYY-MM-DD". */
function assertJourValide(jour: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) {
    throw new Error(`Jour invalide (attendu "YYYY-MM-DD") : "${jour}"`);
  }
}

/**
 * Combine un jour calendaire Paris ("YYYY-MM-DD") et une heure Paris ("HH:MM")
 * pour produire le `Date` UTC absolu correspondant.
 *
 * Gère automatiquement les transitions DST :
 * - Été (UTC+2) : `combineDateTimeParis("2026-05-03", "12:30")` → `2026-05-03T10:30:00Z`
 * - Hiver (UTC+1) : `combineDateTimeParis("2026-12-15", "12:30")` → `2026-12-15T11:30:00Z`
 *
 * Cas limites DST (rares mais à connaître) :
 * - Printemps (dimanche fin mars, 2:00→3:00) : l'heure 2:00–3:00 n'existe pas.
 *   `date-fns-tz` la mappe sur l'instant UTC le plus proche (3:00 Paris).
 * - Automne (dimanche fin octobre, 3:00→2:00) : l'heure 2:00–3:00 existe deux fois.
 *   `date-fns-tz` choisit la première occurrence (UTC+2) par défaut.
 *
 * Remplace progressivement `combineDateTime` (lib/utils.ts) qui faisait
 * `setUTCHours` directement, sans tenir compte du fait que les heures sont Paris.
 */
export function combineDateTimeParis(jour: string, heure: string): Date {
  assertJourValide(jour);
  assertHeureValide(heure);
  // Construire un Date "naïf" représentant le moment Paris voulu, puis convertir
  // en UTC via fromZonedTime qui gère le DST.
  const naive = new Date(`${jour}T${heure}:00.000`);
  return fromZonedTime(naive, PARIS_TZ);
}

/**
 * Formate un `Date` UTC en chaîne "YYYY-MM-DD" représentant le **jour calendaire
 * Paris** correspondant.
 *
 * Exemples :
 * - `formatDateParis(new Date("2026-05-03T22:00:00Z"))` → `"2026-05-04"`
 *   (= minuit du 04/05 Paris)
 * - `formatDateParis(new Date("2026-05-03T20:00:00Z"))` → `"2026-05-03"`
 *   (= 22:00 du 03/05 Paris)
 *
 * Remplace progressivement les `new Date(d).toISOString().slice(0,10)` qui
 * peuvent décaler le jour quand l'instant UTC tombe en fin de soirée Paris.
 */
export function formatDateParis(date: Date): string {
  return formatInTimeZone(date, PARIS_TZ, "yyyy-MM-dd");
}

/**
 * Formate un `Date` UTC en chaîne "HH:MM" représentant l'heure Paris.
 *
 * Exemples :
 * - `formatTimeParis(new Date("2026-05-03T10:30:00Z"))` → `"12:30"` (été)
 * - `formatTimeParis(new Date("2026-12-15T11:30:00Z"))` → `"12:30"` (hiver)
 */
export function formatTimeParis(date: Date): string {
  return formatInTimeZone(date, PARIS_TZ, "HH:mm");
}

/**
 * Formate un `Date` UTC en chaîne "DD/MM/YYYY" Paris (locale FR).
 * Pour les affichages utilisateur classiques.
 */
export function formatDateFrParis(date: Date): string {
  return formatInTimeZone(date, PARIS_TZ, "dd/MM/yyyy");
}

/**
 * Calcule le `Date` UTC correspondant à minuit Paris d'un jour calendaire donné.
 * Utile pour `jourPlanning` : minuit Paris du jour de service en UTC.
 *
 * Exemples :
 * - `minuitParisEnUtc("2026-05-03")` → `2026-05-02T22:00:00Z` (été)
 * - `minuitParisEnUtc("2026-12-15")` → `2026-12-14T23:00:00Z` (hiver)
 */
export function minuitParisEnUtc(jour: string): Date {
  return combineDateTimeParis(jour, "00:00");
}
