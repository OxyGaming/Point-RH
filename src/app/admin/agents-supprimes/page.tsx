import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AgentsSupprimes from "@/components/agents/AgentsSupprimes";

export default async function AgentsSupprimesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agents supprimés</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Les agents supprimés logiquement conservent tout leur historique. Vous pouvez les réintégrer
          à tout moment pour les rendre à nouveau actifs dans les listes et les simulations.
        </p>
      </div>

      <AgentsSupprimes />
    </div>
  );
}
