/**
 * Chargement des codes NPO exclus des simulations.
 *
 * Au premier appel sur une base vide, les codes par défaut sont automatiquement
 * insérés (auto-seed). L'administrateur peut ensuite les modifier dans l'interface.
 *
 * Seuls les codes actifs (actif = true) sont retournés.
 */

import { prisma } from "@/lib/prisma";

export const DEFAULT_NPO_EXCLUSION_CODES: Array<{ code: string; libelle: string }> = [
  { code: "MA",  libelle: "Maladie ordinaire" },
  { code: "AT",  libelle: "Accident du travail" },
  { code: "CLM", libelle: "Congé longue maladie" },
  { code: "CLD", libelle: "Congé longue durée" },
  { code: "MAT", libelle: "Maternité / Paternité" },
];

let _seeded = false; // cache mémoire pour éviter le check à chaque simulation

/**
 * Retourne la liste des préfixes NPO actifs qui excluent un agent des simulations.
 * Chaque préfixe est en MAJUSCULES. Ex : ["MA", "AT", "CLM", "CLD", "MAT"]
 */
export async function loadNpoExclusionCodes(): Promise<string[]> {
  // Auto-seed sur base vide (premier démarrage)
  if (!_seeded) {
    const count = await prisma.npoExclusionCode.count();
    if (count === 0) {
      await prisma.npoExclusionCode.createMany({
        data: DEFAULT_NPO_EXCLUSION_CODES,
      });
    }
    _seeded = true;
  }

  const codes = await prisma.npoExclusionCode.findMany({
    where: { actif: true },
    select: { code: true },
    orderBy: { code: "asc" },
  });

  return codes.map((c) => c.code.toUpperCase());
}
