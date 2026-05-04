/**
 * Logique pure de migration des timestamps de PlanningLigne (étape 3).
 *
 * Convertit une ligne de la convention pré-fix (timestamps pseudo-UTC, décalés
 * de l'offset DST) à la convention cible (UTC absolu vrai, cohérent avec les
 * heures Paris).
 *
 * Idempotente : si la ligne est déjà conforme, le statut "ALREADY_MIGRATED"
 * est retourné sans recalcul.
 *
 * Sans effet de bord — pas d'I/O ni de DB ici. Le script orchestrateur
 * (scripts/migrate-timestamps-utc.ts) appelle cette fonction et applique
 * (ou non) les changements via Prisma.
 */

import {
  combineDateTimeParis,
  formatDateParis,
  formatTimeParis,
  minuitParisEnUtc,
} from "@/lib/timezone";

/** Champs minimaux nécessaires pour la migration. */
export interface LigneMigration {
  id: string;
  dateDebutPop: Date;
  dateFinPop: Date;
  jourPlanning: Date;
  heureDebutPop: string;
  heureFinPop: string;
}

/** Résultat de la migration d'une ligne. */
export type ResultatMigration =
  | {
      statut: "ALREADY_MIGRATED";
      raison: string;
    }
  | {
      statut: "TO_MIGRATE";
      ancienne: { dateDebutPop: Date; dateFinPop: Date; jourPlanning: Date };
      nouvelle: { dateDebutPop: Date; dateFinPop: Date; jourPlanning: Date };
      jourParis: string;        // "YYYY-MM-DD" — jour Paris déduit
      isNuit: boolean;           // JS qui passe minuit ?
    }
  | {
      statut: "ERROR";
      message: string;
    };

/**
 * Détecte si une ligne est **déjà** en convention UTC absolu.
 *
 * Heuristique : si `formatTimeParis(dateDebutPop)` correspond exactement à
 * `heureDebutPop`, alors le timestamp UTC reflète bien l'heure Paris voulue
 * → ligne déjà migrée. Sinon, elle est encore en convention pseudo-UTC
 * (ex: dateDebutPop à minuit UTC ou décalé d'un offset DST).
 */
export function estDejaMigree(ligne: LigneMigration): boolean {
  return (
    formatTimeParis(ligne.dateDebutPop) === ligne.heureDebutPop &&
    formatTimeParis(ligne.dateFinPop) === ligne.heureFinPop
  );
}

/**
 * Détermine le jour calendaire Paris de la ligne, en se basant sur
 * `jourPlanning` (clé métier la plus stable : minuit Paris du jour de prise,
 * qu'elle ait été correctement calculée ou pas par l'ancien pipeline).
 *
 * Note : si l'ancien `jourPlanning` est lui-même décalé (rare mais possible
 * sur certains imports historiques), la migration produira un jour décalé.
 * Le ré-import du fichier source via le nouveau pipeline d'import (étape 2)
 * corrige ce cas.
 */
function jourParisDuLigne(ligne: LigneMigration): string {
  return formatDateParis(ligne.jourPlanning);
}

/**
 * Avance d'un jour calendaire (sur l'axe Paris). Sert pour les JS de nuit
 * où la fin est le jour suivant.
 */
function jourSuivant(jour: string): string {
  // jour = "YYYY-MM-DD". On manipule via Date UTC pour éviter tout DST.
  const d = new Date(`${jour}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Migre une ligne unique vers la convention UTC absolu.
 *
 * Algorithme :
 *   1. Si la ligne est déjà conforme (heure UTC reflète bien heure Paris),
 *      retourner ALREADY_MIGRATED.
 *   2. Déduire le jour Paris de prise depuis `jourPlanning`.
 *   3. Si `heureDebutPop > heureFinPop` (JS qui passe minuit), le jour de fin
 *      est le jour suivant ; sinon même jour.
 *   4. Recalculer `dateDebutPop`, `dateFinPop`, `jourPlanning` via les
 *      helpers timezone-aware.
 */
export function migrerLigne(ligne: LigneMigration): ResultatMigration {
  if (estDejaMigree(ligne)) {
    return {
      statut: "ALREADY_MIGRATED",
      raison: `formatTimeParis(${ligne.dateDebutPop.toISOString()}) === "${ligne.heureDebutPop}"`,
    };
  }

  try {
    const jourDebut = jourParisDuLigne(ligne);
    const isNuit = ligne.heureDebutPop > ligne.heureFinPop;
    const jourFin = isNuit ? jourSuivant(jourDebut) : jourDebut;

    const newDateDebut = combineDateTimeParis(jourDebut, ligne.heureDebutPop);
    const newDateFin = combineDateTimeParis(jourFin, ligne.heureFinPop);
    const newJourPlanning = minuitParisEnUtc(jourDebut);

    return {
      statut: "TO_MIGRATE",
      ancienne: {
        dateDebutPop: ligne.dateDebutPop,
        dateFinPop: ligne.dateFinPop,
        jourPlanning: ligne.jourPlanning,
      },
      nouvelle: {
        dateDebutPop: newDateDebut,
        dateFinPop: newDateFin,
        jourPlanning: newJourPlanning,
      },
      jourParis: jourDebut,
      isNuit,
    };
  } catch (e) {
    return {
      statut: "ERROR",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Vérifie l'idempotence d'une migration : applique migrerLigne 2 fois
 * et retourne true si la 2ᵉ passe ne change rien.
 *
 * Utile en test unitaire pour valider que le script peut être ré-exécuté
 * sans risque.
 */
export function verifierIdempotence(ligne: LigneMigration): boolean {
  const passe1 = migrerLigne(ligne);
  if (passe1.statut !== "TO_MIGRATE") return passe1.statut === "ALREADY_MIGRATED";

  const ligneApresPasse1: LigneMigration = {
    id: ligne.id,
    dateDebutPop: passe1.nouvelle.dateDebutPop,
    dateFinPop: passe1.nouvelle.dateFinPop,
    jourPlanning: passe1.nouvelle.jourPlanning,
    heureDebutPop: ligne.heureDebutPop,
    heureFinPop: ligne.heureFinPop,
  };

  const passe2 = migrerLigne(ligneApresPasse1);
  return passe2.statut === "ALREADY_MIGRATED";
}
