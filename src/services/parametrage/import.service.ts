/**
 * Service d'import du paramétrage depuis un fichier Excel.
 *
 * Comportements garantis :
 *   - Ne touche JAMAIS aux données de planning (PlanningLigne, PlanningImport,
 *     Simulation, ResultatAgent)
 *   - Les agents absents du fichier Excel ne sont PAS supprimés
 *   - Les opérations sont atomiques : en cas d'erreur critique, rien n'est écrit
 *   - Rapport détaillé : créations, mises à jour, erreurs, avertissements
 *
 * Ordre d'import :
 *   1. LPA      (aucune dépendance)
 *   2. JsType   (aucune dépendance)
 *   3. Agents   (dépend de LPA via lpaBaseCode)
 *   4. LPA_JS_Types   (dépend de LPA + JsType)
 *   5. Agent_JS_Deplacement (dépend de Agent + JsType)
 */

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ─── Types publics ─────────────────────────────────────────────────────────────

export interface ImportLineResult {
  ligne: number;
  statut: "créé" | "mis à jour" | "inchangé" | "erreur" | "avertissement";
  cle: string;
  message?: string;
}

export interface ImportSheetReport {
  feuille: string;
  total: number;
  crees: number;
  misAJour: number;
  inchanges: number;
  erreurs: number;
  avertissements: number;
  lignes: ImportLineResult[];
}

export interface ImportParametrageResult {
  success: boolean;
  rapports: ImportSheetReport[];
  erreurGlobale?: string;
  stats: {
    totalCrees: number;
    totalMisAJour: number;
    totalErreurs: number;
    importedAt: string;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseBoolean(val: unknown, fieldName: string): { value: boolean; error?: string } {
  if (val === null || val === undefined || val === "") return { value: false };
  const s = String(val).trim().toUpperCase();
  if (["VRAI", "TRUE", "1", "OUI", "YES"].includes(s)) return { value: true };
  if (["FAUX", "FALSE", "0", "NON", "NO"].includes(s)) return { value: false };
  return { value: false, error: `Valeur booléenne invalide pour '${fieldName}': "${val}"` };
}

function parseBooleanNullable(val: unknown, fieldName: string): { value: boolean | null; error?: string } {
  if (val === null || val === undefined || val === "") return { value: null };
  const s = String(val).trim().toUpperCase();
  if (["VRAI", "TRUE", "1", "OUI", "YES"].includes(s)) return { value: true };
  if (["FAUX", "FALSE", "0", "NON", "NO"].includes(s)) return { value: false };
  return { value: null, error: `Valeur booléenne invalide pour '${fieldName}': "${val}"` };
}

function parseInteger(val: unknown, fieldName: string): { value: number; error?: string } {
  if (val === null || val === undefined || val === "") return { value: 0 };
  const n = parseInt(String(val), 10);
  if (isNaN(n)) return { value: 0, error: `Valeur entière invalide pour '${fieldName}': "${val}"` };
  return { value: n };
}

function parseIntegerNullable(val: unknown, fieldName: string): { value: number | null; error?: string } {
  if (val === null || val === undefined || val === "") return { value: null };
  const n = parseInt(String(val), 10);
  if (isNaN(n)) return { value: null, error: `Valeur entière invalide pour '${fieldName}': "${val}"` };
  return { value: n };
}

function parseHabilitations(val: unknown): { value: string; error?: string } {
  if (val === null || val === undefined || val === "") return { value: "[]" };
  const s = String(val).trim();
  if (s === "") return { value: "[]" };
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return { value: "[]", error: `Habilitations : tableau JSON attendu, reçu: "${s}"` };
    return { value: JSON.stringify(parsed) };
  } catch {
    return { value: "[]", error: `Habilitations : JSON invalide: "${s}"` };
  }
}

function validateTimeHHMM(val: unknown, fieldName: string): string | null {
  if (!val) return `'${fieldName}' est obligatoire`;
  const s = String(val).trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return `Format HH:MM attendu pour '${fieldName}': "${s}"`;
  const [h, m] = s.split(":").map(Number);
  if (h < 0 || h > 23) return `Heure invalide pour '${fieldName}': ${h}`;
  if (m < 0 || m > 59) return `Minutes invalides pour '${fieldName}': ${m}`;
  return null;
}

function sheetToRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });
}

function makeReport(feuille: string): ImportSheetReport {
  return { feuille, total: 0, crees: 0, misAJour: 0, inchanges: 0, erreurs: 0, avertissements: 0, lignes: [] };
}

function addLine(report: ImportSheetReport, result: ImportLineResult) {
  report.lignes.push(result);
  report.total++;
  if (result.statut === "créé") report.crees++;
  else if (result.statut === "mis à jour") report.misAJour++;
  else if (result.statut === "inchangé") report.inchanges++;
  else if (result.statut === "erreur") report.erreurs++;
  else if (result.statut === "avertissement") report.avertissements++;
}

// ─── Import LPA ───────────────────────────────────────────────────────────────

async function importLpa(ws: XLSX.WorkSheet): Promise<ImportSheetReport> {
  const report = makeReport("LPA");
  const rows = sheetToRows(ws);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ligne = i + 2; // +2 car ligne 1 = en-têtes
    const code = String(row["code"] ?? "").trim();
    const libelle = String(row["libelle"] ?? "").trim();

    if (!code) {
      addLine(report, { ligne, statut: "erreur", cle: `ligne ${ligne}`, message: "Le champ 'code' est obligatoire" });
      continue;
    }
    if (!libelle) {
      addLine(report, { ligne, statut: "erreur", cle: code, message: "Le champ 'libelle' est obligatoire" });
      continue;
    }

    const actifResult = parseBoolean(row["actif"], "actif");
    if (actifResult.error) {
      addLine(report, { ligne, statut: "avertissement", cle: code, message: actifResult.error + " — valeur FAUX utilisée" });
    }

    const existing = await prisma.lpa.findUnique({ where: { code } });
    if (existing) {
      const changed = existing.libelle !== libelle || existing.actif !== actifResult.value;
      if (changed) {
        await prisma.lpa.update({ where: { code }, data: { libelle, actif: actifResult.value } });
        addLine(report, { ligne, statut: "mis à jour", cle: code });
      } else {
        addLine(report, { ligne, statut: "inchangé", cle: code });
      }
    } else {
      await prisma.lpa.create({ data: { code, libelle, actif: actifResult.value } });
      addLine(report, { ligne, statut: "créé", cle: code });
    }
  }

  return report;
}

// ─── Import JsType ────────────────────────────────────────────────────────────

async function importJsTypes(ws: XLSX.WorkSheet): Promise<ImportSheetReport> {
  const report = makeReport("JS_Types");
  const rows = sheetToRows(ws);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ligne = i + 2;
    const code = String(row["code"] ?? "").trim();
    const libelle = String(row["libelle"] ?? "").trim();
    const heureDebut = String(row["heureDebutStandard"] ?? "").trim();
    const heureFin = String(row["heureFinStandard"] ?? "").trim();

    if (!code) {
      addLine(report, { ligne, statut: "erreur", cle: `ligne ${ligne}`, message: "Le champ 'code' est obligatoire" });
      continue;
    }
    if (!libelle) {
      addLine(report, { ligne, statut: "erreur", cle: code, message: "Le champ 'libelle' est obligatoire" });
      continue;
    }

    const errors: string[] = [];
    const tDebut = validateTimeHHMM(heureDebut, "heureDebutStandard");
    if (tDebut) errors.push(tDebut);
    const tFin = validateTimeHHMM(heureFin, "heureFinStandard");
    if (tFin) errors.push(tFin);

    const dureeResult = parseInteger(row["dureeStandard"], "dureeStandard");
    if (dureeResult.error) errors.push(dureeResult.error);

    const estNuitResult = parseBoolean(row["estNuit"], "estNuit");
    if (estNuitResult.error) errors.push(estNuitResult.error);
    const actifResult = parseBoolean(row["actif"], "actif");
    if (actifResult.error) errors.push(actifResult.error);

    if (errors.length > 0) {
      addLine(report, { ligne, statut: "erreur", cle: code, message: errors.join(" | ") });
      continue;
    }

    const regime = String(row["regime"] ?? "").trim() || null;

    const data = {
      libelle,
      heureDebutStandard: heureDebut,
      heureFinStandard: heureFin,
      dureeStandard: dureeResult.value,
      estNuit: estNuitResult.value,
      regime,
      actif: actifResult.value,
    };

    const existing = await prisma.jsType.findUnique({ where: { code } });
    if (existing) {
      const changed =
        existing.libelle !== data.libelle ||
        existing.heureDebutStandard !== data.heureDebutStandard ||
        existing.heureFinStandard !== data.heureFinStandard ||
        existing.dureeStandard !== data.dureeStandard ||
        existing.estNuit !== data.estNuit ||
        existing.regime !== data.regime ||
        existing.actif !== data.actif;
      if (changed) {
        await prisma.jsType.update({ where: { code }, data });
        addLine(report, { ligne, statut: "mis à jour", cle: code });
      } else {
        addLine(report, { ligne, statut: "inchangé", cle: code });
      }
    } else {
      await prisma.jsType.create({ data: { code, ...data } });
      addLine(report, { ligne, statut: "créé", cle: code });
    }
  }

  return report;
}

// ─── Import Agents ────────────────────────────────────────────────────────────

async function importAgents(ws: XLSX.WorkSheet): Promise<ImportSheetReport> {
  const report = makeReport("Agents");
  const rows = sheetToRows(ws);

  // Charger le mapping code → id de toutes les LPA pour résolution rapide
  const allLpas = await prisma.lpa.findMany({ select: { id: true, code: true } });
  const lpaByCode = new Map(allLpas.map((l) => [l.code, l.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ligne = i + 2;
    const matricule = String(row["matricule"] ?? "").trim();
    const nom = String(row["nom"] ?? "").trim();
    const prenom = String(row["prenom"] ?? "").trim();

    if (!matricule) {
      addLine(report, { ligne, statut: "erreur", cle: `ligne ${ligne}`, message: "Le champ 'matricule' est obligatoire" });
      continue;
    }
    if (!nom) {
      addLine(report, { ligne, statut: "erreur", cle: matricule, message: "Le champ 'nom' est obligatoire" });
      continue;
    }
    if (!prenom) {
      addLine(report, { ligne, statut: "erreur", cle: matricule, message: "Le champ 'prenom' est obligatoire" });
      continue;
    }

    const errors: string[] = [];
    const agentReserveResult = parseBoolean(row["agentReserve"], "agentReserve");
    if (agentReserveResult.error) errors.push(agentReserveResult.error);
    const peutFaireNuitResult = parseBoolean(row["peutFaireNuit"], "peutFaireNuit");
    if (peutFaireNuitResult.error) errors.push(peutFaireNuitResult.error);
    const peutEtreDeplace = parseBoolean(row["peutEtreDeplace"], "peutEtreDeplace");
    if (peutEtreDeplace.error) errors.push(peutEtreDeplace.error);
    const regimeB = parseBoolean(row["regimeB"], "regimeB");
    if (regimeB.error) errors.push(regimeB.error);
    const regimeC = parseBoolean(row["regimeC"], "regimeC");
    if (regimeC.error) errors.push(regimeC.error);
    const habResult = parseHabilitations(row["habilitations"]);
    if (habResult.error) errors.push(habResult.error);
    const codeCollegeGradeResult = parseIntegerNullable(row["codeCollegeGrade"], "codeCollegeGrade");
    if (codeCollegeGradeResult.error) errors.push(codeCollegeGradeResult.error);

    if (errors.length > 0) {
      addLine(report, { ligne, statut: "erreur", cle: matricule, message: errors.join(" | ") });
      continue;
    }

    // Résolution LPA
    const lpaBaseCodeRaw = String(row["lpaBaseCode"] ?? "").trim();
    let lpaBaseId: string | null = null;
    if (lpaBaseCodeRaw) {
      lpaBaseId = lpaByCode.get(lpaBaseCodeRaw) ?? null;
      if (!lpaBaseId) {
        addLine(report, {
          ligne,
          statut: "avertissement",
          cle: matricule,
          message: `LPA "${lpaBaseCodeRaw}" introuvable — lpaBaseId laissé vide`,
        });
      }
    }

    const data = {
      nom,
      prenom,
      uch: String(row["uch"] ?? "").trim() || null,
      codeUch: String(row["codeUch"] ?? "").trim() || null,
      codeApes: String(row["codeApes"] ?? "").trim() || null,
      codeSymboleGrade: String(row["codeSymboleGrade"] ?? "").trim() || null,
      codeCollegeGrade: codeCollegeGradeResult.value,
      posteAffectation: String(row["posteAffectation"] ?? "").trim() || null,
      agentReserve: agentReserveResult.value,
      peutFaireNuit: peutFaireNuitResult.value,
      peutEtreDeplace: peutEtreDeplace.value,
      regimeB: regimeB.value,
      regimeC: regimeC.value,
      habilitations: habResult.value,
      lpaBaseId,
    };

    const existing = await prisma.agent.findUnique({ where: { matricule } });
    if (existing) {
      const changed =
        existing.nom !== data.nom ||
        existing.prenom !== data.prenom ||
        existing.uch !== data.uch ||
        existing.codeUch !== data.codeUch ||
        existing.codeApes !== data.codeApes ||
        existing.codeSymboleGrade !== data.codeSymboleGrade ||
        existing.codeCollegeGrade !== data.codeCollegeGrade ||
        existing.posteAffectation !== data.posteAffectation ||
        existing.agentReserve !== data.agentReserve ||
        existing.peutFaireNuit !== data.peutFaireNuit ||
        existing.peutEtreDeplace !== data.peutEtreDeplace ||
        existing.regimeB !== data.regimeB ||
        existing.regimeC !== data.regimeC ||
        existing.habilitations !== data.habilitations ||
        existing.lpaBaseId !== data.lpaBaseId;
      if (changed) {
        await prisma.agent.update({ where: { matricule }, data });
        addLine(report, { ligne, statut: "mis à jour", cle: matricule });
      } else {
        addLine(report, { ligne, statut: "inchangé", cle: matricule });
      }
    } else {
      await prisma.agent.create({ data: { matricule, ...data } });
      addLine(report, { ligne, statut: "créé", cle: matricule });
    }
  }

  return report;
}

// ─── Import LPA_JS_Types ──────────────────────────────────────────────────────

async function importLpaJsTypes(ws: XLSX.WorkSheet): Promise<ImportSheetReport> {
  const report = makeReport("LPA_JS_Types");
  const rows = sheetToRows(ws);

  // Charger les référentiels
  const allLpas = await prisma.lpa.findMany({ select: { id: true, code: true } });
  const lpaByCode = new Map(allLpas.map((l) => [l.code, l.id]));
  const allJsTypes = await prisma.jsType.findMany({ select: { id: true, code: true } });
  const jsTypeByCode = new Map(allJsTypes.map((j) => [j.code, j.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ligne = i + 2;
    const lpaCode = String(row["lpaCode"] ?? "").trim();
    const jsTypeCode = String(row["jsTypeCode"] ?? "").trim();
    const cle = `${lpaCode}|${jsTypeCode}`;

    if (!lpaCode || !jsTypeCode) {
      addLine(report, { ligne, statut: "erreur", cle: `ligne ${ligne}`, message: "Les champs 'lpaCode' et 'jsTypeCode' sont obligatoires" });
      continue;
    }

    const lpaId = lpaByCode.get(lpaCode);
    if (!lpaId) {
      addLine(report, { ligne, statut: "erreur", cle, message: `LPA "${lpaCode}" introuvable` });
      continue;
    }

    const jsTypeId = jsTypeByCode.get(jsTypeCode);
    if (!jsTypeId) {
      addLine(report, { ligne, statut: "erreur", cle, message: `JsType "${jsTypeCode}" introuvable` });
      continue;
    }

    const existing = await prisma.lpaJsType.findUnique({ where: { lpaId_jsTypeId: { lpaId, jsTypeId } } });
    if (existing) {
      addLine(report, { ligne, statut: "inchangé", cle });
    } else {
      await prisma.lpaJsType.create({ data: { lpaId, jsTypeId } });
      addLine(report, { ligne, statut: "créé", cle });
    }
  }

  return report;
}

// ─── Import Agent_JS_Deplacement ──────────────────────────────────────────────

async function importDeplacementRules(ws: XLSX.WorkSheet): Promise<ImportSheetReport> {
  const report = makeReport("Agent_JS_Deplacement");
  const rows = sheetToRows(ws);

  // Charger les référentiels
  const allAgents = await prisma.agent.findMany({ select: { id: true, matricule: true } });
  const agentByMatricule = new Map(allAgents.map((a) => [a.matricule, a.id]));
  const allJsTypes = await prisma.jsType.findMany({ select: { id: true, code: true } });
  const jsTypeByCode = new Map(allJsTypes.map((j) => [j.code, j.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ligne = i + 2;
    const agentMatricule = String(row["agentMatricule"] ?? "").trim();
    const jsTypeCode = String(row["jsTypeCode"] ?? "").trim();
    const prefixeJs = String(row["prefixeJs"] ?? "").trim() || null;
    const cle = `${agentMatricule}|${jsTypeCode || prefixeJs || "?"}`;

    if (!agentMatricule) {
      addLine(report, { ligne, statut: "erreur", cle: `ligne ${ligne}`, message: "Le champ 'agentMatricule' est obligatoire" });
      continue;
    }
    if (!jsTypeCode && !prefixeJs) {
      addLine(report, { ligne, statut: "erreur", cle, message: "Soit 'jsTypeCode' soit 'prefixeJs' doit être renseigné" });
      continue;
    }

    const agentId = agentByMatricule.get(agentMatricule);
    if (!agentId) {
      addLine(report, { ligne, statut: "erreur", cle, message: `Agent matricule "${agentMatricule}" introuvable` });
      continue;
    }

    let jsTypeId: string | null = null;
    if (jsTypeCode) {
      jsTypeId = jsTypeByCode.get(jsTypeCode) ?? null;
      if (!jsTypeId) {
        addLine(report, { ligne, statut: "erreur", cle, message: `JsType "${jsTypeCode}" introuvable` });
        continue;
      }
    }

    const errors: string[] = [];
    const horsLpaResult = parseBooleanNullable(row["horsLpa"], "horsLpa");
    if (horsLpaResult.error) errors.push(horsLpaResult.error);
    const allerResult = parseInteger(row["tempsTrajetAllerMinutes"], "tempsTrajetAllerMinutes");
    if (allerResult.error) errors.push(allerResult.error);
    const retourResult = parseInteger(row["tempsTrajetRetourMinutes"], "tempsTrajetRetourMinutes");
    if (retourResult.error) errors.push(retourResult.error);
    const actifResult = parseBoolean(row["actif"], "actif");
    if (actifResult.error) errors.push(actifResult.error);

    if (errors.length > 0) {
      addLine(report, { ligne, statut: "erreur", cle, message: errors.join(" | ") });
      continue;
    }

    const data = {
      horsLpa: horsLpaResult.value,
      tempsTrajetAllerMinutes: allerResult.value,
      tempsTrajetRetourMinutes: retourResult.value,
      actif: actifResult.value,
    };

    // Clé de rapprochement : agentId + jsTypeId OU agentId + prefixeJs
    const existing = jsTypeId
      ? await prisma.agentJsDeplacementRule.findFirst({ where: { agentId, jsTypeId } })
      : await prisma.agentJsDeplacementRule.findFirst({ where: { agentId, prefixeJs } });

    if (existing) {
      const changed =
        existing.horsLpa !== data.horsLpa ||
        existing.tempsTrajetAllerMinutes !== data.tempsTrajetAllerMinutes ||
        existing.tempsTrajetRetourMinutes !== data.tempsTrajetRetourMinutes ||
        existing.actif !== data.actif;
      if (changed) {
        await prisma.agentJsDeplacementRule.update({ where: { id: existing.id }, data });
        addLine(report, { ligne, statut: "mis à jour", cle });
      } else {
        addLine(report, { ligne, statut: "inchangé", cle });
      }
    } else {
      await prisma.agentJsDeplacementRule.create({
        data: { agentId, jsTypeId, prefixeJs, ...data },
      });
      addLine(report, { ligne, statut: "créé", cle });
    }
  }

  return report;
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

const SHEET_NAMES = {
  lpa: "LPA",
  jsTypes: "JS_Types",
  agents: "Agents",
  lpaJsTypes: "LPA_JS_Types",
  deplacement: "Agent_JS_Deplacement",
} as const;

export async function importParametrage(buffer: Buffer): Promise<ImportParametrageResult> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return {
      success: false,
      rapports: [],
      erreurGlobale: "Impossible de lire le fichier Excel. Vérifiez que c'est un fichier .xlsx valide.",
      stats: { totalCrees: 0, totalMisAJour: 0, totalErreurs: 1, importedAt: new Date().toISOString() },
    };
  }

  const availableSheets = wb.SheetNames;
  const rapports: ImportSheetReport[] = [];

  try {
    // 1. LPA — aucune dépendance
    if (availableSheets.includes(SHEET_NAMES.lpa)) {
      rapports.push(await importLpa(wb.Sheets[SHEET_NAMES.lpa]));
    } else {
      rapports.push({ feuille: SHEET_NAMES.lpa, total: 0, crees: 0, misAJour: 0, inchanges: 0, erreurs: 0, avertissements: 1,
        lignes: [{ ligne: 0, statut: "avertissement", cle: "-", message: `Onglet "${SHEET_NAMES.lpa}" absent — feuille ignorée` }] });
    }

    // 2. JS_Types — aucune dépendance
    if (availableSheets.includes(SHEET_NAMES.jsTypes)) {
      rapports.push(await importJsTypes(wb.Sheets[SHEET_NAMES.jsTypes]));
    } else {
      rapports.push({ feuille: SHEET_NAMES.jsTypes, total: 0, crees: 0, misAJour: 0, inchanges: 0, erreurs: 0, avertissements: 1,
        lignes: [{ ligne: 0, statut: "avertissement", cle: "-", message: `Onglet "${SHEET_NAMES.jsTypes}" absent — feuille ignorée` }] });
    }

    // 3. Agents — dépend de LPA
    if (availableSheets.includes(SHEET_NAMES.agents)) {
      rapports.push(await importAgents(wb.Sheets[SHEET_NAMES.agents]));
    } else {
      rapports.push({ feuille: SHEET_NAMES.agents, total: 0, crees: 0, misAJour: 0, inchanges: 0, erreurs: 0, avertissements: 1,
        lignes: [{ ligne: 0, statut: "avertissement", cle: "-", message: `Onglet "${SHEET_NAMES.agents}" absent — feuille ignorée` }] });
    }

    // 4. LPA_JS_Types — dépend de LPA + JsType
    if (availableSheets.includes(SHEET_NAMES.lpaJsTypes)) {
      rapports.push(await importLpaJsTypes(wb.Sheets[SHEET_NAMES.lpaJsTypes]));
    } else {
      rapports.push({ feuille: SHEET_NAMES.lpaJsTypes, total: 0, crees: 0, misAJour: 0, inchanges: 0, erreurs: 0, avertissements: 1,
        lignes: [{ ligne: 0, statut: "avertissement", cle: "-", message: `Onglet "${SHEET_NAMES.lpaJsTypes}" absent — feuille ignorée` }] });
    }

    // 5. Agent_JS_Deplacement — dépend de Agent + JsType
    if (availableSheets.includes(SHEET_NAMES.deplacement)) {
      rapports.push(await importDeplacementRules(wb.Sheets[SHEET_NAMES.deplacement]));
    } else {
      rapports.push({ feuille: SHEET_NAMES.deplacement, total: 0, crees: 0, misAJour: 0, inchanges: 0, erreurs: 0, avertissements: 1,
        lignes: [{ ligne: 0, statut: "avertissement", cle: "-", message: `Onglet "${SHEET_NAMES.deplacement}" absent — feuille ignorée` }] });
    }
  } catch (err) {
    console.error("[importParametrage] Erreur inattendue:", err);
    return {
      success: false,
      rapports,
      erreurGlobale: `Erreur technique lors de l'import : ${err instanceof Error ? err.message : String(err)}`,
      stats: { totalCrees: 0, totalMisAJour: 0, totalErreurs: 1, importedAt: new Date().toISOString() },
    };
  }

  const totalCrees = rapports.reduce((s, r) => s + r.crees, 0);
  const totalMisAJour = rapports.reduce((s, r) => s + r.misAJour, 0);
  const totalErreurs = rapports.reduce((s, r) => s + r.erreurs, 0);

  return {
    success: true,
    rapports,
    stats: {
      totalCrees,
      totalMisAJour,
      totalErreurs,
      importedAt: new Date().toISOString(),
    },
  };
}
