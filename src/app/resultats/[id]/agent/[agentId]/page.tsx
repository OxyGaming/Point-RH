import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatutBadge from "@/components/ui/StatutBadge";
import { minutesToTime } from "@/lib/utils";
import type { DetailCalcul, StatutAgent } from "@/types/simulation";

async function getResultat(simulationId: string, agentId: string) {
  return prisma.resultatAgent.findFirst({
    where: { simulationId, agentId },
    include: {
      agent: true,
      simulation: true,
    },
  });
}

export default async function AgentResultatPage({
  params,
}: {
  params: Promise<{ id: string; agentId: string }>;
}) {
  const { id: simulationId, agentId } = await params;
  const resultat = await getResultat(simulationId, agentId);
  if (!resultat) notFound();

  const detail = JSON.parse(resultat.detail) as DetailCalcul;
  const agent = resultat.agent;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-400">
        <Link href="/resultats" className="hover:text-gray-600">Résultats</Link>
        <span>/</span>
        <Link href={`/resultats/${simulationId}`} className="hover:text-gray-600">
          {resultat.simulation.poste}
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{agent.nom} {agent.prenom}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{agent.nom} {agent.prenom}</h1>
          <p className="text-gray-500 text-sm font-mono">{agent.matricule}</p>
        </div>
        <div className="text-right">
          <StatutBadge statut={resultat.statut as StatutAgent} />
          <p className="text-xs text-gray-400 mt-1">Score {resultat.scorePertinence}/100</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Calculs */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800">Calculs</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            {[
              { label: "Amplitude imprévu", value: minutesToTime(detail.amplitudeImprevu) },
              { label: "Amplitude max autorisée", value: minutesToTime(detail.amplitudeMaxAutorisee) },
              { label: "Durée effective max", value: minutesToTime(detail.dureeEffectiveMax) },
              { label: "Repos journalier min", value: minutesToTime(detail.reposJournalierMin) },
              {
                label: "Repos disponible",
                value: detail.reposJournalierDisponible !== null
                  ? minutesToTime(detail.reposJournalierDisponible)
                  : "Aucun poste précédent",
              },
              { label: "Jours GPT en cours", value: `${detail.gptActuel} / ${detail.gptMax}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center border-b border-gray-50 pb-2">
                <span className="text-gray-500">{label}</span>
                <span className="font-semibold text-gray-800">{value}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Violations */}
        <div className="space-y-4">
          {detail.violations.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-red-700">Violations ({detail.violations.length})</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                {detail.violations.map((v, i) => (
                  <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-red-800 text-xs">{v.regle}</p>
                    <p className="text-red-700 mt-0.5">{v.description}</p>
                    {v.valeur !== undefined && (
                      <p className="text-xs text-red-500 mt-1">
                        Valeur : <strong>{v.valeur}</strong>
                        {v.limite !== undefined && <> · Limite : <strong>{v.limite}</strong></>}
                      </p>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {detail.respectees.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-green-700">Règles respectées ({detail.respectees.length})</h2>
              </CardHeader>
              <CardBody className="space-y-2">
                {detail.respectees.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <div>
                      <p className="text-gray-700">{r.description}</p>
                      {r.valeur !== undefined && (
                        <p className="text-xs text-gray-400">{r.valeur}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
