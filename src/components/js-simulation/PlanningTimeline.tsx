"use client";

import { useState } from "react";
import { cn, isJsDeNuit } from "@/lib/utils";
import type { JsCible } from "@/types/js-simulation";

interface PlanningLigne {
  id: string;
  dateDebutPop: string;
  heureDebutPop: string;
  heureFinPop: string;
  jsNpo: string;
  codeJs: string | null;
  amplitudeHHMM: string | null;
  typeJs: string | null;
  amplitudeCentesimal: number | null;
}

interface PlanningTimelineProps {
  lignes: PlanningLigne[];
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  importId: string;
  onJsSelected: (js: JsCible) => void;
  selectedJsId: string | null;
}

// isJsDeNuit importé depuis utils

export default function PlanningTimeline({
  lignes,
  agentId,
  agentNom,
  agentPrenom,
  agentMatricule,
  importId,
  onJsSelected,
  selectedJsId,
}: PlanningTimelineProps) {
  if (lignes.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-8">Aucune ligne de planning</p>
    );
  }

  const handleClickJs = (ligne: PlanningLigne) => {
    if (ligne.jsNpo !== "JS") return;

    // Calculer l'amplitude en minutes
    const [hd, md] = ligne.heureDebutPop.split(":").map(Number);
    const [hf, mf] = ligne.heureFinPop.split(":").map(Number);
    let amplitudeMin = (hf * 60 + mf) - (hd * 60 + md);
    if (amplitudeMin < 0) amplitudeMin += 24 * 60; // passe minuit

    const jsCible: JsCible = {
      planningLigneId: ligne.id,
      agentId,
      agentNom,
      agentPrenom,
      agentMatricule,
      date: new Date(ligne.dateDebutPop).toISOString().slice(0, 10),
      heureDebut: ligne.heureDebutPop,
      heureFin: ligne.heureFinPop,
      amplitudeMin,
      codeJs: ligne.codeJs,
      typeJs: ligne.typeJs,
      isNuit: isJsDeNuit(ligne.heureDebutPop, ligne.heureFinPop),
      importId,
    };

    onJsSelected(jsCible);
  };

  return (
    <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
      {lignes.map((l) => {
        const isJs = l.jsNpo === "JS";
        const isSelected = l.id === selectedJsId;

        return (
          <div
            key={l.id}
            onClick={() => isJs && handleClickJs(l)}
            className={cn(
              "flex items-center gap-4 px-5 py-3 text-sm transition-all border-l-2",
              isJs
                ? "cursor-pointer hover:bg-blue-50 group border-transparent hover:border-blue-400"
                : "cursor-default bg-slate-50/50 border-transparent",
              isSelected && "bg-blue-50 border-blue-500"
            )}
          >
            {/* Date */}
            <div className={cn("w-24 text-xs shrink-0", isJs ? "text-slate-700 font-medium" : "text-slate-400")}>
              {new Date(l.dateDebutPop).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </div>

            {/* Horaires */}
            <div className={cn("w-28 text-xs font-mono shrink-0", isJs ? "text-slate-800 font-semibold" : "text-slate-400")}>
              {l.heureDebutPop} → {l.heureFinPop}
            </div>

            {/* Badge JS/NPO */}
            <div className="flex-1 flex items-center gap-2">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded font-semibold border",
                  isJs
                    ? "bg-blue-100 text-blue-800 border-blue-300 group-hover:bg-blue-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                )}
              >
                {l.jsNpo}
              </span>
              {l.codeJs && (
                <span className={cn("text-xs", isJs ? "text-slate-600" : "text-slate-400")}>{l.codeJs}</span>
              )}
              {isJsDeNuit(l.heureDebutPop, l.heureFinPop) && isJs && (
                <span className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-semibold">Nuit</span>
              )}
            </div>

            {/* Amplitude */}
            <div className={cn("text-xs shrink-0", isJs ? "text-slate-600 font-medium" : "text-slate-400")}>
              {l.amplitudeHHMM ?? "—"}
            </div>

            {/* Type */}
            <div className={cn("w-32 text-xs shrink-0 truncate", isJs ? "text-slate-600" : "text-slate-400")}>
              {l.typeJs ?? ""}
            </div>

            {/* Icône sélection */}
            {isJs && (
              <div className="w-6 shrink-0 text-right">
                {isSelected ? (
                  <span className="text-blue-600 font-bold text-sm">✓</span>
                ) : (
                  <span className="text-slate-300 group-hover:text-blue-500 text-sm">›</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
