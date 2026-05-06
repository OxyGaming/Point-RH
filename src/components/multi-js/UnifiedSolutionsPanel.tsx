"use client";

/**
 * Panneau d'affichage du solveur unifié — onglet "Solveur unifié (expérimental)"
 * dans MultiJsResultsPanel. Activé uniquement si FEATURE_UNIFIED_PRIMARY=1
 * côté serveur (le scenario.unifiedReport est alors présent).
 *
 * Règles d'affichage :
 *  - Solutions OK / VIGILANCE en zone principale (= recommandations).
 *  - Solutions DECONSEILLEE en zone repliée "Alternatives avancées" — JAMAIS
 *    affichées comme recommandation principale.
 *  - Si une séquence forcée a été testée, son résultat (possible / impossible
 *    + raison) est affiché en bas dans la zone "Séquences terrain testées".
 */

import { useState } from "react";
import type {
  UnifiedReportUI,
  UnifiedJsAnalyseUI,
  UnifiedSolutionUI,
} from "@/types/multi-js-simulation";

// ─── Badges niveau de risque ─────────────────────────────────────────────────

function RisqueBadge({ niveau }: { niveau: UnifiedSolutionUI["niveauRisque"] }) {
  const styles: Record<UnifiedSolutionUI["niveauRisque"], { label: string; classes: string }> = {
    OK: { label: "OK", classes: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    VIGILANCE: { label: "Vigilance", classes: "bg-amber-100 text-amber-700 border-amber-200" },
    DECONSEILLEE: {
      label: "Déconseillée",
      classes: "bg-orange-100 text-orange-700 border-orange-300",
    },
    INCOMPLETE: { label: "Incomplète", classes: "bg-red-100 text-red-700 border-red-200" },
  };
  const s = styles[niveau];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${s.classes}`}
    >
      {s.label}
    </span>
  );
}

// ─── Une étape de chaîne avec détails RH (disclosure imbriqué) ───────────────

function StepItem({
  step,
  niveauLabel,
}: {
  step: UnifiedSolutionUI["chaine"][number];
  niveauLabel: string;
}) {
  const [openDetail, setOpenDetail] = useState(false);
  // Garde-fou compatibilité : un payload "ancien format" sans metrics doit
  // pouvoir s'afficher en dégradé (juste l'en-tête, pas le détail).
  const m = step.metrics ?? null;
  const sb = step.scoreBreakdown ?? null;
  const hasDetail = m !== null && sb !== null;
  const margeReposLabel = !m || m.margeReposMin === null
    ? "—"
    : `${m.margeReposMin >= 0 ? "+" : ""}${m.margeReposMin}min`;
  const reposColor = m && m.margeReposMin !== null && m.margeReposMin < 0
    ? "text-red-600 font-semibold"
    : "text-slate-700";
  return (
    <div className="rounded-md border border-slate-100">
      <button
        type="button"
        onClick={() => setOpenDetail((o) => !o)}
        className="w-full flex items-baseline gap-2 px-2 py-1 text-left hover:bg-slate-50"
      >
        <span className="text-slate-400 text-[10px] shrink-0 w-12 tabular-nums">
          {niveauLabel}
        </span>
        <span className="font-medium text-slate-700">
          {step.agentNom} {step.agentPrenom}
        </span>
        {step.agentReserve && (
          <span className="text-[9px] bg-blue-50 text-blue-700 px-1 rounded font-medium">RES</span>
        )}
        <span className="text-slate-500">sur {step.jsCode ?? "?"}</span>
        <span className="text-slate-400 text-[10px]">
          {step.jsDate} {step.jsHoraires}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          step.statut === "DIRECT" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}>
          {step.statut === "DIRECT" ? "Direct" : "Vigilance"}
        </span>
        <span className="text-[10px] text-slate-500 tabular-nums">{step.score}/100</span>
        {step.consequenceType !== "RACINE" && (
          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
            {step.consequenceType.replace("INDUCED_", "").replace("HORAIRE_CONFLICT", "horaire")}
          </span>
        )}
        <span className="ml-auto text-slate-400 text-[10px]">{openDetail ? "▾" : "▸"}</span>
      </button>
      {openDetail && hasDetail && m && sb && (
        <div className="px-3 pb-2 pt-0.5 text-[10px] text-slate-600 space-y-2 border-t border-slate-100">
          {/* Description précise de la conséquence */}
          {step.consequenceDescription && (
            <div className="bg-slate-50 px-2 py-1.5 rounded border border-slate-100">
              <p className="text-[10px] font-semibold text-slate-700">Conséquence</p>
              <p className="text-[10px] text-slate-600">{step.consequenceDescription}</p>
            </div>
          )}
          {/* Métriques RH */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div>
              <span className="text-slate-400">Repos disponible : </span>
              <span className={reposColor}>
                {m.reposDisponibleMin === null ? "—" : `${m.reposDisponibleMin}min`}
              </span>
              {m.reposRequisMin > 0 && (
                <span className="text-slate-400"> / requis {m.reposRequisMin}min</span>
              )}
            </div>
            <div>
              <span className="text-slate-400">Marge repos : </span>
              <span className={reposColor}>{margeReposLabel}</span>
            </div>
            <div>
              <span className="text-slate-400">GPT : </span>
              <span className={m.gptActuel >= m.gptMax ? "text-red-600 font-semibold" : "text-slate-700"}>
                {m.gptActuel}/{m.gptMax}
              </span>
            </div>
            <div>
              <span className="text-slate-400">TE 48h cumul : </span>
              <span className="text-slate-700">{m.teCumule48hMin}min</span>
            </div>
            <div>
              <span className="text-slate-400">Violations RH : </span>
              <span className={m.nbViolations > 0 ? "text-red-600" : "text-slate-700"}>
                {m.nbViolations}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Conséquences : </span>
              <span className={m.nbConflitsInduits > 0 ? "text-amber-700" : "text-slate-700"}>
                {m.nbConflitsInduits}
              </span>
            </div>
          </div>
          {/* Décomposition du score */}
          <div className="pt-1 border-t border-slate-100">
            <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">Score métier</p>
            <p className="text-[10px] text-slate-600 font-mono">
              {sb.base}
              {sb.penaliteViolations > 0 && <> − {sb.penaliteViolations}<sub className="text-slate-400">viol</sub></>}
              {sb.penaliteConflits > 0 && <> − {sb.penaliteConflits}<sub className="text-slate-400">conséq</sub></>}
              {sb.bonusReserve > 0 && <> + {sb.bonusReserve}<sub className="text-slate-400">rés</sub></>}
              {sb.bonusJsZ > 0 && <> + {sb.bonusJsZ}<sub className="text-slate-400">JS Z</sub></>}
              {sb.penaliteMargeRepos > 0 && <> − {sb.penaliteMargeRepos}<sub className="text-slate-400">marge</sub></>}
              {sb.penaliteGpt > 0 && <> − {sb.penaliteGpt}<sub className="text-slate-400">GPT</sub></>}
              <> = </>
              <span className="font-semibold">{sb.total}</span>
            </p>
          </div>
          {/* Motif principal si vigilance */}
          {step.motifPrincipal && (
            <div className="pt-1 border-t border-slate-100">
              <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">Motif</p>
              <p className="text-[10px] text-amber-700">{step.motifPrincipal}</p>
            </div>
          )}
          {/* Habilitations */}
          {step.prefixesJs.length > 0 && (
            <div className="pt-1 border-t border-slate-100">
              <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">Habilitations préfixe</p>
              <p className="text-[10px] text-slate-600 font-mono">{step.prefixesJs.join(", ")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Une solution unifiée (chaîne aplatie) ───────────────────────────────────

function SolutionItem({ sol, rang }: { sol: UnifiedSolutionUI; rang: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-500">#{rang}</span>
          <span className="font-semibold text-slate-800">
            {sol.n1Nom} {sol.n1Prenom}
          </span>
          <span className="text-slate-400">profondeur {sol.profondeur}</span>
          <RisqueBadge niveau={sol.niveauRisque} />
        </span>
        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
      </button>
      {/* Phrase "Pourquoi ce rang" — toujours visible si présente */}
      {sol.resumePenalites && (
        <p className="mt-1 text-[10px] text-slate-500 italic">
          {sol.resumePenalites}
        </p>
      )}
      {open && (
        <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-100">
          {sol.chaine.map((step, i) => (
            <StepItem
              key={i}
              step={step}
              niveauLabel={`niv. ${sol.chaine.length - i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bloc par JS ─────────────────────────────────────────────────────────────

function JsBlock({ js }: { js: UnifiedJsAnalyseUI }) {
  // Séparer les solutions par niveau de risque pour l'affichage
  const solsRecommandees = js.solutions.filter(
    (s) => s.niveauRisque === "OK" || s.niveauRisque === "VIGILANCE"
  );
  const solsDeconseillees = js.solutions.filter((s) => s.niveauRisque === "DECONSEILLEE");
  const solsIncompletes = js.solutions.filter((s) => s.niveauRisque === "INCOMPLETE");

  const [showDeconseillees, setShowDeconseillees] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {js.jsCode ?? "?"} <span className="text-slate-500 font-normal">{js.jsDate} {js.jsHoraires}</span>
          </p>
          <p className="text-[11px] text-slate-500">
            Legacy : {js.legacyAgentRetenu ?? "non couvert"}
            {js.legacyStatut ? ` (${js.legacyStatut})` : ""}
          </p>
        </div>
        <span className="text-[11px] text-slate-500">
          {js.solutions.length} solution{js.solutions.length > 1 ? "s" : ""} · budget {js.budgetConsomme}
        </span>
      </div>

      {js.raisonSiVide && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
          {js.raisonSiVide}
        </div>
      )}

      {/* Solutions recommandées (OK + VIGILANCE) */}
      {solsRecommandees.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            Recommandations ({solsRecommandees.length})
          </p>
          {solsRecommandees.map((s, i) => (
            <SolutionItem key={i} sol={s} rang={i + 1} />
          ))}
        </div>
      )}

      {/* Alternatives DECONSEILLEE — repliées par défaut */}
      {solsDeconseillees.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDeconseillees((o) => !o)}
            className="w-full flex items-center justify-between text-left text-[11px] font-semibold text-orange-700 hover:text-orange-800"
          >
            <span>
              Alternatives avancées — déconseillées ({solsDeconseillees.length})
            </span>
            <span>{showDeconseillees ? "▾" : "▸"}</span>
          </button>
          {showDeconseillees && (
            <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-orange-200">
              {solsDeconseillees.map((s, i) => (
                <SolutionItem key={i} sol={s} rang={solsRecommandees.length + i + 1} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incomplètes */}
      {solsIncompletes.length > 0 && (
        <div className="pt-1 text-[11px] text-red-700">
          ⚠ {solsIncompletes.length} solution(s) incomplète(s) — non exploitable(s).
        </div>
      )}
    </div>
  );
}

// ─── Test de séquence forcée ─────────────────────────────────────────────────

function SequenceForceeBlock({
  result,
}: {
  result: NonNullable<UnifiedReportUI["sequenceForceeResultat"]>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">
            Séquence terrain testée
          </p>
          <p className="text-sm font-medium text-indigo-900 mt-0.5">
            {result.synthese}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
            result.possible
              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
              : "bg-red-100 text-red-700 border-red-200"
          }`}
        >
          {result.possible ? "POSSIBLE" : "IMPOSSIBLE"}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-[11px]">
          {result.trace.map((t, i) => (
            <div
              key={i}
              className={`rounded-md px-2.5 py-1.5 border ${
                t.faisable
                  ? "bg-white border-emerald-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <p className="font-medium text-slate-800">
                Étape {t.numero + 1} : {t.agentNom}
                {t.besoinCode ? ` sur ${t.besoinCode}` : ""}
                {t.besoinHoraires ? ` ${t.besoinHoraires}` : ""}
              </p>
              <p
                className={`text-[10px] mt-0.5 ${
                  t.faisable ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {t.faisable
                  ? `→ FAISABLE (statut=${t.statut})`
                  : `→ ÉCHEC : ${t.raisonEchec}`}
              </p>
              {t.consequences.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-0.5">
                  conséquences : {t.consequences.map((c) => `${c.type}@${c.code ?? "?"} ${c.date}`).join(" + ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panneau principal ───────────────────────────────────────────────────────

interface UnifiedSolutionsPanelProps {
  report: UnifiedReportUI;
}

export default function UnifiedSolutionsPanel({ report }: UnifiedSolutionsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Bandeau expérimental */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <p className="font-semibold">
          Solveur unifié — vue expérimentale
        </p>
        <p className="mt-0.5 text-blue-700">
          Ces solutions proviennent d'un nouveau moteur de cascade en validation. Le legacy reste la
          référence — comparez les deux avant d'appliquer.
        </p>
      </div>

      {/* Agrégat */}
      <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
        <span><strong>{report.agregat.nbN1Match}</strong> match N1 ↔ legacy</span>
        <span><strong>{report.agregat.nbUnifiedSeul}</strong> unified seul</span>
        <span><strong>{report.agregat.nbLegacySeul}</strong> legacy seul</span>
        {report.agregat.nbSequenceCibleTrouvee > 0 && (
          <span className="text-emerald-700">
            <strong>{report.agregat.nbSequenceCibleTrouvee}</strong> séquence(s) cible(s) trouvée(s)
          </span>
        )}
        <span className="text-slate-400">budget {report.agregat.budgetTotal}</span>
      </div>

      {/* Blocs par JS */}
      <div className="space-y-3">
        {report.jsAnalyses.map((js) => (
          <JsBlock key={js.jsId} js={js} />
        ))}
      </div>

      {/* Séquence forcée */}
      {report.sequenceForceeResultat && (
        <SequenceForceeBlock result={report.sequenceForceeResultat} />
      )}
    </div>
  );
}
