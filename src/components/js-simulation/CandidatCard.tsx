"use client";

import { useState } from "react";
import Link from "next/link";
import { minutesToTime } from "@/lib/utils";
import type { CandidatResult } from "@/types/js-simulation";

const STATUT_STYLES = {
  DIRECT: "bg-green-50 border-green-200",
  VIGILANCE: "bg-yellow-50 border-yellow-200",
  REFUSE: "bg-red-50 border-red-200",
};

const STATUT_BADGE = {
  DIRECT: "bg-green-100 text-green-800",
  VIGILANCE: "bg-yellow-100 text-yellow-800",
  REFUSE: "bg-red-100 text-red-800",
};

const STATUT_LABEL = {
  DIRECT: "Mobilisable",
  VIGILANCE: "Vigilance",
  REFUSE: "Refusé",
};

export default function CandidatCard({ candidat }: { candidat: CandidatResult }) {
  const [open, setOpen] = useState(false);
  const { detail } = candidat;

  return (
    <div className={`border rounded-xl overflow-hidden ${STATUT_STYLES[candidat.statut]}`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/agents/${candidat.agentId}`}
              className="font-semibold text-gray-900 text-sm hover:text-blue-600 hover:underline"
            >
              {candidat.nom} {candidat.prenom}
            </Link>
            {candidat.agentReserve && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Réserve</span>
            )}
            {candidat.surJsZ && /^FO/i.test(candidat.codeJsZOrigine ?? "") && (
              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold" title={`Prévu sur JS FO : ${candidat.codeJsZOrigine}`}>
                JS FO
              </span>
            )}
            {candidat.surJsZ && !/^FO/i.test(candidat.codeJsZOrigine ?? "") && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded" title={`Prévu sur JS Z : ${candidat.codeJsZOrigine}`}>
                JS Z
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">{candidat.matricule}</p>
        </div>

        <div className="text-right">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUT_BADGE[candidat.statut]}`}>
            {STATUT_LABEL[candidat.statut]}
          </span>
          <p className="text-xs text-gray-500 mt-1">Score {candidat.scorePertinence}/100</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1 bg-gray-100 mx-4">
        <div
          className={`h-full rounded-full ${
            candidat.statut === "DIRECT" ? "bg-green-500" :
            candidat.statut === "VIGILANCE" ? "bg-yellow-400" : "bg-red-400"
          }`}
          style={{ width: `${candidat.scorePertinence}%` }}
        />
      </div>

      {/* Motif principal */}
      <div className="px-4 pt-2 pb-3">
        <p className="text-xs text-gray-600">{candidat.motifPrincipal}</p>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="bg-white/60 rounded p-1.5">
            <p className="text-gray-600 text-xs">Repos dispo</p>
            <p className="font-semibold text-gray-700 text-xs">
              {detail.reposJournalierDisponible !== null
                ? minutesToTime(detail.reposJournalierDisponible)
                : "N/A"}
            </p>
          </div>
          <div className="bg-white/60 rounded p-1.5">
            <p className="text-gray-600 text-xs">GPT</p>
            <p className="font-semibold text-gray-700 text-xs">
              {detail.gptActuel}/{detail.gptMax}j
            </p>
          </div>
          <div className="bg-white/60 rounded p-1.5">
            <p className="text-gray-600 text-xs">Conflits</p>
            <p className={`font-semibold text-xs ${candidat.nbConflits > 0 ? "text-orange-600" : "text-green-600"}`}>
              {candidat.nbConflits}
            </p>
          </div>
        </div>

        {/* Info JS FO / JS Z sans cascade */}
        {candidat.surJsZ && candidat.nbConflits === 0 && (
          <div className={`mt-2 text-xs px-2 py-1 rounded ${
            /^FO/i.test(candidat.codeJsZOrigine ?? "")
              ? "bg-orange-50 text-orange-700"
              : "bg-purple-50 text-purple-700"
          }`}>
            {/^FO/i.test(candidat.codeJsZOrigine ?? "")
              ? `Mobilisable depuis une JS FO (${candidat.codeJsZOrigine}) — aucune cascade nécessaire`
              : `Mobilisable depuis une JS Z (${candidat.codeJsZOrigine}) — aucune cascade nécessaire`
            }
          </div>
        )}

        {/* Points de vigilance GPT */}
        {(detail.pointsVigilance ?? []).length > 0 && (
          <div className="mt-2 space-y-1">
            {(detail.pointsVigilance ?? []).map((pv, i) => (
              <div key={i} className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 px-2 py-1 rounded flex items-start gap-1.5">
                <span className="shrink-0">⚠️</span>
                <span>{pv}</span>
              </div>
            ))}
          </div>
        )}

        {/* Conflits induits */}
        {candidat.conflitsInduits.length > 0 && (
          <div className="mt-2 space-y-1">
            {candidat.conflitsInduits.slice(0, 2).map((c, i) => (
              <div key={i} className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded">
                ⚠ {c.description}
              </div>
            ))}
          </div>
        )}

        {/* Bouton détails */}
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-blue-600 hover:text-blue-800 mt-2 font-medium"
        >
          {open ? "Masquer les détails ↑" : "Voir les détails ↓"}
        </button>
      </div>

      {/* Détails calculs */}
      {open && (
        <div className="border-t border-white/50 px-4 py-3 bg-white/40 space-y-3">
          {/* Règles respectées */}
          {detail.respectees.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 mb-1">Règles respectées</p>
              <div className="space-y-1">
                {detail.respectees.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <span className="text-green-500 shrink-0">✓</span>
                    <span className="text-gray-600">{r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Violations */}
          {detail.violations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">Violations</p>
              <div className="space-y-1.5">
                {detail.violations.map((v, i) => (
                  <div key={i} className="text-xs bg-red-50 border border-red-100 rounded p-2">
                    <p className="font-semibold text-red-800">{v.regle}</p>
                    <p className="text-red-700">{v.description}</p>
                    {v.valeur !== undefined && (
                      <p className="text-red-500 mt-0.5">
                        Valeur: <strong>{v.valeur}</strong>
                        {v.limite !== undefined && <> · Limite: <strong>{v.limite}</strong></>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
