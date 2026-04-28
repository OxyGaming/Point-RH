/**
 * Utilitaires métier sur les codes JS
 */

import type { PlanningEvent } from "@/engine/rules";

/**
 * Retourne true si l'événement NPO représente une absence pour inaptitude
 * qui interdit toute mobilisation de l'agent pendant la période concernée.
 *
 * @param event          - L'événement planning à tester
 * @param exclusionCodes - Liste de préfixes configurés par l'admin (ex : ["MA","AT","CLM"]).
 *                         Si vide, aucune exclusion n'est appliquée.
 *
 * Correspondance : le codeJs de l'événement doit commencer par l'un des préfixes
 * (insensible à la casse). Ex : préfixe "MA" exclut "MA01", "MAL", "MALADIE", etc.
 */
export function isAbsenceInaptitude(event: PlanningEvent, exclusionCodes: string[]): boolean {
  if (event.jsNpo !== "NPO") return false;
  if (exclusionCodes.length === 0) return false;

  const code = (event.codeJs ?? "").toUpperCase().trim();

  return exclusionCodes.some((prefix) => code.startsWith(prefix.toUpperCase()));
}

/**
 * Détecte une journée de service sans charge réelle ("journée Z").
 *
 * Trois familles reconnues :
 *  1. Code se terminant par " Z"   → ex : "GIV Z", "GIC Z", "PEY Z"
 *  2. Code commençant par "FO"     → ex : "FO123", "FOX", "FO" (formation, assimilé Z)
 *  3. typeJs égal à "DIS"          → famille DIS, assimilée Z (sans charge)
 *
 * Dans tous les cas, l'agent peut être réaffecté sans nécessiter le remplacement
 * de sa journée d'origine (pas de cascade).
 */
export function isZeroLoadJs(
  codeJs: string | null | undefined,
  typeJs?: string | null | undefined,
): boolean {
  if (typeJs && typeJs.trim().toUpperCase() === "DIS") return true;
  if (!codeJs) return false;
  const code = codeJs.trim();
  return /\sZ$/i.test(code) || /^FO/i.test(code);
}
