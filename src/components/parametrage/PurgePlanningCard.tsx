"use client";

import { useState } from "react";

interface PurgeResult {
  success: true;
  cutoff: string;
  lignesDeleted: number;
  importsDeleted: number;
}

type PurgeState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: PurgeResult }
  | { phase: "error"; message: string };

export default function PurgePlanningCard() {
  const [state, setState] = useState<PurgeState>({ phase: "idle" });

  async function handlePurge() {
    const ok = window.confirm(
      "Cette action supprime définitivement les lignes de planning dont la date de fin est antérieure à aujourd'hui - 6 mois, ainsi que les imports devenus orphelins.\n\nLes agents et le paramétrage ne sont pas impactés.\n\nConfirmer la purge ?"
    );
    if (!ok) return;

    setState({ phase: "running" });
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setState({
          phase: "error",
          message: data?.error ?? "Échec de la purge.",
        });
        return;
      }
      setState({ phase: "done", result: data as PurgeResult });
    } catch {
      setState({ phase: "error", message: "Erreur réseau lors de la purge." });
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <h2 className="font-semibold text-slate-800">Maintenance — Purge planning</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Supprime les lignes de planning terminées depuis plus de 6 mois et les imports devenus orphelins.
          Les agents et le paramétrage sont préservés. Opération idempotente.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        <button
          onClick={handlePurge}
          disabled={state.phase === "running"}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {state.phase === "running" ? (
            <>
              <SpinIcon />
              Purge en cours…
            </>
          ) : (
            <>
              <TrashIcon />
              Lancer la purge
            </>
          )}
        </button>

        {state.phase === "done" && <PurgeReport result={state.result} />}
        {state.phase === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            {state.message}
          </div>
        )}
      </div>
    </div>
  );
}

function PurgeReport({ result }: { result: PurgeResult }) {
  const cutoffDate = new Date(result.cutoff).toLocaleDateString("fr-FR");
  const nothing = result.lignesDeleted === 0 && result.importsDeleted === 0;

  return (
    <div
      className={`border rounded-lg px-4 py-3 text-sm ${
        nothing
          ? "bg-slate-50 border-slate-200 text-slate-700"
          : "bg-green-50 border-green-200 text-green-800"
      }`}
    >
      <p className="font-semibold">{nothing ? "Aucune donnée à purger" : "Purge effectuée"}</p>
      <p className="text-xs mt-1">Seuil appliqué : antérieur au {cutoffDate}.</p>
      {!nothing && (
        <ul className="text-xs mt-1 list-disc list-inside">
          <li>
            {result.lignesDeleted} ligne{result.lignesDeleted > 1 ? "s" : ""} supprimée
            {result.lignesDeleted > 1 ? "s" : ""}
          </li>
          <li>
            {result.importsDeleted} import{result.importsDeleted > 1 ? "s" : ""} orphelin
            {result.importsDeleted > 1 ? "s" : ""} supprimé{result.importsDeleted > 1 ? "s" : ""}
          </li>
        </ul>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
      />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
