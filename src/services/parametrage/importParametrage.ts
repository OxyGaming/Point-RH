/**
 * Service d'import Excel — données de paramétrage.
 *
 * Périmètre : JS_Types, LPA, LPA_JS_Types, Agents, Agent_JS_Deplacement.
 * EXCLUSION TOTALE : PlanningImport, PlanningLigne, Simulation, ResultatAgent.
 *
 * Stratégie :
 *   1. Validation complète de toutes les données (sans écriture).
 *   2. Si erreurs bloquantes → retour immédiat sans écriture.
 *   3. Sinon → persistance en transaction unique.
 *
 * Clés de rapprochement :
 *   - JsType     → code (unique)
 *   - Lpa        → code (unique)
 *   - LpaJsType  → (lpaCode, jsTypeCode)
 *   - Agent      → matricule (unique)
 *   - AgentJsDeplacement → (agentId, jsTypeId, prefixeJs)
 */
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ─── Types publics ────────────────────────────────────────────────────────────

export interface ErreurImportParametrage {
  onglet: string;
  ligne: number;
  champ?: string;
  message: string;
  niveau: "erreur" | "avertissement";
}

export interface ResultatImportParametrage {
  success: boolean;
  nbCreations: {
    jsTypes: number;
    lpas: number;
    lpaJsTypes: number;
    agents: number;
    agentDeplacement: number;
  };
  nbMisesAJour: {
    jsTypes: number;
    lpas: number;
    agents: number;
    agentDeplacement: number;
  };
  nbIgnores: number;
  erreurs: ErreurImportParametrage[];
  avertissements: ErreurImportParametrage[];
}

// ─── Types internes ───────────────────────────────────────────────────────────

interface ParsedJsType {
  ligne: number;
  id: string;
  code: string;
  libelle: string;
  heureDebutStandard: string;
  heureFinStandard: string;
  dureeStandard: number;
  estNuit: boolean;
  regime: string | null;
  actif: boolean;
}

interface ParsedLpa {
  ligne: number;
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface ParsedLpaJsType {
  ligne: number;
  lpaCode: string;
  jsTypeCode: string;
}

interface ParsedAgent {
  ligne: number;
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  uch: string | null;
  codeUch: string | null;
  codeApes: string | null;
  codeSymboleGrade: string | null;
  codeCollegeGrade: number | null;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  regimeB: boolean;
  regimeC: boolean;
  habilitations: string;
  lpaCode: string | null;
  actif: boolean;
}

interface ParsedAgentDeplacement {
  ligne: number;
  id: string;
  matricule: string;
  jsTypeCode: string | null;
  prefixeJs: string | null;
  horsLpa: boolean | null;
  tempsTrajetAllerMinutes: number;
  tempsTrajetRetourMinutes: number;
  actif: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function strOrNull(val: unknown): string | null {
  const s = str(val);
  return s === "" ? null : s;
}

function parseBool(val: unknown, defaultVal = false): boolean {
  const s = str(val).toUpperCase();
  if (s === "OUI" || s === "1" || s === "TRUE") return true;
  if (s === "NON" || s === "0" || s === "FALSE") return false;
  return defaultVal;
}

function parseBoolOrNull(val: unknown): boolean | null {
  const s = str(val).toUpperCase();
  if (s === "") return null;
  if (s === "OUI" || s === "1" || s === "TRUE") return true;
  if (s === "NON" || s === "0" || s === "FALSE") return false;
  return null;
}

function numOrDefault(val: unknown, def = 0): number {
  const n = Number(val);
  return isNaN(n) ? def : Math.round(n);
}

function numOrNull(val: unknown): number | null {
  const s = str(val);
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? null : Math.round(n);
}

function isValidHhMm(val: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(val);
}

function getSheetRows(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
}

function emptyResult(erreurs: ErreurImportParametrage[], avertissements: ErreurImportParametrage[] = []): ResultatImportParametrage {
  return {
    success: false,
    nbCreations: { jsTypes: 0, lpas: 0, lpaJsTypes: 0, agents: 0, agentDeplacement: 0 },
    nbMisesAJour: { jsTypes: 0, lpas: 0, agents: 0, agentDeplacement: 0 },
    nbIgnores: 0,
    erreurs,
    avertissements,
  };
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

export async function importerParametrage(buffer: Buffer): Promise<ResultatImportParametrage> {
  const erreurs: ErreurImportParametrage[] = [];
  const avertissements: ErreurImportParametrage[] = [];

  const addErr = (onglet: string, ligne: number, message: string, champ?: string) => {
    erreurs.push({ onglet, ligne, champ, message, niveau: "erreur" });
  };
  const addWarn = (onglet: string, ligne: number, message: string) => {
    avertissements.push({ onglet, ligne, message, niveau: "avertissement" });
  };

  // ── Parse du classeur ──────────────────────────────────────────────────────
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return emptyResult([{ onglet: "Fichier", ligne: 0, message: "Impossible de lire le fichier Excel. Vérifiez qu'il s'agit bien d'un fichier .xlsx valide.", niveau: "erreur" }]);
  }

  // Onglets obligatoires
  for (const required of ["Agents", "JS_Types", "LPA"]) {
    if (!wb.SheetNames.includes(required)) {
      addErr("Fichier", 0, `Onglet obligatoire manquant : "${required}"`);
    }
  }
  if (erreurs.length > 0) return emptyResult(erreurs, avertissements);

  // ── Parse JS_Types ─────────────────────────────────────────────────────────
  const jsTypesParsed: ParsedJsType[] = [];
  const jsTypesCodes = new Set<string>();

  for (const [i, row] of getSheetRows(wb, "JS_Types").entries()) {
    const ligne = i + 2;
    const code = str(row.code);
    const libelle = str(row.libelle);
    const heureDebut = str(row.heureDebutStandard);
    const heureFin = str(row.heureFinStandard);

    if (!code) { addErr("JS_Types", ligne, "La colonne 'code' est obligatoire.", "code"); continue; }
    if (!libelle) { addErr("JS_Types", ligne, "La colonne 'libelle' est obligatoire.", "libelle"); continue; }
    if (!heureDebut) { addErr("JS_Types", ligne, "La colonne 'heureDebutStandard' est obligatoire.", "heureDebutStandard"); continue; }
    if (!heureFin) { addErr("JS_Types", ligne, "La colonne 'heureFinStandard' est obligatoire.", "heureFinStandard"); continue; }
    if (!isValidHhMm(heureDebut)) { addErr("JS_Types", ligne, `Format heure début invalide (attendu HH:MM) : "${heureDebut}"`, "heureDebutStandard"); continue; }
    if (!isValidHhMm(heureFin)) { addErr("JS_Types", ligne, `Format heure fin invalide (attendu HH:MM) : "${heureFin}"`, "heureFinStandard"); continue; }

    if (jsTypesCodes.has(code)) {
      addErr("JS_Types", ligne, `Code JS dupliqué dans le fichier : "${code}"`, "code");
      continue;
    }
    jsTypesCodes.add(code);

    jsTypesParsed.push({
      ligne,
      id: str(row.id),
      code,
      libelle,
      heureDebutStandard: heureDebut,
      heureFinStandard: heureFin,
      dureeStandard: numOrDefault(row.dureeStandard, 0),
      estNuit: parseBool(row.estNuit, false),
      regime: strOrNull(row.regime),
      actif: parseBool(row.actif, true),
    });
  }

  // ── Parse LPA ──────────────────────────────────────────────────────────────
  const lpaParsed: ParsedLpa[] = [];
  const lpaCodes = new Set<string>();

  for (const [i, row] of getSheetRows(wb, "LPA").entries()) {
    const ligne = i + 2;
    const code = str(row.code);
    const libelle = str(row.libelle);

    if (!code) { addErr("LPA", ligne, "La colonne 'code' est obligatoire.", "code"); continue; }
    if (!libelle) { addErr("LPA", ligne, "La colonne 'libelle' est obligatoire.", "libelle"); continue; }

    if (lpaCodes.has(code)) {
      addErr("LPA", ligne, `Code LPA dupliqué dans le fichier : "${code}"`, "code");
      continue;
    }
    lpaCodes.add(code);

    lpaParsed.push({
      ligne,
      id: str(row.id),
      code,
      libelle,
      actif: parseBool(row.actif, true),
    });
  }

  // ── Parse LPA_JS_Types ─────────────────────────────────────────────────────
  const lpaJsTypesParsed: ParsedLpaJsType[] = [];
  const lpaJsTypesKeys = new Set<string>();

  if (wb.SheetNames.includes("LPA_JS_Types")) {
    for (const [i, row] of getSheetRows(wb, "LPA_JS_Types").entries()) {
      const ligne = i + 2;
      const lpaCode = str(row.lpaCode);
      const jsTypeCode = str(row.jsTypeCode);

      if (!lpaCode && !jsTypeCode) continue; // Ligne vide (ex : ligne exemple dans modèle)
      if (!lpaCode) { addErr("LPA_JS_Types", ligne, "La colonne 'lpaCode' est obligatoire.", "lpaCode"); continue; }
      if (!jsTypeCode) { addErr("LPA_JS_Types", ligne, "La colonne 'jsTypeCode' est obligatoire.", "jsTypeCode"); continue; }

      const key = `${lpaCode}::${jsTypeCode}`;
      if (lpaJsTypesKeys.has(key)) {
        addWarn("LPA_JS_Types", ligne, `Association dupliquée ignorée : LPA="${lpaCode}" + JS="${jsTypeCode}"`);
        continue;
      }
      lpaJsTypesKeys.add(key);

      // Validation des références croisées dans le fichier
      if (!lpaCodes.has(lpaCode)) {
        addErr("LPA_JS_Types", ligne, `Code LPA introuvable dans l'onglet LPA : "${lpaCode}"`, "lpaCode");
      }
      if (!jsTypesCodes.has(jsTypeCode)) {
        addErr("LPA_JS_Types", ligne, `Code JS introuvable dans l'onglet JS_Types : "${jsTypeCode}"`, "jsTypeCode");
      }

      lpaJsTypesParsed.push({ ligne, lpaCode, jsTypeCode });
    }
  }

  // ── Parse Agents ───────────────────────────────────────────────────────────
  const agentsParsed: ParsedAgent[] = [];
  const agentsMatricules = new Set<string>();

  for (const [i, row] of getSheetRows(wb, "Agents").entries()) {
    const ligne = i + 2;
    const matricule = str(row.matricule);
    const nom = str(row.nom);
    const prenom = str(row.prenom);

    if (!matricule) { addErr("Agents", ligne, "La colonne 'matricule' est obligatoire.", "matricule"); continue; }
    if (!nom) { addErr("Agents", ligne, "La colonne 'nom' est obligatoire.", "nom"); continue; }
    if (!prenom) { addErr("Agents", ligne, "La colonne 'prenom' est obligatoire.", "prenom"); continue; }

    if (agentsMatricules.has(matricule)) {
      addErr("Agents", ligne, `Matricule dupliqué dans le fichier : "${matricule}"`, "matricule");
      continue;
    }
    agentsMatricules.add(matricule);

    const lpaCode = strOrNull(row.lpaCode);
    if (lpaCode && !lpaCodes.has(lpaCode)) {
      addWarn("Agents", ligne, `LPA "${lpaCode}" absente de l'onglet LPA — la référence sera ignorée si la LPA est inconnue en base.`);
    }

    let habilitations = "[]";
    const habRaw = str(row.habilitations);
    if (habRaw && habRaw !== "[]") {
      try {
        JSON.parse(habRaw);
        habilitations = habRaw;
      } catch {
        addWarn("Agents", ligne, `Habilitations JSON invalide, valeur réinitialisée à [] : "${habRaw.slice(0, 50)}"`);
      }
    }

    agentsParsed.push({
      ligne,
      id: str(row.id),
      matricule,
      nom,
      prenom,
      uch: strOrNull(row.uch),
      codeUch: strOrNull(row.codeUch),
      codeApes: strOrNull(row.codeApes),
      codeSymboleGrade: strOrNull(row.codeSymboleGrade),
      codeCollegeGrade: numOrNull(row.codeCollegeGrade),
      posteAffectation: strOrNull(row.posteAffectation),
      agentReserve: parseBool(row.agentReserve, false),
      peutFaireNuit: parseBool(row.peutFaireNuit, true),
      peutEtreDeplace: parseBool(row.peutEtreDeplace, false),
      regimeB: parseBool(row.regimeB, false),
      regimeC: parseBool(row.regimeC, false),
      habilitations,
      lpaCode,
      actif: parseBool(row.actif, true),
    });
  }

  // ── Parse Agent_JS_Deplacement ─────────────────────────────────────────────
  const agentDeplacParsed: ParsedAgentDeplacement[] = [];
  const agentDeplacKeys = new Set<string>();

  if (wb.SheetNames.includes("Agent_JS_Deplacement")) {
    for (const [i, row] of getSheetRows(wb, "Agent_JS_Deplacement").entries()) {
      const ligne = i + 2;
      const matricule = str(row.matricule);
      const jsTypeCode = strOrNull(row.jsTypeCode);
      const prefixeJs = strOrNull(row.prefixeJs);

      if (!matricule) continue; // Ligne vide ou exemple

      if (!jsTypeCode && !prefixeJs) {
        addErr("Agent_JS_Deplacement", ligne, "Renseignez 'jsTypeCode' ou 'prefixeJs' (au moins l'un des deux).", "jsTypeCode");
        continue;
      }

      if (!agentsMatricules.has(matricule)) {
        addErr("Agent_JS_Deplacement", ligne, `Matricule agent introuvable dans l'onglet Agents : "${matricule}"`, "matricule");
        continue;
      }

      if (jsTypeCode && !jsTypesCodes.has(jsTypeCode)) {
        addErr("Agent_JS_Deplacement", ligne, `Code JS introuvable dans l'onglet JS_Types : "${jsTypeCode}"`, "jsTypeCode");
        continue;
      }

      const key = `${matricule}::${jsTypeCode ?? ""}::${prefixeJs ?? ""}`;
      if (agentDeplacKeys.has(key)) {
        addWarn("Agent_JS_Deplacement", ligne, `Règle dupliquée ignorée pour agent "${matricule}"`);
        continue;
      }
      agentDeplacKeys.add(key);

      agentDeplacParsed.push({
        ligne,
        id: str(row.id),
        matricule,
        jsTypeCode,
        prefixeJs,
        horsLpa: parseBoolOrNull(row.horsLpa),
        tempsTrajetAllerMinutes: numOrDefault(row.tempsTrajetAllerMinutes, 0),
        tempsTrajetRetourMinutes: numOrDefault(row.tempsTrajetRetourMinutes, 0),
        actif: parseBool(row.actif, true),
      });
    }
  }

  // ── Arrêt si erreurs bloquantes ────────────────────────────────────────────
  if (erreurs.length > 0) {
    return emptyResult(erreurs, avertissements);
  }

  // ── Persistance en transaction ─────────────────────────────────────────────
  const nbCreations = { jsTypes: 0, lpas: 0, lpaJsTypes: 0, agents: 0, agentDeplacement: 0 };
  const nbMisesAJour = { jsTypes: 0, lpas: 0, agents: 0, agentDeplacement: 0 };
  let nbIgnores = 0;

  try {
    await prisma.$transaction(async (tx) => {

      // 1 ── JsTypes
      for (const jt of jsTypesParsed) {
        const existing = await tx.jsType.findUnique({ where: { code: jt.code } });
        if (existing) {
          await tx.jsType.update({
            where: { code: jt.code },
            data: {
              libelle: jt.libelle,
              heureDebutStandard: jt.heureDebutStandard,
              heureFinStandard: jt.heureFinStandard,
              dureeStandard: jt.dureeStandard,
              estNuit: jt.estNuit,
              regime: jt.regime,
              actif: jt.actif,
            },
          });
          nbMisesAJour.jsTypes++;
        } else {
          await tx.jsType.create({
            data: {
              code: jt.code,
              libelle: jt.libelle,
              heureDebutStandard: jt.heureDebutStandard,
              heureFinStandard: jt.heureFinStandard,
              dureeStandard: jt.dureeStandard,
              estNuit: jt.estNuit,
              regime: jt.regime,
              actif: jt.actif,
            },
          });
          nbCreations.jsTypes++;
        }
      }

      // 2 ── LPAs
      for (const lpa of lpaParsed) {
        const existing = await tx.lpa.findUnique({ where: { code: lpa.code } });
        if (existing) {
          await tx.lpa.update({
            where: { code: lpa.code },
            data: { libelle: lpa.libelle, actif: lpa.actif },
          });
          nbMisesAJour.lpas++;
        } else {
          await tx.lpa.create({
            data: { code: lpa.code, libelle: lpa.libelle, actif: lpa.actif },
          });
          nbCreations.lpas++;
        }
      }

      // 3 ── LPA_JS_Types (upsert uniquement les associations présentes dans le fichier)
      for (const ljt of lpaJsTypesParsed) {
        const lpa = await tx.lpa.findUnique({ where: { code: ljt.lpaCode } });
        const jsType = await tx.jsType.findUnique({ where: { code: ljt.jsTypeCode } });
        if (!lpa || !jsType) { nbIgnores++; continue; }

        const existing = await tx.lpaJsType.findUnique({
          where: { lpaId_jsTypeId: { lpaId: lpa.id, jsTypeId: jsType.id } },
        });
        if (!existing) {
          await tx.lpaJsType.create({ data: { lpaId: lpa.id, jsTypeId: jsType.id } });
          nbCreations.lpaJsTypes++;
        } else {
          nbIgnores++;
        }
      }

      // 4 ── Agents
      for (const agent of agentsParsed) {
        let lpaId: string | null = null;
        if (agent.lpaCode) {
          const lpa = await tx.lpa.findUnique({ where: { code: agent.lpaCode } });
          lpaId = lpa?.id ?? null;
        }

        const existing = await tx.agent.findUnique({ where: { matricule: agent.matricule } });
        if (existing) {
          await tx.agent.update({
            where: { matricule: agent.matricule },
            data: {
              nom: agent.nom,
              prenom: agent.prenom,
              uch: agent.uch,
              codeUch: agent.codeUch,
              codeApes: agent.codeApes,
              codeSymboleGrade: agent.codeSymboleGrade,
              codeCollegeGrade: agent.codeCollegeGrade,
              posteAffectation: agent.posteAffectation,
              agentReserve: agent.agentReserve,
              peutFaireNuit: agent.peutFaireNuit,
              peutEtreDeplace: agent.peutEtreDeplace,
              regimeB: agent.regimeB,
              regimeC: agent.regimeC,
              habilitations: agent.habilitations,
              lpaBaseId: lpaId,
              // deletedAt intentionnellement ignoré — seul un admin peut supprimer
            },
          });
          nbMisesAJour.agents++;
        } else {
          await tx.agent.create({
            data: {
              matricule: agent.matricule,
              nom: agent.nom,
              prenom: agent.prenom,
              uch: agent.uch,
              codeUch: agent.codeUch,
              codeApes: agent.codeApes,
              codeSymboleGrade: agent.codeSymboleGrade,
              codeCollegeGrade: agent.codeCollegeGrade,
              posteAffectation: agent.posteAffectation,
              agentReserve: agent.agentReserve,
              peutFaireNuit: agent.peutFaireNuit,
              peutEtreDeplace: agent.peutEtreDeplace,
              regimeB: agent.regimeB,
              regimeC: agent.regimeC,
              habilitations: agent.habilitations,
              lpaBaseId: lpaId,
            },
          });
          nbCreations.agents++;
        }
      }

      // 5 ── AgentJsDeplacementRules
      for (const deplac of agentDeplacParsed) {
        const agent = await tx.agent.findUnique({ where: { matricule: deplac.matricule } });
        if (!agent) { nbIgnores++; continue; }

        let jsTypeId: string | null = null;
        if (deplac.jsTypeCode) {
          const jsType = await tx.jsType.findUnique({ where: { code: deplac.jsTypeCode } });
          jsTypeId = jsType?.id ?? null;
        }

        const existing = await tx.agentJsDeplacementRule.findFirst({
          where: {
            agentId: agent.id,
            jsTypeId: jsTypeId,
            prefixeJs: deplac.prefixeJs,
          },
        });

        if (existing) {
          await tx.agentJsDeplacementRule.update({
            where: { id: existing.id },
            data: {
              horsLpa: deplac.horsLpa,
              tempsTrajetAllerMinutes: deplac.tempsTrajetAllerMinutes,
              tempsTrajetRetourMinutes: deplac.tempsTrajetRetourMinutes,
              actif: deplac.actif,
            },
          });
          nbMisesAJour.agentDeplacement++;
        } else {
          await tx.agentJsDeplacementRule.create({
            data: {
              agentId: agent.id,
              jsTypeId,
              prefixeJs: deplac.prefixeJs,
              horsLpa: deplac.horsLpa,
              tempsTrajetAllerMinutes: deplac.tempsTrajetAllerMinutes,
              tempsTrajetRetourMinutes: deplac.tempsTrajetRetourMinutes,
              actif: deplac.actif,
            },
          });
          nbCreations.agentDeplacement++;
        }
      }
    });
  } catch (err) {
    return {
      success: false,
      nbCreations,
      nbMisesAJour,
      nbIgnores,
      erreurs: [
        ...erreurs,
        {
          onglet: "Base de données",
          ligne: 0,
          message: `Erreur lors de l'écriture en base : ${String(err)}`,
          niveau: "erreur",
        },
      ],
      avertissements,
    };
  }

  return { success: true, nbCreations, nbMisesAJour, nbIgnores, erreurs, avertissements };
}
