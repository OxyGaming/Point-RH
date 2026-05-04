"use client";

import { cn } from "@/lib/utils";
import { formatDateParis } from "@/lib/timezone";
import type { JsTimeline } from "@/types/multi-js-simulation";
import { IconMoon } from "@/components/icons/Icons";

export interface FiltersState {
  dateDebut: string;
  dateFin: string;
  prefixe: string;
  agent: string;
  nuitSeulement: boolean;
  zExclu: boolean;
}

interface Props {
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
  allJs: JsTimeline[];
  nbVisible: number;
  nbTotal: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  nbSelected: number;
}

function toIsoDate(d: Date): string {
  // Force l'extraction du jour Paris pour cohérence avec les heures Paris
  // affichées (cf. rapport Phase 1.A).
  return formatDateParis(d);
}

export function defaultFilters(): FiltersState {
  const today = new Date();
  const j10 = new Date(today);
  j10.setDate(today.getDate() + 10);
  return {
    dateDebut: toIsoDate(today),
    dateFin: toIsoDate(j10),
    prefixe: "",
    agent: "",
    nuitSeulement: false,
    zExclu: true,
  };
}

export function emptyFilters(): FiltersState {
  return defaultFilters();
}

export function applyFilters(js: JsTimeline[], f: FiltersState): JsTimeline[] {
  return js.filter((j) => {
    if (f.dateDebut && j.date < f.dateDebut) return false;
    if (f.dateFin && j.date > f.dateFin) return false;
    if (f.prefixe && !j.prefixeJs?.toLowerCase().includes(f.prefixe.toLowerCase()) &&
        !j.codeJs?.toLowerCase().includes(f.prefixe.toLowerCase())) return false;
    if (f.agent) {
      const q = f.agent.toLowerCase();
      const match =
        j.agentNom.toLowerCase().includes(q) ||
        j.agentPrenom.toLowerCase().includes(q) ||
        j.agentMatricule.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (f.nuitSeulement && !j.isNuit) return false;
    if (f.zExclu && j.isZ) return false;
    return true;
  });
}

export default function MultiJsFilters({
  filters,
  onChange,
  nbVisible,
  nbTotal,
  onSelectAll,
  onDeselectAll,
  nbSelected,
}: Props) {
  const set = (patch: Partial<FiltersState>) => onChange({ ...filters, ...patch });

  const hasActiveFilters =
    filters.dateDebut ||
    filters.dateFin ||
    filters.prefixe ||
    filters.agent ||
    filters.nuitSeulement ||
    filters.zExclu;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Titre + compteur */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Filtres</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {nbVisible}/{nbTotal} JS affichées
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => onChange(emptyFilters())}
              className="text-xs text-blue-600 hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Ligne 1 : dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">
            Du
          </label>
          <input
            type="date"
            value={filters.dateDebut}
            onChange={(e) => set({ dateDebut: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">
            Au
          </label>
          <input
            type="date"
            value={filters.dateFin}
            onChange={(e) => set({ dateFin: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Ligne 2 : préfixe + agent */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">
            Code / Préfixe JS
          </label>
          <input
            type="text"
            placeholder="ex: GIV, PEY…"
            value={filters.prefixe}
            onChange={(e) => set({ prefixe: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">
            Agent
          </label>
          <input
            type="text"
            placeholder="Nom, prénom ou matricule"
            value={filters.agent}
            onChange={(e) => set({ agent: e.target.value })}
            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* Ligne 3 : toggles */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.nuitSeulement}
            onChange={(e) => set({ nuitSeulement: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
          />
          <span className="text-xs text-slate-600 inline-flex items-center gap-1">
            Nuit uniquement
            <IconMoon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
          </span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.zExclu}
            onChange={(e) => set({ zExclu: e.target.checked })}
            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
          />
          <span className="text-xs text-slate-600">Exclure JS de type Z</span>
        </label>
      </div>

      {/* Sélection rapide */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <span className="text-[10px] text-slate-500">Sélection rapide :</span>
        <button
          onClick={onSelectAll}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          Tout sélectionner ({nbVisible})
        </button>
        {nbSelected > 0 && (
          <>
            <span className="text-slate-300">|</span>
            <button
              onClick={onDeselectAll}
              className="text-xs text-slate-500 hover:underline"
            >
              Tout décocher
            </button>
          </>
        )}
      </div>
    </div>
  );
}
