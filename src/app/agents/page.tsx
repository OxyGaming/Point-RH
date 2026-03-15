import { prisma } from "@/lib/prisma";
import AgentTable from "@/components/agents/AgentTable";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-gray-500 mt-1 text-sm">{agents.length} agent(s) en base</p>
        </div>
      </div>

      {/* Stats — grille responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {[
          { label: "Total", value: agents.length, color: "text-blue-600" },
          { label: "Réserve", value: agents.filter((a) => a.agentReserve).length, color: "text-purple-600" },
          { label: "Nuit possible", value: agents.filter((a) => a.peutFaireNuit).length, color: "text-indigo-600" },
          { label: "Déplacement", value: agents.filter((a) => a.peutEtreDeplace).length, color: "text-green-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 text-center shadow-sm">
            <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Note persistance — visible uniquement admin */}
      {isAdmin && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
          <strong>Règle de gestion :</strong> Les agents importés sont <strong>rémanents</strong>.
          Un import ne supprime jamais un agent. Seule une suppression explicite par un administrateur
          retire définitivement un agent de la base.
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-800">Liste des agents actifs</h2>
        </CardHeader>
        <CardBody className="p-0">
          <AgentTable agents={agents} />
        </CardBody>
      </Card>

      {agents.length === 0 && (
        <div className="mt-6 text-center">
          <Link href="/import" className="text-blue-600 hover:underline text-sm">
            → Importer un planning pour ajouter des agents
          </Link>
        </div>
      )}
    </div>
  );
}
