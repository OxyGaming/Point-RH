import { prisma } from "@/lib/prisma";

export default async function ActiveDataBanner() {
  const [stats, agentCount] = await Promise.all([
    prisma.planningLigne.aggregate({
      _min: { dateDebutPop: true },
      _max: { dateFinPop: true },
      _count: { id: true },
    }),
    prisma.agent.count({ where: { deletedAt: null } }),
  ]);

  const nbLignes = stats._count.id;
  const dateMin = stats._min.dateDebutPop;
  const dateMax = stats._max.dateFinPop;
  const isEmpty = nbLignes === 0;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="rounded-xl border border-[#e2e8f5] bg-white p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb]">Planning</p>
          <h2 className="text-[15px] font-[700] text-[#0f1b4c] mt-0.5">Données disponibles</h2>
        </div>
        <span className="text-[10px] text-[#8b93b8] bg-[#f1f5f9] rounded-full px-2.5 py-1 font-[500]">
          Rétention 3 mois
        </span>
      </div>

      {isEmpty ? (
        <p className="text-[13px] text-[#8b93b8] text-center py-4 flex-1 flex items-center justify-center">
          Aucune donnée — importez un fichier de planning.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#f8fafc] rounded-lg px-3 py-3 text-center">
            <p className="text-[22px] font-[800] text-[#0f1b4c] font-mono leading-none">
              {agentCount}
            </p>
            <p className="text-[11px] text-[#8b93b8] mt-1">agents</p>
          </div>
          <div className="bg-[#f8fafc] rounded-lg px-3 py-3 text-center">
            <p className="text-[22px] font-[800] text-[#0f1b4c] font-mono leading-none">
              {nbLignes.toLocaleString("fr-FR")}
            </p>
            <p className="text-[11px] text-[#8b93b8] mt-1">lignes</p>
          </div>
          <div className="bg-[#f8fafc] rounded-lg px-3 py-3 text-center">
            {dateMin && dateMax ? (
              <>
                <p className="text-[11px] font-[700] text-[#0f1b4c] leading-tight">
                  {formatDate(dateMin)}
                </p>
                <p className="text-[10px] text-[#8b93b8] my-0.5">→</p>
                <p className="text-[11px] font-[700] text-[#0f1b4c] leading-tight">
                  {formatDate(dateMax)}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-[#8b93b8]">—</p>
            )}
            <p className="text-[11px] text-[#8b93b8] mt-1">plage</p>
          </div>
        </div>
      )}
    </div>
  );
}
