/**
 * Utilitaires métier sur les codes JS
 */

/**
 * Détecte une journée de service sans charge réelle ("journée Z").
 * Exemples : "GIV Z", "GIC Z", "PEY Z", "BAD Z"
 * Règle : le code JS se termine par " Z" (espace + lettre Z), insensible à la casse.
 */
export function isZeroLoadJs(codeJs: string | null | undefined): boolean {
  if (!codeJs) return false;
  return /\sZ$/i.test(codeJs.trim());
}
