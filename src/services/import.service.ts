/**
 * Service d'import planning — orchestrateur principal
 *
 * Pipeline :
 *   1. Détection du type de fichier (Excel / TXT)
 *   2. Lecture + parsing (parseExcelRows / parseTxtRows)
 *   3. Validation des en-têtes
 *   4. Normalisation métier commune (normalizeRows)
 *   5. Persistance en base (upsert agents + upsert lignes par clé métier)
 *
 * Clé métier PlanningLigne : (matricule, jourPlanning)
 * jourPlanning = minuit heure locale Europe/Paris du jour de dateDebutPop.
 * Un agent a au plus une affectation par jour calendaire.
 */
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import type { ImportResult } from "@/types/planning";
import { validateHeaders } from "./import/headers";
import { parseExcelRows } from "./import/parseExcel";
import { parseTxtRows } from "./import/parseTxt";
import { normalizeRows } from "./import/normalizeRows";

export type FileType = "excel" | "txt";

function detectFileType(filename: string): FileType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

function jourPlanningFromDate(dateDebutPop: Date): Date {
  const paris = toZonedTime(dateDebutPop, "Europe/Paris");
  return fromZonedTime(
    new Date(paris.getFullYear(), paris.getMonth(), paris.getDate()),
    "Europe/Paris"
  );
}

// ─── Entrée principale ────────────────────────────────────────────────────────

export async function importerPlanning(
  buffer: Buffer,
  filename: string
): Promise<ImportResult> {
  // 1. Détecter le type
  const fileType = detectFileType(filename);
  if (!fileType) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType: undefined,
      erreurs: [{ ligne: 0, message: `Format de fichier non supporté : ${filename}` }],
    };
  }

  // 2. Parser selon le type
  let parseResult: ReturnType<typeof parseExcelRows>;
  try {
    parseResult = fileType === "excel"
      ? parseExcelRows(buffer)
      : parseTxtRows(buffer);
  } catch (err) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [{ ligne: 0, message: `Erreur de lecture du fichier : ${String(err)}` }],
    };
  }

  const { headers, rows } = parseResult;

  if (rows.length === 0) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [{ ligne: 0, message: "Fichier vide ou aucune ligne de données trouvée" }],
    };
  }

  // 3. Valider les en-têtes
  const headerValidation = validateHeaders(headers);
  if (!headerValidation.valid) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: headerValidation.missing.map((col) => ({
        ligne: 0,
        champ: col,
        message: `Colonne obligatoire manquante : "${col}"`,
      })),
    };
  }

  // 4. Normaliser les lignes
  const { lignes: lignesRaw, erreurs } = normalizeRows(rows, headers);

  if (lignesRaw.length === 0) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [
        ...erreurs,
        { ligne: 0, message: "Aucune ligne valide après normalisation" },
      ],
    };
  }

  // 5. Persister en base
  try {
    // ── Agents : upsert + tracking créés/mis à jour ──────────────────────────
    const matriculesDuFichier = [...new Set(lignesRaw.map((l) => l.matricule))];

    const agentsExistants = await prisma.agent.findMany({
      where: { matricule: { in: matriculesDuFichier } },
      select: { matricule: true },
    });
    const matriculesExistants = new Set(agentsExistants.map((a) => a.matricule));

    let agentsCreated = 0;
    let agentsUpdated = 0;
    const agentsMap = new Map<string, string>();
    const matriculesVus = new Set<string>();

    for (const l of lignesRaw) {
      if (matriculesVus.has(l.matricule)) continue;
      matriculesVus.add(l.matricule);

      const agent = await prisma.agent.upsert({
        where: { matricule: l.matricule },
        update: {
          nom: l.nom, prenom: l.prenom, uch: l.uch, codeUch: l.codeUch,
          codeApes: l.codeApes, codeSymboleGrade: l.codeSymboleGrade,
          codeCollegeGrade: l.codeCollegeGrade,
        },
        create: {
          matricule: l.matricule, nom: l.nom, prenom: l.prenom,
          uch: l.uch, codeUch: l.codeUch, codeApes: l.codeApes,
          codeSymboleGrade: l.codeSymboleGrade, codeCollegeGrade: l.codeCollegeGrade,
          habilitations: "[]",
        },
      });
      agentsMap.set(l.matricule, agent.id);

      if (matriculesExistants.has(l.matricule)) {
        agentsUpdated++;
      } else {
        agentsCreated++;
      }
    }

    // ── Import record ─────────────────────────────────────────────────────────
    await prisma.planningImport.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const planningImport = await prisma.planningImport.create({
      data: {
        filename,
        nbLignes: lignesRaw.length,
        nbAgents: matriculesVus.size,
        erreurs: JSON.stringify(erreurs),
        isActive: true,
      },
    });

    // ── Lignes : upsert par (matricule, jourPlanning) ─────────────────────────
    const lignesAvecJour = lignesRaw.map((l) => ({
      ...l,
      jourPlanning: jourPlanningFromDate(l.dateDebutPop),
    }));

    const existingLignes = await prisma.planningLigne.findMany({
      where: {
        matricule: { in: matriculesDuFichier },
        jourPlanning: { in: lignesAvecJour.map((l) => l.jourPlanning) },
      },
      select: { matricule: true, jourPlanning: true },
    });
    const existingKeys = new Set(
      existingLignes.map((k) => `${k.matricule}|${k.jourPlanning.toISOString()}`)
    );

    const toCreate: typeof lignesAvecJour = [];
    const toUpdate: typeof lignesAvecJour = [];
    for (const l of lignesAvecJour) {
      const key = `${l.matricule}|${l.jourPlanning.toISOString()}`;
      if (existingKeys.has(key)) {
        toUpdate.push(l);
      } else {
        toCreate.push(l);
      }
    }

    if (toCreate.length > 0) {
      await prisma.planningLigne.createMany({
        data: toCreate.map((l) => ({
          importId: planningImport.id,
          agentId: agentsMap.get(l.matricule) ?? null,
          uch: l.uch, codeUch: l.codeUch, nom: l.nom, prenom: l.prenom,
          matricule: l.matricule, codeApes: l.codeApes,
          codeSymboleGrade: l.codeSymboleGrade, codeCollegeGrade: l.codeCollegeGrade,
          dateDebutPop: l.dateDebutPop, heureDebutPop: l.heureDebutPop,
          heureFinPop: l.heureFinPop, dateFinPop: l.dateFinPop,
          amplitudeCentesimal: l.amplitudeCentesimal, amplitudeHHMM: l.amplitudeHHMM,
          dureeEffectiveCent: l.dureeEffectiveCent, dureeEffectiveHHMM: l.dureeEffectiveHHMM,
          jsNpo: l.jsNpo, codeJs: l.codeJs, typeJs: l.typeJs,
          valeurNpo: l.valeurNpo, uchJs: l.uchJs, codeUchJs: l.codeUchJs,
          codeRoulementJs: l.codeRoulementJs, numeroJs: l.numeroJs,
          jourPlanning: l.jourPlanning,
        })),
      });
    }

    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map((l) =>
          prisma.planningLigne.update({
            where: {
              matricule_jourPlanning: {
                matricule: l.matricule,
                jourPlanning: l.jourPlanning,
              },
            },
            data: {
              importId: planningImport.id,
              agentId: agentsMap.get(l.matricule) ?? null,
              uch: l.uch, codeUch: l.codeUch, nom: l.nom, prenom: l.prenom,
              codeApes: l.codeApes,
              codeSymboleGrade: l.codeSymboleGrade, codeCollegeGrade: l.codeCollegeGrade,
              dateDebutPop: l.dateDebutPop, heureDebutPop: l.heureDebutPop,
              heureFinPop: l.heureFinPop, dateFinPop: l.dateFinPop,
              amplitudeCentesimal: l.amplitudeCentesimal, amplitudeHHMM: l.amplitudeHHMM,
              dureeEffectiveCent: l.dureeEffectiveCent, dureeEffectiveHHMM: l.dureeEffectiveHHMM,
              jsNpo: l.jsNpo, codeJs: l.codeJs, typeJs: l.typeJs,
              valeurNpo: l.valeurNpo, uchJs: l.uchJs, codeUchJs: l.codeUchJs,
              codeRoulementJs: l.codeRoulementJs, numeroJs: l.numeroJs,
            },
          })
        )
      );
    }

    return {
      success: true,
      importId: planningImport.id,
      lignesCreees: toCreate.length,
      lignesMisesAJour: toUpdate.length,
      agentsCreated,
      agentsUpdated,
      fileType,
      erreurs,
    };
  } catch (err) {
    return {
      success: false, lignesCreees: 0, lignesMisesAJour: 0,
      agentsCreated: 0, agentsUpdated: 0, fileType,
      erreurs: [{ ligne: 0, message: `Erreur base de données : ${String(err)}` }],
    };
  }
}

// Compat : l'ancien nom reste exporté
export { importerPlanning as importerPlanningExcel };
