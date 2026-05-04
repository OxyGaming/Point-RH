/**
 * Script de migration des timestamps PlanningLigne vers UTC absolu (étape 3).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SAUVEGARDE OBLIGATOIRE AVANT EXÉCUTION RÉELLE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *   Avant d'utiliser --apply, créer une copie de dev.db :
 *
 *     # Windows / bash
 *     cp dev.db dev.db.bak-$(date +%Y%m%d-%H%M%S)
 *
 *   En cas de problème, restaurer simplement la sauvegarde :
 *
 *     cp dev.db.bak-YYYYMMDD-HHMMSS dev.db
 *
 *   La migration est idempotente — elle peut être ré-exécutée sans risque
 *   tant que la sauvegarde existe.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *   Dry-run (par défaut) — aucune écriture :
 *     npx tsx scripts/migrate-timestamps-utc.ts
 *
 *   Verbose dry-run — affiche toutes les lignes au lieu d'un échantillon :
 *     npx tsx scripts/migrate-timestamps-utc.ts --verbose
 *
 *   Exécution réelle (après sauvegarde manuelle) :
 *     npx tsx scripts/migrate-timestamps-utc.ts --apply
 *
 *   Filtrer sur un agent spécifique (utile pour valider des cas précis) :
 *     npx tsx scripts/migrate-timestamps-utc.ts --matricule=7211574T
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * COMPORTEMENT
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *   - Lit toutes les PlanningLigne (ou filtrées) en lecture seule en dry-run
 *   - Pour chaque ligne, applique la fonction pure migrerLigne()
 *   - Détecte les lignes déjà migrées (heure UTC reflète déjà l'heure Paris)
 *   - En --apply, met à jour dateDebutPop, dateFinPop, jourPlanning
 *   - Affiche un rapport avec compteurs + 5 exemples avant/après
 *
 *   Le script ne modifie JAMAIS heureDebutPop / heureFinPop ni les autres champs.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "../src/lib/prisma";
import { migrerLigne, type LigneMigration } from "../src/lib/migration/migrateTimestamps";
import { formatDateParis, formatTimeParis } from "../src/lib/timezone";

// ─── Parsing des arguments ────────────────────────────────────────────────────

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");
const MATRICULE_ARG = process.argv.find((a) => a.startsWith("--matricule="));
const MATRICULE_FILTER = MATRICULE_ARG ? MATRICULE_ARG.split("=")[1] : null;

// ─── Affichage helpers ────────────────────────────────────────────────────────

function fmtUtc(d: Date): string {
  return d.toISOString();
}

function fmtParis(d: Date): string {
  return `${formatDateParis(d)} ${formatTimeParis(d)}`;
}

function bandeau(titre: string): void {
  console.log("─".repeat(80));
  console.log(titre);
  console.log("─".repeat(80));
}

// ─── Logique principale ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  bandeau(
    APPLY
      ? "🔥 MIGRATION RÉELLE — modifications appliquées en base"
      : "🔍 DRY-RUN — aucune écriture en base"
  );

  if (!APPLY) {
    console.log("Mode dry-run par défaut. Pour exécuter réellement :");
    console.log("  1. Créer une sauvegarde : cp dev.db dev.db.bak-$(date +%Y%m%d-%H%M%S)");
    console.log("  2. Lancer : npx tsx scripts/migrate-timestamps-utc.ts --apply");
  } else {
    console.log("⚠ Vérification : avez-vous fait une sauvegarde de dev.db ?");
    console.log("  Si non, interrompre maintenant (Ctrl+C) et créer la sauvegarde.");
    console.log("  Reprise dans 3 secondes...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (MATRICULE_FILTER) {
    console.log(`Filtre actif : matricule = ${MATRICULE_FILTER}`);
  }
  console.log();

  // ─── Lecture des lignes ─────────────────────────────────────────────────────

  const where = MATRICULE_FILTER ? { matricule: MATRICULE_FILTER } : {};
  const lignes = await prisma.planningLigne.findMany({
    where,
    select: {
      id: true,
      matricule: true,
      nom: true,
      codeJs: true,
      jsNpo: true,
      dateDebutPop: true,
      dateFinPop: true,
      jourPlanning: true,
      heureDebutPop: true,
      heureFinPop: true,
    },
    orderBy: [{ jourPlanning: "asc" }, { matricule: "asc" }],
  });

  console.log(`Lignes lues : ${lignes.length}`);
  console.log();

  // ─── Migration ligne par ligne ──────────────────────────────────────────────

  let nbDejaMigrees = 0;
  let nbAMigrer = 0;
  let nbErreurs = 0;
  let nbAppliquees = 0;
  const exemples: Array<{ ligne: typeof lignes[number]; r: ReturnType<typeof migrerLigne> }> = [];
  const erreurs: Array<{ ligne: typeof lignes[number]; message: string }> = [];

  for (const ligne of lignes) {
    const ligneMigration: LigneMigration = {
      id: ligne.id,
      dateDebutPop: ligne.dateDebutPop,
      dateFinPop: ligne.dateFinPop,
      jourPlanning: ligne.jourPlanning,
      heureDebutPop: ligne.heureDebutPop,
      heureFinPop: ligne.heureFinPop,
    };

    const r = migrerLigne(ligneMigration);

    switch (r.statut) {
      case "ALREADY_MIGRATED":
        nbDejaMigrees++;
        break;
      case "TO_MIGRATE":
        nbAMigrer++;
        if (exemples.length < 10 || VERBOSE) exemples.push({ ligne, r });
        if (APPLY) {
          await prisma.planningLigne.update({
            where: { id: ligne.id },
            data: {
              dateDebutPop: r.nouvelle.dateDebutPop,
              dateFinPop: r.nouvelle.dateFinPop,
              jourPlanning: r.nouvelle.jourPlanning,
            },
          });
          nbAppliquees++;
        }
        break;
      case "ERROR":
        nbErreurs++;
        erreurs.push({ ligne, message: r.message });
        break;
    }
  }

  // ─── Rapport ────────────────────────────────────────────────────────────────

  console.log();
  bandeau("Rapport");
  console.log(`  Total lignes        : ${lignes.length}`);
  console.log(`  Déjà migrées (skip) : ${nbDejaMigrees}`);
  console.log(`  À migrer            : ${nbAMigrer}`);
  console.log(`  Erreurs             : ${nbErreurs}`);
  if (APPLY) {
    console.log(`  Appliquées          : ${nbAppliquees}`);
  }
  console.log();

  if (erreurs.length > 0) {
    bandeau("Erreurs détectées");
    for (const e of erreurs.slice(0, 10)) {
      console.log(`  ${e.ligne.matricule} ${e.ligne.nom} ${e.ligne.codeJs ?? e.ligne.jsNpo}`);
      console.log(`    → ${e.message}`);
    }
    if (erreurs.length > 10) {
      console.log(`  ...et ${erreurs.length - 10} autres erreurs`);
    }
    console.log();
  }

  // ─── Échantillon avant/après ────────────────────────────────────────────────

  if (exemples.length > 0) {
    const limit = VERBOSE ? exemples.length : 5;
    bandeau(`Échantillon avant/après (${Math.min(limit, exemples.length)} sur ${nbAMigrer})`);

    for (const ex of exemples.slice(0, limit)) {
      const { ligne, r } = ex;
      if (r.statut !== "TO_MIGRATE") continue;

      console.log(
        `  ${ligne.matricule} ${ligne.nom.padEnd(15)} ${ligne.codeJs ?? ligne.jsNpo}` +
          (r.isNuit ? " (nuit)" : "")
      );
      console.log(
        `    AVANT  dateDebut = ${fmtUtc(r.ancienne.dateDebutPop)}  (Paris: ${fmtParis(r.ancienne.dateDebutPop)})`
      );
      console.log(
        `    APRÈS  dateDebut = ${fmtUtc(r.nouvelle.dateDebutPop)}  (Paris: ${fmtParis(r.nouvelle.dateDebutPop)})`
      );
      console.log(
        `    AVANT  dateFin   = ${fmtUtc(r.ancienne.dateFinPop)}  (Paris: ${fmtParis(r.ancienne.dateFinPop)})`
      );
      console.log(
        `    APRÈS  dateFin   = ${fmtUtc(r.nouvelle.dateFinPop)}  (Paris: ${fmtParis(r.nouvelle.dateFinPop)})`
      );
      // jourPlanning : afficher avant/après uniquement si différent
      if (
        r.ancienne.jourPlanning.getTime() !== r.nouvelle.jourPlanning.getTime()
      ) {
        console.log(
          `    AVANT  jourPlan  = ${fmtUtc(r.ancienne.jourPlanning)}  (Paris: ${fmtParis(r.ancienne.jourPlanning)})`
        );
        console.log(
          `    APRÈS  jourPlan  = ${fmtUtc(r.nouvelle.jourPlanning)}  (Paris: ${fmtParis(r.nouvelle.jourPlanning)})`
        );
      } else {
        console.log(
          `    jourPlan inchangé : ${fmtUtc(r.ancienne.jourPlanning)}  (Paris: ${fmtParis(r.ancienne.jourPlanning)})`
        );
      }
      console.log();
    }

    if (!VERBOSE && exemples.length > limit) {
      console.log(`  ...${exemples.length - limit} autres lignes — utiliser --verbose pour tout voir`);
      console.log();
    }
  }

  // ─── Conclusion ─────────────────────────────────────────────────────────────

  if (APPLY) {
    console.log("✓ Migration appliquée. Vérifier en base et relancer si besoin (idempotent).");
  } else if (nbAMigrer === 0) {
    console.log("✓ Toutes les lignes sont déjà migrées — rien à faire.");
  } else {
    console.log("Pour appliquer réellement :");
    console.log("  1. cp dev.db dev.db.bak-$(date +%Y%m%d-%H%M%S)");
    console.log("  2. npx tsx scripts/migrate-timestamps-utc.ts --apply");
  }
}

main()
  .catch((e) => {
    console.error("Erreur fatale :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
