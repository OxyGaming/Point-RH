"use client";

/**
 * Page d'administration : Import / Export Excel du paramétrage
 *
 * Fonctionnalités :
 *   - Export Excel (snapshot à l'instant T)
 *   - Import Excel (création + mise à jour, jamais de suppression)
 *   - Téléchargement du modèle vide
 *   - Rapport détaillé après import
 *
 * Accès : administrateurs uniquement (vérification côté API)
 */

import { useState, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ImportLineResult {
  ligne: number;
  statut: "créé" | "mis à jour" | "inchangé" | "erreur" | "avertissement";
  cle: string;
  message?: string;
}

interface ImportSheetReport {
  feuille: string;
  total: number;
  crees: number;
  misAJour: number;
  inchanges: number;
  erreurs: number;
  avertissements: number;
  lignes: ImportLineResult[];
}

interface ImportResult {
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

// ─── Couleurs par statut ───────────────────────────────────────────────────────

function statutClass(statut: ImportLineResult["statut"]): string {
  switch (statut) {
    case "créé": return "text-green-700 bg-green-50";
    case "mis à jour": return "text-blue-700 bg-blue-50";
    case "inchangé": return "text-slate-500 bg-slate-50";
    case "erreur": return "text-red-700 bg-red-50";
    case "avertissement": return "text-amber-700 bg-amber-50";
  }
}

function statutIcon(statut: ImportLineResult["statut"]): string {
  switch (statut) {
    case "créé": return "+";
    case "mis à jour": return "~";
    case "inchangé": return "=";
    case "erreur": return "✗";
    case "avertissement": return "!";
  }
}

// ─── Composant : résumé d'une feuille ─────────────────────────────────────────

function SheetSummaryBadge({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {value} {label}
    </span>
  );
}

function SheetReport({ report, defaultOpen }: { report: ImportSheetReport; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? (report.erreurs > 0 || report.avertissements > 0));

  const hasIssues = report.erreurs > 0 || report.avertissements > 0;
  const hasActivity = report.crees > 0 || report.misAJour > 0;

  return (
    <div className={`border rounded-lg overflow-hidden ${hasIssues ? "border-red-200" : hasActivity ? "border-green-200" : "border-slate-200"}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{report.feuille}</span>
          <span className="text-xs text-slate-400">{report.total} ligne{report.total !== 1 ? "s" : ""}</span>
          <div className="flex gap-1 flex-wrap">
            <SheetSummaryBadge label="créé" value={report.crees} color="text-green-700 bg-green-100" />
            <SheetSummaryBadge label="mis à jour" value={report.misAJour} color="text-blue-700 bg-blue-100" />
            <SheetSummaryBadge label="inchangé" value={report.inchanges} color="text-slate-500 bg-slate-100" />
            <SheetSummaryBadge label="erreur" value={report.erreurs} color="text-red-700 bg-red-100" />
            <SheetSummaryBadge label="avertissement" value={report.avertissements} color="text-amber-700 bg-amber-100" />
          </div>
        </div>
        <span className="text-slate-400 text-xs shrink-0 ml-2">{open ? "▲" : "▼"}</span>
      </button>

      {open && report.lignes.length > 0 && (
        <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-72 overflow-y-auto">
          {report.lignes.map((line, i) => (
            <div key={i} className={`px-4 py-2 flex items-start gap-3 text-xs ${statutClass(line.statut)}`}>
              <span className="font-mono font-bold w-4 shrink-0 text-center">{statutIcon(line.statut)}</span>
              {line.ligne > 0 && (
                <span className="text-slate-400 shrink-0 font-mono">L{line.ligne}</span>
              )}
              <span className="font-medium shrink-0">{line.cle}</span>
              {line.message && <span className="text-opacity-80">{line.message}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function ParametragePage() {
  const [exportLoading, setExportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExportLoading(true);
    try {
      const res = await fetch("/api/admin/parametrage/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Erreur lors de l'export");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = cd.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "parametrage.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erreur réseau lors de l'export");
    } finally {
      setExportLoading(false);
    }
  }

  // ── Modèle ──────────────────────────────────────────────────────────────────
  async function handleTemplate() {
    setTemplateLoading(true);
    try {
      const res = await fetch("/api/admin/parametrage/template");
      if (!res.ok) { alert("Erreur lors du téléchargement du modèle"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modele_parametrage.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erreur réseau");
    } finally {
      setTemplateLoading(false);
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setImportError("Seuls les fichiers .xlsx sont acceptés.");
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/parametrage/import", {
        method: "POST",
        body: formData,
      });
      const data: ImportResult = await res.json();
      if (!res.ok && !data.rapports) {
        setImportError((data as { error?: string }).error ?? "Erreur lors de l'import");
      } else {
        setImportResult(data);
      }
    } catch {
      setImportError("Erreur réseau lors de l'import");
    } finally {
      setImportLoading(false);
    }
  }, []);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const totalCrees = importResult?.stats.totalCrees ?? 0;
  const totalMisAJour = importResult?.stats.totalMisAJour ?? 0;
  const totalErreurs = importResult?.stats.totalErreurs ?? 0;
  const hasErrors = totalErreurs > 0 || !!importResult?.erreurGlobale;
  const hasActivity = totalCrees > 0 || totalMisAJour > 0;

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 px-4 sm:px-6">

      {/* En-tête */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Import / Export Excel — Paramétrage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Exportez les données de référence (agents, types JS, LPA) ou réimportez un fichier modifié.
          Les données de planning ne sont jamais impactées.
        </p>
      </div>

      {/* ── Section Export ──────────────────────────────────────────────────── */}
      <section className="mb-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Export</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Génère un fichier Excel contenant l&apos;état actuel des données de paramétrage :
            agents, types JS, LPA, associations et règles de déplacement.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              disabled={exportLoading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {exportLoading ? "Génération..." : "Exporter le paramétrage (.xlsx)"}
            </button>
            <button
              onClick={handleTemplate}
              disabled={templateLoading}
              className="px-4 py-2.5 text-sm text-slate-600 hover:text-blue-600 border border-slate-300 hover:border-blue-300 rounded-lg transition-colors"
            >
              {templateLoading ? "Téléchargement..." : "Télécharger le modèle vide"}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Le fichier exporté est le format de référence pour le réimport. Le modèle vide contient des exemples pour chaque onglet.
          </p>
        </div>
      </section>

      {/* ── Section Import ──────────────────────────────────────────────────── */}
      <section className="mb-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Import</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-slate-600 space-y-1">
            <p>Importez un fichier Excel au format attendu (export ou modèle rempli).</p>
            <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5 mt-1">
              <li>Crée les entrées manquantes et met à jour les existantes</li>
              <li>Ne supprime jamais les agents ni les données de planning</li>
              <li>Valide les données avant écriture et produit un rapport détaillé</li>
            </ul>
          </div>

          {/* Zone de dépôt */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-blue-400 bg-blue-50"
                : importLoading
                ? "border-slate-200 bg-slate-50 cursor-not-allowed"
                : "border-slate-300 hover:border-blue-400 hover:bg-blue-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileInput}
              className="hidden"
              disabled={importLoading}
            />
            {importLoading ? (
              <div className="space-y-2">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-500">Import en cours...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-2xl">📑</p>
                <p className="text-sm font-medium text-slate-700">Déposez un fichier .xlsx ici</p>
                <p className="text-xs text-slate-400">ou cliquez pour sélectionner</p>
              </div>
            )}
          </div>

          {/* Erreur d'import */}
          {importError && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {importError}
            </div>
          )}
        </div>
      </section>

      {/* ── Rapport d'import ────────────────────────────────────────────────── */}
      {importResult && (
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className={`px-5 py-4 border-b ${hasErrors ? "bg-red-50 border-red-200" : hasActivity ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className={`font-semibold text-sm uppercase tracking-wide ${hasErrors ? "text-red-800" : hasActivity ? "text-green-800" : "text-slate-700"}`}>
                Rapport d&apos;import
              </h2>
              <div className="flex gap-2 flex-wrap text-xs">
                {totalCrees > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded font-semibold">
                    +{totalCrees} créé{totalCrees > 1 ? "s" : ""}
                  </span>
                )}
                {totalMisAJour > 0 && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold">
                    ~{totalMisAJour} mis à jour
                  </span>
                )}
                {totalErreurs > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-semibold">
                    {totalErreurs} erreur{totalErreurs > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {new Date(importResult.stats.importedAt).toLocaleString("fr-FR")}
            </p>
          </div>

          <div className="p-4 space-y-3">
            {/* Erreur globale */}
            {importResult.erreurGlobale && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 font-medium">
                {importResult.erreurGlobale}
              </div>
            )}

            {/* Récapitulatif global */}
            {!importResult.erreurGlobale && totalCrees === 0 && totalMisAJour === 0 && totalErreurs === 0 && (
              <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                Aucune modification effectuée — toutes les données sont déjà à jour.
              </div>
            )}

            {/* Rapports par feuille */}
            {importResult.rapports.map((r, i) => (
              <SheetReport key={i} report={r} defaultOpen={r.erreurs > 0 || r.crees > 0 || r.misAJour > 0} />
            ))}

            {/* Note de sécurité */}
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              Les données de planning (journées affectées, simulations) n&apos;ont pas été modifiées.
            </div>
          </div>
        </section>
      )}

      {/* ── Note bas de page ────────────────────────────────────────────────── */}
      <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600">Format attendu</p>
        <p>Le fichier doit contenir les onglets : <code className="bg-slate-100 px-1 rounded">Agents</code>, <code className="bg-slate-100 px-1 rounded">JS_Types</code>, <code className="bg-slate-100 px-1 rounded">LPA</code>, <code className="bg-slate-100 px-1 rounded">LPA_JS_Types</code>, <code className="bg-slate-100 px-1 rounded">Agent_JS_Deplacement</code>.</p>
        <p>Les onglets absents sont ignorés sans erreur. L&apos;onglet <code className="bg-slate-100 px-1 rounded">Readme</code> est toujours ignoré.</p>
        <p>Toutes les opérations sont journalisées dans le log d&apos;audit.</p>
      </div>
    </div>
  );
}
