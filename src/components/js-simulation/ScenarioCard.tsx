"use client";

import { useState } from "react";
import type { Scenario, ModificationPlanning } from "@/types/js-simulation";
import AgentLink from "@/components/ui/AgentLink";
import DetailRegles from "@/components/js-simulation/DetailRegles";
import {
  IconLock,
  IconAlertTriangle,
  IconBan,
  IconInfo,
  IconChevronDown,
  IconChevronUp,
} from "@/components/icons/Icons";

// ─── Styles ──────────────────────────────────────────────────────────────────

const CONFORMITE_STYLES = {
  CONFORME:     { badge: "bg-green-100 text-green-800",  bar: "bg-green-500",  label: "Conforme",     dot: "bg-green-500" },
  VIGILANCE:    { badge: "bg-yellow-100 text-yellow-800", bar: "bg-yellow-400", label: "Vigilance",    dot: "bg-yellow-400" },
  NON_CONFORME: { badge: "bg-red-100 text-red-800",      bar: "bg-red-400",    label: "Non conforme", dot: "bg-red-400" },
};

const SEVERITY_STYLES: Record<string, string> = {
  INFO:          "bg-blue-50 text-blue-700 border-blue-200",
  AVERTISSEMENT: "bg-yellow-50 text-yellow-700 border-yellow-200",
  BLOQUANT:      "bg-red-50 text-red-700 border-red-200",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extrait la date et les horaires depuis une description de modification. */
function parseJsInfo(desc: string): { date: string | null; horaires: string | null } {
  const full = desc.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}[–\-]\d{2}:\d{2})/);
  if (full) {
    const d = new Date(full[1] + "T00:00:00");
    const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return { date, horaires: full[2].replace("-", "–") };
  }
  const du = desc.match(/du\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})[–\-](\d{2}:\d{2})/);
  if (du) {
    const d = new Date(du[1] + "T00:00:00");
    const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return { date, horaires: `${du[2]}–${du[3]}` };
  }
  const t = desc.match(/(\d{2}:\d{2})[–\-](\d{2}:\d{2})/);
  if (t) return { date: null, horaires: `${t[1]}–${t[2]}` };
  return { date: null, horaires: null };
}

/** Réordonne les modifications pour afficher la chaîne dans l'ordre logique :
 *  principal → niv.1 → niv.2 → … (cascadeResolver stocke en deepest-first). */
function sortedChain(modifications: ModificationPlanning[]): ModificationPlanning[] {
  if (modifications.length <= 1) return modifications;
  const [principal, ...cascade] = modifications;
  return [principal, ...cascade.reverse()];
}

// ─── Nœud de chaîne ───────────────────────────────────────────────────────────

interface ChainNodeProps {
  mod: ModificationPlanning;
  level: number;
  prevAgentNom?: string;    // nom de l'agent du niveau précédent (pour afficher "JS de X")
  nextMod?: ModificationPlanning | null; // modification suivante dans la chaîne (pour afficher "libérée vers")
  jsCibleHoraires?: string;
}

function formatDateCourt(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function JsBadge({ date, heureDebut, heureFin, codeJs, variant = "neutral" }: {
  date?: string | null; heureDebut: string; heureFin: string; codeJs?: string | null;
  variant?: "imprevue" | "reprise" | "neutre" | "neutral";
}) {
  const bg =
    variant === "imprevue" ? "bg-blue-600 text-white" :
    variant === "reprise"  ? "bg-slate-100 text-slate-700 border border-slate-300" :
    "bg-white text-gray-700 border border-gray-300";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded ${bg}`}>
      {date && <span className="font-normal opacity-75">{formatDateCourt(date)}</span>}
      {heureDebut}–{heureFin}
      {codeJs && <span className="font-normal opacity-60 ml-0.5">· {codeJs}</span>}
    </span>
  );
}

function ChainNode({ mod, level, prevAgentNom, nextMod, jsCibleHoraires }: ChainNodeProps) {
  const nodeColor =
    level === 0
      ? mod.conforme ? "border-green-300 bg-green-50" : "border-yellow-300 bg-yellow-50"
      : mod.conforme ? "border-blue-200 bg-blue-50"   : "border-orange-200 bg-orange-50";

  const badgeColor =
    level === 0
      ? mod.conforme ? "bg-green-100 text-green-800"  : "bg-yellow-100 text-yellow-800"
      : mod.conforme ? "bg-blue-100 text-blue-800"    : "bg-orange-100 text-orange-800";

  const levelLabel = level === 0 ? "Agent principal" : `Cascade niv. ${level}`;

  return (
    <div className="flex flex-col items-center">
      {/* Connecteur */}
      {level > 0 && (
        <div className="flex flex-col items-center w-full">
          <div className="w-0.5 h-3 bg-gray-300" />
          <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-medium my-0.5">
            <span className="flex-1 h-px bg-gray-200" />
            <span>couvre la JS libérée</span>
            <span className="flex-1 h-px bg-gray-200" />
          </div>
        </div>
      )}

      {/* Carte */}
      <div className={`border-2 rounded-xl p-3 w-full ${nodeColor}`}>
        <div className="flex items-start justify-between mb-2 gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
            {levelLabel}
          </span>
          {mod.violations.length > 0 && (
            <span className="text-[10px] text-yellow-700 font-medium shrink-0 inline-flex items-center gap-1">
              <IconAlertTriangle className="w-3 h-3" aria-hidden="true" />
              {mod.violations.length} violation{mod.violations.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Agent */}
        <AgentLink
          agentId={mod.agentId}
          nom={mod.agentNom}
          prenom={mod.agentPrenom}
          className="font-bold text-sm text-gray-900 hover:text-blue-600 block"
        />

        <div className="mt-2 space-y-1.5">
          {/* → JS qu'il prend */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide w-16 shrink-0">Prend</span>
            {level === 0 && jsCibleHoraires ? (
              <>
                <JsBadge heureDebut={jsCibleHoraires.split("–")[0]} heureFin={jsCibleHoraires.split("–")[1]} variant="imprevue" />
                {mod.heureDebutEffective && mod.heureDebutEffective !== jsCibleHoraires.split("–")[0] && (
                  <span className="text-[10px] text-blue-600 font-mono font-semibold">
                    → {mod.heureDebutEffective}–{mod.heureFinEffective} <span className="font-normal text-blue-400">(avec trajet)</span>
                  </span>
                )}
              </>
            ) : mod.jsReprise ? (
              <>
                <JsBadge
                  date={mod.jsReprise.date}
                  heureDebut={mod.jsReprise.heureDebut}
                  heureFin={mod.jsReprise.heureFin}
                  codeJs={mod.jsReprise.codeJs}
                  variant="reprise"
                />
                {mod.heureDebutEffective && mod.heureDebutEffective !== mod.jsReprise.heureDebut && (
                  <span className="text-[10px] text-blue-600 font-mono font-semibold">
                    → {mod.heureDebutEffective}–{mod.heureFinEffective} <span className="font-normal text-blue-400">(avec trajet)</span>
                  </span>
                )}
              </>
            ) : null}
            {level > 0 && prevAgentNom && (
              <span className="text-[10px] text-gray-400">
                (JS de <span className="font-medium text-gray-600">{prevAgentNom}</span>)
              </span>
            )}
          </div>

          {/* Motif vigilance / violation */}
          {!mod.conforme && mod.motif && (
            <div className="mt-1 flex items-start gap-1.5 bg-yellow-100 border border-yellow-200 rounded-lg px-2 py-1.5">
              <IconAlertTriangle className="w-3 h-3 text-yellow-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-[11px] text-yellow-800 leading-tight">{mod.motif}</span>
            </div>
          )}
          {!mod.conforme && !mod.motif && mod.violations.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {mod.violations.map((v, i) => (
                <div key={i} className="flex items-start gap-1.5 bg-yellow-100 border border-yellow-200 rounded-lg px-2 py-1.5">
                  <IconAlertTriangle className="w-3 h-3 text-yellow-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="text-[11px] text-yellow-800 leading-tight">{v.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* → Sa JS libérée vers le niveau suivant */}
          {nextMod?.jsReprise && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-400 uppercase tracking-wide w-16 shrink-0">Libère</span>
              <JsBadge
                date={nextMod.jsReprise.date}
                heureDebut={nextMod.jsReprise.heureDebut}
                heureFin={nextMod.jsReprise.heureFin}
                codeJs={nextMod.jsReprise.codeJs}
                variant="neutral"
              />
              <span className="text-[10px] text-gray-400">
                → prise par <span className="font-medium text-gray-600">{nextMod.agentNom} {nextMod.agentPrenom}</span>
              </span>
            </div>
          )}

          {/* Détail des calculs (repos, amplitude, GPT, TE…) */}
          {mod.detail && <DetailRegles detail={mod.detail} />}
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ScenarioCard({ scenario, index }: { scenario: Scenario; index: number }) {
  const [open, setOpen] = useState(false);
  const cf = CONFORMITE_STYLES[scenario.conformiteFinale];
  const chain = sortedChain(scenario.modifications);
  const hasCascade = scenario.profondeurCascade > 0;
  const hasDetails = scenario.impactsCascade.length > 0 || scenario.modifications.some(m => m.violations.length > 0);

  // Horaires de la JS cible (du nœud principal = première modification)
  const jsCibleHoraires = (() => {
    const m = scenario.modifications[0];
    if (!m) return undefined;
    const info = parseJsInfo(m.description);
    return info.horaires ?? undefined;
  })();

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* ── Header ── */}
      <div className="px-4 py-3 bg-gray-50 flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">{scenario.titre}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${cf.badge}`}>
              {cf.label}
            </span>
            {hasCascade && (
              <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded font-medium">
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2h3v3H2zM7 7h3v3H7zM5 3.5h1.5a1 1 0 011 1V7" strokeLinecap="round"/>
                </svg>
                Cascade {scenario.profondeurCascade} niv.
              </span>
            )}
            <span className="text-xs text-gray-400">
              {scenario.nbModifications} modification{scenario.nbModifications > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-gray-800">{scenario.score}</p>
          <p className="text-xs text-gray-400">/ 100</p>
        </div>
      </div>

      {/* ── Score bar ── */}
      <div className="h-1 bg-gray-100">
        <div className={`h-full ${cf.bar} transition-all`} style={{ width: `${scenario.score}%` }} />
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* ── Justification ── */}
        <p className="text-xs text-gray-500 italic">{scenario.justification}</p>

        {/* ── Figeage ── */}
        {scenario.jsSourceFigee && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
            <IconLock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-semibold text-amber-700">JS figée — DERNIER RECOURS</p>
              <p className="text-[11px] text-amber-800 mt-0.5">{scenario.jsSourceFigee.justification}</p>
            </div>
          </div>
        )}

        {/* ── Chaîne de cascade ── */}
        {chain.length === 1 ? (
          /* Solution directe — pas de cascade */
          <div className="rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                Solution directe
              </span>
            </div>
            <AgentLink
              agentId={chain[0].agentId}
              nom={chain[0].agentNom}
              prenom={chain[0].agentPrenom}
              className="font-bold text-sm text-gray-900 hover:text-blue-600 block"
            />
            <p className="text-xs text-gray-500 mt-0.5">Disponible — prend directement l'imprévu</p>
            {jsCibleHoraires && (
              <span className="mt-1.5 inline-block text-[11px] font-mono font-semibold bg-blue-600 text-white px-2 py-0.5 rounded">
                {jsCibleHoraires}
              </span>
            )}
            {chain[0].detail && <DetailRegles detail={chain[0].detail} />}
          </div>
        ) : (
          /* Cascade : visualisation en chaîne verticale */
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Chaîne de réorganisation
            </p>

            {/* JS imprevue — point de départ */}
            <div className="flex flex-col items-center mb-0">
              <div className="border-2 border-blue-500 bg-blue-600 rounded-xl px-4 py-2.5 text-center w-full">
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-wide">JS Imprevue</p>
                <p className="text-white font-bold text-sm font-mono mt-0.5">
                  {jsCibleHoraires ?? "—"}
                </p>
              </div>

              {/* Flèche vers le premier agent */}
              <div className="flex flex-col items-center my-1">
                <div className="w-0.5 h-3 bg-blue-400" />
                <svg className="w-3 h-3 text-blue-400 -mt-px" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 10L1 4h10L6 10z"/>
                </svg>
              </div>
            </div>

            {/* Nœuds de la chaîne */}
            <div className="space-y-0">
              {chain.map((mod, i) => (
                <ChainNode
                  key={mod.agentId + i}
                  mod={mod}
                  level={i}
                  prevAgentNom={i > 0 ? `${chain[i - 1].agentNom} ${chain[i - 1].agentPrenom}` : undefined}
                  nextMod={i < chain.length - 1 ? chain[i + 1] : null}
                  jsCibleHoraires={i === 0 ? jsCibleHoraires : undefined}
                />
              ))}
            </div>

            {chain.length > 1 && (
              <div className="mt-3 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cf.dot}`} />
                <p className="text-[11px] text-gray-500">
                  {chain.length - 1} agent{chain.length > 2 ? "s" : ""} mobilisé{chain.length > 2 ? "s" : ""} en cascade pour libérer la chaîne
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Toggle détails ── */}
        {hasDetails && (
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            {open ? (
              <><IconChevronUp className="w-3 h-3" aria-hidden="true" /> Masquer les détails</>
            ) : (
              <><IconChevronDown className="w-3 h-3" aria-hidden="true" /> Violations &amp; impacts en cascade</>
            )}
          </button>
        )}
      </div>

      {/* ── Détails (violations + impacts) ── */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50">
          {/* Violations par modification */}
          {scenario.modifications.some(m => m.violations.length > 0) && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Violations</p>
              <div className="space-y-1.5">
                {scenario.modifications.filter(m => m.violations.length > 0).map((m, i) => (
                  <div key={i} className="text-xs bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    <p className="font-semibold text-yellow-800 mb-1">{m.agentNom} {m.agentPrenom}</p>
                    {m.violations.map((v, j) => (
                      <p key={j} className="text-yellow-700 inline-flex items-center gap-1">
                        <IconAlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {v.description}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impacts en cascade */}
          {scenario.impactsCascade.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Impacts détectés</p>
              <div className="space-y-1.5">
                {scenario.impactsCascade.map((impact, i) => (
                  <div key={i} className={`text-xs border rounded-lg px-3 py-2 ${SEVERITY_STYLES[impact.severity]}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {impact.severity === "BLOQUANT" ? (
                        <IconBan className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : impact.severity === "AVERTISSEMENT" ? (
                        <IconAlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <IconInfo className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      {impact.agentNom && (
                        <AgentLink agentId={impact.agentId} nom={impact.agentNom} prenom={impact.agentPrenom} className="font-semibold" />
                      )}
                      <span className="text-opacity-70">— {impact.date}</span>
                    </div>
                    <p>{impact.description}</p>
                    <p className="opacity-60 mt-0.5 text-[10px]">Règle : {impact.regle}</p>
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
