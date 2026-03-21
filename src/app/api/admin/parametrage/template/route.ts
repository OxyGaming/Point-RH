/**
 * GET /api/admin/parametrage/template
 *
 * Génère un fichier Excel vide avec les en-têtes et des exemples.
 * Accessible à tout utilisateur authentifié pour faciliter la saisie.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/session";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const wb = XLSX.utils.book_new();

  // ── Readme ──────────────────────────────────────────────────────────────────
  const readmeRows = [
    ["Point RH — Modèle d'import paramétrage"],
    [],
    ["Ce fichier est un modèle vide. Complétez chaque onglet avec vos données."],
    ["La colonne 'id' doit rester vide (elle est ignorée à l'import)."],
    ["Les colonnes marquées * sont obligatoires."],
    [],
    ["ONGLET", "CLÉ DE RAPPROCHEMENT *", "DESCRIPTION"],
    ["Agents", "matricule", "Données administratives des agents (hors planning)"],
    ["JS_Types", "code", "Types de journées de service"],
    ["LPA", "code", "Lieux de prise d'attachement"],
    ["LPA_JS_Types", "lpaCode + jsTypeCode", "Associations entre LPA et types JS"],
    ["Agent_JS_Deplacement", "agentMatricule + (jsTypeCode ou prefixeJs)", "Règles de déplacement par agent"],
    [],
    ["BOOLÉENS : saisir VRAI ou FAUX"],
    ["HABILITATIONS : tableau JSON ex. [\"CONDUITE\",\"MANOEUVRE\"] ou laisser vide"],
    ["HEURES : format HH:MM ex. 06:00"],
  ];
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeRows);
  wsReadme["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsReadme, "Readme");

  // ── Agents ───────────────────────────────────────────────────────────────────
  const agentsData = [
    {
      id: "(laisser vide)",
      matricule: "MAT001",
      nom: "DUPONT",
      prenom: "Jean",
      uch: "UCH01",
      codeUch: "U01",
      codeApes: "AP01",
      codeSymboleGrade: "ADJ",
      codeCollegeGrade: "2",
      posteAffectation: "CONDUCTEUR",
      agentReserve: "FAUX",
      peutFaireNuit: "VRAI",
      peutEtreDeplace: "FAUX",
      regimeB: "FAUX",
      regimeC: "FAUX",
      habilitations: '["CONDUITE"]',
      lpaBaseCode: "LPA_PARIS",
      deletedAt: "",
      deletedByEmail: "",
    },
  ];
  const wsAgents = XLSX.utils.json_to_sheet(agentsData);
  wsAgents["!cols"] = Object.keys(agentsData[0]).map((k) => ({ wch: Math.max(k.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, wsAgents, "Agents");

  // ── JS_Types ─────────────────────────────────────────────────────────────────
  const jsTypesData = [
    {
      id: "(laisser vide)",
      code: "GIV",
      libelle: "Grande Vitesse",
      heureDebutStandard: "06:00",
      heureFinStandard: "14:00",
      dureeStandard: "480",
      estNuit: "FAUX",
      regime: "",
      actif: "VRAI",
    },
  ];
  const wsJsTypes = XLSX.utils.json_to_sheet(jsTypesData);
  wsJsTypes["!cols"] = Object.keys(jsTypesData[0]).map((k) => ({ wch: Math.max(k.length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, wsJsTypes, "JS_Types");

  // ── LPA ───────────────────────────────────────────────────────────────────────
  const lpaData = [
    { id: "(laisser vide)", code: "LPA_PARIS", libelle: "LPA Paris Gare de Lyon", actif: "VRAI" },
  ];
  const wsLpa = XLSX.utils.json_to_sheet(lpaData);
  wsLpa["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 36 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsLpa, "LPA");

  // ── LPA_JS_Types ─────────────────────────────────────────────────────────────
  const lpaJsData = [
    { id: "(laisser vide)", lpaCode: "LPA_PARIS", jsTypeCode: "GIV" },
  ];
  const wsLpaJs = XLSX.utils.json_to_sheet(lpaJsData);
  wsLpaJs["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsLpaJs, "LPA_JS_Types");

  // ── Agent_JS_Deplacement ─────────────────────────────────────────────────────
  const deplData = [
    {
      id: "(laisser vide)",
      agentMatricule: "MAT001",
      jsTypeCode: "GIV",
      prefixeJs: "",
      horsLpa: "VRAI",
      tempsTrajetAllerMinutes: "30",
      tempsTrajetRetourMinutes: "30",
      actif: "VRAI",
    },
  ];
  const wsDepl = XLSX.utils.json_to_sheet(deplData);
  wsDepl["!cols"] = Object.keys(deplData[0]).map((k) => ({ wch: Math.max(k.length + 4, 16) }));
  XLSX.utils.book_append_sheet(wb, wsDepl, "Agent_JS_Deplacement");

  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const buffer = Buffer.from(xlsxBuffer);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele_parametrage.xlsx"',
      "Content-Length": String(buffer.length),
    },
  });
}
