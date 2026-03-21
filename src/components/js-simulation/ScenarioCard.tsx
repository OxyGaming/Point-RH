"use client";

import { useState } from "react";
import type { Scenario } from "@/types/js-simulation";

const CONFORMITE_STYLES = {
  CONFORME: { badge: "bg-green-100 text-green-800", bar: "bg-green-500", label: "Conforme" },
  VIGILANCE: { badge: "bg-yellow-100 text-yellow-800", bar: "bg-yellow-400", label: "Vigilance" },
  NON_CONFORME: { badge: "bg-red-100 text-red-800", bar: "bg-red-400", label: "Non conforme" },
};

const ACTION_LABELS: Record<string, string> = {
  REPRENDRE_JS: "↩ Reprise",
  ECHANGER_JS: "⇄ Échange",
  DECALER_NPO: "→ Décalage",
  RESOUDRE_CONFLIT: "✓ Résolution",
};

const SEVERITY_STYLES: Record<string, string> = {
  INFO: "bg-blue-50 text-blue-700",
  AVERTISSEMENT: "bg-yellow-50 text-yellow-700",
  BLOQUANT: "bg-red-50 text-red-700",
};

export default function ScenarioCard({ scenario, index }: { scenario: Scenario; index: number }) {
  const [open, setOpen] = useState(false);
  const cf = CONFORMITE_STYLES[scenario.conformiteFinale];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
          {index + 1}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">{scenario.titre}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${cf.badge}`}>
              {cf.label}
            </span>
            <span className="text-xs text-gray-400">
              {scenario.nbModifications} modification{scenario.nbModifications > 1 ? "s" : ""}
            </span>
            {scenario.profondeurCascade > 0 && (
              <span className="text-xs text-purple-600">
                cascade n°{scenario.profondeurCascade}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800">{scenario.score}</p>
          <p className="text-xs text-gray-400">/ 100</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1 bg-gray-100">
        <div
          className={`h-full ${cf.bar} transition-all`}
          style={{ width: `${scenario.score}%` }}
        />
      </div>

      {/* Justification */}
      <div className="px-4 py-3">
        <p className="text-xs text-gray-600 italic">{scenario.justification}</p>

        {/* Modifications résumé */}
        <div className="mt-3 space-y-2">
          {scenario.modifications.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
                m.conforme ? "bg-green-50" : "bg-yellow-50"
              }`}
            >
              <span className="font-semibold text-gray-500 shrink-0">
                {ACTION_LABELS[m.action] ?? m.action}
              </span>
              <div>
                <span className="font-semibold text-gray-800">{m.agentNom} {m.agentPrenom}</span>
                <p className="text-gray-600 mt-0.5">{m.description}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-blue-600 hover:text-blue-800 mt-2 font-medium"
        >
          {open ? "Masquer impacts ↑" : "Voir impacts en cascade ↓"}
        </button>
      </div>

      {/* Impacts en cascade */}
      {open && scenario.impactsCascade.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Impacts en cascade
          </p>
          {scenario.impactsCascade.map((impact, i) => (
            <div
              key={i}
              className={`text-xs px-3 py-2 rounded-lg ${SEVERITY_STYLES[impact.severity]}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-semibold">
                  {impact.severity === "BLOQUANT" ? "⛔" : impact.severity === "AVERTISSEMENT" ? "⚠" : "ℹ"}
                </span>
                {impact.agentNom && (
                  <span className="font-semibold">{impact.agentNom} {impact.agentPrenom}</span>
                )}
                <span className="text-gray-500">— {impact.date}</span>
              </div>
              <p>{impact.description}</p>
              <p className="text-xs opacity-70 mt-0.5">Règle: {impact.regle}</p>
            </div>
          ))}
        </div>
      )}

      {open && scenario.impactsCascade.length === 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400">Aucun impact en cascade.</p>
        </div>
      )}
    </div>
  );
}
