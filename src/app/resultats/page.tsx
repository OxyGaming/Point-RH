import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import PurgeButton from "./PurgeButton";

export const dynamic = "force-dynamic";

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
    <div className="p-5 sm:p-7 lg:p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Simulations</p>
          <h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">Résultats</h1>
          <p className="text-[13px] text-[#4a5580] mt-2">{simulations.length} simulation(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <PurgeButton count={simulations.length} />
          <Link
            href="/simulation"
            className="inline-flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[13px] font-[600] px-4 py-2 rounded-lg transition-colors"
          >
            + Nouvelle simulation
          </Link>
        </div>
      </div>

      {simulations.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-12 text-[#8b93b8]">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <p className="font-[600] text-[#4a5580]">Aucune simulation effectuée</p>
              <Link href="/simulation" className="text-[#2563eb] text-[13px] mt-2 inline-block hover:underline">
                Lancer une simulation →
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {simulations.map((sim) => (
            <Link key={sim.id} href={`/resultats/${sim.id}`}>
              <Card className="hover:border-[#2563eb]/30 hover:shadow-[0_4px_16px_rgba(15,27,76,0.09)] transition-all cursor-pointer group">
                <CardBody className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-[600] text-[13px] text-[#0f1b4c] truncate">Poste : {sim.poste}</p>
                      <p className="text-[12px] text-[#4a5580] mt-0.5 font-mono">
                        {new Date(sim.dateDebut).toLocaleDateString("fr-FR")} · {sim.heureDebut} → {sim.heureFin}
                        {sim.commentaire && ` · ${sim.commentaire}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {sim.remplacement && <span className="text-[11px] font-[600] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">Remplacement</span>}
                      {sim.deplacement && <span className="text-[11px] font-[600] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Déplacement</span>}
                      {sim.posteNuit && <span className="text-[11px] font-[600] bg-[#eff6ff] text-[#1e40af] px-2 py-0.5 rounded-full">Nuit</span>}
                      <span className="text-[11px] text-[#8b93b8]">{sim._count.resultats} agents</span>
                      <span className="text-[#2563eb] text-[12px] group-hover:translate-x-0.5 transition-transform">→</span>
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
