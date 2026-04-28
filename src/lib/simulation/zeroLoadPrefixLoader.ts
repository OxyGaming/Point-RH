/**
 * Chargement des préfixes JS additionnels assimilés "JS Z" (sans charge réelle).
 *
 * S'ajoutent aux règles built-in d'isZeroLoadJs :
 *   - suffixe " Z"   (ex : "GIV Z")
 *   - préfixe "FO"   (ex : "FO123")
 *   - typeJs="DIS"
 *
 * Pas d'auto-seed : la table démarre vide. L'admin ajoute des entrées au cas
 * par cas pour couvrir des codes "exotiques" qui doivent être traités comme DIS.
 *
 * Seuls les préfixes actifs (actif = true) sont retournés, en MAJUSCULES.
 */

import { prisma } from "@/lib/prisma";

export async function loadZeroLoadPrefixes(): Promise<string[]> {
  const rows = await prisma.zeroLoadPrefix.findMany({
    where: { actif: true },
    select: { prefixe: true },
    orderBy: { prefixe: "asc" },
  });
  return rows.map((r) => r.prefixe.toUpperCase());
}
