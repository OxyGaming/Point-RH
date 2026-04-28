"use client";

import { useState } from "react";
import { cn, isJsDeNuit } from "@/lib/utils";
import { isZeroLoadJs } from "@/lib/simulation/jsUtils";
import type { JsCible, FlexibiliteJs } from "@/types/js-simulation";

interface PlanningLigne {
  id: string;
  dateDebutPop: string;
  heureDebutPop: string;
  heureFinPop: string;
  /** Horaires standard du JsType (indépendants du trajet de l'agent) */
  heureDebutJsType?: string;
  heureFinJsType?: string;
  jsNpo: string;
  codeJs: string | null;
  amplitudeHHMM: string | null;
  typeJs: string | null;
  amplitudeCentesimal: number | null;
  /** Propagé depuis JsType.flexibilite — défaut OBLIGATOIRE */
  flexibilite?: FlexibiliteJs;
}

// ─── Calcul GPT ──────────────────────────────────────────────────────────────

/** NPO RP (simple, double ou triple) : réinitialise le compteur GPT. */
function isRP(l: PlanningLigne): boolean {
  if (l.jsNpo !== "NPO") return false;
  const code = (l.codeJs ?? "").toUpperCase().trim();
  return code === "RP" || code.startsWith("RP");
}

/**
 * NPO qui incrémente le compteur GPT (congé-repos, absence, RU…).
 * Tout NPO non-RP avec famille "Congé-repos" ou code "C" entre dans la GPT.
 */
function isCongeGpt(l: PlanningLigne): boolean {
  if (l.jsNpo !== "NPO" || isRP(l)) return false;
  const code = (l.codeJs ?? "").toUpperCase().trim();
  const t = (l.typeJs ?? "").toLowerCase();
  return (
    code === "C" ||
    t.includes("congé") || t.includes("conge") ||
    t.includes("absence") || t === "ru" || t.includes("repos universel")
  );
}

/**
 * Retourne pour chaque ligne : { count, isFirstOfGpt }
 *
 * Règle métier :
 *  – JS et congé-repos (NPO C) incrémentent le compteur.
 *  – NPO RP remet le compteur à 0 (pas d'incrémentation).
 *  – Le premier événement comptable après un RP ouvre une nouvelle GPT (↺).
 *  – Les autres NPO portent le compteur sans l'incrémenter.
 */
function computeGptMap(
  lignes: PlanningLigne[]
): Map<string, { count: number; isFirstOfGpt: boolean }> {
  const sorted = [...lignes].sort(
    (a, b) => new Date(a.dateDebutPop).getTime() - new Date(b.dateDebutPop).getTime()
  );

  const result = new Map<string, { count: number; isFirstOfGpt: boolean }>();
  let count = 0;
  let afterRp = true; // vrai au départ et après chaque RP

  for (const l of sorted) {
    if (isRP(l)) {
      count = 0;
      afterRp = true;
      result.set(l.id, { count: 0, isFirstOfGpt: false });
    } else if (l.jsNpo === "JS" || isCongeGpt(l)) {
      const isFirstOfGpt = afterRp;
      count++;
      afterRp = false;
      result.set(l.id, { count, isFirstOfGpt });
    } else {
      // Autre NPO : porte le compteur sans l'incrémenter
      result.set(l.id, { count, isFirstOfGpt: false });
    }
  }

  return result;
}

function gptBadgeClass(count: number): string {
  if (count <= 2) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (count <= 4) return "bg-blue-50 text-blue-700 border-blue-200";
  if (count === 5) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-red-50 text-red-700 border-red-200";
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
  const gptMap = computeGptMap(lignes);

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
      heureDebutJsType: ligne.heureDebutJsType,
      heureFinJsType: ligne.heureFinJsType,
      amplitudeMin,
      codeJs: ligne.codeJs,
      typeJs: ligne.typeJs,
      isNuit: isJsDeNuit(ligne.heureDebutPop, ligne.heureFinPop),
      importId,
      flexibilite: ligne.flexibilite ?? "OBLIGATOIRE",
    };

    onJsSelected(jsCible);
  };

  return (
    <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto overflow-x-auto">
      {lignes.map((l) => {
        const isJs = l.jsNpo === "JS";
        const isSelected = l.id === selectedJsId;
        const gpt = gptMap.get(l.id) ?? { count: 0, isFirstOfGpt: false };

        return (
          <div
            key={l.id}
            onClick={() => isJs && handleClickJs(l)}
            className={cn(
              "flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 text-sm transition-all border-l-2 min-w-0",
              isJs
                ? "cursor-pointer hover:bg-blue-50 group border-transparent hover:border-blue-400"
                : "cursor-default bg-slate-50/50 border-transparent",
              isSelected && "bg-blue-50 border-blue-500",
              gpt.isFirstOfGpt && "border-t-2 border-t-emerald-300"
            )}
          >
            {/* Date */}
            <div className={cn("w-16 sm:w-24 text-xs shrink-0", isJs ? "text-slate-700 font-medium" : "text-slate-400")}>
              {new Date(l.dateDebutPop).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </div>

            {/* Horaires */}
            <div className={cn("w-24 sm:w-28 text-xs font-mono shrink-0", isJs ? "text-slate-800 font-semibold" : "text-slate-400")}>
              {l.heureDebutPop}→{l.heureFinPop}
            </div>

            {/* Badge JS/NPO */}
            <div className="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded font-semibold border shrink-0",
                  isJs
                    ? "bg-blue-100 text-blue-800 border-blue-300 group-hover:bg-blue-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                )}
              >
                {l.jsNpo}
              </span>
              {l.codeJs && (
                <span className={cn("text-xs truncate", isJs ? "text-slate-600" : "text-slate-400")}>{l.codeJs}</span>
              )}
              {isJs && /^FO/i.test(l.codeJs ?? "") && (
                <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded font-semibold shrink-0">JS FO</span>
              )}
              {isJs && isZeroLoadJs(l.codeJs, l.typeJs) && !/^FO/i.test(l.codeJs ?? "") && (
                <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-semibold shrink-0">JS Z</span>
              )}
              {isJsDeNuit(l.heureDebutPop, l.heureFinPop) && isJs && (
                <span className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-semibold shrink-0 hidden xs:inline">Nuit</span>
              )}
            </div>

            {/* Amplitude — masquée sur très petit écran */}
            <div className={cn("text-xs shrink-0 hidden sm:block", isJs ? "text-slate-600 font-medium" : "text-slate-400")}>
              {l.amplitudeHHMM ?? "—"}
            </div>

            {/* Type — masqué sur mobile */}
            <div className={cn("w-28 text-xs shrink-0 truncate hidden md:block", isJs ? "text-slate-600" : "text-slate-400")}>
              {l.typeJs ?? ""}
            </div>

            {/* Cumul GPT */}
            <div className="w-12 sm:w-14 shrink-0 flex items-center justify-end gap-1">
              {gpt.count > 0 ? (
                <>
                  {gpt.isFirstOfGpt && (
                    <span className="text-emerald-500 text-xs" title="Nouvelle GPT">↺</span>
                  )}
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded border",
                      isJs ? "font-semibold" : "opacity-50",
                      gptBadgeClass(gpt.count)
                    )}
                    title={`Jour ${gpt.count} dans la GPT courante`}
                  >
                    {gpt.count}/6
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-200">—</span>
              )}
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
