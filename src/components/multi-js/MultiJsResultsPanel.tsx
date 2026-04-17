"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  MultiJsSimulationResultat,
  MultiJsScenario,
  AffectationJs,
  AffectationsParAgent,
  JsOriginaleAgent,
  ExclusionsParJs,
} from "@/types/multi-js-simulation";
import type { ModificationPlanning, ImpactCascade } from "@/types/js-simulation";
import AgentLink from "@/components/ui/AgentLink";
import DetailReglesShared from "@/components/js-simulation/DetailRegles";
import {
  IconLock,
  IconShield,
  IconUsers,
  IconLink as IconLinkIcon,
  IconCheckCircle,
  IconBan,
  IconAlertTriangle,
  IconInfo,
  IconClipboard,
  IconXCircle,
} from "@/components/icons/Icons";

interface Props {
  resultat: MultiJsSimulationResultat;
}

type Tab = "resume" | "affectations" | "agents" | "non-couvertes" | "conflits" | "exclusions";

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-100 text-emerald-700"
      : score >= 50
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-bold", color)}>
      {score}/100
    </span>
  );
}

function RobustesseBadge({ robustesse }: { robustesse: string }) {
  const map: Record<string, string> = {
    HAUTE: "bg-emerald-100 text-emerald-700",
    MOYENNE: "bg-amber-100 text-amber-700",
    FAIBLE: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    HAUTE: "Robuste",
    MOYENNE: "Moyenne",
    FAIBLE: "Fragile",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold", map[robustesse] ?? "bg-slate-100 text-slate-600")}>
      {labels[robustesse] ?? robustesse}
    </span>
  );
}

function StatutBadge({ statut }: { statut: "DIRECT" | "VIGILANCE" | "NON_CONFORME" | "CONFORME" }) {
  const map: Record<string, string> = {
    DIRECT: "bg-emerald-100 text-emerald-700",
    CONFORME: "bg-emerald-100 text-emerald-700",
    VIGILANCE: "bg-amber-100 text-amber-700",
    NON_CONFORME: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    DIRECT: "Direct",
    CONFORME: "Conforme",
    VIGILANCE: "Vigilance",
    NON_CONFORME: "Non conforme",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold", map[statut] ?? "bg-slate-100")}>
      {labels[statut] ?? statut}
    </span>
  );
}

function SeveriteBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    INFO: "bg-blue-100 text-blue-700",
    AVERTISSEMENT: "bg-amber-100 text-amber-700",
    BLOQUANT: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", map[severity] ?? "bg-slate-100")}>
      {severity}
    </span>
  );
}

function FlexibiliteBadge({ flexibilite }: { flexibilite: string }) {
  if (flexibilite === "DERNIER_RECOURS") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
        DERNIER RECOURS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
      OBLIGATOIRE
    </span>
  );
}

function FigeageBadge({ justification }: { justification: string }) {
  return (
    <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1">
      <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1 mb-0.5">
        <IconLock className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>JS figée — DERNIER RECOURS</span>
      </p>
      <p className="text-[10px] text-amber-800">{justification}</p>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold",
      scope === "reserve_only"
        ? "bg-violet-100 text-violet-700"
        : "bg-blue-100 text-blue-700"
    )}>
      {scope === "reserve_only" ? (
        <><IconShield className="w-3 h-3" aria-hidden="true" /> Réserve</>
      ) : (
        <><IconUsers className="w-3 h-3" aria-hidden="true" /> Tous agents</>
      )}
    </span>
  );
}

// ─── Détail des règles : composant partagé importé ───────────────────────────
const DetailRegles = DetailReglesShared;

// ─── Situation initiale de l'agent ────────────────────────────────────────────

function JsOriginaleBadge({ jsOrigine }: { jsOrigine: JsOriginaleAgent }) {
  const config: Record<string, { label: React.ReactNode; color: string }> = {
    LIBRE:   { label: <span className="font-bold">○</span>,                                                 color: "text-slate-400"  },
    RESERVE: { label: <IconShield className="w-3 h-3" aria-hidden="true" />,                                 color: "text-violet-600" },
    JS_Z:    { label: <span className="font-bold">Z</span>,                                                 color: "text-sky-600"    },
    JS:      { label: <IconClipboard className="w-3 h-3" aria-hidden="true" />,                              color: "text-orange-600" },
  };
  const { label, color } = config[jsOrigine.type] ?? { label: <span className="font-bold">?</span>, color: "text-slate-400" };

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px]", color)}>
      {label}
      <span>{jsOrigine.description}</span>
    </span>
  );
}

// ─── Chaîne de cascade ────────────────────────────────────────────────────────

function CascadeChain({
  modifications,
  impacts,
}: {
  modifications: ModificationPlanning[];
  impacts: ImpactCascade[];
}) {
  if (modifications.length === 0 && impacts.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-2 space-y-1">
      {/* En-tête */}
      <p className="text-[10px] font-semibold text-teal-700 flex items-center gap-1">
        <IconLinkIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>
          Cascade résolue — {modifications.length} agent{modifications.length > 1 ? "s" : ""} mobilisé{modifications.length > 1 ? "s" : ""}
        </span>
      </p>

      {/* Étapes de la chaîne */}
      {modifications.map((m, i) => (
        <p key={i} className="text-[10px] text-teal-800 flex items-start gap-1 pl-2">
          <span className="shrink-0 text-teal-400">{"→".repeat(i + 1)}</span>
          <span>
            <AgentLink agentId={m.agentId} nom={m.agentNom} prenom={m.agentPrenom} className="font-semibold" />{" "}
            {m.description}
            {!m.conforme && (
              <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 rounded">vigilance</span>
            )}
          </span>
        </p>
      ))}

      {/* Impacts résiduels */}
      {impacts.length > 0 && (
        <div className="pt-1 border-t border-teal-200 space-y-0.5">
          {impacts.map((imp, i) => (
            <p key={i} className="text-[10px] text-amber-700 flex items-start gap-1 pl-2">
              <span className="shrink-0">⚠</span>
              <span>
                <AgentLink agentId={imp.agentId} nom={imp.agentNom} prenom={imp.agentPrenom} className="font-semibold" />{" "}
                {imp.description}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Résumé d'un scénario ─────────────────────────────────────────────────────

function ScenarioResume({ scenario }: { scenario: MultiJsScenario }) {
  const pct = scenario.tauxCouverture;
  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-slate-800">{scenario.titre}</p>
          <p className="text-xs text-slate-500 mt-0.5">{scenario.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ScopeBadge scope={scenario.candidateScope} />
          <ScoreBadge score={scenario.score} />
          <RobustesseBadge robustesse={scenario.robustesse} />
        </div>
      </div>

      {/* Barre de couverture */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
            Taux de couverture
          </span>
          <span className="text-xs font-bold text-slate-700">{pct}%</span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct === 100
                ? "bg-emerald-500"
                : pct >= 70
                ? "bg-amber-400"
                : "bg-red-400"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "JS sélectionnées", val: scenario.nbJsCouvertes + scenario.nbJsNonCouvertes },
          { label: "JS couvertes", val: scenario.nbJsCouvertes, color: "text-emerald-600" },
          { label: "JS non couvertes", val: scenario.nbJsNonCouvertes, color: scenario.nbJsNonCouvertes > 0 ? "text-red-600" : "text-slate-600" },
          { label: "Agents mobilisés", val: scenario.nbAgentsMobilises, color: "text-blue-600" },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white rounded-lg p-2.5 border border-slate-100 text-center">
            <p className={cn("text-xl font-bold", color ?? "text-slate-800")}>{val}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Cascade — affiché uniquement si au moins un conflit a été tenté */}
      {(scenario.nbCascadesResolues > 0 || scenario.nbCascadesNonResolues > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold text-teal-700">{scenario.nbCascadesResolues}</p>
            <p className="text-[10px] text-teal-600 mt-0.5 inline-flex items-center gap-1 justify-center w-full">
              <IconLinkIcon className="w-3 h-3" aria-hidden="true" />
              Conflits résolus en cascade
            </p>
          </div>
          <div className={cn(
            "rounded-lg border p-2.5 text-center",
            scenario.nbCascadesNonResolues > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-slate-50 border-slate-100"
          )}>
            <p className={cn(
              "text-xl font-bold",
              scenario.nbCascadesNonResolues > 0 ? "text-amber-700" : "text-slate-400"
            )}>
              {scenario.nbCascadesNonResolues}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 inline-flex items-center gap-1 justify-center w-full">
              <IconAlertTriangle className="w-3 h-3" aria-hidden="true" />
              Conflits non résolus
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tableau affectations ─────────────────────────────────────────────────────

function AffectationsTable({ affectations }: { affectations: AffectationJs[] }) {
  if (affectations.length === 0) {
    return <p className="text-sm text-slate-400 italic py-4 text-center">Aucune affectation dans ce scénario.</p>;
  }
  return (
    <div className="space-y-1.5">
      {affectations.map((aff) => {
        const hasIssue = aff.statut === "VIGILANCE" || aff.conflitsInduits.length > 0;
        return (
          <div
            key={aff.jsId}
            className={cn(
              "rounded-lg border px-3 py-2",
              hasIssue ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white"
            )}
          >
            {/* Ligne principale */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[10px] text-slate-500 min-w-[60px]">
                {new Date(aff.jsCible.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
              </span>
              <span className="font-mono text-xs text-slate-600">
                {aff.jsCible.heureDebutJsType ?? aff.jsCible.heureDebut}–{aff.jsCible.heureFinJsType ?? aff.jsCible.heureFin}
              </span>
              <span className="font-mono font-bold text-xs text-slate-800 min-w-[70px]">
                {aff.jsCible.codeJs ?? "—"}
              </span>
              <span className="flex-1 text-xs font-medium text-slate-700">
                <AgentLink agentId={aff.agentId} nom={aff.agentNom} prenom={aff.agentPrenom} />
                {aff.agentReserve && (
                  <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 py-0.5 rounded font-semibold">
                    RES
                  </span>
                )}
              </span>
              <StatutBadge statut={aff.statut} />
              <div className="flex items-center gap-1">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      aff.score >= 80 ? "bg-emerald-400" : aff.score >= 50 ? "bg-amber-400" : "bg-red-400"
                    )}
                    style={{ width: `${aff.score}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">{aff.score}</span>
              </div>
            </div>

            {/* Situation initiale de l'agent */}
            <div className="mt-1 pl-1">
              <JsOriginaleBadge jsOrigine={aff.jsOriginaleAgent} />
            </div>

            {/* Motif vigilance */}
            {aff.statut === "VIGILANCE" && aff.justification && (
              <p className="mt-1.5 text-[10px] text-amber-700 flex items-start gap-1">
                <span className="shrink-0">⚠</span>
                <span>{aff.justification}</span>
              </p>
            )}

            {/* Conflits induits */}
            {aff.conflitsInduits.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {aff.conflitsInduits.map((c, i) => (
                  <p key={i} className="text-[10px] text-amber-700 flex items-start gap-1">
                    <span className="shrink-0">↳</span>
                    <span>{c.description}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Résolution en cascade */}
            <CascadeChain
              modifications={aff.cascadeModifications}
              impacts={aff.cascadeImpacts}
            />

            {/* Figeage JS source */}
            {aff.jsSourceFigee && (
              <FigeageBadge justification={aff.jsSourceFigee.justification} />
            )}

            {/* Détail des règles */}
            {aff.detail && <DetailRegles detail={aff.detail} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Affectations par agent ───────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AffectationsParAgent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-blue-600">
              {agent.agentPrenom?.[0]}{agent.agentNom?.[0]}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              <AgentLink agentId={agent.agentId} nom={agent.agentNom} prenom={agent.agentPrenom} />
              {agent.agentReserve && (
                <span className="ml-2 text-[9px] bg-violet-100 text-violet-600 px-1 py-0.5 rounded font-semibold">
                  RÉSERVE
                </span>
              )}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">{agent.agentMatricule}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">{agent.nbJs} JS</span>
          <StatutBadge statut={agent.conformiteGlobale} />
          <span className="text-slate-400 text-sm">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
          {agent.jsAssignees.map((aff, i) => {
            const hasIssue = aff.statut === "VIGILANCE" || aff.conflitsInduits.length > 0;
            return (
              <div
                key={aff.jsId}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs",
                  hasIssue ? "bg-amber-50 border border-amber-200" : "bg-white border border-slate-100"
                )}
              >
                {/* Ligne principale */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400 w-4">{i + 1}</span>
                  <span className="font-mono text-slate-600 min-w-[70px]">
                    {new Date(aff.jsCible.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="font-mono text-slate-500">{aff.jsCible.heureDebutJsType ?? aff.jsCible.heureDebut}–{aff.jsCible.heureFinJsType ?? aff.jsCible.heureFin}</span>
                  <span className="font-bold font-mono text-slate-800">{aff.jsCible.codeJs ?? "—"}</span>
                  <StatutBadge statut={aff.statut} />
                </div>

                {/* Situation initiale de l'agent */}
                <div className="mt-1 pl-1">
                  <JsOriginaleBadge jsOrigine={aff.jsOriginaleAgent} />
                </div>

                {/* Motif vigilance RH */}
                {aff.statut === "VIGILANCE" && aff.justification && (
                  <p className="mt-1.5 text-[10px] text-amber-700 flex items-start gap-1">
                    <span className="shrink-0">⚠</span>
                    <span>{aff.justification}</span>
                  </p>
                )}

                {/* Conflits induits */}
                {aff.conflitsInduits.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {aff.conflitsInduits.map((c, j) => (
                      <p key={j} className="text-[10px] text-amber-700 flex items-start gap-1">
                        <span className="shrink-0">↳</span>
                        <span>{c.description}</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Résolution en cascade */}
                <CascadeChain
                  modifications={aff.cascadeModifications}
                  impacts={aff.cascadeImpacts}
                />

                {/* Figeage JS source */}
                {aff.jsSourceFigee && (
                  <FigeageBadge justification={aff.jsSourceFigee.justification} />
                )}

                {/* Détail des règles */}
                {aff.detail && <DetailRegles detail={aff.detail} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Codes de règles → libellés lisibles ──────────────────────────────────────

const REGLE_LABELS: Record<string, string> = {
  REPOS_JOURNALIER:         "Repos journalier insuffisant",
  AMPLITUDE:                "Amplitude dépassée",
  PREFIXE_JS:               "Préfixe JS non autorisé",
  NUIT_HABILITATION:        "Non habilité nuit",
  DEPLACEMENT_HABILITATION: "Non habilité déplacement",
  GPT_MAX:                  "GPT maximum atteint",
  TE_GPT_48H:               "Travail effectif GPT 48h dépassé",
  TRAVAIL_EFFECTIF:         "Travail effectif dépassé",
  SCOPE_RESERVE:            "Hors périmètre réserve",
  ABSENCE_INAPTITUDE:       "Absence / inaptitude",
  CONFLIT_HORAIRE:          "Déjà en service",
  REGLE_METIER:             "Règle métier",
};

// ─── Panel exclusions ─────────────────────────────────────────────────────────

function ExclusionsPanel({ exclusionsParJs }: { exclusionsParJs: ExclusionsParJs[] }) {
  const [openJs, setOpenJs] = useState<string | null>(null);

  const avecExclusions = exclusionsParJs.filter((e) => e.exclusions.length > 0);

  if (avecExclusions.length === 0) {
    return (
      <div className="py-6 text-center">
        <IconCheckCircle className="w-7 h-7 mx-auto mb-1 text-emerald-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-emerald-600">
          Aucune exclusion enregistrée pour ce scénario
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-3">
        Raisons pour lesquelles chaque agent a été écarté par JS.
        Les agents affectés n'apparaissent pas ici.
      </p>

      {avecExclusions.map((jsExcl) => {
        const isOpen = openJs === jsExcl.jsId;

        // Regrouper par regle
        const parRegle = jsExcl.exclusions.reduce<Record<string, typeof jsExcl.exclusions>>(
          (acc, excl) => {
            (acc[excl.regle] ??= []).push(excl);
            return acc;
          },
          {}
        );

        return (
          <div key={jsExcl.jsId} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* En-tête JS */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              onClick={() => setOpenJs(isOpen ? null : jsExcl.jsId)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-sm text-slate-800">
                  {jsExcl.codeJs ?? "JS sans code"}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(jsExcl.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                  })}{" "}
                  · {jsExcl.heureDebut}–{jsExcl.heureFin}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                  {jsExcl.exclusions.length} exclu{jsExcl.exclusions.length > 1 ? "s" : ""}
                </span>
                <span className="text-slate-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Détail exclusions */}
            {isOpen && (
              <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-3">
                {Object.entries(parRegle).map(([regle, agents]) => (
                  <div key={regle}>
                    {/* En-tête raison */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        {regle}
                      </span>
                      <span className="text-xs text-slate-500">
                        {REGLE_LABELS[regle] ?? regle}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {agents.length} agent{agents.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Liste des agents */}
                    <div className="space-y-1 pl-2 border-l-2 border-slate-100">
                      {agents.map((excl) => (
                        <div key={excl.agentId} className="flex items-start gap-2 text-xs">
                          <IconBan className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-700">
                              {excl.agentNom} {excl.agentPrenom}
                            </span>
                            <span className="text-slate-400 font-mono ml-1.5 text-[10px]">
                              {excl.agentMatricule}
                            </span>
                            <p className="text-slate-500 text-[10px] mt-0.5">{excl.raison}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

type ScenarioKey = "reserveDirect" | "reserveFigeage" | "tousDirect" | "tousFigeage";

function ScenarioIcon({ cfgKey }: { cfgKey: ScenarioKey }) {
  const shieldCls = "w-3.5 h-3.5";
  const usersCls = "w-3.5 h-3.5";
  const lockCls = "w-3 h-3 -ml-0.5";
  switch (cfgKey) {
    case "reserveDirect":  return <IconShield className={shieldCls} aria-hidden="true" />;
    case "reserveFigeage": return (<span className="inline-flex items-center"><IconShield className={shieldCls} aria-hidden="true" /><IconLock className={lockCls} aria-hidden="true" /></span>);
    case "tousDirect":     return <IconUsers className={usersCls} aria-hidden="true" />;
    case "tousFigeage":    return (<span className="inline-flex items-center"><IconUsers className={usersCls} aria-hidden="true" /><IconLock className={lockCls} aria-hidden="true" /></span>);
  }
}

const SCENARIO_CONFIG: {
  key: ScenarioKey;
  label: string;
  figeage: boolean;
  scope: "reserve_only" | "all_agents";
}[] = [
  { key: "reserveDirect",  label: "Réserve — Direct",      figeage: false, scope: "reserve_only" },
  { key: "reserveFigeage", label: "Réserve + Figeage",     figeage: true,  scope: "reserve_only" },
  { key: "tousDirect",     label: "Tous agents — Direct",  figeage: false, scope: "all_agents"   },
  { key: "tousFigeage",    label: "Tous agents + Figeage", figeage: true,  scope: "all_agents"   },
];

export default function MultiJsResultsPanel({ resultat }: Props) {
  const [activeKey, setActiveKey] = useState<ScenarioKey>("reserveDirect");
  const [activeTab, setActiveTab] = useState<Tab>("resume");

  const scenarioByKey: Record<ScenarioKey, typeof resultat.scenarioReserveOnly> = {
    reserveDirect:  resultat.scenarioReserveOnly,
    reserveFigeage: resultat.scenarioReserveOnlyFigeage,
    tousDirect:     resultat.scenarioTousAgents,
    tousFigeage:    resultat.scenarioTousAgentsFigeage,
  };

  const scenario = scenarioByKey[activeKey];
  if (!scenario) return null;

  const nbExclusions = scenario.exclusionsParJs.reduce(
    (sum, e) => sum + e.exclusions.length, 0
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "resume", label: "Résumé" },
    { id: "affectations", label: "Affectations", count: scenario.affectations.length },
    { id: "agents", label: "Par agent", count: scenario.affectationsParAgent.length },
    { id: "non-couvertes", label: "Non couvertes", count: scenario.jsNonCouvertes.length },
    { id: "conflits", label: "Conflits", count: scenario.conflitsDetectes.length },
    { id: "exclusions", label: "Exclusions", count: nbExclusions },
  ];

  return (
    <div className="space-y-4">
      {/* ─── Sélecteur 4 scénarios ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SCENARIO_CONFIG.map((cfg) => {
          const s = scenarioByKey[cfg.key];
          const isActive = activeKey === cfg.key;
          if (!s) return null;
          const coverageColor =
            s.tauxCouverture === 100
              ? "text-emerald-600"
              : s.tauxCouverture >= 70
              ? "text-amber-600"
              : "text-red-600";
          return (
            <button
              key={cfg.key}
              type="button"
              onClick={() => { setActiveKey(cfg.key); setActiveTab("resume"); }}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                isActive
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <ScenarioIcon cfgKey={cfg.key} />
                {cfg.figeage && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                    CASCADE
                  </span>
                )}
              </div>
              <p className={cn("text-xl font-bold", coverageColor)}>
                {s.tauxCouverture}%
              </p>
              <p className="text-[10px] font-semibold text-slate-600 leading-tight mt-0.5">
                {cfg.label}
              </p>
              <p className="text-[9px] text-slate-400 mt-1">
                {s.nbJsCouvertes}/{s.nbJsCouvertes + s.nbJsNonCouvertes} JS · {s.nbAgentsMobilises} agents
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <RobustesseBadge robustesse={s.robustesse} />
                <ScoreBadge score={s.score} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Onglets ──────────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors whitespace-nowrap border-b-2",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold",
                    tab.id === "non-couvertes" && tab.count > 0
                      ? "bg-red-100 text-red-600"
                      : tab.id === "conflits" && tab.count > 0
                      ? "bg-amber-100 text-amber-600"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Résumé */}
          {activeTab === "resume" && <ScenarioResume scenario={scenario} />}

          {/* Affectations */}
          {activeTab === "affectations" && (
            <AffectationsTable affectations={scenario.affectations} />
          )}

          {/* Par agent */}
          {activeTab === "agents" && (
            <div className="space-y-2">
              {scenario.affectationsParAgent.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4 text-center">
                  Aucun agent mobilisé dans ce scénario.
                </p>
              ) : (
                scenario.affectationsParAgent.map((agent) => (
                  <AgentCard key={agent.agentId} agent={agent} />
                ))
              )}
            </div>
          )}

          {/* JS non couvertes */}
          {activeTab === "non-couvertes" && (
            <div className="space-y-2">
              {scenario.jsNonCouvertes.length === 0 ? (
                <div className="py-6 text-center">
                  <IconCheckCircle className="w-7 h-7 mx-auto mb-1 text-emerald-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-emerald-600">
                    Toutes les JS sont couvertes
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-red-600 font-semibold mb-2">
                    {scenario.jsNonCouvertes.length} JS impossible(s) à couvrir dans ce scénario
                  </p>
                  {scenario.jsNonCouvertes.map((js) => (
                    <div
                      key={js.planningLigneId}
                      className={cn(
                        "flex items-center gap-3 p-3 border rounded-lg",
                        js.flexibilite === "DERNIER_RECOURS"
                          ? "bg-amber-50 border-amber-200"
                          : "bg-red-50 border-red-200"
                      )}
                    >
                      {js.flexibilite === "DERNIER_RECOURS" ? (
                        <IconAlertTriangle className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
                      ) : (
                        <IconBan className="w-5 h-5 text-red-500 shrink-0" aria-hidden="true" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-slate-800">
                            {js.codeJs ?? "JS sans code"}
                          </p>
                          <FlexibiliteBadge flexibilite={js.flexibilite} />
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {new Date(js.date).toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                          })}{" "}
                          · {js.heureDebut}–{js.heureFin}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Agent prévu : <AgentLink agentId={js.agentId} nom={js.agentNom} prenom={js.agentPrenom} />
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Exclusions */}
          {activeTab === "exclusions" && (
            <ExclusionsPanel exclusionsParJs={scenario.exclusionsParJs} />
          )}

          {/* Conflits */}
          {activeTab === "conflits" && (
            <div className="space-y-2">
              {scenario.conflitsDetectes.length === 0 ? (
                <div className="py-6 text-center">
                  <IconCheckCircle className="w-7 h-7 mx-auto mb-1 text-emerald-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-emerald-600">
                    Aucun conflit détecté
                  </p>
                </div>
              ) : (
                scenario.conflitsDetectes.map((c, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border",
                      c.severity === "BLOQUANT"
                        ? "bg-red-50 border-red-200"
                        : c.severity === "AVERTISSEMENT"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-blue-50 border-blue-200"
                    )}
                  >
                    {c.severity === "BLOQUANT" ? (
                      <IconXCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
                    ) : c.severity === "AVERTISSEMENT" ? (
                      <IconAlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                      <IconInfo className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <SeveriteBadge severity={c.severity} />
                        <span className="text-[10px] text-slate-500 font-mono">{c.type}</span>
                      </div>
                      <p className="text-xs text-slate-700">{c.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
