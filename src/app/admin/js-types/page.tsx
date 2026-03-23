import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import JsTypesManager from "@/components/admin/JsTypesManager";

export default async function JsTypesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Types JS</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Gérez les types de journées de service et leur flexibilité en simulation.
          La flexibilité détermine la priorité de couverture et autorise (ou non) le figeage
          d'un agent planifié sur ce type pour libérer un remplaçant.
        </p>
      </div>

      <JsTypesManager />
    </div>
  );
}
