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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:shadow transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/agents/${resultat.agentId}`}
            className="font-semibold text-gray-900 hover:text-blue-700 hover:underline"
          >
            {resultat.nom} {resultat.prenom}
          </Link>
          <p className="text-xs text-gray-500 font-mono">{resultat.matricule}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatutBadge statut={resultat.statut} />
          <span className="text-xs text-gray-500">Score {resultat.scorePertinence}/100</span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            resultat.statut === "CONFORME"
              ? "bg-green-500"
              : resultat.statut === "VIGILANCE"
              ? "bg-yellow-400"
              : "bg-red-400"
          }`}
          style={{ width: `${resultat.scorePertinence}%` }}
        />
      </div>

      {/* Motif */}
      <p className="text-xs text-gray-600 line-clamp-2">{resultat.motifPrincipal}</p>

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-600">Repos disponible</p>
          <p className="font-semibold text-gray-700">
            {detail.reposJournalierDisponible !== null
              ? minutesToTime(detail.reposJournalierDisponible)
              : "N/A"}
          </p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-gray-600">Jours GPT</p>
          <p className="font-semibold text-gray-700">
            {detail.gptActuel}/{detail.gptMax}
          </p>
        </div>
      </div>

      {/* Link */}
      <Link
        href={`/resultats/${simulationId}/agent/${resultat.agentId}`}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        Voir le détail →
      </Link>
    </div>
  );
}
