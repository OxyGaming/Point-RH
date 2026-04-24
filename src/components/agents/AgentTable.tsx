"use client";
import { useState, useMemo, useCallback, useTransition, useRef, useEffect } from "react";
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

interface FilterSlot {
  slotIndex: number;
  name: string;
  selectedIds: string[];
  isActive: boolean;
}

interface Props {
  agents: Agent[];
  initialSlots: FilterSlot[];
}

const NB_SLOTS = 4;
const NAME_MAX_LEN = 40;

async function saveSlot(slot: FilterSlot) {
  await fetch("/api/user-filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slot),
  });
}

export default function AgentTable({ agents, initialSlots }: Props) {
  const [search, setSearch] = useState("");
  const [uchFilter, setUchFilter] = useState("__all__");

  const [filterPanel, setFilterPanel] = useState(false);
  const [slots, setSlots] = useState<FilterSlot[]>(initialSlots);
  const [currentSlotIndex, setCurrentSlotIndex] = useState<number>(
    initialSlots.find((s) => s.isActive)?.slotIndex ?? 0
  );
  const [modalSearch, setModalSearch] = useState("");
  const [modalUchFilter, setModalUchFilter] = useState<string>("__all__");
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [, startTransition] = useTransition();

  const uchOptions = useMemo(() => {
    const set = new Set(agents.map((a) => a.uch ?? "").filter(Boolean));
    return Array.from(set).sort();
  }, [agents]);

  const currentSlot = slots[currentSlotIndex];
  const activeSlot = slots.find((s) => s.isActive) ?? null;
  const selectedIds = useMemo(() => new Set(currentSlot.selectedIds), [currentSlot]);
  const activeIds = useMemo(
    () => (activeSlot ? new Set(activeSlot.selectedIds) : null),
    [activeSlot]
  );

  const persistSlot = useCallback((slot: FilterSlot) => {
    startTransition(async () => {
      await saveSlot(slot);
    });
  }, []);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const mutateSlot = useCallback(
    (idx: number, patch: Partial<Omit<FilterSlot, "slotIndex">>) => {
      setSlots((prev) => {
        const next = prev.map((s) => (s.slotIndex === idx ? { ...s, ...patch } : s));
        // Contrainte métier : 1 seul slot actif à la fois
        if (patch.isActive === true) {
          return next.map((s) =>
            s.slotIndex === idx ? s : s.isActive ? { ...s, isActive: false } : s
          );
        }
        return next;
      });
    },
    []
  );

  const toggleAgent = (id: string) => {
    const curr = new Set(currentSlot.selectedIds);
    if (curr.has(id)) curr.delete(id);
    else curr.add(id);
    mutateSlot(currentSlotIndex, { selectedIds: Array.from(curr) });
  };

  const modalAgents = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    return agents.filter((a) => {
      if (modalUchFilter !== "__all__" && (a.uch ?? "") !== modalUchFilter) return false;
      if (q && !`${a.nom} ${a.prenom} ${a.matricule}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agents, modalSearch, modalUchFilter]);

  const selectAll = () => {
    const next = new Set(currentSlot.selectedIds);
    for (const a of modalAgents) next.add(a.id);
    mutateSlot(currentSlotIndex, { selectedIds: Array.from(next) });
  };

  const selectNone = () => {
    const next = new Set(currentSlot.selectedIds);
    for (const a of modalAgents) next.delete(a.id);
    mutateSlot(currentSlotIndex, { selectedIds: Array.from(next) });
  };

  const toggleActiveCurrent = () => {
    const next = !currentSlot.isActive;
    mutateSlot(currentSlotIndex, { isActive: next });
  };

  const deactivateFromBanner = () => {
    if (!activeSlot) return;
    const updated = { ...activeSlot, isActive: false };
    mutateSlot(activeSlot.slotIndex, { isActive: false });
    persistSlot(updated);
  };

  // ─── Renommage inline ─────────────────────────────────────────────────────

  const startRename = (idx: number) => {
    setEditingName(idx);
    setNameDraft(slots[idx].name);
  };

  useEffect(() => {
    if (editingName !== null) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const commitRename = () => {
    if (editingName === null) return;
    const trimmed = nameDraft.trim().slice(0, NAME_MAX_LEN);
    const name = trimmed.length > 0 ? trimmed : `Filtre ${editingName + 1}`;
    mutateSlot(editingName, { name });
    setEditingName(null);
  };

  const cancelRename = () => {
    setEditingName(null);
    setNameDraft("");
  };

  // ─── Fermeture / persistance ──────────────────────────────────────────────

  const saveAndClose = () => {
    // Envoie tous les slots (4 requêtes en parallèle via startTransition)
    startTransition(async () => {
      await Promise.all(slots.map(saveSlot));
    });
    setFilterPanel(false);
    setModalSearch("");
    setModalUchFilter("__all__");
    setEditingName(null);
  };

  const closePanel = () => {
    // Abandon : on recharge les slots initiaux pour jeter les modifs en cours
    setSlots(initialSlots);
    setCurrentSlotIndex(
      initialSlots.find((s) => s.isActive)?.slotIndex ?? 0
    );
    setFilterPanel(false);
    setModalSearch("");
    setModalUchFilter("__all__");
    setEditingName(null);
  };

  // ─── Filtrage de la table (hors modale) ────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (activeIds && !activeIds.has(a.id)) return false;
      if (uchFilter !== "__all__" && (a.uch ?? "") !== uchFilter) return false;
      if (q) {
        const haystack = `${a.nom} ${a.prenom} ${a.matricule}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [agents, search, uchFilter, activeIds]);

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

  const activeCount = activeIds?.size ?? 0;

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
            activeSlot
              ? "bg-[#2563eb] text-white border-[#2563eb] shadow-[0_1px_3px_rgba(37,99,235,0.3)]"
              : "bg-white text-[#4a5580] border-[#e2e8f5] hover:border-[#2563eb] hover:text-[#2563eb]"
          }`}
          title="Configurer l'affichage personnalisé"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          {activeSlot ? `${activeSlot.name} (${activeCount})` : "Affichage"}
        </button>
      </div>

      {/* Bandeau filtre actif */}
      {activeSlot && activeCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#eff6ff] border-b border-[#bfdbfe] text-[12px] text-[#1e40af]">
          <span>
            <strong>{activeSlot.name}</strong> — {activeCount} agent{activeCount > 1 ? "s" : ""} affiché{activeCount > 1 ? "s" : ""}
          </span>
          <button onClick={deactivateFromBanner} className="underline hover:text-[#1d4ed8] ml-4 font-[500]">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-[#e2e8f5]">
            {/* En-tête */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f5]">
              <div>
                <h3 className="font-[700] text-[#0f1b4c] text-[15px]">Affichage personnalisé</h3>
                <p className="text-[12px] text-[#8b93b8] mt-0.5">Jusqu&apos;à 4 filtres nommés — 1 seul actif à la fois</p>
              </div>
              <button
                onClick={closePanel}
                className="text-[#8b93b8] hover:text-[#4a5580] text-xl leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f4f6fb] transition-colors"
              >
                ×
              </button>
            </div>

            {/* Onglets de slots */}
            <div className="flex border-b border-[#e2e8f5] bg-[#f8f9fd] px-2 pt-2 gap-1">
              {slots.map((s) => {
                const isCurrent = s.slotIndex === currentSlotIndex;
                const isEditing = editingName === s.slotIndex;
                return (
                  <div
                    key={s.slotIndex}
                    className={`relative flex-1 min-w-0 px-2 py-1.5 rounded-t-lg border-t border-x text-[12px] font-[500] cursor-pointer transition-colors flex items-center gap-1 ${
                      isCurrent
                        ? "bg-white border-[#e2e8f5] text-[#0f1b4c]"
                        : "border-transparent text-[#8b93b8] hover:text-[#4a5580]"
                    }`}
                    onClick={() => !isEditing && setCurrentSlotIndex(s.slotIndex)}
                    onDoubleClick={() => startRename(s.slotIndex)}
                    title={`Renommer : double-cliquez sur l'onglet`}
                  >
                    {s.isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#059669] shrink-0" title="Slot actif" />
                    )}
                    {isEditing ? (
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value.slice(0, NAME_MAX_LEN))}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          else if (e.key === "Escape") cancelRename();
                        }}
                        className="flex-1 min-w-0 bg-white border border-[#2563eb] rounded px-1 py-0 text-[11px] outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate">{s.name}</span>
                    )}
                    <span className="shrink-0 text-[10px] text-[#8b93b8]">({s.selectedIds.length})</span>
                  </div>
                );
              })}
            </div>

            {/* Toggle activer/désactiver */}
            <div className="px-5 py-3 border-b border-[#e2e8f5] flex items-center justify-between">
              <div>
                <p className="text-[13px] font-[600] text-[#0f1b4c]">Activer ce filtre</p>
                <p className="text-[11px] text-[#8b93b8]">
                  {currentSlot.isActive
                    ? `« ${currentSlot.name} » est actif`
                    : activeSlot
                    ? `« ${activeSlot.name} » est actuellement actif`
                    : "Aucun filtre actif"}
                </p>
              </div>
              <button
                onClick={toggleActiveCurrent}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  currentSlot.isActive ? "bg-[#2563eb]" : "bg-[#e2e8f5]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    currentSlot.isActive ? "translate-x-6" : "translate-x-1"
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
            <div className="px-5 py-4 border-t border-[#e2e8f5] flex items-center justify-between gap-2">
              <p className="text-[11px] text-[#8b93b8]">
                Double-cliquez sur un onglet pour renommer
              </p>
              <div className="flex gap-2">
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
        </div>
      )}
    </div>
  );
}
