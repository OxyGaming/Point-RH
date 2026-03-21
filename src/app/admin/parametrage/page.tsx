import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ParametrageManager from "@/components/parametrage/ParametrageManager";

export default async function ParametragePage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Import / Export Paramétrage</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Exportez l'intégralité du paramétrage (agents, types JS, LPA, règles de déplacement) ou réimportez
          un fichier modifié. Les données de planning ne sont jamais concernées.
        </p>
      </div>

      <ParametrageManager />
    </div>
  );
}
