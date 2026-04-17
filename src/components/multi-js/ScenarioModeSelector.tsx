"use client";

import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import type { CandidateScope } from "@/types/multi-js-simulation";
import { IconShield, IconUsers } from "@/components/icons/Icons";

interface Props {
  value: CandidateScope;
  onChange: (v: CandidateScope) => void;
}

const OPTIONS: { value: CandidateScope; label: string; desc: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    value: "reserve_only",
    label: "Réserve uniquement",
    desc: "Simule la couverture avec le seul vivier d'agents de réserve",
    Icon: IconShield,
  },
  {
    value: "all_agents",
    label: "Tous les agents",
    desc: "Ouvre la recherche à l'ensemble des agents éligibles",
    Icon: IconUsers,
  },
];

export default function ScenarioModeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        Mode de simulation
      </p>
      <div className="grid grid-cols-1 gap-2">
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-all",
                active
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
              )}
            >
              <opt.Icon className={cn("w-5 h-5 shrink-0 mt-0.5", active ? "text-blue-600" : "text-slate-500")} aria-hidden="true" />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-xs font-semibold leading-tight",
                    active ? "text-blue-700" : "text-slate-700"
                  )}
                >
                  {opt.label}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                  {opt.desc}
                </p>
              </div>
              <div className="ml-auto shrink-0 mt-0.5">
                <div
                  className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    active
                      ? "border-blue-500 bg-blue-500"
                      : "border-slate-300 bg-white"
                  )}
                >
                  {active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
