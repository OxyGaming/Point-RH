"use client";

import { useState } from "react";
import CandidatCard from "./CandidatCard";
import ScenarioCard from "./ScenarioCard";
import type { JsSimulationResultat } from "@/types/js-simulation";

type Tab = "candidats" | "vigilance" | "refuses" | "scenarios";

const TABS: { id: Tab; label: string; colorEmpty?: string }[] = [
  { id: "candidats", label: "Mobilisables" },
  { id: "vigilance", label: "Vigilance" },
  { id: "refuses", label: "Non utilisables" },
  { id: "scenarios", label: "Scénarios" },
];

export default function JsResultatsTabs({ resultat }: { resultat: JsSimulationResultat }) {
  const [activeTab, setActiveTab] = useState<Tab>("candidats");

  const counts: Record<Tab, number> = {
    candidats: resultat.directsUtilisables.length,
    vigilance: resultat.vigilance.length,
    refuses: resultat.refuses.length,
    scenarios: resultat.scenarios.length,
  };

  const TAB_BADGE: Record<Tab, string> = {
    candidats: "bg-green-100 text-green-700",
    vigilance: "bg-yellow-100 text-yellow-700",
    refuses: "bg-red-100 text-red-700",
    scenarios: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="border-t border-gray-200">
      {/* Summary bar */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="text-gray-500">{resultat.nbAgentsAnalyses} agents analysés</span>
        <span className="text-green-600 font-semibold">{resultat.directsUtilisables.length} mobilisables</span>
        <span className="text-yellow-600">{resultat.vigilance.length} vigilance</span>
        <span className="text-red-600">{resultat.refuses.length} refusés</span>
        <span className="text-blue-600">{resultat.scenarios.length} scénarios</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors relative ${
              activeTab === tab.id
                ? "text-blue-600 border-b-2 border-blue-600 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className={`ml-1 inline-block px-1.5 py-0.5 rounded-full text-xs font-bold ${TAB_BADGE[tab.id]}`}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-3">
        {activeTab === "candidats" && (
          <>
            {resultat.directsUtilisables.length === 0 ? (
              <EmptyState icon="✅" text="Aucun agent directement mobilisable" />
            ) : (
              resultat.directsUtilisables.map((c) => (
                <CandidatCard key={c.agentId} candidat={c} />
              ))
            )}
          </>
        )}

        {activeTab === "vigilance" && (
          <>
            {resultat.vigilance.length === 0 ? (
              <EmptyState icon="⚠️" text="Aucun agent en zone de vigilance" />
            ) : (
              resultat.vigilance.map((c) => (
                <CandidatCard key={c.agentId} candidat={c} />
              ))
            )}
          </>
        )}

        {activeTab === "refuses" && (
          <>
            {resultat.refuses.length === 0 ? (
              <EmptyState icon="🚫" text="Aucun agent refusé" />
            ) : (
              <div className="space-y-2">
                {resultat.refuses.map((c) => (
                  <div
                    key={c.agentId}
                    className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {c.nom} {c.prenom}
                        {c.agentReserve && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Réserve</span>
                        )}
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">{c.motifPrincipal}</p>
                    </div>
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-medium shrink-0">
                      Refusé
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "scenarios" && (
          <>
            {resultat.scenarios.length === 0 ? (
              <EmptyState icon="📋" text="Aucun scénario de réorganisation disponible" />
            ) : (
              resultat.scenarios.map((s, i) => (
                <ScenarioCard key={s.id} scenario={s} index={i} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-center py-8 text-gray-400">
      <p className="text-2xl mb-2">{icon}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}
