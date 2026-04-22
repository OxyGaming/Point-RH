import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getReservistesInactivite } from "@/services/reservistesInactivite.service";
import ReservistesInactiviteTable from "@/components/reservistes/ReservistesInactiviteTable";

export const dynamic = "force-dynamic";

export default async function ReservistesPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?from=/reservistes");

  const data = await getReservistesInactivite(session.id);

  const nbAlerte = data.alerteCount;
  const nbTotal = data.reservistes.length;
  const nbHabilitations = data.prefixes.length;

  return (
    <div className="p-5 sm:p-7 lg:p-8 max-w-[1400px]">
      {/* En-tête */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">
            Suivi d'utilisation
          </p>
          <h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">
            Réservistes
          </h1>
          <p className="text-[13px] text-[#4a5580] mt-2">
            Dernière affectation JS par préfixe d'habilitation, pour chaque agent de réserve.
            {data.filterActive && (
              <span className="ml-1 inline-flex items-center gap-1 text-[12px] text-[#2563eb] font-[600]">
                · filtre personnalisé actif
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Réservistes affichés" value={nbTotal} tone="blue" />
        <StatCard label="Préfixes JS couverts" value={nbHabilitations} tone="neutral" />
        <StatCard
          label={`> ${data.seuilAlerteJours} j d'inactivité`}
          value={nbAlerte}
          tone={nbAlerte > 0 ? "red" : "green"}
        />
      </div>

      <ReservistesInactiviteTable data={data} />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red" | "neutral";
}) {
  const colors = {
    blue: { top: "bg-[#2563eb]", val: "text-[#1e40af]" },
    green: { top: "bg-[#059669]", val: "text-[#065f46]" },
    red: { top: "bg-[#dc2626]", val: "text-[#991b1b]" },
    neutral: { top: "bg-[#64748b]", val: "text-[#334155]" },
  }[tone];
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f5] shadow-[0_1px_3px_rgba(15,27,76,0.07)] overflow-hidden relative">
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${colors.top}`} />
      <div className="px-4 py-4 pt-5">
        <p className="text-[10px] font-[700] uppercase tracking-[0.06em] text-[#8b93b8] mb-2">
          {label}
        </p>
        <p className={`text-[30px] font-[800] tracking-tight leading-none ${colors.val}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
