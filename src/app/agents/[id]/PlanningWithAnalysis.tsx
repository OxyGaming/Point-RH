"use client";

import { useState, useEffect } from "react";
import PlanningTimeline from "@/components/js-simulation/PlanningTimeline";
import JsAnalysisPanel from "@/components/js-simulation/JsAnalysisPanel";
import type { JsCible, FlexibiliteJs } from "@/types/js-simulation";
import { IconLightbulb, IconZap } from "@/components/icons/Icons";

interface PlanningLigne {
  id: string;
  dateDebutPop: string;
  heureDebutPop: string;
  heureFinPop: string;
  heureDebutJsType?: string;
  heureFinJsType?: string;
  jsNpo: string;
  codeJs: string | null;
  amplitudeHHMM: string | null;
  typeJs: string | null;
  amplitudeCentesimal: number | null;
  flexibilite?: FlexibiliteJs;
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
  // Contrôle l'animation d'entrée du drawer
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (selectedJs) {
      // Micro-delay pour laisser le DOM monter avant de déclencher la transition
      const t = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [selectedJs]);

  const handleClose = () => {
    setVisible(false);
    // Attendre la fin de l'animation avant de démonter
    setTimeout(() => setSelectedJs(null), 300);
  };

  const hasJsLines = lignes.some((l) => l.jsNpo === "JS");
  const resolvedImportId = importId ?? "";

  return (
    <div className="relative">
      {/* Planning timeline — toujours pleine largeur */}
      <div>
        {hasJsLines && !selectedJs && (
          <div className="mx-5 mb-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
            <IconLightbulb className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Cliquez sur une ligne <strong>JS</strong> pour analyser un imprévu</span>
          </div>
        )}
        {selectedJs && (
          <div className="mx-5 mb-2 text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <IconZap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              JS sélectionnée — {selectedJs.date} {selectedJs.heureDebut}→{selectedJs.heureFin}
            </span>
            <button
              onClick={handleClose}
              className="text-blue-500 hover:text-blue-700 font-semibold ml-3 text-sm leading-none"
              aria-label="Fermer l'analyse"
            >
              ×
            </button>
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

      {/* Overlay semi-transparent */}
      {selectedJs && (
        <div
          className={`fixed inset-0 bg-black/20 z-30 transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
          onClick={handleClose}
        />
      )}

      {/* Drawer d'analyse — glisse depuis la droite */}
      {selectedJs && (
        <div
          className={`fixed top-0 right-0 h-full w-full sm:w-[480px] lg:w-[520px] z-40 bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            visible ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex-1 overflow-y-auto">
            <JsAnalysisPanel
              jsCible={selectedJs}
              onClose={handleClose}
            />
          </div>
        </div>
      )}
    </div>
  );
}
