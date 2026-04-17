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
      <div className="text-center py-16 text-[#8b93b8]">
        <svg className="w-10 h-10 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
        </svg>
        <p className="font-[600] text-[#4a5580]">Aucun agent trouvé</p>
        <p className="text-[12px] mt-1">Importez un planning pour ajouter des agents</p>
      </div>
    );
  }

  return (
    <div>
      {/* Barre de filtres */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 border-b border-[#e2e8f5] bg-[#f8f9fd]">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b93b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom, matricule…"
            className="w-full border border-[#e2e8f5] rounded-lg pl-9 pr-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[rgba(37,99,235,0.1)] transition-all text-[#0f1b4c] placeholder:text-[#8b93b8]"
          />
        </div>
        {uchOptions.length > 1 && (
          <select
            value={uchFilter}
            onChange={(e) => setUchFilter(e.target.value)}
            className="border border-[#e2e8f5] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[rgba(37,99,235,0.1)] bg-white text-[#0f1b4c] transition-all"
          >
            <option value="__all__">Toutes les UCH</option>
            {uchOptions.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e2e8f5] bg-[#f8f9fd]">
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em]">Agent</th>
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em]">Matricule</th>
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em] hidden sm:table-cell">UCH</th>
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em] hidden md:table-cell">Poste</th>
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em]">Profil</th>
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em] hidden lg:table-cell">Préfixes JS</th>
              <th className="text-left px-4 py-3 text-[10px] font-[700] text-[#8b93b8] uppercase tracking-[0.08em]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-[#8b93b8] text-[13px]">
                  Aucun agent ne correspond à la recherche
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="border-b border-[#e2e8f5] hover:bg-[#f4f6fb] transition-colors group">
                  <td className="px-4 py-3 text-[13px] font-[600] text-[#0f1b4c]">
                    {a.nom} {a.prenom}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[12px] text-[#4a5580]">{a.matricule}</span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#4a5580] hidden sm:table-cell">{a.uch ?? "—"}</td>
                  <td className="px-4 py-3 text-[13px] text-[#4a5580] hidden md:table-cell">{a.posteAffectation ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.agentReserve && <Badge variant="blue" dot>Réserve</Badge>}
                      {a.peutFaireNuit && <Badge variant="gray" dot={false}>Nuit</Badge>}
                      {a.peutEtreDeplace && <Badge variant="gray" dot={false}>Dépl.</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {a.habilitations.length === 0 ? (
                      <span className="text-[#dc2626] text-[11px] italic">Aucun</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.habilitations.map((p) => (
                          <span key={p} className="font-mono text-[11px] bg-[#f4f6fb] text-[#4a5580] border border-[#e2e8f5] rounded px-1.5 py-0.5">{p}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/agents/${a.id}`}
                      className="text-[12px] font-[600] text-[#2563eb] hover:text-[#1d4ed8] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Voir →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {filtered.length > 0 && filtered.length < agents.length && (
          <p className="px-4 py-2 text-[11px] text-[#8b93b8] border-t border-[#e2e8f5]">
            {filtered.length} / {agents.length} agent(s) affiché(s)
          </p>
        )}
      </div>
    </div>
  );
}
