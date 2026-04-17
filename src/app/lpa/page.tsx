import LpaManager from "@/components/lpa/LpaManager";

export const metadata = { title: "Gestion LPA — Point RH" };

export default function LpaPage() {
  return (
    <div className="p-5 sm:p-7 lg:p-8 max-w-6xl space-y-6">
      <div>
        <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Administration</p><h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">LPA &amp; Types JS</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configurez les Lieux de Prise d&apos;Attachement et leurs Journées de Service compatibles.
          Cette configuration détermine automatiquement si un agent est en déplacement lors d&apos;une simulation.
        </p>
      </div>

      {/* Explication métier */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Principe de calcul du déplacement</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Un agent est <strong>en déplacement</strong> si la JS réalisée est <strong>hors de sa LPA de base</strong>.</li>
          <li>La table de correspondance <strong>LPA ↔ Types JS</strong> définit quelles JS sont &quot;dans la LPA&quot;.</li>
          <li>Si l&apos;agent a une règle spécifique (temps de trajet, override), elle prime sur la correspondance générale.</li>
          <li>Si la LPA n&apos;est pas configurée pour un agent, le déplacement est <strong>indéterminable</strong>.</li>
        </ul>
      </div>

      <LpaManager />
    </div>
  );
}
