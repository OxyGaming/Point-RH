"use client";

import { cn } from "@/lib/utils";
import type { JsTimeline } from "@/types/multi-js-simulation";
import AgentLink from "@/components/ui/AgentLink";
import { IconMoon } from "@/components/icons/Icons";

interface Props {
  js: JsTimeline;
  selected: boolean;
  onToggle: (id: string) => void;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default function JsTimelineItem({ js, selected, onToggle }: Props) {
  return (
    <div
      className={cn(
        "relative flex items-stretch gap-3 group cursor-pointer transition-all duration-150",
        selected
          ? "bg-blue-50 border-blue-400 ring-1 ring-blue-400"
          : "bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50",
        "border rounded-lg px-3 py-2.5"
      )}
      onClick={() => onToggle(js.planningLigneId)}
    >
      {/* ─── Indicateur vertical couleur ─────────────────────────────── */}
      <div
        className={cn(
          "w-1 rounded-full shrink-0 self-stretch",
          js.isNuit
            ? "bg-indigo-400"
            : js.isZ
            ? "bg-slate-300"
            : selected
            ? "bg-blue-500"
            : "bg-emerald-400"
        )}
      />

      {/* ─── Checkbox ────────────────────────────────────────────────── */}
      <div className="flex items-center shrink-0 pt-0.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(js.planningLigneId)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
      </div>

      {/* ─── Date + heure ─────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center min-w-[90px] shrink-0">
        <span className="text-xs font-semibold text-slate-700 capitalize">
          {formatDate(js.date)}
        </span>
        <span className="text-xs text-slate-500 font-mono">
          {js.heureDebut} → {js.heureFin}
        </span>
        <span className="text-[10px] text-slate-400">
          {formatMinutes(js.amplitudeMin)}
        </span>
      </div>

      {/* ─── Séparateur ───────────────────────────────────────────────── */}
      <div className="w-px bg-slate-100 self-stretch shrink-0" />

      {/* ─── Code JS + poste ─────────────────────────────────────────── */}
      <div className="flex flex-col justify-center min-w-[90px] shrink-0">
        {js.codeJs ? (
          <span className="text-xs font-bold text-slate-800 font-mono leading-tight">
            {js.codeJs}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">–</span>
        )}
        {js.prefixeJs && (
          <span className="text-[10px] text-slate-500">{js.prefixeJs}</span>
        )}
        {js.numeroJs && (
          <span className="text-[10px] text-slate-400">#{js.numeroJs}</span>
        )}
      </div>

      {/* ─── Agent prévu ─────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center flex-1 min-w-0">
        <AgentLink
          agentId={js.agentId}
          nom={js.agentNom}
          prenom={js.agentPrenom}
          className="text-xs font-medium text-slate-700 truncate"
        />
        <span className="text-[10px] text-slate-500 font-mono">
          {js.agentMatricule}
        </span>
        {js.posteAffectation && (
          <span className="text-[10px] text-slate-400 truncate">
            {js.posteAffectation}
          </span>
        )}
      </div>

      {/* ─── Badges ───────────────────────────────────────────────────── */}
      <div className="flex flex-col items-end justify-center gap-1 shrink-0">
        {js.isNuit && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
            <IconMoon className="w-3 h-3" aria-hidden="true" />
            Nuit
          </span>
        )}
        {js.isZ && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
            Z
          </span>
        )}
        {selected && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
            ✓ Sél.
          </span>
        )}
      </div>
    </div>
  );
}
