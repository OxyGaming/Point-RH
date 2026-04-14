import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import ResultatCard from "@/components/resultats/ResultatCard";
import type { ResultatAgentDetail, DetailCalcul } from "@/types/simulation";

async function getSimulation(id: string) {
  const sim = await prisma.simulation.findUnique({
    where: { id },
    include: {
      resultats: {
        include: { agent: true },
        orderBy: { scorePertinence: "desc" },
      },
    },
  });
  return sim;
}

export default async function ResultatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sim = await getSimulation(id);
  if (!sim) notFound();

  const resultats: ResultatAgentDetail[] = sim.resultats.map((r) => ({
    agentId: r.agentId,
    nom: r.agent.nom,
    prenom: r.agent.prenom,
    matricule: r.agent.matricule,
    posteAffectation: r.agent.posteAffectation,
    agentReserve: r.agent.agentReserve,
    statut: r.statut as ResultatAgentDetail["statut"],
    scorePertinence: r.scorePertinence,
    motifPrincipal: r.motifPrincipal ?? "",
    detail: JSON.parse(r.detail) as DetailCalcul,
  }));

  const conformes = resultats.filter((r) => r.statut === "CONFORME");
  const vigilance = resultats.filter((r) => r.statut === "VIGILANCE");
  const nonConformes = resultats.filter((r) => r.statut === "NON_CONFORME");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Link href="/resultats" className="text-slate-400 hover:text-slate-600 text-sm">← Résultats</Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Simulation — {sim.poste}</h1>
      </div>

      {/* Summary */}
      <Card className="mb-8">
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Date</p>
              <p className="font-semibold">{new Date(sim.dateDebut).toLocaleDateString("fr-FR")} {sim.heureDebut} → {sim.heureFin}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Type</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {sim.remplacement && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Remplacement</span>}
                {sim.deplacement && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Déplacement</span>}
                {sim.posteNuit && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Nuit</span>}
                {!sim.remplacement && !sim.deplacement && !sim.posteNuit && <span className="text-xs text-gray-400">Standard</span>}
              </div>
            </div>
            {sim.commentaire && (
              <div className="col-span-2">
                <p className="text-gray-500 text-xs">Commentaire</p>
                <p className="font-medium">{sim.commentaire}</p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Score summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8" role="region" aria-label="Résumé de la simulation">
        {[
          { label: "Mobilisables",   count: conformes.length,    style: "bg-green-50 border-green-300 text-green-800" },
          { label: "Vigilance",      count: vigilance.length,    style: "bg-amber-50 border-amber-300 text-amber-800" },
          { label: "Non mobilis.",   count: nonConformes.length, style: "bg-red-50 border-red-300 text-red-800" },
        ].map(({ label, count, style }) => (
          <div key={label} className={`rounded-xl border p-3 sm:p-5 text-center ${style}`}>
            <p className="text-2xl sm:text-4xl font-bold tabular-nums">{count}</p>
            <p className="text-[11px] sm:text-sm font-semibold mt-0.5 sm:mt-1 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Agents conformes */}
      {conformes.length > 0 && (
        <section className="mb-8" aria-labelledby="section-conformes">
          <h2 id="section-conformes" className="text-base sm:text-lg font-semibold text-green-700 mb-4 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-green-500 inline-block shrink-0" aria-hidden="true" />
            Agents mobilisables
            <span className="text-sm font-normal text-green-600">({conformes.length})</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {conformes.map((r) => (
              <ResultatCard key={r.agentId} resultat={r} simulationId={id} />
            ))}
          </div>
        </section>
      )}

      {/* Vigilance */}
      {vigilance.length > 0 && (
        <section className="mb-8" aria-labelledby="section-vigilance">
          <h2 id="section-vigilance" className="text-base sm:text-lg font-semibold text-amber-700 mb-4 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-amber-500 inline-block shrink-0" aria-hidden="true" />
            Vigilance
            <span className="text-sm font-normal text-amber-600">({vigilance.length})</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {vigilance.map((r) => (
              <ResultatCard key={r.agentId} resultat={r} simulationId={id} />
            ))}
          </div>
        </section>
      )}

      {/* Non conformes */}
      {nonConformes.length > 0 && (
        <section className="mb-8" aria-labelledby="section-non-conformes">
          <h2 id="section-non-conformes" className="text-base sm:text-lg font-semibold text-red-700 mb-4 flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-red-400 inline-block shrink-0" aria-hidden="true" />
            Non mobilisables
            <span className="text-sm font-normal text-red-600">({nonConformes.length})</span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {nonConformes.map((r) => (
              <ResultatCard key={r.agentId} resultat={r} simulationId={id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
