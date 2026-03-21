"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

interface Agent {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  uch: string | null;
  habilitations: string[];
}

export default function AgentTable({ agents }: { agents: Agent[] }) {
  const [search, setSearch] = useState("");
  const [uchFilter, setUchFilter] = useState("__all__");

  const uchOptions = useMemo(() => {
    const set = new Set(agents.map((a) => a.uch ?? "").filter(Boolean));
    return Array.from(set).sort();
  }, [agents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (uchFilter !== "__all__" && (a.uch ?? "") !== uchFilter) return false;
      if (q) {
        const haystack = `${a.nom} ${a.prenom} ${a.matricule}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [agents, search, uchFilter]);

  if (agents.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">👥</div>
        <p className="font-medium">Aucun agent trouvé</p>
        <p className="text-sm mt-1">Importez un planning pour ajouter des agents</p>
      </div>
    );
  }

  return (
    <div>
      {/* Barre de filtres */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/60">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un agent (nom, prénom, matricule)…"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {uchOptions.length > 1 && (
          <select
            value={uchFilter}
            onChange={(e) => setUchFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="__all__">Toutes les UCH</option>
            {uchOptions.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Agent</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Matricule</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden sm:table-cell">UCH</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Poste</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Profil</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Préfixes JS</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400 text-sm">
                  Aucun agent ne correspond à la recherche
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {a.nom} {a.prenom}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{a.matricule}</td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{a.uch ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{a.posteAffectation ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.agentReserve && <Badge variant="blue">Réserve</Badge>}
                      {a.peutFaireNuit && <Badge variant="gray">Nuit</Badge>}
                      {a.peutEtreDeplace && <Badge variant="gray">Dépl.</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {a.habilitations.length === 0 ? (
                      <span className="text-red-400 text-xs italic">Aucun</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.habilitations.map((p) => (
                          <span key={p} className="font-mono text-xs bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">{p}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/agents/${a.id}`}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      Détail →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {filtered.length > 0 && filtered.length < agents.length && (
          <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
            {filtered.length} / {agents.length} agent(s) affiché(s)
          </p>
        )}
      </div>
    </div>
  );
}
