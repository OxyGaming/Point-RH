"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface AgentSupprime {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  uch: string | null;
  posteAffectation: string | null;
  codeSymboleGrade: string | null;
  habilitations: string[];
  deletedAt: string;
  deletedByEmail: string | null;
}

type RestoreState =
  | { phase: "idle" }
  | { phase: "confirm"; agentId: string; agentLabel: string }
  | { phase: "loading"; agentId: string }
  | { phase: "done"; agentId: string; nom: string };

export default function AgentsSupprimes() {
  const [agents, setAgents] = useState<AgentSupprime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState>({ phase: "idle" });
  const [search, setSearch] = useState("");

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/deleted");
      if (!res.ok) throw new Error("Impossible de charger les agents supprimés.");
      const data: AgentSupprime[] = await res.json();
      setAgents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDeleted(); }, [fetchDeleted]);

  async function handleRestore(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setRestoreState({ phase: "loading", agentId });
    try {
      const res = await fetch(`/api/agents/${agentId}/restore`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Erreur lors de la réintégration.");
        setRestoreState({ phase: "idle" });
        return;
      }
      setRestoreState({ phase: "done", agentId, nom: `${agent.prenom} ${agent.nom}` });
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    } catch {
      alert("Erreur réseau.");
      setRestoreState({ phase: "idle" });
    }
  }

  const filtered = agents.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.nom.toLowerCase().includes(q) ||
      a.prenom.toLowerCase().includes(q) ||
      a.matricule.toLowerCase().includes(q) ||
      (a.uch ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Bandeau succès de réintégration */}
      {restoreState.phase === "done" && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-sm text-green-800">
          <span className="text-green-500 text-lg">✓</span>
          <div>
            <span className="font-semibold">{restoreState.nom}</span> a été réintégré avec succès.{" "}
            <Link href={`/agents/${restoreState.agentId}`} className="underline hover:text-green-900">
              Voir la fiche agent →
            </Link>
          </div>
          <button
            onClick={() => setRestoreState({ phase: "idle" })}
            className="ml-auto text-green-600 hover:text-green-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal de confirmation */}
      {restoreState.phase === "confirm" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Confirmer la réintégration</h3>
            <p className="text-sm text-gray-600">
              L'agent <span className="font-semibold">{restoreState.agentLabel}</span> sera réactivé et
              réapparaîtra dans les listes et les simulations.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => handleRestore(restoreState.agentId)}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Réintégrer
              </button>
              <button
                onClick={() => setRestoreState({ phase: "idle" })}
                className="flex-1 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zone de recherche + compteur */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="text"
          placeholder="Rechercher par nom, prénom, matricule, UCH…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {!loading && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""} supprimé{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* États */}
      {loading && (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-400 text-sm">Aucun agent supprimé.</p>
          <p className="text-gray-300 text-xs mt-1">Les suppressions logiques apparaîtront ici.</p>
        </div>
      )}

      {!loading && !error && agents.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm bg-white border border-gray-200 rounded-xl">
          Aucun agent ne correspond à votre recherche.
        </div>
      )}

      {/* Tableau */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">UCH / Poste</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Préfixes JS</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Supprimé le</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  isRestoring={restoreState.phase === "loading" && restoreState.agentId === agent.id}
                  onRestore={() =>
                    setRestoreState({
                      phase: "confirm",
                      agentId: agent.id,
                      agentLabel: `${agent.prenom} ${agent.nom} (${agent.matricule})`,
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AgentRow({
  agent,
  isRestoring,
  onRestore,
}: {
  agent: AgentSupprime;
  isRestoring: boolean;
  onRestore: () => void;
}) {
  const deletedDate = new Date(agent.deletedAt).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      {/* Nom + matricule + grade */}
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">
          {agent.prenom} {agent.nom}
        </div>
        <div className="text-xs text-gray-400 mt-0.5 font-mono">
          {agent.matricule}
          {agent.codeSymboleGrade && <span className="ml-2 text-gray-300">· {agent.codeSymboleGrade}</span>}
        </div>
        {agent.deletedByEmail && (
          <div className="text-xs text-red-400 mt-0.5">par {agent.deletedByEmail}</div>
        )}
      </td>

      {/* UCH / Poste */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <div className="text-gray-700">{agent.uch ?? "—"}</div>
        {agent.posteAffectation && (
          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{agent.posteAffectation}</div>
        )}
      </td>

      {/* Préfixes JS */}
      <td className="px-4 py-3 hidden md:table-cell">
        {agent.habilitations.length === 0 ? (
          <span className="text-xs text-gray-300 italic">Aucun</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {agent.habilitations.slice(0, 4).map((h) => (
              <span
                key={h}
                className="inline-block px-1.5 py-0.5 text-xs font-mono bg-blue-50 text-blue-700 border border-blue-100 rounded"
              >
                {h}
              </span>
            ))}
            {agent.habilitations.length > 4 && (
              <span className="text-xs text-gray-400">+{agent.habilitations.length - 4}</span>
            )}
          </div>
        )}
      </td>

      {/* Date suppression */}
      <td className="px-4 py-3 text-gray-600 text-xs">
        <span className="bg-red-50 text-red-600 border border-red-100 rounded px-2 py-0.5 font-medium">
          {deletedDate}
        </span>
      </td>

      {/* Bouton réintégrer */}
      <td className="px-4 py-3 text-right">
        <button
          onClick={onRestore}
          disabled={isRestoring}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed border border-green-200 text-green-700 text-xs font-semibold rounded-lg transition-colors"
        >
          {isRestoring ? (
            <>
              <SpinIcon />
              En cours…
            </>
          ) : (
            <>
              <RestoreIcon />
              Réintégrer
            </>
          )}
        </button>
      </td>
    </tr>
  );
}

function RestoreIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
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
