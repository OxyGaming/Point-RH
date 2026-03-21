/**
 * Service d'export du paramétrage en fichier Excel.
 *
 * Périmètre exporté :
 *   - Agents (hors données planning : PlanningLigne, Simulation, ResultatAgent)
 *   - JsType (référentiel journées de service)
 *   - LPA   (lieux de prise d'attachement)
 *   - LpaJsType (associations LPA ↔ JsType)
 *   - AgentJsDeplacementRule (règles de déplacement par agent)
 *
 * Format : fichier XLSX multi-onglets, premier ligne = en-têtes.
 * Les clés de rapprochement pour le réimport sont documentées dans le README.
 */

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ─── Types internes ────────────────────────────────────────────────────────────

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  stats: {
    agents: number;
    jsTypes: number;
    lpas: number;
    lpaJsTypes: number;
    deplacementRules: number;
    exportedAt: string;
  };
}

// ─── Feuille README ───────────────────────────────────────────────────────────

function buildReadmeSheet(): XLSX.WorkSheet {
  const rows = [
    ["Point RH — Export Paramétrage"],
    [],
    ["Ce fichier contient les données de référence et de paramétrage du système Point RH."],
    ["Il peut être utilisé tel quel comme fichier de réimport après modification manuelle."],
    [],
    ["ONGLETS ET CONTENU"],
    ["Onglet", "Contenu", "Clé de rapprochement (réimport)"],
    ["Agents", "Liste des agents (hors planning)", "matricule (obligatoire, unique)"],
    ["JS_Types", "Types de journées de service", "code (obligatoire, unique)"],
    ["LPA", "Lieux de prise d'attachement", "code (obligatoire, unique)"],
    ["LPA_JS_Types", "Associations LPA ↔ JS", "lpaCode + jsTypeCode (couple unique)"],
    ["Agent_JS_Deplacement", "Règles de déplacement par agent", "agentMatricule + jsTypeCode ou prefixeJs"],
    [],
    ["RÈGLES D'IMPORT"],
    ["1. La colonne 'id' est ignorée à l'import — ne pas la modifier."],
    ["2. La clé de rapprochement (matricule, code…) détermine création ou mise à jour."],
    ["3. Pour les agents : un matricule absent du fichier n'est PAS supprimé."],
    ["4. Les données de planning (journées affectées, simulations) ne sont jamais modifiées."],
    ["5. Les booléens : saisir VRAI / FAUX ou 1 / 0."],
    ["6. Les habilitations : liste JSON, ex. [\"CONDUITE\",\"MANOEUVRE\"] ou laisser vide pour []."],
    [],
    ["EXCLUSIONS EXPLICITES"],
    ["- Données de planning (PlanningLigne, PlanningImport)"],
    ["- Simulations et résultats"],
    ["- Historiques et journaux d'audit"],
    [],
    ["Généré le :", new Date().toLocaleString("fr-FR")],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 30 }, { wch: 50 }, { wch: 40 }];
  return ws;
}

// ─── Feuille Agents ───────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  uch: string;
  codeUch: string;
  codeApes: string;
  codeSymboleGrade: string;
  codeCollegeGrade: string;
  posteAffectation: string;
  agentReserve: string;
  peutFaireNuit: string;
  peutEtreDeplace: string;
  regimeB: string;
  regimeC: string;
  habilitations: string;
  lpaBaseCode: string;
  deletedAt: string;
  deletedByEmail: string;
}

async function buildAgentsSheet(): Promise<{ ws: XLSX.WorkSheet; count: number }> {
  const agents = await prisma.agent.findMany({
    include: { lpaBase: { select: { code: true } } },
    orderBy: { matricule: "asc" },
  });

  const headers: (keyof AgentRow)[] = [
    "id", "matricule", "nom", "prenom", "uch", "codeUch",
    "codeApes", "codeSymboleGrade", "codeCollegeGrade", "posteAffectation",
    "agentReserve", "peutFaireNuit", "peutEtreDeplace", "regimeB", "regimeC",
    "habilitations", "lpaBaseCode", "deletedAt", "deletedByEmail",
  ];

  const data: AgentRow[] = agents.map((a) => ({
    id: a.id,
    matricule: a.matricule,
    nom: a.nom,
    prenom: a.prenom,
    uch: a.uch ?? "",
    codeUch: a.codeUch ?? "",
    codeApes: a.codeApes ?? "",
    codeSymboleGrade: a.codeSymboleGrade ?? "",
    codeCollegeGrade: a.codeCollegeGrade != null ? String(a.codeCollegeGrade) : "",
    posteAffectation: a.posteAffectation ?? "",
    agentReserve: a.agentReserve ? "VRAI" : "FAUX",
    peutFaireNuit: a.peutFaireNuit ? "VRAI" : "FAUX",
    peutEtreDeplace: a.peutEtreDeplace ? "VRAI" : "FAUX",
    regimeB: a.regimeB ? "VRAI" : "FAUX",
    regimeC: a.regimeC ? "VRAI" : "FAUX",
    habilitations: a.habilitations,
    lpaBaseCode: a.lpaBase?.code ?? "",
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : "",
    deletedByEmail: a.deletedByEmail ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
  return { ws, count: agents.length };
}

// ─── Feuille JS_Types ──────────────────────────────────────────────────────────

interface JsTypeRow {
  id: string;
  code: string;
  libelle: string;
  heureDebutStandard: string;
  heureFinStandard: string;
  dureeStandard: string;
  estNuit: string;
  regime: string;
  actif: string;
}

async function buildJsTypesSheet(): Promise<{ ws: XLSX.WorkSheet; count: number }> {
  const jsTypes = await prisma.jsType.findMany({ orderBy: { code: "asc" } });

  const headers: (keyof JsTypeRow)[] = [
    "id", "code", "libelle", "heureDebutStandard", "heureFinStandard",
    "dureeStandard", "estNuit", "regime", "actif",
  ];

  const data: JsTypeRow[] = jsTypes.map((j) => ({
    id: j.id,
    code: j.code,
    libelle: j.libelle,
    heureDebutStandard: j.heureDebutStandard,
    heureFinStandard: j.heureFinStandard,
    dureeStandard: String(j.dureeStandard),
    estNuit: j.estNuit ? "VRAI" : "FAUX",
    regime: j.regime ?? "",
    actif: j.actif ? "VRAI" : "FAUX",
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
  return { ws, count: jsTypes.length };
}

// ─── Feuille LPA ──────────────────────────────────────────────────────────────

interface LpaRow {
  id: string;
  code: string;
  libelle: string;
  actif: string;
}

async function buildLpaSheet(): Promise<{ ws: XLSX.WorkSheet; count: number }> {
  const lpas = await prisma.lpa.findMany({ orderBy: { code: "asc" } });

  const headers: (keyof LpaRow)[] = ["id", "code", "libelle", "actif"];

  const data: LpaRow[] = lpas.map((l) => ({
    id: l.id,
    code: l.code,
    libelle: l.libelle,
    actif: l.actif ? "VRAI" : "FAUX",
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 36 }, { wch: 8 }];
  return { ws, count: lpas.length };
}

// ─── Feuille LPA_JS_Types ──────────────────────────────────────────────────────

interface LpaJsTypeRow {
  id: string;
  lpaCode: string;
  jsTypeCode: string;
}

async function buildLpaJsTypesSheet(): Promise<{ ws: XLSX.WorkSheet; count: number }> {
  const associations = await prisma.lpaJsType.findMany({
    include: {
      lpa: { select: { code: true } },
      jsType: { select: { code: true } },
    },
    orderBy: [{ lpa: { code: "asc" } }, { jsType: { code: "asc" } }],
  });

  const headers: (keyof LpaJsTypeRow)[] = ["id", "lpaCode", "jsTypeCode"];

  const data: LpaJsTypeRow[] = associations.map((a) => ({
    id: a.id,
    lpaCode: a.lpa.code,
    jsTypeCode: a.jsType.code,
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 20 }];
  return { ws, count: associations.length };
}

// ─── Feuille Agent_JS_Deplacement ─────────────────────────────────────────────

interface DeplacementRow {
  id: string;
  agentMatricule: string;
  jsTypeCode: string;
  prefixeJs: string;
  horsLpa: string;
  tempsTrajetAllerMinutes: string;
  tempsTrajetRetourMinutes: string;
  actif: string;
}

async function buildDeplacementSheet(): Promise<{ ws: XLSX.WorkSheet; count: number }> {
  const rules = await prisma.agentJsDeplacementRule.findMany({
    include: {
      agent: { select: { matricule: true } },
      jsType: { select: { code: true } },
    },
    orderBy: [{ agent: { matricule: "asc" } }],
  });

  const headers: (keyof DeplacementRow)[] = [
    "id", "agentMatricule", "jsTypeCode", "prefixeJs",
    "horsLpa", "tempsTrajetAllerMinutes", "tempsTrajetRetourMinutes", "actif",
  ];

  const data: DeplacementRow[] = rules.map((r) => ({
    id: r.id,
    agentMatricule: r.agent.matricule,
    jsTypeCode: r.jsType?.code ?? "",
    prefixeJs: r.prefixeJs ?? "",
    horsLpa: r.horsLpa === null ? "" : r.horsLpa ? "VRAI" : "FAUX",
    tempsTrajetAllerMinutes: String(r.tempsTrajetAllerMinutes),
    tempsTrajetRetourMinutes: String(r.tempsTrajetRetourMinutes),
    actif: r.actif ? "VRAI" : "FAUX",
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
  return { ws, count: rules.length };
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

export async function exportParametrage(): Promise<ExportResult> {
  const [agentsResult, jsTypesResult, lpaResult, lpaJsTypesResult, deplacementResult] =
    await Promise.all([
      buildAgentsSheet(),
      buildJsTypesSheet(),
      buildLpaSheet(),
      buildLpaJsTypesSheet(),
      buildDeplacementSheet(),
    ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildReadmeSheet(), "Readme");
  XLSX.utils.book_append_sheet(wb, agentsResult.ws, "Agents");
  XLSX.utils.book_append_sheet(wb, jsTypesResult.ws, "JS_Types");
  XLSX.utils.book_append_sheet(wb, lpaResult.ws, "LPA");
  XLSX.utils.book_append_sheet(wb, lpaJsTypesResult.ws, "LPA_JS_Types");
  XLSX.utils.book_append_sheet(wb, deplacementResult.ws, "Agent_JS_Deplacement");

  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const buffer = Buffer.from(xlsxBuffer);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `parametrage_${dateStr}.xlsx`;

  return {
    buffer,
    filename,
    stats: {
      agents: agentsResult.count,
      jsTypes: jsTypesResult.count,
      lpas: lpaResult.count,
      lpaJsTypes: lpaJsTypesResult.count,
      deplacementRules: deplacementResult.count,
      exportedAt: now.toISOString(),
    },
  };
}
