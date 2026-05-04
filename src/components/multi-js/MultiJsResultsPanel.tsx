"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  MultiJsSimulationResultat,
  MultiJsScenario,
  AffectationJs,
  AffectationsParAgent,
  AlternativesParJs,
  JsOriginaleAgent,
  ExclusionsParJs,
  TypeSolutionAlternative,
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

type Tab = "resume" | "affectations" | "agents" | "non-couvertes" | "conflits" | "exclusions" | "alternatives" | "cascade";

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

/**
 * Détecte si un maillon correspond à un agent libre (fin de chaîne).
 * Dans ce cas, jsLiberee pointe sur la JS reprise (cas non-cascadant)
 * et on l'affiche différemment.
 */
function maillonEtaitLibre(
  m: NonNullable<AffectationJs["chaineRemplacement"]>["maillons"][number],
  i: number,
  total: number
): boolean {
  return (
    m.jsLiberee.codeJs === m.jsRepriseCodeJs &&
    m.jsLiberee.planningLigneId !== "" &&
    i === total - 1
  );
}

function ChaineRemplacementBadge({
  chaine,
}: {
  chaine: NonNullable<AffectationJs["chaineRemplacement"]>;
}) {
  const summary = `Chaîne de remplacement — ${
    chaine.profondeur === 1 ? "1 maillon" : `${chaine.profondeur} maillons`
  }`;
  return (
    <details className="mt-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-1 group">
      <summary className="text-[10px] font-semibold text-sky-700 flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <IconLinkIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span>{summary}</span>
        <span className="ml-1 text-sky-400 group-open:rotate-90 transition-transform">▸</span>
      </summary>
      <ol className="space-y-1 mt-1.5">
        {chaine.maillons.map((m, i) => {
          const etaitLibre = maillonEtaitLibre(m, i, chaine.maillons.length);
          return (
            <li key={i} className="text-[10px] text-sky-900 flex items-start gap-1.5">
              <span className="font-mono text-sky-500 shrink-0 mt-0.5">{i + 1}.</span>
              <span>
                <span className="font-semibold">
                  {m.agentPrenom} {m.agentNom}
                </span>{" "}
                {etaitLibre ? (
                  <>
                    (libre) reprend{" "}
                    <span className="font-mono">{m.jsRepriseCodeJs ?? "—"}</span>
                  </>
                ) : (
                  <>
                    libère{" "}
                    <span className="font-mono">{m.jsLiberee.codeJs ?? "—"}</span>
                    {" "}({m.jsLiberee.heureDebut}–{m.jsLiberee.heureFin}) pour reprendre{" "}
                    <span className="font-mono">{m.jsRepriseCodeJs ?? "—"}</span>
                  </>
                )}
                {m.statut === "VIGILANCE" && (
                  <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                    vigilance
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
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

            {/* Chaîne de remplacement (mode Cascade) */}
            {aff.chaineRemplacement && (
              <ChaineRemplacementBadge chaine={aff.chaineRemplacement} />
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

                {/* Chaîne de remplacement (mode Cascade) */}
                {aff.chaineRemplacement && (
                  <ChaineRemplacementBadge chaine={aff.chaineRemplacement} />
                )}

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

// ─── Onglet Cascade — vue opérationnelle (qui appeler dans quel ordre) ──────

function CascadeTab({ affectations }: { affectations: AffectationJs[] }) {
  const avecChaine = affectations.filter((a) => a.chaineRemplacement !== null);
  if (avecChaine.length === 0) return null;

  // Liste plate de tous les appels à passer, dans l'ordre opérationnel :
  // niveau 0 (agent retenu) puis maillons par profondeur croissante.
  type Appel = {
    ordre: number;
    niveau: number;
    agentNom: string;
    agentPrenom: string;
    agentMatricule: string;
    agentReserve: boolean;
    jsCode: string | null;
    jsHoraires: string;
    jsDate: string;
    motif: string;
    statut: "DIRECT" | "VIGILANCE";
  };

  const appels: Appel[] = [];
  let ordreGlobal = 1;
  for (const aff of avecChaine) {
    appels.push({
      ordre: ordreGlobal++,
      niveau: 0,
      agentNom: aff.agentNom,
      agentPrenom: aff.agentPrenom,
      agentMatricule: aff.agentMatricule,
      agentReserve: aff.agentReserve,
      jsCode: aff.jsCible.codeJs,
      jsHoraires: `${aff.jsCible.heureDebutJsType ?? aff.jsCible.heureDebut}–${aff.jsCible.heureFinJsType ?? aff.jsCible.heureFin}`,
      jsDate: aff.jsCible.date,
      motif: `Couvre la JS imprévue (en remplacement de ${aff.jsCible.agentPrenom} ${aff.jsCible.agentNom})`,
      statut: aff.statut,
    });
    for (let i = 0; i < aff.chaineRemplacement!.maillons.length; i++) {
      const m = aff.chaineRemplacement!.maillons[i];
      const etaitLibre = maillonEtaitLibre(m, i, aff.chaineRemplacement!.maillons.length);
      appels.push({
        ordre: ordreGlobal++,
        niveau: m.niveau,
        agentNom: m.agentNom,
        agentPrenom: m.agentPrenom,
        agentMatricule: m.agentMatricule,
        agentReserve: false, // info non propagée dans MaillonChaine
        jsCode: m.jsRepriseCodeJs,
        jsHoraires: `${m.jsLiberee.heureDebut}–${m.jsLiberee.heureFin}`,
        jsDate: m.jsLiberee.date,
        motif: etaitLibre
          ? `Libre — reprend la JS pour combler la cascade`
          : `Reprend ${m.jsRepriseCodeJs ?? "la JS"} (libère sa propre ${m.jsLiberee.codeJs ?? "JS"})`,
        statut: m.statut,
      });
    }
  }

  const totalAgents = appels.length;
  const totalCibles = avecChaine.length;
  const profondeurMax = Math.max(...avecChaine.map((a) => a.chaineRemplacement!.profondeur));

  return (
    <div className="space-y-4">
      {/* Vue d'ensemble */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <IconLinkIcon className="w-4 h-4 text-sky-600" aria-hidden="true" />
          <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">
            Plan d'appels — chaînes de remplacement
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-sky-700">{totalCibles}</p>
            <p className="text-[10px] text-slate-600">JS couverte{totalCibles > 1 ? "s" : ""} via cascade</p>
          </div>
          <div>
            <p className="text-lg font-bold text-sky-700">{totalAgents}</p>
            <p className="text-[10px] text-slate-600">agent{totalAgents > 1 ? "s" : ""} à mobiliser</p>
          </div>
          <div>
            <p className="text-lg font-bold text-sky-700">{profondeurMax}</p>
            <p className="text-[10px] text-slate-600">profondeur max</p>
          </div>
        </div>
      </div>

      {/* Liste téléphone */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-1">
          Appels à passer dans l'ordre
        </p>
        {appels.map((a) => (
          <div
            key={a.ordre}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2",
              a.niveau === 0
                ? "border-blue-200 bg-blue-50"
                : "border-slate-200 bg-white"
            )}
          >
            <div className="flex flex-col items-center shrink-0 w-8 pt-0.5">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                a.niveau === 0
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 text-slate-600"
              )}>
                {a.ordre}
              </span>
              {a.niveau > 0 && (
                <span className="text-[8px] text-slate-400 mt-0.5 font-mono">N{a.niveau}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-xs font-bold text-slate-800">
                  <AgentLink agentId="" nom={a.agentNom} prenom={a.agentPrenom} />
                </p>
                {a.agentReserve && (
                  <span className="text-[9px] bg-violet-100 text-violet-600 px-1 py-0.5 rounded font-semibold">
                    RÉSERVE
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-mono">{a.agentMatricule}</span>
                {a.statut === "VIGILANCE" && (
                  <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-semibold">
                    VIGILANCE
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-700 flex-wrap">
                <span className="font-mono font-semibold">{a.jsCode ?? "—"}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{a.jsDate}</span>
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-500">{a.jsHoraires}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{a.motif}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-400 italic px-1">
        Les agents <strong>N0</strong> couvrent directement la JS imprévue.
        Les agents <strong>N1+</strong> sont déplacés en cascade pour combler les trous induits.
      </p>
    </div>
  );
}

// ─── Alternatives non retenues ───────────────────────────────────────────────

const TYPE_SOLUTION_CONFIG: Record<TypeSolutionAlternative, { label: string; color: string; dot: string }> = {
  DIRECT:    { label: "Valide — Direct",          color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  CASCADE:   { label: "Valide — Cascade requise", color: "bg-teal-100 text-teal-700",       dot: "bg-teal-400"    },
  CHAINE:    { label: "Via chaîne de remplacement", color: "bg-sky-100 text-sky-700",       dot: "bg-sky-400"     },
  VIGILANCE: { label: "Valide — Vigilance",       color: "bg-amber-100 text-amber-700",     dot: "bg-amber-400"   },
  FIGEAGE:   { label: "Via figeage",              color: "bg-orange-100 text-orange-700",   dot: "bg-orange-400"  },
};

const GROUPES_SOLUTION: { key: TypeSolutionAlternative; titre: string; description: string }[] = [
  { key: "DIRECT",    titre: "Valides directes",          description: "Agents conformes sans contrainte supplémentaire" },
  { key: "CASCADE",   titre: "Valides via cascade",       description: "Agents conformes mais dont l'affectation génère un conflit résolvable" },
  { key: "CHAINE",    titre: "Via chaîne de remplacement", description: "Agents libérés via une cascade de déplacements (mode Cascade)" },
  { key: "VIGILANCE", titre: "Valides avec vigilance",    description: "Agents conformes avec avertissement RH (amplitude, TE…)" },
  { key: "FIGEAGE",   titre: "Possibles via figeage",     description: "Agents libérables en figeant leur JS source DERNIER_RECOURS" },
];

function AlternativesPanel({ alternativesParJs }: { alternativesParJs: AlternativesParJs[] }) {
  const [openJs, setOpenJs] = useState<string | null>(null);

  const avecAlternatives = alternativesParJs.filter((a) => a.alternatives.length > 0);

  if (avecAlternatives.length === 0) {
    return (
      <div className="py-6 text-center">
        <IconInfo className="w-7 h-7 mx-auto mb-1 text-slate-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-500">
          Aucune alternative disponible pour ce scénario
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Soit toutes les JS n'ont qu'un seul candidat, soit aucun candidat supplémentaire n'a été évalué.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-3">
        Candidats valides évalués mais non retenus, par JS. Permet de comprendre les choix de l'algorithme et d'identifier les alternatives disponibles.
      </p>

      {alternativesParJs.map((jsAlt) => {
        const isOpen = openJs === jsAlt.jsId;
        const nbAlternatives = jsAlt.alternatives.length;

        if (nbAlternatives === 0) return null;

        // Regrouper par typeSolution
        const parType = GROUPES_SOLUTION
          .map((groupe) => ({
            ...groupe,
            agents: jsAlt.alternatives.filter((a) => a.typeSolution === groupe.key),
          }))
          .filter((g) => g.agents.length > 0);

        return (
          <div key={jsAlt.jsId} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* En-tête JS */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              onClick={() => setOpenJs(isOpen ? null : jsAlt.jsId)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-sm text-slate-800">
                  {jsAlt.codeJs ?? "JS sans code"}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(jsAlt.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  {" · "}{jsAlt.heureDebut}–{jsAlt.heureFin}
                </span>
                {jsAlt.agentAffecte && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <IconCheckCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                    Retenu : {jsAlt.agentAffecte.prenom} {jsAlt.agentAffecte.nom}
                    <span className="font-mono ml-0.5">({jsAlt.agentAffecte.score})</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                  {nbAlternatives} alternative{nbAlternatives > 1 ? "s" : ""}
                </span>
                <span className="text-slate-400 text-sm">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Détail alternatives */}
            {isOpen && (
              <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-4">
                {/* Agent retenu — rappel */}
                {jsAlt.agentAffecte && (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <IconCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    <div className="text-xs">
                      <span className="font-semibold text-emerald-700">Retenu</span>
                      <span className="text-slate-500 ml-1.5">
                        {jsAlt.agentAffecte.prenom} {jsAlt.agentAffecte.nom}
                        <span className="font-mono ml-1 text-[10px]">{jsAlt.agentAffecte.matricule}</span>
                      </span>
                      <StatutBadge statut={jsAlt.agentAffecte.statut} />
                      <span className="ml-1.5 font-bold text-emerald-700">Score {jsAlt.agentAffecte.score}</span>
                    </div>
                  </div>
                )}

                {/* Groupes de solutions */}
                {parType.map((groupe) => (
                  <div key={groupe.key}>
                    {/* En-tête groupe */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", TYPE_SOLUTION_CONFIG[groupe.key].dot)} />
                      <span className="text-xs font-semibold text-slate-700">{groupe.titre}</span>
                      <span className="text-[10px] text-slate-400">{groupe.description}</span>
                      <span className="ml-auto text-[10px] text-slate-400">
                        {groupe.agents.length} agent{groupe.agents.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Agents du groupe */}
                    <div className="space-y-1.5 pl-4 border-l-2 border-slate-100">
                      {groupe.agents.map((alt) => (
                        <div
                          key={alt.agentId}
                          className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                        >
                          {/* Ligne principale */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold flex items-center justify-center shrink-0">
                              {alt.rang}
                            </span>
                            <span className="font-semibold text-slate-700 flex-1 min-w-0">
                              <AgentLink agentId={alt.agentId} nom={alt.nom} prenom={alt.prenom} />
                              {alt.agentReserve && (
                                <span className="ml-1 text-[9px] bg-violet-100 text-violet-600 px-1 py-0.5 rounded font-semibold">
                                  RES
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">{alt.matricule}</span>
                            <StatutBadge statut={alt.statut} />
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-semibold", TYPE_SOLUTION_CONFIG[alt.typeSolution].color)}>
                              {TYPE_SOLUTION_CONFIG[alt.typeSolution].label}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">Score {alt.score}</span>
                          </div>

                          {/* Raison de non-rétention */}
                          <p className="mt-1.5 text-[10px] text-slate-500 flex items-start gap-1 pl-6">
                            <span className="shrink-0 text-slate-400">→</span>
                            <span className="italic">{alt.raisonNonRetention}</span>
                          </p>

                          {/* Conflits induits (si cascade) */}
                          {alt.conflitsInduits.length > 0 && (
                            <div className="mt-1 pl-6 space-y-0.5">
                              {alt.conflitsInduits.slice(0, 2).map((c, i) => (
                                <p key={i} className="text-[10px] text-teal-600 flex items-start gap-1">
                                  <span className="shrink-0">↳</span>
                                  <span>{c.description}</span>
                                </p>
                              ))}
                              {alt.conflitsInduits.length > 2 && (
                                <p className="text-[10px] text-slate-400 pl-3">
                                  +{alt.conflitsInduits.length - 2} autre{alt.conflitsInduits.length - 2 > 1 ? "s" : ""} conflit{alt.conflitsInduits.length - 2 > 1 ? "s" : ""}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Cascade — chaîne de résolution pré-calculée */}
                          {alt.cascadeResolution && alt.cascadeResolution.modifications.length > 0 && (
                            <div className="mt-1.5 pl-6">
                              <CascadeChain
                                modifications={alt.cascadeResolution.modifications}
                                impacts={alt.cascadeResolution.impacts}
                              />
                            </div>
                          )}
                          {alt.cascadeResolution && alt.cascadeResolution.modifications.length === 0 && (
                            <p className="mt-1 pl-6 text-[10px] text-amber-600 flex items-start gap-1">
                              <span className="shrink-0">⚠</span>
                              <span>Cascade non résoluble — aucun agent disponible pour couvrir les conflits induits</span>
                            </p>
                          )}

                          {/* Figeage */}
                          {alt.jsSourceFigee && (
                            <div className="mt-1.5 pl-6">
                              <FigeageBadge justification={alt.jsSourceFigee.justification} />
                            </div>
                          )}

                          {/* Détail des règles */}
                          {alt.detail && (
                            <div className="pl-6 mt-1">
                              <DetailRegles detail={alt.detail} />
                            </div>
                          )}
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

type ScenarioKey = "reserveDirect" | "reserveFigeage" | "tousDirect" | "tousFigeage" | "tousCascade" | "tousCascadeFigeage";

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
  { key: "reserveDirect",       label: "Réserve — Direct",                figeage: false, scope: "reserve_only" },
  { key: "reserveFigeage",      label: "Réserve + Figeage",               figeage: true,  scope: "reserve_only" },
  { key: "tousDirect",          label: "Tous agents — Direct",            figeage: false, scope: "all_agents"   },
  { key: "tousFigeage",         label: "Tous agents + Figeage",           figeage: true,  scope: "all_agents"   },
  { key: "tousCascade",         label: "Tous agents — Cascade",           figeage: false, scope: "all_agents"   },
  { key: "tousCascadeFigeage",  label: "Tous agents + Cascade + Figeage", figeage: true,  scope: "all_agents"   },
];

/**
 * Décrit en une phrase la stratégie utilisée par un scénario pour atteindre
 * son taux de couverture. Affichée sous le pourcentage pour lever l'ambiguïté
 * "comment c'est obtenu".
 */
function strategieEffective(s: MultiJsScenario): string {
  if (s.affectations.length === 0) return "aucune solution";

  const nbChaines  = s.affectations.filter((a) => a.chaineRemplacement !== null).length;
  const nbFigeages = s.affectations.filter((a) => a.jsSourceFigee !== null).length;
  const nbReserves = s.affectations.filter((a) => a.agentReserve).length;
  const nbDirect   = s.affectations.length - nbChaines - nbFigeages;

  const parts: string[] = [];
  if (nbChaines > 0) {
    const totalMaillons = s.affectations.reduce(
      (sum, a) => sum + (a.chaineRemplacement?.maillons.length ?? 0), 0
    );
    parts.push(`${nbChaines} chaîne${nbChaines > 1 ? "s" : ""} (${totalMaillons} maillon${totalMaillons > 1 ? "s" : ""})`);
  }
  if (nbFigeages > 0) {
    parts.push(`${nbFigeages} figeage${nbFigeages > 1 ? "s" : ""}`);
  }
  if (nbDirect > 0) {
    const suffixe = nbReserves > 0
      ? ` (${nbReserves} rés.)`
      : "";
    parts.push(`${nbDirect} direct${nbDirect > 1 ? "s" : ""}${suffixe}`);
  }
  return "via " + parts.join(" + ");
}

/** Mappe une clé de config vers la propriété correspondante dans le résultat. */
const KEY_TO_FIELD: Record<ScenarioKey, keyof MultiJsSimulationResultat> = {
  reserveDirect:      "scenarioReserveOnly",
  reserveFigeage:     "scenarioReserveOnlyFigeage",
  tousDirect:         "scenarioTousAgents",
  tousFigeage:        "scenarioTousAgentsFigeage",
  tousCascade:        "scenarioTousAgentsCascade",
  tousCascadeFigeage: "scenarioTousAgentsCascadeFigeage",
};

/**
 * Carte d'un scénario. Variante "compacte" pour les non-recommandés (5 autres),
 * variante "large" pour le scénario recommandé en tête.
 */
function ScenarioCard({
  cfg,
  scenario,
  isActive,
  isRecommended = false,
  variant = "compact",
  onClick,
}: {
  cfg: typeof SCENARIO_CONFIG[number];
  scenario: MultiJsScenario;
  isActive: boolean;
  isRecommended?: boolean;
  variant?: "compact" | "large";
  onClick: () => void;
}) {
  const coverageColor =
    scenario.tauxCouverture === 100
      ? "text-emerald-600"
      : scenario.tauxCouverture >= 70
      ? "text-amber-600"
      : "text-red-600";

  const isLarge = variant === "large";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border text-left transition-all relative",
        isLarge ? "p-4" : "p-3",
        isActive
          ? "border-blue-500 bg-blue-50 shadow-sm"
          : isRecommended
          ? "border-emerald-300 bg-white shadow-sm hover:border-emerald-500"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
      )}
    >
      {isRecommended && (
        <span className="absolute -top-2 left-3 inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          <IconCheckCircle className="w-3 h-3" aria-hidden="true" />
          Recommandé
        </span>
      )}
      <div className="flex items-center justify-between mb-1.5">
        <ScenarioIcon cfgKey={cfg.key} />
        <RobustesseBadge robustesse={scenario.robustesse} />
      </div>
      <p className={cn(isLarge ? "text-3xl" : "text-xl", "font-bold", coverageColor)}>
        {scenario.tauxCouverture}%
      </p>
      <p className={cn(
        "font-semibold text-slate-700 leading-tight mt-0.5",
        isLarge ? "text-sm" : "text-[10px]"
      )}>
        {cfg.label}
      </p>
      <p className={cn("text-slate-500 italic", isLarge ? "text-[11px] mt-1" : "text-[9px] mt-1")}>
        {strategieEffective(scenario)}
      </p>
      <div className={cn("flex items-center justify-between", isLarge ? "mt-2.5" : "mt-1.5")}>
        <span className="text-[9px] text-slate-400">
          {scenario.nbJsCouvertes}/{scenario.nbJsCouvertes + scenario.nbJsNonCouvertes} JS · {scenario.nbAgentsMobilises} agent{scenario.nbAgentsMobilises > 1 ? "s" : ""}
        </span>
        <ScoreBadge score={scenario.score} />
      </div>
    </button>
  );
}

export default function MultiJsResultsPanel({ resultat }: Props) {
  const scenarioByKey: Record<ScenarioKey, typeof resultat.scenarioReserveOnly> = {
    reserveDirect:       resultat.scenarioReserveOnly,
    reserveFigeage:      resultat.scenarioReserveOnlyFigeage,
    tousDirect:          resultat.scenarioTousAgents,
    tousFigeage:         resultat.scenarioTousAgentsFigeage,
    tousCascade:         resultat.scenarioTousAgentsCascade,
    tousCascadeFigeage:  resultat.scenarioTousAgentsCascadeFigeage,
  };

  // Trouver la clé du scénario recommandé (= meilleur, déjà en tête de scenarios[]).
  // Comparaison par `id` car les références peuvent être cassées par sérialisation
  // serveur→client (page demo). Si pas de meilleur, fallback sur le 1er scénario.
  const meilleurId = resultat.scenarioMeilleur?.id ?? resultat.scenarios[0]?.id;
  const recommendedKey: ScenarioKey =
    (Object.entries(KEY_TO_FIELD).find(([, field]) => {
      const sc = resultat[field] as MultiJsScenario | null | undefined;
      return sc?.id === meilleurId;
    })?.[0] as ScenarioKey | undefined) ?? "reserveDirect";

  const [activeKey, setActiveKey] = useState<ScenarioKey>(recommendedKey);
  const [activeTab, setActiveTab] = useState<Tab>("resume");
  const [showOthers, setShowOthers] = useState(false);

  const scenario = scenarioByKey[activeKey];
  if (!scenario) return null;

  const nbExclusions = scenario.exclusionsParJs.reduce(
    (sum, e) => sum + e.exclusions.length, 0
  );
  const nbAlternatives = scenario.alternativesParJs.reduce(
    (sum, a) => sum + a.alternatives.length, 0
  );

  // Onglet Cascade : visible uniquement sur les scénarios Cascade* avec au moins une chaîne.
  const affectationsAvecChaine = scenario.affectations.filter((a) => a.chaineRemplacement !== null);
  const showCascadeTab =
    (activeKey === "tousCascade" || activeKey === "tousCascadeFigeage") &&
    affectationsAvecChaine.length > 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "resume", label: "Résumé" },
    { id: "affectations", label: "Affectations", count: scenario.affectations.length },
    ...(showCascadeTab
      ? [{ id: "cascade" as Tab, label: "Cascade", count: affectationsAvecChaine.length }]
      : []),
    { id: "agents", label: "Par agent", count: scenario.affectationsParAgent.length },
    { id: "alternatives", label: "Alternatives", count: nbAlternatives },
    { id: "non-couvertes", label: "Non couvertes", count: scenario.jsNonCouvertes.length },
    { id: "conflits", label: "Conflits", count: scenario.conflitsDetectes.length },
    { id: "exclusions", label: "Exclusions", count: nbExclusions },
  ];

  // Si l'utilisateur est sur l'onglet Cascade et bascule vers un scénario sans cascade,
  // on retombe sur Résumé pour éviter un état orphelin.
  if (activeTab === "cascade" && !showCascadeTab) {
    setTimeout(() => setActiveTab("resume"), 0);
  }

  return (
    <div className="space-y-4">
      {/* ─── Scénario recommandé en grand ─────────────────────────────── */}
      {(() => {
        const recoCfg = SCENARIO_CONFIG.find((c) => c.key === recommendedKey);
        const recoScenario = scenarioByKey[recommendedKey];
        if (!recoCfg || !recoScenario) return null;
        return (
          <div className="grid sm:grid-cols-2 gap-3">
            <ScenarioCard
              cfg={recoCfg}
              scenario={recoScenario}
              isActive={activeKey === recommendedKey}
              isRecommended
              variant="large"
              onClick={() => { setActiveKey(recommendedKey); setActiveTab("resume"); }}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1.5">
              <p className="font-semibold text-slate-700 text-sm">Pourquoi ce scénario ?</p>
              <p>
                Score le plus élevé parmi les 6 stratégies évaluées. Le moteur a
                arbitré entre périmètre (réserve / tous agents) et leviers
                autorisés (figeage DERNIER_RECOURS, chaîne de remplacement).
              </p>
              <p className="text-[11px] text-slate-500 italic">
                Vous pouvez explorer les 5 autres options ci-dessous pour
                comparer.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ─── Accordéon : les 5 autres scénarios ─────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowOthers((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors"
        >
          <span>
            {showOthers ? "Masquer" : "Voir"} les 5 autres scénarios
            {activeKey !== recommendedKey && !showOthers && (
              <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                actif : {SCENARIO_CONFIG.find((c) => c.key === activeKey)?.label}
              </span>
            )}
          </span>
          <span className="text-slate-400">{showOthers ? "▴" : "▾"}</span>
        </button>
        {showOthers && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {SCENARIO_CONFIG.filter((cfg) => cfg.key !== recommendedKey).map((cfg) => {
              const s = scenarioByKey[cfg.key];
              if (!s) return null;
              return (
                <ScenarioCard
                  key={cfg.key}
                  cfg={cfg}
                  scenario={s}
                  isActive={activeKey === cfg.key}
                  variant="compact"
                  onClick={() => { setActiveKey(cfg.key); setActiveTab("resume"); }}
                />
              );
            })}
          </div>
        )}
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

          {/* Cascade — vue téléphone (uniquement si scénario Cascade* avec chaînes) */}
          {activeTab === "cascade" && (
            <CascadeTab affectations={scenario.affectations} />
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

          {/* Alternatives */}
          {activeTab === "alternatives" && (
            <AlternativesPanel alternativesParJs={scenario.alternativesParJs} />
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
