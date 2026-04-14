import Link from "next/link";
import StatutBadge from "@/components/ui/StatutBadge";
import { minutesToTime } from "@/lib/utils";
import type { ResultatAgentDetail } from "@/types/simulation";

export default function ResultatCard({
  resultat,
  simulationId,
}: {
  resultat: ResultatAgentDetail;
  simulationId: string;
}) {
  const { detail } = resultat;

  const scoreColor =
    resultat.statut === "CONFORME"
      ? "bg-green-500"
      : resultat.statut === "VIGILANCE"
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <article className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/agents/${resultat.agentId}`}
            className="font-semibold text-slate-900 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {resultat.nom} {resultat.prenom}
          </Link>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{resultat.matricule}</p>
          {resultat.posteAffectation && (
            <p className="text-xs text-slate-400 truncate">{resultat.posteAffectation}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatutBadge statut={resultat.statut} />
          <span className="text-xs text-slate-500 tabular-nums">
            Score {resultat.scorePertinence}/100
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div
        className="h-1.5 bg-slate-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={resultat.scorePertinence}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Score de pertinence : ${resultat.scorePertinence} sur 100`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreColor}`}
          style={{ width: `${resultat.scorePertinence}%` }}
        />
      </div>

      {/* Motif */}
      <p className="text-xs text-slate-600 line-clamp-2">{resultat.motifPrincipal}</p>

      {/* Points de vigilance GPT */}
      {(detail.pointsVigilance ?? []).length > 0 && (
        <div className="space-y-1">
          {(detail.pointsVigilance ?? []).map((pv, i) => (
            <div
              key={i}
              role="note"
              className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1.5 rounded flex items-start gap-1.5"
            >
              <span aria-hidden="true" className="shrink-0 mt-0.5">⚠️</span>
              <span>{pv}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
          <p className="text-slate-500 mb-0.5">Repos disponible</p>
          <p className="font-semibold text-slate-700">
            {detail.reposJournalierDisponible !== null
              ? minutesToTime(detail.reposJournalierDisponible)
              : <span className="text-slate-400 italic">N/A</span>}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
          <p className="text-slate-500 mb-0.5">GPT en cours</p>
          <p className="font-semibold text-slate-700 tabular-nums">
            {detail.gptActuel}
            <span className="text-slate-400 font-normal"> / {detail.gptMax}</span>
          </p>
        </div>
      </div>

      {/* Link */}
      <Link
        href={`/resultats/${simulationId}/agent/${resultat.agentId}`}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        aria-label={`Voir le détail de ${resultat.nom} ${resultat.prenom}`}
      >
        Voir le détail →
      </Link>
    </article>
  );
}
