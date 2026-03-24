"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import JsTimelineItem from "@/components/multi-js/JsTimelineItem";
import MultiJsFilters, {
  type FiltersState,
  emptyFilters,
  applyFilters,
} from "@/components/multi-js/MultiJsFilters";
import ScenarioModeSelector from "@/components/multi-js/ScenarioModeSelector";
import MultiJsResultsPanel from "@/components/multi-js/MultiJsResultsPanel";
import type { JsTimeline, CandidateScope, MultiJsSimulationResultat } from "@/types/multi-js-simulation";
import type { JsCible } from "@/types/js-simulation";
import { isJsDeNuit } from "@/lib/utils";

interface PlanningImport {
  id: string;
  filename: string;
  importedAt: string;
  nbAgents: number;
  nbLignes: number;
  isActive: boolean;
}

function formatDateFr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

// Groupe les JS par date pour la timeline
function groupByDate(jsList: JsTimeline[]): [string, JsTimeline[]][] {
  const map = new Map<string, JsTimeline[]>();
  for (const js of jsList) {
    const existing = map.get(js.date) ?? [];
    existing.push(js);
    map.set(js.date, existing);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default function MultiJsPage() {
  // ─── Import sélectionné ───────────────────────────────────────────────────
  const [imports, setImports] = useState<PlanningImport[]>([]);
  const [importId, setImportId] = useState("");

  // ─── JS chargées depuis l'API ─────────────────────────────────────────────
  const [allJs, setAllJs] = useState<JsTimeline[]>([]);
  const [loadingJs, setLoadingJs] = useState(false);

  // ─── Filtres ──────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FiltersState>(emptyFilters());

  // ─── Sélection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Mode simulation ──────────────────────────────────────────────────────
  const [candidateScope, setCandidateScope] = useState<CandidateScope>("reserve_only");

  // ─── Simulation ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<MultiJsSimulationResultat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoriserFigeage, setAutoriserFigeage] = useState(false);

  // ─── Charger les imports disponibles ─────────────────────────────────────
  useEffect(() => {
    fetch("/api/import")
      .then((r) => r.json())
      .then((data: PlanningImport[]) => {
        setImports(data);
        const active = data.find((d) => d.isActive) ?? data[0];
        if (active) setImportId(active.id);
      })
      .catch(() => {});
  }, []);

  // ─── Charger les JS à chaque changement d'import ─────────────────────────
  useEffect(() => {
    if (!importId) return;
    setLoadingJs(true);
    setAllJs([]);
    setSelectedIds(new Set());
    setResultat(null);
    setError(null);

    fetch(`/api/multi-js-simulation/js-list?importId=${importId}`)
      .then((r) => r.json())
      .then((data: JsTimeline[]) => setAllJs(data))
      .catch(() => setError("Impossible de charger les JS de ce planning."))
      .finally(() => setLoadingJs(false));
  }, [importId]);

  // ─── JS filtrées ─────────────────────────────────────────────────────────
  const filteredJs = useMemo(() => applyFilters(allJs, filters), [allJs, filters]);

  // ─── Gestion sélection ────────────────────────────────────────────────────
  function toggleJs(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredJs.forEach((js) => next.add(js.planningLigneId));
      return next;
    });
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  // ─── JS sélectionnées (enrichies en JsCible) ──────────────────────────────
  const jsSelectionnees: JsCible[] = useMemo(() => {
    return allJs
      .filter((js) => selectedIds.has(js.planningLigneId))
      .map((js) => ({
        planningLigneId: js.planningLigneId,
        agentId: js.agentId ?? "",
        agentNom: js.agentNom,
        agentPrenom: js.agentPrenom,
        agentMatricule: js.agentMatricule,
        date: js.date,
        heureDebut: js.heureDebut,
        heureFin: js.heureFin,
        heureDebutJsType: js.heureDebutJsType,
        heureFinJsType: js.heureFinJsType,
        amplitudeMin: js.amplitudeMin,
        codeJs: js.codeJs,
        typeJs: js.typeJs,
        isNuit: js.isNuit,
        importId,
        // Propagé depuis JsTimeline.flexibilite (résolu par js-list depuis JsType)
        flexibilite: js.flexibilite ?? "OBLIGATOIRE",
      }));
  }, [allJs, selectedIds, importId]);

  // ─── Lancer la simulation ─────────────────────────────────────────────────
  async function lancerSimulation() {
    if (jsSelectionnees.length === 0) return;
    setLoading(true);
    setError(null);
    setResultat(null);

    try {
      const res = await fetch("/api/multi-js-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importId,
          jsSelectionnees,
          candidateScope,
          remplacement: true,
          deplacement: false,
          autoriserFigeage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la simulation");
      } else {
        setResultat(data as MultiJsSimulationResultat);
        // Scroll vers les résultats
        setTimeout(() => {
          document.getElementById("resultats-section")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    } catch {
      setError("Erreur réseau, veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(() => groupByDate(filteredJs), [filteredJs]);
  const nbSelected = selectedIds.size;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── En-tête ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Simulation
                </span>
                <span className="text-slate-300">›</span>
                <span className="text-xs font-semibold text-blue-600">
                  Multi-JS
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                Simulation multi-JS
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Sélectionnez plusieurs journées de service pour simuler une couverture globale —
                grève, absences multiples, perturbation majeure.
              </p>
            </div>

            {/* Sélecteur d'import */}
            <div className="shrink-0">
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Planning source
              </label>
              <select
                value={importId}
                onChange={(e) => setImportId(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[200px]"
              >
                {imports.map((imp) => (
                  <option key={imp.id} value={imp.id}>
                    {imp.filename} ({imp.nbAgents} agents)
                    {imp.isActive ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ Colonne gauche : timeline + filtres ══════════════════════ */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filtres */}
            <MultiJsFilters
              filters={filters}
              onChange={setFilters}
              allJs={allJs}
              nbVisible={filteredJs.length}
              nbTotal={allJs.length}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              nbSelected={nbSelected}
            />

            {/* Timeline */}
            {loadingJs ? (
              <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Chargement des journées de service…</span>
                </div>
              </div>
            ) : filteredJs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200 text-center">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm font-medium text-slate-600">Aucune JS trouvée</p>
                <p className="text-xs text-slate-400 mt-1">
                  {allJs.length > 0
                    ? "Essayez de modifier les filtres"
                    : "Sélectionnez un planning contenant des JS"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([date, jsList]) => (
                  <div key={date}>
                    {/* En-tête de groupe par date */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide px-2">
                        {new Date(date).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                        })}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>

                    {/* Fil d'Ariane vertical */}
                    <div className="relative pl-4">
                      {/* Ligne verticale */}
                      <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-200" />

                      <div className="space-y-1.5">
                        {jsList.map((js) => (
                          <JsTimelineItem
                            key={js.planningLigneId}
                            js={js}
                            selected={selectedIds.has(js.planningLigneId)}
                            onToggle={toggleJs}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ═══ Colonne droite : panneau de contrôle ═════════════════════ */}
          <div className="space-y-4">
            {/* Compteur + bouton sticky */}
            <div className="sticky top-4 space-y-4">
              {/* Sélection */}
              <div
                className={cn(
                  "rounded-xl border p-4 transition-all",
                  nbSelected > 0
                    ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                    : "bg-white border-slate-200"
                )}
              >
                <div className="text-center mb-3">
                  <p
                    className={cn(
                      "text-4xl font-bold",
                      nbSelected > 0 ? "text-white" : "text-slate-300"
                    )}
                  >
                    {nbSelected}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-medium mt-0.5",
                      nbSelected > 0 ? "text-blue-100" : "text-slate-400"
                    )}
                  >
                    JS sélectionnée{nbSelected > 1 ? "s" : ""}
                  </p>
                </div>

                {/* Liste des JS sélectionnées (résumé) */}
                {nbSelected > 0 && nbSelected <= 8 && (
                  <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                    {jsSelectionnees.map((js) => (
                      <div
                        key={js.planningLigneId}
                        className="flex items-center justify-between text-xs bg-blue-500/40 rounded px-2 py-1"
                      >
                        <span className="font-mono font-bold truncate">
                          {js.codeJs ?? "JS"}
                        </span>
                        <span className="text-blue-200 shrink-0 ml-2">
                          {formatDateFr(js.date)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleJs(js.planningLigneId)}
                          className="ml-2 text-blue-200 hover:text-white shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {nbSelected > 8 && (
                  <p className="text-xs text-blue-200 text-center mb-3">
                    {nbSelected} JS sélectionnées
                  </p>
                )}
              </div>

              {/* Mode simulation */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <ScenarioModeSelector
                  value={candidateScope}
                  onChange={setCandidateScope}
                />
              </div>

              {/* Figeage DERNIER_RECOURS */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoriserFigeage}
                    onChange={(e) => setAutoriserFigeage(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Autoriser le figeage
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Libère les agents dont la JS conflictuelle est marquée{" "}
                      <span className="font-mono text-amber-600">DERNIER_RECOURS</span>.
                    </p>
                  </div>
                </label>
              </div>

              {/* Bouton analyser */}
              <button
                type="button"
                disabled={nbSelected === 0 || loading}
                onClick={lancerSimulation}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-semibold text-sm transition-all",
                  nbSelected === 0
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : loading
                    ? "bg-blue-400 text-white cursor-wait"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 hover:shadow-xl active:scale-95"
                )}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyse en cours…
                  </>
                ) : (
                  <>
                    ⚡ Analyser {nbSelected > 0 ? `${nbSelected} JS` : "la sélection"}
                  </>
                )}
              </button>

              {nbSelected === 0 && (
                <p className="text-xs text-center text-slate-400">
                  Sélectionnez au moins une JS dans la timeline pour lancer l&apos;analyse.
                </p>
              )}

              {/* Info mode */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  <strong>Règle clé :</strong> un même agent peut être affecté à plusieurs JS
                  si ses horaires cumulés restent conformes aux règles RH (amplitude, TE, repos, GPT…).
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Zone résultats ────────────────────────────────────────────── */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <span className="text-red-500">⚠</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {resultat && (
          <div id="resultats-section" className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-slate-800">
                Résultats de la simulation
              </h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                {resultat.nbJsSelectionnees} JS analysées · {resultat.nbAgentsAnalyses} agents
              </span>
            </div>
            <MultiJsResultsPanel resultat={resultat} />
          </div>
        )}
      </div>
    </div>
  );
}
