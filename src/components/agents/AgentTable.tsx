"use client";
import { useState, useMemo, useCallback, useTransition } from "react";
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

interface UserFilter {
  selectedIds: string[];
  isActive: boolean;
}

interface Props {
  agents: Agent[];
  initialFilter: UserFilter;
}

async function saveFilter(filter: UserFilter) {
  await fetch("/api/user-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filter),
  });
}

export default function AgentTable({ agents, initialFilter }: Props) {
  const [search, setSearch] = useState("");
  const [uchFilter, setUchFilter] = useState("__all__");

  const [filterPanel, setFilterPanel] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialFilter.selectedIds)
  );
  const [isActive, setIsActive] = useState(initialFilter.isActive);
  const [modalSearch, setModalSearch] = useState("");
  const [modalUchFilter, setModalUchFilter] = useState<string>("__all__");
  const [, startTransition] = useTransition();

  const uchOptions = useMemo(() => {
    const set = new Set(agents.map((a) => a.uch ?? "").filter(Boolean));
    return Array.from(set).sort();
  }, [agents]);

  const persist = useCallback((nextIds: Set<string>, nextActive: boolean) => {
    startTransition(async () => {
      await saveFilter({ selectedIds: Array.from(nextIds), isActive: nextActive });
    });
  }, []);

  const toggleActive = () => {
    const next = !isActive;
    setIsActive(next);
    persist(selectedIds, next);
  };

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const modalAgents = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    return agents.filter((a) => {
      if (modalUchFilter !== "__all__" && (a.uch ?? "") !== modalUchFilter) return false;
      if (q && !`${a.nom} ${a.prenom} ${a.matricule}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agents, modalSearch, modalUchFilter]);

  // "Tout sélectionner / désélectionner" n'agit que sur les agents visibles
  // (après filtres équipe + recherche) : permet la sélection en masse par équipe
  // tout en préservant les sélections des autres équipes.
  const selectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const a of modalAgents) next.add(a.id);
      return next;
    });

  const selectNone = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const a of modalAgents) next.delete(a.id);
      return next;
    });

  const saveAndClose = () => {
    persist(selectedIds, isActive);
    setFilterPanel(false);
    setModalSearch("");
    setModalUchFilter("__all__");
  };

  const closePanel = () => {
    setFilterPanel(false);
    setModalSearch("");
    setModalUchFilter("__all__");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (isActive && selectedIds.size > 0 && !selectedIds.has(a.id)) return false;
      if (uchFilter !== "__all__" && (a.uch ?? "") !== uchFilter) return false;
      if (q) {
        const haystack = `${a.nom} ${a.prenom} ${a.matricule}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [agents, search, uchFilter, isActive, selectedIds]);

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

        {/* Bouton affichage personnalisé */}
        <button
          onClick={() => setFilterPanel(true)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-[600] border transition-all ${
            isActive
              ? "bg-[#2563eb] text-white border-[#2563eb] shadow-[0_1px_3px_rgba(37,99,235,0.3)]"
              : "bg-white text-[#4a5580] border-[#e2e8f5] hover:border-[#2563eb] hover:text-[#2563eb]"
          }`}
          title="Configurer l'affichage personnalisé"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          {isActive ? `Filtré (${selectedIds.size})` : "Affichage"}
        </button>
      </div>

      {/* Bandeau filtre actif */}
      {isActive && selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#eff6ff] border-b border-[#bfdbfe] text-[12px] text-[#1e40af]">
          <span>Affichage personnalisé actif — {selectedIds.size} agent(s) sélectionné(s)</span>
          <button onClick={toggleActive} className="underline hover:text-[#1d4ed8] ml-4 font-[500]">
            Désactiver
          </button>
        </div>
      )}

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

      {/* Modal panneau de configuration */}
      {filterPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col border border-[#e2e8f5]">
            {/* En-tête */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f5]">
              <div>
                <h3 className="font-[700] text-[#0f1b4c] text-[15px]">Affichage personnalisé</h3>
                <p className="text-[12px] text-[#8b93b8] mt-0.5">Sélectionnez les agents à afficher</p>
              </div>
              <button
                onClick={closePanel}
                className="text-[#8b93b8] hover:text-[#4a5580] text-xl leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f4f6fb] transition-colors"
              >
                ×
              </button>
            </div>

            {/* Toggle activer/désactiver */}
            <div className="px-5 py-3 border-b border-[#e2e8f5] flex items-center justify-between">
              <div>
                <p className="text-[13px] font-[600] text-[#0f1b4c]">Filtre actif</p>
                <p className="text-[11px] text-[#8b93b8]">Active ou désactive l&apos;affichage personnalisé</p>
              </div>
              <button
                onClick={toggleActive}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isActive ? "bg-[#2563eb]" : "bg-[#e2e8f5]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Barre de recherche + filtre équipe */}
            <div className="px-4 py-2.5 border-b border-[#e2e8f5] flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8b93b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Rechercher un agent…"
                  className="w-full border border-[#e2e8f5] rounded-lg pl-8 pr-3 py-1.5 text-[12px] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[rgba(37,99,235,0.15)] text-[#0f1b4c] placeholder:text-[#8b93b8]"
                />
                {modalSearch && (
                  <button
                    onClick={() => setModalSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8b93b8] hover:text-[#4a5580] text-sm leading-none"
                  >×</button>
                )}
              </div>
              {uchOptions.length > 1 && (
                <select
                  value={modalUchFilter}
                  onChange={(e) => setModalUchFilter(e.target.value)}
                  className="border border-[#e2e8f5] rounded-lg px-2 py-1.5 text-[12px] bg-white focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[rgba(37,99,235,0.15)] text-[#0f1b4c] max-w-[45%]"
                  title="Filtrer par équipe"
                >
                  <option value="__all__">Toutes les équipes</option>
                  {uchOptions.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Actions rapides */}
            <div className="px-5 py-2 border-b border-[#e2e8f5] flex items-center gap-3 text-[12px]">
              <button onClick={selectAll} className="text-[#2563eb] hover:underline font-[500]">
                {modalUchFilter !== "__all__" || modalSearch ? "Sélectionner visibles" : "Tout sélectionner"}
              </button>
              <span className="text-[#e2e8f5]">|</span>
              <button onClick={selectNone} className="text-[#2563eb] hover:underline font-[500]">
                {modalUchFilter !== "__all__" || modalSearch ? "Désélectionner visibles" : "Tout désélectionner"}
              </button>
              <span className="ml-auto text-[#8b93b8]">{selectedIds.size} / {agents.length}</span>
            </div>

            {/* Liste des agents avec checkboxes */}
            <div className="overflow-y-auto flex-1 px-3 py-2">
              {modalAgents.length === 0 && (
                <p className="text-center text-[12px] text-[#8b93b8] py-6">Aucun agent trouvé</p>
              )}
              {modalAgents.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#f8f9fd] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleAgent(a.id)}
                    className="w-4 h-4 rounded border-[#e2e8f5] text-[#2563eb] focus:ring-[#2563eb]"
                  />
                  <span className="text-[13px] text-[#0f1b4c] font-[500] flex-1">
                    {a.nom} {a.prenom}
                  </span>
                  <span className="text-[11px] text-[#8b93b8] font-mono">{a.matricule}</span>
                  {a.uch && (
                    <span className="text-[11px] text-[#8b93b8]">{a.uch}</span>
                  )}
                </label>
              ))}
            </div>

            {/* Pied de page */}
            <div className="px-5 py-4 border-t border-[#e2e8f5] flex justify-end gap-2">
              <button
                onClick={closePanel}
                className="px-4 py-2 text-[13px] text-[#4a5580] border border-[#e2e8f5] rounded-lg hover:bg-[#f8f9fd] font-[500] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveAndClose}
                className="px-4 py-2 text-[13px] bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] font-[600] transition-colors shadow-[0_1px_3px_rgba(37,99,235,0.3)]"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
