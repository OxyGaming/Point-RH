/**
 * Politique de rétention des données de planning.
 *
 * Règles :
 *   - Lignes de planning : supprimées quand leur date de FIN (dateFinPop)
 *     est antérieure au seuil glissant M-RETENTION_MONTHS.
 *     On utilise dateFinPop (et non dateDebutPop) pour ne pas supprimer
 *     prématurément une entrée dont le début est ancien mais la fin est récente
 *     (ex: NPO multi-semaines).
 *
 *   - Journal PlanningImport : purge des entrées dont la date d'import est
 *     antérieure au seuil ET qui n'ont plus aucune ligne associée.
 *     Les entrées récentes ou ayant encore des lignes sont conservées.
 *
 * Garanties :
 *   - Ne touche pas aux agents (rémanence garantie)
 *   - Ne supprime jamais une ligne dont la fin est dans la fenêtre de rétention
 *   - Idempotent : peut être rejoué sans effet de bord
 */
import { prisma } from "@/lib/prisma";

const RETENTION_MONTHS = 6;

export interface CleanupResult {
  lignesDeleted: number;
  importsDeleted: number;
  cutoff: Date;
}

export async function cleanupOldPlanningData(): Promise<CleanupResult> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  // Normaliser à minuit UTC pour cohérence avec les dates de planning
  cutoff.setUTCHours(0, 0, 0, 0);

  // 1. Supprimer les lignes dont la fin est antérieure au seuil.
  //    L'index sur dateFinPop garantit que la requête est efficace même sur
  //    une table volumineuse.
  const { count: lignesDeleted } = await prisma.planningLigne.deleteMany({
    where: {
      dateFinPop: { lt: cutoff },
    },
  });

  // 2. Purger les entrées du journal PlanningImport qui :
  //    - ont été créées avant le seuil (import ancien)
  //    - n'ont plus aucune ligne associée (toutes supprimées à l'étape 1,
  //      ou les lignes ont été réaffectées à un import ultérieur via importId)
  const { count: importsDeleted } = await prisma.planningImport.deleteMany({
    where: {
      importedAt: { lt: cutoff },
      lignes: { none: {} },
    },
  });

  return { lignesDeleted, importsDeleted, cutoff };
}
