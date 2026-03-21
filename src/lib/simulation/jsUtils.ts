/**
 * Utilitaires métier sur les codes JS
 */

/**
 * Détecte une journée de service sans charge réelle ("journée Z").
 *
 * Deux familles reconnues :
 *  1. Code se terminant par " Z"  → ex : "GIV Z", "GIC Z", "PEY Z"
 *  2. Code commençant par "FO"    → ex : "FO123", "FOX", "FO" (formation, assimilé Z)
 *
 * Dans les deux cas, l'agent peut être réaffecté sans nécessiter le remplacement
 * de sa journée d'origine (pas de cascade).
 */
export function isZeroLoadJs(codeJs: string | null | undefined): boolean {
  if (!codeJs) return false;
  const code = codeJs.trim();
  return /\sZ$/i.test(code) || /^FO/i.test(code);
}
