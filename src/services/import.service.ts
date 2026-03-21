/**
 * Service d'import planning — orchestrateur principal
 *
 * Pipeline :
 *   1. Détection du type de fichier (Excel / TXT)
 *   2. Lecture + parsing (parseExcelRows / parseTxtRows)
 *   3. Validation des en-têtes
 *   4. Normalisation métier commune (normalizeRows)
 *   5. Persistance en base (upsert agents + création import + lignes)
 */
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

// ─── Entrée principale ────────────────────────────────────────────────────────

export async function importerPlanning(
  buffer: Buffer,
  filename: string
): Promise<ImportResult> {
  // 1. Détecter le type
  const fileType = detectFileType(filename);
  if (!fileType) {
    return {
      success: false, nbLignes: 0, nbAgents: 0, fileType: undefined,
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
      success: false, nbLignes: 0, nbAgents: 0, fileType,
      erreurs: [{ ligne: 0, message: `Erreur de lecture du fichier : ${String(err)}` }],
    };
  }

  const { headers, rows } = parseResult;

  if (rows.length === 0) {
    return {
      success: false, nbLignes: 0, nbAgents: 0, fileType,
      erreurs: [{ ligne: 0, message: "Fichier vide ou aucune ligne de données trouvée" }],
    };
  }

  // 3. Valider les en-têtes
  const headerValidation = validateHeaders(headers);
  if (!headerValidation.valid) {
    return {
      success: false, nbLignes: 0, nbAgents: 0, fileType,
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
      success: false, nbLignes: 0, nbAgents: 0, fileType,
      erreurs: [
        ...erreurs,
        { ligne: 0, message: "Aucune ligne valide après normalisation" },
      ],
    };
  }

  // 5. Persister en base
  try {
    // Upsert des agents (première occurrence par matricule)
    const agentsMap = new Map<string, string>();
    const matriculesVus = new Set<string>();
    const agentsParMatricule: typeof lignesRaw = [];

    for (const l of lignesRaw) {
      if (!matriculesVus.has(l.matricule)) {
        matriculesVus.add(l.matricule);
        agentsParMatricule.push(l);
      }
    }

    for (const l of agentsParMatricule) {
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
    }

    // Désactiver tous les imports précédents
    await prisma.planningImport.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Créer l'enregistrement d'import (actif par défaut)
    const planningImport = await prisma.planningImport.create({
      data: {
        filename,
        nbLignes: lignesRaw.length,
        nbAgents: matriculesVus.size,
        erreurs: JSON.stringify(erreurs),
        isActive: true,
      },
    });

    // Insérer les lignes de planning
    for (const l of lignesRaw) {
      await prisma.planningLigne.create({
        data: {
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
        },
      });
    }

    return {
      success: true, importId: planningImport.id,
      nbLignes: lignesRaw.length, nbAgents: matriculesVus.size,
      fileType, erreurs,
    };
  } catch (err) {
    return {
      success: false, nbLignes: 0, nbAgents: 0, fileType,
      erreurs: [{ ligne: 0, message: `Erreur base de données : ${String(err)}` }],
    };
  }
}

// Compat : l'ancien nom reste exporté
export { importerPlanning as importerPlanningExcel };
