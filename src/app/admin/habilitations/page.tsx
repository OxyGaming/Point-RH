import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import HabilitationsManager from "@/components/agents/HabilitationsManager";

export default async function HabilitationsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Préfixes JS — Habilitations</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Gérez les préfixes de journées de service autorisés pour chaque agent. Ces préfixes
          conditionnent l'éligibilité de chaque agent dans les simulations d'imprévus.
        </p>
      </div>

      <HabilitationsManager />
    </div>
  );
}
