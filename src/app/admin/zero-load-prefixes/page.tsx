import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ZeroLoadPrefixesManager from "@/components/admin/ZeroLoadPrefixesManager";

export default async function ZeroLoadPrefixesPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/auth/login");
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Préfixes JS Z — Codes additionnels « sans charge »</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Préfixes complémentaires qui assimilent un code JS à une JS Z (sans charge réelle),
          en plus des règles built-in (suffixe « Z », préfixe « FO », typeJs « DIS »).
          Utile pour couvrir des codes locaux ou exotiques. Impacte simulations, scoring (+15 pts)
          et exclusion des propositions d'habilitation post-import.
        </p>
      </div>

      <ZeroLoadPrefixesManager />
    </div>
  );
}
