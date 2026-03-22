import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import NpoExclusionsManager from "@/components/admin/NpoExclusionsManager";

export default async function NpoExclusionsPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Codes NPO — Exclusions simulations</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Définissez les préfixes de codes NPO qui empêchent la mobilisation d'un agent lors d'une
          simulation d'imprévu. S'applique aux simulations simples et multi-JS, y compris les cascades.
        </p>
      </div>

      <NpoExclusionsManager />
    </div>
  );
}
