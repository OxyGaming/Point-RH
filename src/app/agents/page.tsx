import { prisma } from "@/lib/prisma";
import AgentTable from "@/components/agents/AgentTable";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import Link from "next/link";
import { getSession } from "@/lib/session";

async function getAgents() {
  const agents = await prisma.agent.findMany({
    where: { deletedAt: null },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });
  return agents.map((a) => ({ ...a, habilitations: JSON.parse(a.habilitations) as string[] }));
}

export default async function AgentsPage() {
  const [agents, session] = await Promise.all([getAgents(), getSession()]);
  const isAdmin = session?.role === "ADMIN";

  const userFilter = session
    ? await prisma.userAgentFilter.findUnique({ where: { userId: session.id } })
    : null;

  const initialFilter = {
    selectedIds: userFilter ? (JSON.parse(userFilter.selectedIds) as string[]) : [],
    isActive: userFilter?.isActive ?? false,
  };

  const stats = [
    { label: "Total agents",   value: agents.length,                                    color: "blue"  as const },
    { label: "En réserve",     value: agents.filter((a) => a.agentReserve).length,      color: "green" as const },
    { label: "Nuit possible",  value: agents.filter((a) => a.peutFaireNuit).length,     color: "amber" as const },
    { label: "Déplaçables",    value: agents.filter((a) => a.peutEtreDeplace).length,   color: "blue"  as const },
  ];

  const ACCENT_COLORS = {
    blue:  { top: "bg-[#2563eb]", val: "text-[#1e40af]" },
    green: { top: "bg-[#059669]", val: "text-[#065f46]" },
    amber: { top: "bg-[#d97706]", val: "text-[#92400e]" },
    red:   { top: "bg-[#dc2626]", val: "text-[#991b1b]" },
  };

  return (
    <div className="p-5 sm:p-7 lg:p-8 max-w-6xl">

      {/* Page header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Ressources humaines</p>
          <h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">Agents</h1>
          <p className="text-[13px] text-[#4a5580] mt-2">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} en base active
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, color }) => {
          const { top, val } = ACCENT_COLORS[color];
          return (
            <div key={label} className="bg-white rounded-xl border border-[#e2e8f5] shadow-[0_1px_3px_rgba(15,27,76,0.07)] overflow-hidden relative">
              <div className={`absolute top-0 left-0 right-0 h-[3px] ${top}`} />
              <div className="px-4 py-4 pt-5">
                <p className="text-[10px] font-[700] uppercase tracking-[0.06em] text-[#8b93b8] mb-2">{label}</p>
                <p className={`text-[30px] font-[800] tracking-tight leading-none ${val}`}>{value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Note persistance admin */}
      {isAdmin && (
        <div className="mb-5 flex items-start gap-2.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[12px] text-[#1e40af] font-[500]">
            Les agents importés sont <strong>rémanents</strong>. Un import ne supprime jamais un agent — seule une suppression explicite par un administrateur le retire.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Liste des agents actifs</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <AgentTable agents={agents} initialFilter={initialFilter} />
        </CardBody>
      </Card>

      {agents.length === 0 && (
        <div className="mt-6 text-center">
          <Link href="/import" className="text-[#2563eb] hover:underline text-[13px] font-[500]">
            → Importer un planning pour ajouter des agents
          </Link>
        </div>
      )}
    </div>
  );
}
