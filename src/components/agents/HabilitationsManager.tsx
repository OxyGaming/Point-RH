"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface AgentHabilitations {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  uch: string | null;
  posteAffectation: string | null;
  agentReserve: boolean;
  habilitations: string[];
}

type RowState =
  | { phase: "idle" }
  | { phase: "editing"; value: string }
  | { phase: "saving" }
  | { phase: "saved" };

export default function HabilitationsManager() {
  const [agents, setAgents] = useState<AgentHabilitations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"tous" | "avec" | "sans">("tous");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Impossible de charger les agents.");
      const data: AgentHabilitations[] = await res.json();
      setAgents(data.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  function startEdit(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setRowStates((prev) => ({
      ...prev,
      [agentId]: { phase: "editing", value: agent.habilitations.join(", ") },
    }));
    // Focus the input after render
    setTimeout(() => inputRefs.current[agentId]?.focus(), 50);
  }

  function cancelEdit(agentId: string) {
    setRowStates((prev) => ({ ...prev, [agentId]: { phase: "idle" } }));
  }

  function handleInputChange(agentId: string, value: string) {
    setRowStates((prev) => ({ ...prev, [agentId]: { phase: "editing", value } }));
  }

  async function saveAgent(agentId: string) {
    const state = rowStates[agentId];
    if (state?.phase !== "editing") return;

    const newHabilitations = state.value
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const deduped = [...new Set(newHabilitations)];

    setRowStates((prev) => ({ ...prev, [agentId]: { phase: "saving" } }));

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habilitations: deduped }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Erreur lors de la sauvegarde.");
        setRowStates((prev) => ({ ...prev, [agentId]: { phase: "idle" } }));
        return;
      }

      // Mettre à jour l'agent en local
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, habilitations: deduped } : a))
      );
      setRowStates((prev) => ({ ...prev, [agentId]: { phase: "saved" } }));

      // Retour à idle après 2 secondes
      setTimeout(() => {
        setRowStates((prev) => {
          if (prev[agentId]?.phase === "saved") {
            return { ...prev, [agentId]: { phase: "idle" } };
          }
          return prev;
        });
      }, 2000);
    } catch {
      alert("Erreur réseau.");
      setRowStates((prev) => ({ ...prev, [agentId]: { phase: "idle" } }));
    }
  }

  function handleKeyDown(agentId: string, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") saveAgent(agentId);
    if (e.key === "Escape") cancelEdit(agentId);
  }

  // Filtrages
  const filtered = agents.filter((a) => {
    const matchSearch = (() => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        a.matricule.toLowerCase().includes(q) ||
        (a.uch ?? "").toLowerCase().includes(q) ||
        a.habilitations.some((h) => h.toLowerCase().includes(q))
      );
    })();
    const matchFilter =
      filter === "tous" ||
      (filter === "avec" && a.habilitations.length > 0) ||
      (filter === "sans" && a.habilitations.length === 0);
    return matchSearch && matchFilter;
  });

  const countSans = agents.filter((a) => a.habilitations.length === 0).length;
  const countAvec = agents.filter((a) => a.habilitations.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Encart d'aide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Préfixes JS autorisés</p>
        <p className="text-xs text-blue-700">
          Chaque agent possède une liste de préfixes qui détermine quelles journées de service (JS) il peut couvrir
          lors d'une simulation. Un agent sans préfixe est exclu de toutes les simulations.
        </p>
        <p className="text-xs text-blue-600">
          Ex : <span className="font-mono bg-blue-100 px-1 rounded">GIC</span> autorise toutes les JS dont le code commence par "GIC".
          Saisissez les préfixes séparés par des virgules, puis appuyez sur <kbd className="bg-blue-100 px-1 rounded text-xs">Entrée</kbd> ou cliquez sur Enregistrer.
        </p>
      </div>

      {/* Barre de filtres */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="text"
          placeholder="Rechercher par nom, matricule, UCH, préfixe…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1 text-xs">
          {(["tous", "avec", "sans"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {f === "tous" && `Tous (${agents.length})`}
              {f === "avec" && `Avec préfixes (${countAvec})`}
              {f === "sans" && (
                <span className={countSans > 0 ? "text-amber-600" : ""}>
                  Sans préfixe{countSans > 0 ? ` ⚠ ${countSans}` : ` (${countSans})`}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* États */}
      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl text-gray-400 text-sm">
          Aucun agent ne correspond.
        </div>
      )}

      {/* Tableau */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">UCH</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Préfixes JS autorisés</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((agent) => {
                const state = rowStates[agent.id] ?? { phase: "idle" };
                return (
                  <HabilitationRow
                    key={agent.id}
                    agent={agent}
                    state={state}
                    inputRef={(el) => { inputRefs.current[agent.id] = el; }}
                    onStartEdit={() => startEdit(agent.id)}
                    onCancelEdit={() => cancelEdit(agent.id)}
                    onInputChange={(v) => handleInputChange(agent.id, v)}
                    onSave={() => saveAgent(agent.id)}
                    onKeyDown={(e) => handleKeyDown(agent.id, e)}
                  />
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ligne du tableau ─────────────────────────────────────────────────────────

function HabilitationRow({
  agent,
  state,
  inputRef,
  onStartEdit,
  onCancelEdit,
  onInputChange,
  onSave,
  onKeyDown,
}: {
  agent: AgentHabilitations;
  state: RowState;
  inputRef: (el: HTMLInputElement | null) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onInputChange: (v: string) => void;
  onSave: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const isEditing = state.phase === "editing";
  const isSaving = state.phase === "saving";
  const isSaved = state.phase === "saved";

  return (
    <tr className={`transition-colors ${isEditing ? "bg-blue-50" : "hover:bg-slate-50"}`}>
      {/* Nom + matricule */}
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">
          {agent.prenom} {agent.nom}
          {agent.agentReserve && (
            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Réserve</span>
          )}
        </div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{agent.matricule}</div>
      </td>

      {/* UCH */}
      <td className="px-4 py-3 text-gray-600 text-xs hidden sm:table-cell">
        {agent.uch ?? "—"}
      </td>

      {/* Préfixes — affichage ou édition */}
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={state.value}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="GIC, BAD, PEY…"
            className="w-full text-sm border border-blue-400 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
          />
        ) : isSaved ? (
          <div className="flex items-center gap-2">
            <PrefixesBadges habilitations={agent.habilitations} />
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <span>✓</span> Enregistré
            </span>
          </div>
        ) : agent.habilitations.length === 0 ? (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 font-medium">
            ⚠ Aucun préfixe — exclu des simulations
          </span>
        ) : (
          <PrefixesBadges habilitations={agent.habilitations} />
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {isEditing ? (
            <>
              <button
                onClick={onSave}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Enregistrer
              </button>
              <button
                onClick={onCancelEdit}
                className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs rounded-lg transition-colors"
              >
                Annuler
              </button>
            </>
          ) : isSaving ? (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <SpinIcon /> Enregistrement…
            </span>
          ) : (
            <button
              onClick={onStartEdit}
              className="px-3 py-1.5 border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 text-xs font-medium rounded-lg transition-colors"
            >
              Modifier
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function PrefixesBadges({ habilitations }: { habilitations: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {habilitations.map((h) => (
        <span
          key={h}
          className="inline-block px-1.5 py-0.5 text-xs font-mono bg-blue-50 text-blue-700 border border-blue-100 rounded"
        >
          {h}
        </span>
      ))}
    </div>
  );
}

function SpinIcon() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
