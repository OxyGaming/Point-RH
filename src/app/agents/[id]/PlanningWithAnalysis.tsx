"use client";

import { useState } from "react";
import PlanningTimeline from "@/components/js-simulation/PlanningTimeline";
import JsAnalysisPanel from "@/components/js-simulation/JsAnalysisPanel";
import type { JsCible } from "@/types/js-simulation";

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
}

interface Props {
  lignes: PlanningLigne[];
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  importId: string | null;
}

export default function PlanningWithAnalysis({
  lignes,
  agentId,
  agentNom,
  agentPrenom,
  agentMatricule,
  importId,
}: Props) {
  const [selectedJs, setSelectedJs] = useState<JsCible | null>(null);

  const hasJsLines = lignes.some((l) => l.jsNpo === "JS");
  const resolvedImportId = importId ?? "";

  return (
    <div className={`flex flex-col xl:flex-row gap-0 transition-all ${selectedJs ? "xl:gap-6" : ""}`}>
      {/* Planning timeline */}
      <div className={`flex-1 min-w-0 transition-all ${selectedJs ? "xl:max-w-[55%]" : ""}`}>
        {hasJsLines && !selectedJs && (
          <div className="mx-5 mb-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
            💡 Cliquez sur une ligne <strong>JS</strong> pour analyser un imprévu
          </div>
        )}
        {selectedJs && (
          <div className="mx-5 mb-2 text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2">
            ⚡ JS sélectionnée — {selectedJs.date} {selectedJs.heureDebut}→{selectedJs.heureFin}
          </div>
        )}
        <PlanningTimeline
          lignes={lignes}
          agentId={agentId}
          agentNom={agentNom}
          agentPrenom={agentPrenom}
          agentMatricule={agentMatricule}
          importId={resolvedImportId}
          onJsSelected={setSelectedJs}
          selectedJsId={selectedJs?.planningLigneId ?? null}
        />
      </div>

      {/* Panel d'analyse — slide-in */}
      {selectedJs && (
        <div className="w-full xl:w-[45%] min-w-0 border-t xl:border-t-0 xl:border-l border-gray-200 bg-white flex flex-col xl:max-h-[700px] xl:overflow-hidden">
          <JsAnalysisPanel
            jsCible={selectedJs}
            onClose={() => setSelectedJs(null)}
          />
        </div>
      )}
    </div>
  );
}
