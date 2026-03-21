import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import PurgeButton from "./PurgeButton";

async function getSimulations() {
  return prisma.simulation.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { _count: { select: { resultats: true } } },
  });
}

export default async function ResultatsPage() {
  const simulations = await getSimulations();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Résultats</h1>
          <p className="text-gray-500 mt-1 text-sm">{simulations.length} simulation(s)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PurgeButton count={simulations.length} />
          <Link
            href="/simulation"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + Nouvelle simulation
          </Link>
        </div>
      </div>

      {simulations.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-medium">Aucune simulation effectuée</p>
              <Link href="/simulation" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
                Lancer une simulation →
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {simulations.map((sim) => (
            <Link key={sim.id} href={`/resultats/${sim.id}`}>
              <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                <CardBody className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        Poste : {sim.poste}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {new Date(sim.dateDebut).toLocaleDateString("fr-FR")} {sim.heureDebut} → {sim.heureFin}
                        {sim.commentaire && ` · ${sim.commentaire}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {sim.remplacement && <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded">Remplacement</span>}
                      {sim.deplacement && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded">Déplacement</span>}
                      {sim.posteNuit && <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded">Nuit</span>}
                      <span className="text-gray-400 text-xs">{sim._count.resultats} agents</span>
                      <span className="text-blue-600 text-xs">→</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
