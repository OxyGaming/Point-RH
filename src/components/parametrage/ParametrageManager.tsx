"use client";

import { useRef, useState } from "react";
import type { ResultatImportParametrage, ErreurImportParametrage } from "@/services/parametrage/importParametrage";

type ImportState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "done"; result: ResultatImportParametrage; filename: string };

export default function ParametrageManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const [exportLoading, setExportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    setExportLoading(true);
    try {
      const res = await fetch("/api/parametrage/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Erreur lors de l'export.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "parametrage.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erreur réseau lors de l'export.");
    } finally {
      setExportLoading(false);
    }
  }

  // ── Modèle ──────────────────────────────────────────────────────────────────
  async function handleTemplate() {
    setTemplateLoading(true);
    try {
      const res = await fetch("/api/parametrage/template");
      if (!res.ok) {
        alert("Erreur lors de la génération du modèle.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modele_parametrage.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erreur réseau.");
    } finally {
      setTemplateLoading(false);
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImportState({ phase: "uploading" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parametrage/import", { method: "POST", body: formData });
      const result: ResultatImportParametrage = await res.json();
      setImportState({ phase: "done", result, filename: file.name });
    } catch {
      setImportState({
        phase: "done",
        filename: file.name,
        result: {
          success: false,
          nbCreations: { jsTypes: 0, lpas: 0, lpaJsTypes: 0, agents: 0, agentDeplacement: 0 },
          nbMisesAJour: { jsTypes: 0, lpas: 0, agents: 0, agentDeplacement: 0 },
          nbIgnores: 0,
          erreurs: [{ onglet: "Réseau", ligne: 0, message: "Erreur réseau lors de l'import.", niveau: "erreur" }],
          avertissements: [],
        },
      });
    }
  }

  const erreurs = importState.phase === "done" ? importState.result.erreurs : [];
  const avertissements = importState.phase === "done" ? importState.result.avertissements : [];

  return (
    <div className="space-y-6">
      {/* ── Actions principales ── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
          <h2 className="font-semibold text-slate-800">Actions</h2>
          <p className="text-xs text-slate-500 mt-0.5">Export, import et téléchargement du modèle</p>
        </div>
        <div className="px-6 py-5 flex flex-wrap gap-3">
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {exportLoading ? (
              <>
                <SpinIcon />
                Export en cours…
              </>
            ) : (
              <>
                <DownloadIcon />
                Exporter le paramétrage
              </>
            )}
          </button>

          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importState.phase === "uploading"}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {importState.phase === "uploading" ? (
              <>
                <SpinIcon />
                Import en cours…
              </>
            ) : (
              <>
                <UploadIcon />
                Importer un fichier Excel
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Modèle */}
          <button
            onClick={handleTemplate}
            disabled={templateLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            {templateLoading ? <SpinIcon /> : <FileIcon />}
            Télécharger le modèle vide
          </button>
        </div>
      </div>

      {/* ── Résultat d'import ── */}
      {importState.phase === "done" && (
        <ImportReport result={importState.result} filename={importState.filename} />
      )}

      {/* ── Info périmètre ── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-xs text-amber-800 space-y-1">
        <p className="font-semibold text-sm">Périmètre de cet import/export</p>
        <p>Inclus : Agents (paramétrage uniquement), Types JS, LPA, associations LPA/JS, règles de déplacement.</p>
        <p className="font-medium text-amber-700">Exclus : Planning agents, journées affectées, simulations, historiques. Ces données ne sont jamais impactées.</p>
      </div>
    </div>
  );
}

// ── Composant rapport d'import ─────────────────────────────────────────────────

function ImportReport({ result, filename }: { result: ResultatImportParametrage; filename: string }) {
  const totalCreations =
    result.nbCreations.agents +
    result.nbCreations.jsTypes +
    result.nbCreations.lpas +
    result.nbCreations.lpaJsTypes +
    result.nbCreations.agentDeplacement;

  const totalMaj =
    result.nbMisesAJour.agents +
    result.nbMisesAJour.jsTypes +
    result.nbMisesAJour.lpas +
    result.nbMisesAJour.agentDeplacement;

  return (
    <div className={`bg-white border rounded-xl shadow-sm ${result.success ? "border-green-200" : "border-red-200"}`}>
      <div className={`px-6 py-4 border-b rounded-t-xl ${result.success ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{result.success ? "✓" : "✗"}</span>
          <div>
            <h2 className={`font-semibold ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.success ? "Import réussi" : "Import refusé — erreurs détectées"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{filename}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Compteurs */}
        {result.success && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Créations" value={totalCreations} color="green" />
            <StatBox label="Mises à jour" value={totalMaj} color="blue" />
            <StatBox label="Ignorés" value={result.nbIgnores} color="slate" />
            <StatBox label="Avertissements" value={result.avertissements.length} color="amber" />
          </div>
        )}

        {/* Détail par entité */}
        {result.success && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-800 font-medium text-xs">
              Détail par entité
            </summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  ["Agents", result.nbCreations.agents, result.nbMisesAJour.agents],
                  ["JS_Types", result.nbCreations.jsTypes, result.nbMisesAJour.jsTypes],
                  ["LPA", result.nbCreations.lpas, result.nbMisesAJour.lpas],
                  ["LPA_JS_Types", result.nbCreations.lpaJsTypes, 0],
                  ["Agent_JS_Deplacement", result.nbCreations.agentDeplacement, result.nbMisesAJour.agentDeplacement],
                ] as [string, number, number][]
              ).map(([label, crea, maj]) => (
                <div key={label} className="flex justify-between items-center text-xs bg-slate-50 rounded px-3 py-1.5">
                  <span className="font-mono text-slate-700">{label}</span>
                  <span className="text-slate-500">
                    {crea > 0 && <span className="text-green-600 font-medium">+{crea} créé{crea > 1 ? "s" : ""}</span>}
                    {crea > 0 && maj > 0 && " · "}
                    {maj > 0 && <span className="text-blue-600 font-medium">{maj} mis à jour</span>}
                    {crea === 0 && maj === 0 && <span className="text-slate-400">aucun changement</span>}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Avertissements */}
        {avertissementsSection(result.avertissements)}

        {/* Erreurs */}
        {erreursSection(result.erreurs)}
      </div>
    </div>
  );
}

function avertissementsSection(items: ErreurImportParametrage[]) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-amber-700 mb-1">
        {items.length} avertissement{items.length > 1 ? "s" : ""}
      </p>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {items.map((w, i) => (
          <div key={i} className="text-xs bg-amber-50 border border-amber-100 rounded px-3 py-1.5 text-amber-800">
            <span className="font-mono text-amber-600">[{w.onglet} L.{w.ligne}]</span>{" "}
            {w.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function erreursSection(items: ErreurImportParametrage[]) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-red-700 mb-1">
        {items.length} erreur{items.length > 1 ? "s" : ""} bloquante{items.length > 1 ? "s" : ""}
      </p>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {items.map((e, i) => (
          <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-3 py-1.5 text-red-800">
            <span className="font-mono text-red-600">[{e.onglet} L.{e.ligne}]</span>{" "}
            {e.champ && <span className="font-medium">{e.champ} : </span>}
            {e.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: "green" | "blue" | "slate" | "amber" }) {
  const colors = {
    green: "bg-green-50 border-green-200 text-green-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  };
  return (
    <div className={`border rounded-lg px-4 py-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  );
}

// ── Icônes ─────────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
