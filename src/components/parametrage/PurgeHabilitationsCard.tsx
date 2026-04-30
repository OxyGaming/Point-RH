"use client";

import { useEffect, useState, useCallback } from "react";

interface UchSummary {
  uch: string;
  totalAgents: number;
  agentsWithHabilitations: number;
}

interface GlobalSummary {
  totalAgents: number;
  agentsWithHabilitations: number;
}

interface SummaryResponse {
  global: GlobalSummary;
  uchs: UchSummary[];
}

interface PurgeResponse {
  success: true;
  agentsUpdated: number;
  scope: { type: "all" } | { type: "uch"; uch: string };
}

type ScopeChoice = { type: "all" } | { type: "uch"; uch: string };

type PurgeState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: PurgeResponse }
  | { phase: "error"; message: string };

export default function PurgeHabilitationsCard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scopeType, setScopeType] = useState<"all" | "uch">("all");
  const [selectedUch, setSelectedUch] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<PurgeState>({ phase: "idle" });

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/habilitations/purge");
      if (!res.ok) throw new Error("Impossible de charger les compteurs.");
      const data: SummaryResponse = await res.json();
      setSummary(data);
      // Pré-sélectionner la 1re UCH si disponible
      if (data.uchs.length > 0 && selectedUch === "") {
        setSelectedUch(data.uchs[0]!.uch);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, [selectedUch]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const currentScope: ScopeChoice = scopeType === "all" ? { type: "all" } : { type: "uch", uch: selectedUch };

  const previewCount = (() => {
    if (!summary) return null;
    if (currentScope.type === "all") return summary.global.agentsWithHabilitations;
    const u = summary.uchs.find((x) => x.uch === currentScope.uch);
    return u?.agentsWithHabilitations ?? 0;
  })();

  const canRun =
    !loading &&
    !loadError &&
    state.phase !== "running" &&
    (currentScope.type === "all" || (currentScope.type === "uch" && currentScope.uch.length > 0)) &&
    (previewCount ?? 0) > 0;

  async function handleConfirm() {
    setConfirming(false);
    setState({ phase: "running" });
    try {
      const res = await fetch("/api/admin/habilitations/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          currentScope.type === "all" ? { scope: "all" } : { scope: "uch", uch: currentScope.uch },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setState({ phase: "error", message: data?.error ?? "Échec de la purge." });
        return;
      }
      setState({ phase: "done", result: data as PurgeResponse });
      // Re-fetcher les compteurs (idempotence visible immédiatement)
      fetchSummary();
    } catch {
      setState({ phase: "error", message: "Erreur réseau lors de la purge." });
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
        <h2 className="font-semibold text-slate-800">Maintenance — Purge habilitations</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Réinitialise les préfixes JS d'habilitation des agents (vide la liste). Le paramétrage et le planning
          ne sont pas impactés. Action irréversible — la sauvegarde DB du déploiement est le seul filet de
          sécurité.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        {loading && <div className="text-sm text-slate-400">Chargement des compteurs…</div>}
        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {!loading && !loadError && summary && (
          <>
            {/* Choix du scope */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-700 mb-1">Périmètre</legend>

              <label className="flex items-start gap-3 px-3 py-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:bg-red-50 has-[:checked]:border-red-300">
                <input
                  type="radio"
                  name="scope"
                  value="all"
                  checked={scopeType === "all"}
                  onChange={() => setScopeType("all")}
                  className="mt-0.5 accent-red-600"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">Toute la base</div>
                  <div className="text-xs text-slate-500">
                    {summary.global.agentsWithHabilitations} agent
                    {summary.global.agentsWithHabilitations > 1 ? "s" : ""} avec des habilitations sur{" "}
                    {summary.global.totalAgents} actif{summary.global.totalAgents > 1 ? "s" : ""}
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 px-3 py-2.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:bg-red-50 has-[:checked]:border-red-300">
                <input
                  type="radio"
                  name="scope"
                  value="uch"
                  checked={scopeType === "uch"}
                  onChange={() => setScopeType("uch")}
                  disabled={summary.uchs.length === 0}
                  className="mt-0.5 accent-red-600"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">Une UCH spécifique</div>
                  {summary.uchs.length === 0 ? (
                    <div className="text-xs text-slate-400">Aucune UCH renseignée sur les agents actifs</div>
                  ) : (
                    <div className="mt-1.5">
                      <select
                        value={selectedUch}
                        onChange={(e) => setSelectedUch(e.target.value)}
                        disabled={scopeType !== "uch"}
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {summary.uchs.map((u) => (
                          <option key={u.uch} value={u.uch}>
                            {u.uch} — {u.agentsWithHabilitations}/{u.totalAgents} agent
                            {u.totalAgents > 1 ? "s" : ""} avec habilitations
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </label>
            </fieldset>

            {/* Récap impact + bouton */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => setConfirming(true)}
                disabled={!canRun}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {state.phase === "running" ? (
                  <>
                    <SpinIcon /> Purge en cours…
                  </>
                ) : (
                  <>
                    <TrashIcon /> Purger les habilitations
                  </>
                )}
              </button>
              {previewCount !== null && (
                <span className="text-xs text-slate-600">
                  {previewCount === 0
                    ? "Aucun agent à purger pour ce périmètre"
                    : `Impactera ${previewCount} agent${previewCount > 1 ? "s" : ""}`}
                </span>
              )}
            </div>

            {state.phase === "done" && <PurgeReport result={state.result} />}
            {state.phase === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                {state.message}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de confirmation */}
      {confirming && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">Confirmer la purge des habilitations</h3>
                <p className="text-sm text-slate-600 mt-1.5">
                  {currentScope.type === "all" ? (
                    <>
                      Vous allez vider les habilitations de{" "}
                      <strong className="text-red-700">
                        {previewCount} agent{previewCount && previewCount > 1 ? "s" : ""}
                      </strong>{" "}
                      sur la totalité de la base.
                    </>
                  ) : (
                    <>
                      Vous allez vider les habilitations de{" "}
                      <strong className="text-red-700">
                        {previewCount} agent{previewCount && previewCount > 1 ? "s" : ""}
                      </strong>{" "}
                      de l'UCH{" "}
                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                        {currentScope.uch}
                      </span>
                      .
                    </>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Cette action est <strong>irréversible</strong>. L'audit log enregistrera le scope et le
                  nombre d'agents impactés mais pas les valeurs antérieures.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Purger
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PurgeReport({ result }: { result: PurgeResponse }) {
  const nothing = result.agentsUpdated === 0;
  const scopeLabel =
    result.scope.type === "all" ? "toute la base" : `UCH ${result.scope.uch}`;
  return (
    <div
      className={`border rounded-lg px-4 py-3 text-sm ${
        nothing
          ? "bg-slate-50 border-slate-200 text-slate-700"
          : "bg-green-50 border-green-200 text-green-800"
      }`}
    >
      <p className="font-semibold">{nothing ? "Aucune habilitation à purger" : "Purge effectuée"}</p>
      <p className="text-xs mt-1">
        Périmètre : {scopeLabel}.
        {!nothing && (
          <>
            {" "}
            {result.agentsUpdated} agent{result.agentsUpdated > 1 ? "s" : ""} mis à jour.
          </>
        )}
      </p>
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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
