"use client";

import { useState } from "react";
import Link from "next/link";
import { minutesToTime } from "@/lib/utils";
import type { CandidatResult } from "@/types/js-simulation";
import DetailRegles from "@/components/js-simulation/DetailRegles";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
} from "@/components/icons/Icons";

// ─── Statuts ─────────────────────────────────────────────────────────────────

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
                <IconAlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{pv}</span>
              </div>
            ))}
          </div>
        )}

        {/* Conflits induits */}
        {candidat.conflitsInduits.length > 0 && (
          <div className="mt-2 space-y-1">
            {candidat.conflitsInduits.slice(0, 2).map((c, i) => (
              <div key={i} className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded inline-flex items-center gap-1.5 w-full">
                <IconAlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                {c.description}
              </div>
            ))}
          </div>
        )}

        {/* Bouton détails */}
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-blue-600 hover:text-blue-800 mt-2 font-medium inline-flex items-center gap-1"
        >
          {open ? (
            <>Masquer les détails <IconChevronUp className="w-3 h-3" aria-hidden="true" /></>
          ) : (
            <>Voir les détails <IconChevronDown className="w-3 h-3" aria-hidden="true" /></>
          )}
        </button>
      </div>

      {/* Détails calculs */}
      {open && (
        <div className="border-t border-white/50 px-4 py-3 bg-white/40 space-y-3">

          {/* ── Détail des règles ── */}
          <DetailRegles detail={detail} />

          {/* ── Analyse déplacement (LPA-based) ── */}
          {detail.deplacementInfo && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Analyse déplacement</p>
              <div className="bg-white/70 rounded-lg p-2.5 space-y-1 text-xs">
                {detail.deplacementInfo.indeterminable ? (
                  <>
                    {detail.deplacementInfo.jsTypeCode && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">JS de référence</span>
                        <span className="font-mono font-semibold text-gray-700">
                          {detail.deplacementInfo.jsTypeCode}
                          {detail.deplacementInfo.heureDebutReference && (
                            <span className="text-gray-500 font-normal ml-1">
                              {detail.deplacementInfo.heureDebutReference}→{detail.deplacementInfo.heureFinReference}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <p className="text-amber-700 font-medium">
                      ⚠ Indéterminable — {detail.deplacementInfo.raisonIndeterminable}
                    </p>
                  </>
                ) : (
                  <>
                    {/* JS de référence */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">JS de référence</span>
                      <span className="font-mono font-semibold text-gray-800">
                        {detail.deplacementInfo.jsTypeCode}
                        <span className="text-gray-500 font-normal ml-1">
                          {detail.deplacementInfo.heureDebutReference}→{detail.deplacementInfo.heureFinReference}
                        </span>
                      </span>
                    </div>
                    {detail.deplacementInfo.jsTypeLibelle && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Type</span>
                        <span className="text-gray-600">{detail.deplacementInfo.jsTypeLibelle}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-100 pt-1 mt-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">JS dans la LPA</span>
                      <span className={`font-semibold ${detail.deplacementInfo.jsDansLpa ? "text-green-700" : "text-orange-700"}`}>
                        {detail.deplacementInfo.jsDansLpa ? "Oui" : "Non"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">En déplacement</span>
                      <span className={`font-semibold ${detail.deplacementInfo.estEnDeplacement ? "text-blue-700" : "text-gray-600"}`}>
                        {detail.deplacementInfo.estEnDeplacement ? "Oui" : "Non"}
                      </span>
                    </div>
                    {detail.deplacementInfo.estEnDeplacement && (
                      <>
                        <div className="border-t border-gray-100 pt-1 mt-1" />
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Trajet aller</span>
                          <span className="font-mono text-gray-700">
                            {detail.deplacementInfo.tempsTrajetAllerMin > 0
                              ? `−${detail.deplacementInfo.tempsTrajetAllerMin} min`
                              : "0 min"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Trajet retour</span>
                          <span className="font-mono text-gray-700">
                            {detail.deplacementInfo.tempsTrajetRetourMin > 0
                              ? `+${detail.deplacementInfo.tempsTrajetRetourMin} min`
                              : "0 min"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">JS effective finale</span>
                          <span className="font-mono text-blue-700 font-semibold">
                            {detail.deplacementInfo.heureDebutEffective}→{detail.deplacementInfo.heureFinEffective}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Amplitude effective</span>
                          <span className="font-mono text-blue-700">
                            {minutesToTime(detail.deplacementInfo.amplitudeEffectiveMin)}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="border-t border-gray-100 pt-1 mt-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Régime RH</span>
                      <span className="text-gray-700 capitalize">{detail.deplacementInfo.regimeRH}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Décomposition du score */}
          {candidat.scoreBreakdown && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">
                Détail du score ({candidat.scorePertinence}/100)
              </p>
              <div className="bg-white/70 rounded-lg p-2.5 space-y-1 text-xs">
                {/* Base */}
                <div className="flex justify-between text-gray-500">
                  <span>Base</span>
                  <span className="font-mono">+{candidat.scoreBreakdown.base}</span>
                </div>
                {/* Violations */}
                {candidat.scoreBreakdown.penaliteViolations > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Violations ({detail.violations.length}×25)</span>
                    <span className="font-mono">−{candidat.scoreBreakdown.penaliteViolations}</span>
                  </div>
                )}
                {/* Conflits induits */}
                {candidat.scoreBreakdown.penaliteConflits > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Conflits induits ({candidat.nbConflits}×15)</span>
                    <span className="font-mono">−{candidat.scoreBreakdown.penaliteConflits}</span>
                  </div>
                )}
                {/* Bonus réserve */}
                {candidat.scoreBreakdown.bonusReserve > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Bonus agent de réserve</span>
                    <span className="font-mono">+{candidat.scoreBreakdown.bonusReserve}</span>
                  </div>
                )}
                {/* Bonus JS Z */}
                {candidat.scoreBreakdown.bonusJsZ > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Bonus JS Z (réaffectation directe)</span>
                    <span className="font-mono">+{candidat.scoreBreakdown.bonusJsZ}</span>
                  </div>
                )}
                {/* Pénalité marge repos */}
                {candidat.scoreBreakdown.penaliteMargeRepos > 0 && (
                  <div className="flex justify-between text-yellow-700">
                    <span>Marge repos &lt; 2h</span>
                    <span className="font-mono">−{candidat.scoreBreakdown.penaliteMargeRepos}</span>
                  </div>
                )}
                {/* Pénalité GPT */}
                {candidat.scoreBreakdown.penaliteGpt > 0 && (
                  <div className="flex justify-between text-yellow-700">
                    <span>GPT chargé (&gt;80%)</span>
                    <span className="font-mono">−{candidat.scoreBreakdown.penaliteGpt}</span>
                  </div>
                )}
                {/* Total */}
                <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between font-semibold text-gray-800">
                  <span>Total</span>
                  <span className="font-mono">{candidat.scoreBreakdown.total}/100</span>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
