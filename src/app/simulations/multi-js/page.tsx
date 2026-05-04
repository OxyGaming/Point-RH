"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import JsTimelineItem from "@/components/multi-js/JsTimelineItem";
import MultiJsFilters, {
  type FiltersState,
  emptyFilters,
  applyFilters,
} from "@/components/multi-js/MultiJsFilters";
import MultiJsResultsPanel from "@/components/multi-js/MultiJsResultsPanel";
import type { JsTimeline, MultiJsSimulationResultat } from "@/types/multi-js-simulation";
import type { JsCible } from "@/types/js-simulation";
import { isJsDeNuit } from "@/lib/utils";
import { IconZap } from "@/components/icons/Icons";
import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";

interface PlanningImport {
  id: string;
  filename: string;
  importedAt: string;
  nbAgents: number;
  nbLignes: number;
  isActive: boolean;
}

function formatDateFr(dateStr: string): string {
  return formatInTimeZone(new Date(`${dateStr}T00:00:00`), "Europe/Paris", "dd MMM", { locale: fr });
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

const SS_KEY = "pointrh_multiJs_resultat";

export default function MultiJsPage() {
  // ─── Import sélectionné ───────────────────────────────────────────────────
  const [imports, setImports] = useState<PlanningImport[]>([]);
  const [importId, setImportId] = useState("");

  // ─── JS chargées depuis l'API ─────────────────────────────────────────────
  const [allJs, setAllJs] = useState<JsTimeline[]>([]);
  const [loadingJs, setLoadingJs] = useState(false);

  // ─── Filtre personnalisé utilisateur ─────────────────────────────────────
  const [userFilterIds, setUserFilterIds] = useState<Set<string>>(new Set());
  const [userFilterActive, setUserFilterActive] = useState(false);

  useEffect(() => {
    fetch("/api/user-filter")
      .then((r) => r.json())
      .then((data: { selectedIds: string[]; isActive: boolean }) => {
        setUserFilterIds(new Set(data.selectedIds));
        setUserFilterActive(data.isActive);
      })
      .catch(() => {});
  }, []);

  // ─── Filtres ──────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FiltersState>(emptyFilters());

  // ─── Sélection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Simulation ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<MultiJsSimulationResultat | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref pour détecter si c'est le premier chargement de l'import
  const prevImportId = useRef<string>("");

  // IDs présélectionnés depuis la vue planning (via sessionStorage)
  const preselectRef = useRef<string[] | null>(null);
  // Déclencher la simulation automatiquement si on vient de la vue planning
  const autoRunRef = useRef(false);

  // ─── Restaurer le résultat + pré-sélection depuis sessionStorage ─────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) setResultat(JSON.parse(raw) as MultiJsSimulationResultat);
    } catch {}
    try {
      const pre = sessionStorage.getItem("pointrh_multiJs_preselect");
      if (pre) {
        const parsed = JSON.parse(pre) as Array<{ planningLigneId: string }>;
        preselectRef.current = parsed.map((jc) => jc.planningLigneId);
        autoRunRef.current = true;
        sessionStorage.removeItem("pointrh_multiJs_preselect");
      }
    } catch {}
  }, []);

  // ─── Persister le résultat dans sessionStorage ────────────────────────────
  useEffect(() => {
    try {
      if (resultat) sessionStorage.setItem(SS_KEY, JSON.stringify(resultat));
      else sessionStorage.removeItem(SS_KEY);
    } catch {}
  }, [resultat]);

  // ─── Charger les imports disponibles ─────────────────────────────────────
  useEffect(() => {
    fetch("/api/import")
      .then((r) => r.json())
      .then((data: PlanningImport[]) => {
        setImports(data);
        if (data[0]) setImportId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // ─── Charger les JS à chaque changement d'import ─────────────────────────
  useEffect(() => {
    if (!importId) return;
    setLoadingJs(true);
    setAllJs([]);
    setSelectedIds(new Set());
    setError(null);

    // Effacer le résultat seulement si l'utilisateur change d'import (pas au 1er chargement)
    if (prevImportId.current && prevImportId.current !== importId) {
      setResultat(null);
    }
    prevImportId.current = importId;

    fetch(`/api/multi-js-simulation/js-list?importId=${importId}`)
      .then((r) => r.json())
      .then((data: JsTimeline[]) => setAllJs(data))
      .catch(() => setError("Impossible de charger les JS de ce planning."))
      .finally(() => setLoadingJs(false));
  }, [importId]);

  // ─── Appliquer la pré-sélection après chargement des JS ─────────────────
  useEffect(() => {
    if (!preselectRef.current || allJs.length === 0) return;
    const allIds = new Set(allJs.map((js) => js.planningLigneId));
    const matches = preselectRef.current.filter((id) => allIds.has(id));
    if (matches.length > 0) setSelectedIds(new Set(matches));
    preselectRef.current = null;
  }, [allJs]);

  // ─── JS filtrées ─────────────────────────────────────────────────────────
  const filteredJs = useMemo(() => {
    let list = allJs;
    if (userFilterActive && userFilterIds.size > 0) {
      list = list.filter((js) => js.agentId !== null && userFilterIds.has(js.agentId));
    }
    return applyFilters(list, filters);
  }, [allJs, filters, userFilterActive, userFilterIds]);

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

  // ─── Auto-lancer la simulation si on vient de la vue planning ────────────
  useEffect(() => {
    if (!autoRunRef.current || jsSelectionnees.length === 0) return;
    autoRunRef.current = false;
    lancerSimulation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsSelectionnees]);

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
          remplacement: true,
          deplacement: false,
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
          <div className="flex items-start justify-between gap-4 flex-wrap lg:pr-72">
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

          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:pr-80">
        {/* ─── Contenu principal ───────────────────────────────────────── */}
        <div className="space-y-4">
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

          {/* Badge filtre personnalisé actif */}
          {userFilterActive && userFilterIds.size > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-lg w-fit">
              <svg className="w-3.5 h-3.5 text-[#1e40af]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <span className="text-[11px] font-[600] text-[#1e40af]">
                Affichage personnalisé actif — {userFilterIds.size} agent{userFilterIds.size > 1 ? "s" : ""}
              </span>
            </div>
          )}

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
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide px-2">
                      {formatInTimeZone(new Date(`${date}T00:00:00`), "Europe/Paris", "EEEE dd MMMM", { locale: fr })}
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="relative pl-4">
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

      {/* ─── Panneau sélection flottant (droite) ────────────────────────────── */}
      <div className="fixed top-24 right-4 z-40 w-64 space-y-2 hidden lg:block">
        <div
          className={cn(
            "rounded-xl border p-4 shadow-lg transition-all",
            nbSelected > 0
              ? "bg-blue-600 border-blue-600 text-white shadow-blue-200"
              : "bg-white border-slate-200"
          )}
        >
          <div className="text-center mb-3">
            <p className={cn("text-4xl font-bold", nbSelected > 0 ? "text-white" : "text-slate-300")}>
              {nbSelected}
            </p>
            <p className={cn("text-sm font-medium mt-0.5", nbSelected > 0 ? "text-blue-100" : "text-slate-400")}>
              JS sélectionnée{nbSelected > 1 ? "s" : ""}
            </p>
          </div>

          {nbSelected > 0 && nbSelected <= 8 && (
            <div className="space-y-1 mb-1 max-h-48 overflow-y-auto">
              {jsSelectionnees.map((js) => (
                <div
                  key={js.planningLigneId}
                  className="flex items-center justify-between text-xs bg-blue-500/40 rounded px-2 py-1"
                >
                  <span className="font-mono font-bold truncate">{js.codeJs ?? "JS"}</span>
                  <span className="text-blue-200 shrink-0 ml-2">{formatDateFr(js.date)}</span>
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
            <p className="text-xs text-blue-200 text-center mb-1">{nbSelected} JS sélectionnées</p>
          )}
          {nbSelected === 0 && (
            <p className="text-xs text-center text-slate-400">
              Sélectionnez au moins une JS dans la timeline.
            </p>
          )}

          {/* Bouton Analyser intégré dans le panneau */}
          {nbSelected > 0 && (
            <button
              type="button"
              disabled={loading}
              onClick={lancerSimulation}
              className={cn(
                "mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all",
                loading
                  ? "bg-white/20 text-blue-100 cursor-wait"
                  : "bg-white text-blue-600 hover:bg-blue-50 active:scale-95"
              )}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-200 border-t-transparent rounded-full animate-spin" />
                  Analyse en cours…
                </>
              ) : (
                <><IconZap className="w-4 h-4" aria-hidden="true" />Analyser {nbSelected} JS</>
              )}
            </button>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <strong>Règle clé :</strong> un même agent peut être affecté à plusieurs JS
            si ses horaires cumulés restent conformes aux règles RH (amplitude, TE, repos, GPT…).
          </p>
        </div>
      </div>

      {/* ─── Barre flottante bas (mobile uniquement) ─────────────────────────── */}
      {nbSelected > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none lg:hidden">
          <div className="px-4 pb-4 flex justify-end pointer-events-none">
            <button
              type="button"
              disabled={loading}
              onClick={lancerSimulation}
              className={cn(
                "pointer-events-auto flex items-center gap-2.5 px-5 py-3 rounded-xl font-semibold text-sm shadow-2xl transition-all",
                loading
                  ? "bg-blue-400 text-white cursor-wait"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
              )}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyse en cours…
                </>
              ) : (
                <><IconZap className="w-4 h-4" aria-hidden="true" />Analyser {nbSelected} JS</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
