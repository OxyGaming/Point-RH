"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DetailCalcul } from "@/types/simulation";
import {
  IconMoon,
  IconClock,
  IconCalendar,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronRight,
} from "@/components/icons/Icons";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function fmtMin(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

// ─── RuleRow ──────────────────────────────────────────────────────────────────

function RuleRow({
  label,
  valeur,
  limite,
  ok,
  detail,
}: {
  label: React.ReactNode;
  valeur: string;
  limite?: string;
  ok: boolean;
  detail?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded border px-2 py-1.5", ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600 font-medium inline-flex items-center gap-1">{label}</span>
        <span className={cn("font-mono font-bold shrink-0 inline-flex items-center gap-1", ok ? "text-emerald-700" : "text-red-700")}>
          {valeur}
          {limite && <span className="font-normal text-slate-400 ml-1">/ {limite}</span>}
          {ok
            ? <IconCheck className="w-3 h-3 ml-0.5" aria-hidden="true" />
            : <IconX className="w-3 h-3 ml-0.5" aria-hidden="true" />}
        </span>
      </div>
      {detail && <div className="mt-1">{detail}</div>}
    </div>
  );
}

// ─── TeGptBreakdown ───────────────────────────────────────────────────────────

function TeGptBreakdown({ detail }: { detail: DetailCalcul }) {
  const lignes = detail.teGptLignes;
  const total = detail.teGptCumulAvant + detail.amplitudeImprevu;

  const teGptViolation = detail.violations.find((v) => v.regle === "TE_GPT_48H");
  const teGptOk = !teGptViolation;

  return (
    <div className={cn("rounded border px-2 py-1.5", teGptOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-600 font-medium">TE GPT</span>
        <span className={cn("font-mono font-bold shrink-0", teGptOk ? "text-emerald-700" : "text-red-700")}>
          {fmtMin(total)}
          {teGptViolation?.limite && (
            <span className="font-normal text-slate-400 ml-1">/ {teGptViolation.limite}</span>
          )}
          {teGptOk
            ? <IconCheck className="w-3 h-3 ml-0.5 inline" aria-hidden="true" />
            : <IconX className="w-3 h-3 ml-0.5 inline" aria-hidden="true" />}
        </span>
      </div>

      {(lignes.length > 0 || detail.amplitudeImprevu > 0) && (
        <div className="mt-1.5 pl-1 border-l-2 border-slate-200 space-y-0.5">
          {lignes.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-[9px] text-slate-500">
              <span className="font-mono">
                {fmtDate(l.date)} · {l.heureDebut}–{l.heureFin}
                {l.codeJs && <span className="ml-1 font-bold text-slate-600">{l.codeJs}</span>}
              </span>
              <span className="font-mono font-semibold text-slate-700 ml-2">{fmtMin(l.dureeMin)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-[9px] text-blue-600 font-semibold">
            <span>+ JS simulée</span>
            <span className="font-mono">{fmtMin(detail.amplitudeImprevu)}</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-bold border-t border-slate-200 pt-0.5 mt-0.5">
            <span className="text-slate-600">= Total GPT</span>
            <span className={cn("font-mono", teGptOk ? "text-emerald-700" : "text-red-700")}>
              {fmtMin(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DetailRegles (composant exporté) ────────────────────────────────────────

export default function DetailRegles({ detail }: { detail: DetailCalcul }) {
  const [open, setOpen] = useState(false);

  const reposOk =
    detail.reposJournalierDisponible === null ||
    detail.reposJournalierDisponible >= detail.reposJournalierMin;
  const amplitudeOk = detail.amplitudeImprevu <= detail.amplitudeMaxAutorisee;
  const gptOk = detail.gptActuel <= detail.gptMax;

  const hasViolations = detail.violations.length > 0;
  const hasVigilance = (detail.pointsVigilance ?? []).length > 0;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 hover:text-blue-600 transition-colors"
      >
        {open
          ? <IconChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />
          : <IconChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />}
        <span>Détail des règles</span>
        {hasViolations && (
          <span className="px-1 py-0.5 rounded bg-red-100 text-red-600 text-[9px] font-bold">
            {detail.violations.length} violation{detail.violations.length > 1 ? "s" : ""}
          </span>
        )}
        {!hasViolations && hasVigilance && (
          <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-600 text-[9px] font-bold">
            {(detail.pointsVigilance ?? []).length} vigilance
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5 text-[10px]">

          {/* ── Repos journalier ── */}
          <RuleRow
            label={<><IconMoon className="w-3 h-3" aria-hidden="true" /> Repos journalier</>}
            valeur={
              detail.reposJournalierDisponible !== null
                ? fmtMin(detail.reposJournalierDisponible)
                : "—"
            }
            limite={`${fmtMin(detail.reposJournalierMin)} min`}
            ok={reposOk}
            detail={
              detail.dernierPosteDebut ? (
                <p className="text-[9px] text-slate-500 font-mono">
                  Fin dernier poste
                  {detail.dernierPosteDate ? ` (${fmtDate(detail.dernierPosteDate)})` : ""}
                  {" "}: {detail.dernierPosteDebut}–{detail.dernierPosteFin}
                  {detail.reposJournalierDisponible !== null && (
                    <span className="ml-1 text-slate-400">
                      → {fmtMin(detail.reposJournalierDisponible)} de repos
                    </span>
                  )}
                </p>
              ) : undefined
            }
          />

          {/* ── Amplitude ── */}
          <RuleRow
            label={<><IconClock className="w-3 h-3" aria-hidden="true" /> Amplitude</>}
            valeur={fmtMin(detail.amplitudeImprevu)}
            limite={`${fmtMin(detail.amplitudeMaxAutorisee)} max`}
            ok={amplitudeOk}
            detail={
              detail.amplitudeRaison ? (
                <p className="text-[9px] text-slate-500 italic">{detail.amplitudeRaison}</p>
              ) : undefined
            }
          />

          {/* ── TE GPT ── */}
          <TeGptBreakdown detail={detail} />

          {/* ── Longueur GPT ── */}
          <RuleRow
            label={<><IconCalendar className="w-3 h-3" aria-hidden="true" /> Longueur GPT</>}
            valeur={`${detail.gptActuel}j`}
            limite={`${detail.gptMax}j max`}
            ok={gptOk}
          />

          {/* ── Repos périodiques autour de la GPT ── */}
          {detail.gptRpAnalyse && (
            <div className="rounded border bg-indigo-50 border-indigo-200 px-2 py-1.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-indigo-700 inline-flex items-center gap-1">
                  <IconCalendar className="w-3 h-3" aria-hidden="true" />
                  Repos périodiques GPT
                </span>
                <span className="text-[9px] text-indigo-500 font-mono">
                  {detail.gptRpAnalyse.premierJsDate} → {detail.gptRpAnalyse.dernierJsDate}
                  <span className="ml-1 text-indigo-400">({detail.gptRpAnalyse.gptLength}j)</span>
                </span>
              </div>
              {detail.gptRpAnalyse.rpAvantGptMin !== null && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-600">RP avant GPT</span>
                  <span className={cn("font-mono font-bold", detail.gptRpAnalyse.rpAvantGptConforme ? "text-emerald-700" : "text-red-700")}>
                    {fmtMin(detail.gptRpAnalyse.rpAvantGptMin)}
                    <span className="font-normal text-slate-400 ml-1">
                      / {fmtMin(detail.gptRpAnalyse.rpAvantGptMinRequis)} min
                    </span>
                    <span className="ml-1">{detail.gptRpAnalyse.rpAvantGptConforme ? "✓" : "✗"}</span>
                  </span>
                </div>
              )}
              {detail.gptRpAnalyse.rpApresGptMin !== null && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-600">RP après GPT</span>
                  <span className={cn("font-mono font-bold", detail.gptRpAnalyse.rpApresGptConforme ? "text-emerald-700" : "text-red-700")}>
                    {fmtMin(detail.gptRpAnalyse.rpApresGptMin)}
                    <span className="font-normal text-slate-400 ml-1">
                      / {fmtMin(detail.gptRpAnalyse.rpApresGptMinRequis)} min
                    </span>
                    <span className="ml-1">{detail.gptRpAnalyse.rpApresGptConforme ? "✓" : "✗"}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Violations bloquantes ── */}
          {detail.violations.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 space-y-0.5">
              <p className="font-semibold text-red-700">✗ Violations bloquantes</p>
              {detail.violations.map((v, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-[9px]">
                  <span className="text-red-700">{v.description}</span>
                  {v.valeur !== undefined && (
                    <span className="font-mono font-bold text-red-800 shrink-0">
                      {String(v.valeur)}
                      {v.limite !== undefined && (
                        <span className="font-normal text-red-400 ml-1">/ {String(v.limite)}</span>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Points de vigilance ── */}
          {(detail.pointsVigilance ?? []).length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 space-y-0.5">
              <p className="font-semibold text-amber-700">⚠ Points de vigilance</p>
              {(detail.pointsVigilance ?? []).map((p, i) => (
                <p key={i} className="text-[9px] text-amber-800">{p}</p>
              ))}
            </div>
          )}

          {/* ── Règles respectées (repliées) ── */}
          {detail.respectees.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-[9px] text-slate-400 hover:text-emerald-600 font-semibold list-none flex items-center gap-1">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                <span>
                  {detail.respectees.length} règle{detail.respectees.length > 1 ? "s" : ""} respectée{detail.respectees.length > 1 ? "s" : ""}
                </span>
              </summary>
              <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-emerald-100">
                {detail.respectees.map((r, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-[9px]">
                    <span className="text-slate-600 flex items-start gap-1">
                      <span className="text-emerald-500 shrink-0">✓</span>
                      {r.description}
                    </span>
                    {r.valeur !== undefined && (
                      <span className="font-mono font-semibold text-emerald-700 shrink-0">
                        {String(r.valeur)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
