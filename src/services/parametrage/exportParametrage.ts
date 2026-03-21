/**
 * Service d'export Excel — données de paramétrage.
 * Génère un fichier .xlsx multi-onglets contenant :
 *   - Agents (hors planning, hors agents supprimés)
 *   - JS_Types
 *   - LPA
 *   - LPA_JS_Types (table de liaison)
 *   - Agent_JS_Deplacement
 *   - Readme (instructions de réimport)
 *
 * IMPORTANT : ne contient JAMAIS de données de planning (PlanningImport / PlanningLigne).
 */
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

function bool(v: boolean): string {
  return v ? "OUI" : "NON";
}

function boolOrEmpty(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return v ? "OUI" : "NON";
}

export async function genererExportParametrage(): Promise<Buffer> {
  const [agents, jsTypes, lpas, lpaJsTypes, agentDeplacement] = await Promise.all([
    prisma.agent.findMany({
      where: { deletedAt: null },
      include: { lpaBase: { select: { code: true } } },
      orderBy: { matricule: "asc" },
    }),
    prisma.jsType.findMany({ orderBy: { code: "asc" } }),
    prisma.lpa.findMany({ orderBy: { code: "asc" } }),
    prisma.lpaJsType.findMany({
      include: {
        lpa: { select: { code: true } },
        jsType: { select: { code: true } },
      },
      orderBy: [{ lpaId: "asc" }],
    }),
    prisma.agentJsDeplacementRule.findMany({
      include: {
        agent: { select: { matricule: true } },
        jsType: { select: { code: true } },
      },
      orderBy: { agentId: "asc" },
    }),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Onglet Readme ──────────────────────────────────────────────────────────
  const readmeData = [
    ["Point RH — Export Paramétrage"],
    [`Généré le : ${new Date().toLocaleString("fr-FR")}`],
    [""],
    ["═══════════════════════════════════════════════════════"],
    ["INSTRUCTIONS DE RÉIMPORT"],
    ["═══════════════════════════════════════════════════════"],
    [""],
    ["Ce fichier peut être réimporté via le bouton « Import Paramétrage »"],
    ["accessible depuis Administration > Import/Export Paramétrage."],
    [""],
    ["ONGLETS ET CLÉS DE RAPPROCHEMENT"],
    ["─────────────────────────────────"],
    ["Onglet", "Clé de rapprochement", "Description"],
    ["Agents", "matricule", "Référentiel des agents (hors planning)"],
    ["JS_Types", "code", "Types de journées de service"],
    ["LPA", "code", "Lieux de Prise d'Attachement"],
    ["LPA_JS_Types", "lpaCode + jsTypeCode", "Associations LPA ↔ Type JS"],
    ["Agent_JS_Deplacement", "matricule + jsTypeCode (ou prefixeJs)", "Règles de déplacement par agent"],
    [""],
    ["RÈGLES IMPORTANTES"],
    ["─────────────────────────────────"],
    ["• Les colonnes 'id' sont utilisées pour la mise à jour — ne pas les modifier."],
    ["• Les valeurs booléennes sont OUI ou NON."],
    ["• Les heures sont au format HH:MM (ex : 06:00, 14:30)."],
    ["• La colonne 'lpaCode' de l'onglet Agents référence le code de l'onglet LPA."],
    ["• La colonne 'jsTypeCode' de l'onglet Agent_JS_Deplacement référence le code de l'onglet JS_Types."],
    ["• Pour Agent_JS_Deplacement : renseignez jsTypeCode OU prefixeJs, pas les deux."],
    ["• La colonne 'horsLpa' peut être vide (pas d'override), OUI ou NON."],
    [""],
    ["AVERTISSEMENTS"],
    ["─────────────────────────────────"],
    ["• Ne PAS modifier les en-têtes de colonnes."],
    ["• Ne PAS importer ce fichier via l'import planning — formats différents."],
    ["• Ce fichier NE CONTIENT PAS de données de planning."],
    ["• Les agents supprimés (soft delete) ne sont PAS exportés."],
    ["• La réimportation ne supprime jamais un agent ou une LPA existante."],
  ];
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeData);
  wsReadme["!cols"] = [{ wch: 40 }, { wch: 35 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsReadme, "Readme");

  // ── Onglet Agents ──────────────────────────────────────────────────────────
  const agentsRows = agents.map((a) => ({
    id: a.id,
    matricule: a.matricule,
    nom: a.nom,
    prenom: a.prenom,
    uch: a.uch ?? "",
    codeUch: a.codeUch ?? "",
    codeApes: a.codeApes ?? "",
    codeSymboleGrade: a.codeSymboleGrade ?? "",
    codeCollegeGrade: a.codeCollegeGrade ?? "",
    posteAffectation: a.posteAffectation ?? "",
    agentReserve: bool(a.agentReserve),
    peutFaireNuit: bool(a.peutFaireNuit),
    peutEtreDeplace: bool(a.peutEtreDeplace),
    regimeB: bool(a.regimeB),
    regimeC: bool(a.regimeC),
    habilitations: a.habilitations,
    lpaCode: a.lpaBase?.code ?? "",
    actif: "OUI",
  }));
  const wsAgents = XLSX.utils.json_to_sheet(
    agentsRows.length > 0
      ? agentsRows
      : [{ id: "", matricule: "", nom: "", prenom: "", uch: "", codeUch: "", codeApes: "", codeSymboleGrade: "", codeCollegeGrade: "", posteAffectation: "", agentReserve: "", peutFaireNuit: "", peutEtreDeplace: "", regimeB: "", regimeC: "", habilitations: "[]", lpaCode: "", actif: "" }]
  );
  wsAgents["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
    { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 13 },
    { wch: 15 }, { wch: 9 }, { wch: 9 }, { wch: 30 }, { wch: 10 }, { wch: 6 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAgents, "Agents");

  // ── Onglet JS_Types ────────────────────────────────────────────────────────
  const jsTypesRows = jsTypes.map((j) => ({
    id: j.id,
    code: j.code,
    libelle: j.libelle,
    heureDebutStandard: j.heureDebutStandard,
    heureFinStandard: j.heureFinStandard,
    dureeStandard: j.dureeStandard,
    estNuit: bool(j.estNuit),
    regime: j.regime ?? "",
    actif: bool(j.actif),
  }));
  const wsJsTypes = XLSX.utils.json_to_sheet(
    jsTypesRows.length > 0
      ? jsTypesRows
      : [{ id: "", code: "", libelle: "", heureDebutStandard: "", heureFinStandard: "", dureeStandard: 0, estNuit: "", regime: "", actif: "" }]
  );
  wsJsTypes["!cols"] = [
    { wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 6 },
  ];
  XLSX.utils.book_append_sheet(wb, wsJsTypes, "JS_Types");

  // ── Onglet LPA ─────────────────────────────────────────────────────────────
  const lpaRows = lpas.map((l) => ({
    id: l.id,
    code: l.code,
    libelle: l.libelle,
    actif: bool(l.actif),
  }));
  const wsLpa = XLSX.utils.json_to_sheet(
    lpaRows.length > 0
      ? lpaRows
      : [{ id: "", code: "", libelle: "", actif: "" }]
  );
  wsLpa["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 6 }];
  XLSX.utils.book_append_sheet(wb, wsLpa, "LPA");

  // ── Onglet LPA_JS_Types ────────────────────────────────────────────────────
  const lpaJsRows = lpaJsTypes.map((ljt) => ({
    lpaCode: ljt.lpa.code,
    jsTypeCode: ljt.jsType.code,
  }));
  const wsLpaJs = XLSX.utils.json_to_sheet(
    lpaJsRows.length > 0 ? lpaJsRows : [{ lpaCode: "", jsTypeCode: "" }]
  );
  wsLpaJs["!cols"] = [{ wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsLpaJs, "LPA_JS_Types");

  // ── Onglet Agent_JS_Deplacement ────────────────────────────────────────────
  const deplacRows = agentDeplacement.map((r) => ({
    id: r.id,
    matricule: r.agent.matricule,
    jsTypeCode: r.jsType?.code ?? "",
    prefixeJs: r.prefixeJs ?? "",
    horsLpa: boolOrEmpty(r.horsLpa),
    tempsTrajetAllerMinutes: r.tempsTrajetAllerMinutes,
    tempsTrajetRetourMinutes: r.tempsTrajetRetourMinutes,
    actif: bool(r.actif),
  }));
  const wsDeplac = XLSX.utils.json_to_sheet(
    deplacRows.length > 0
      ? deplacRows
      : [{ id: "", matricule: "", jsTypeCode: "", prefixeJs: "", horsLpa: "", tempsTrajetAllerMinutes: 0, tempsTrajetRetourMinutes: 0, actif: "" }]
  );
  wsDeplac["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 24 }, { wch: 25 }, { wch: 6 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDeplac, "Agent_JS_Deplacement");

  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(excelBuffer);
}

/**
 * Génère un fichier modèle vide (en-têtes uniquement + 1 ligne exemple).
 * Utilisé pour le bouton "Télécharger le modèle".
 */
export function genererModeleParametrage(): Buffer {
  const wb = XLSX.utils.book_new();

  const sheetDefs = [
    {
      name: "Agents",
      headers: ["id", "matricule", "nom", "prenom", "uch", "codeUch", "codeApes", "codeSymboleGrade", "codeCollegeGrade", "posteAffectation", "agentReserve", "peutFaireNuit", "peutEtreDeplace", "regimeB", "regimeC", "habilitations", "lpaCode", "actif"],
      exemple: { id: "(laisser vide pour création)", matricule: "12345", nom: "DUPONT", prenom: "Jean", uch: "UCH1", codeUch: "U01", codeApes: "APE1", codeSymboleGrade: "G1", codeCollegeGrade: "1", posteAffectation: "POSTE1", agentReserve: "NON", peutFaireNuit: "OUI", peutEtreDeplace: "NON", regimeB: "NON", regimeC: "NON", habilitations: "[]", lpaCode: "LPA1", actif: "OUI" },
    },
    {
      name: "JS_Types",
      headers: ["id", "code", "libelle", "heureDebutStandard", "heureFinStandard", "dureeStandard", "estNuit", "regime", "actif"],
      exemple: { id: "(laisser vide pour création)", code: "GIV", libelle: "Journée standard", heureDebutStandard: "06:00", heureFinStandard: "14:00", dureeStandard: "480", estNuit: "NON", regime: "", actif: "OUI" },
    },
    {
      name: "LPA",
      headers: ["id", "code", "libelle", "actif"],
      exemple: { id: "(laisser vide pour création)", code: "LPA1", libelle: "Lieu de prise 1", actif: "OUI" },
    },
    {
      name: "LPA_JS_Types",
      headers: ["lpaCode", "jsTypeCode"],
      exemple: { lpaCode: "LPA1", jsTypeCode: "GIV" },
    },
    {
      name: "Agent_JS_Deplacement",
      headers: ["id", "matricule", "jsTypeCode", "prefixeJs", "horsLpa", "tempsTrajetAllerMinutes", "tempsTrajetRetourMinutes", "actif"],
      exemple: { id: "(laisser vide pour création)", matricule: "12345", jsTypeCode: "GIV", prefixeJs: "", horsLpa: "", tempsTrajetAllerMinutes: "15", tempsTrajetRetourMinutes: "15", actif: "OUI" },
    },
  ];

  for (const def of sheetDefs) {
    const ws = XLSX.utils.json_to_sheet([def.exemple], { header: def.headers });
    XLSX.utils.book_append_sheet(wb, ws, def.name);
  }

  const readmeData = [
    ["Point RH — Modèle d'import Paramétrage"],
    [""],
    ["Complétez chaque onglet selon les règles décrites ci-dessous."],
    ["Pour créer une nouvelle entrée : laissez la colonne 'id' vide."],
    ["Pour mettre à jour une entrée existante : copiez son 'id' depuis un export."],
    [""],
    ["OUI/NON : utilisez ces valeurs pour les colonnes booléennes."],
    ["Heures : format HH:MM (ex : 06:00, 14:30)."],
    ["lpaCode dans Agents : doit correspondre au code de l'onglet LPA."],
    ["jsTypeCode dans Agent_JS_Deplacement : doit correspondre au code de l'onglet JS_Types."],
  ];
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeData);
  XLSX.utils.book_append_sheet(wb, wsReadme, "Readme");

  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(excelBuffer);
}
