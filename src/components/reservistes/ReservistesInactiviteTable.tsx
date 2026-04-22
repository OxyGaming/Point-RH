"use client";

import { useMemo, useState } from "react";
import type {
  CelluleInactivite,
  ReservistesInactiviteData,
  ReservisteRow,
} from "@/services/reservistesInactivite.service";

type SortMode = "nom" | "inactivite";

interface Props {
  data: ReservistesInactiviteData;
}

/**
 * Couleur d'une cellule (gradient HSL vert → rouge linéaire sur 0–180 jours).
 * Null = "jamais affecté" → gris neutre distinct du rouge.
 * Au-delà du seuil d'alerte, teinte saturée + texte blanc pour attirer l'œil.
 */
function cellStyle(jours: number | null, seuil: number): React.CSSProperties {
  if (jours === null) {
    return { background: "#e2e8f0", color: "#475569" };
  }
  const capped = Math.min(jours, 180);
  const hue = 120 - (capped / 180) * 120; // 120 (vert) → 0 (rouge)
  const over = jours > seuil;
  return {
    background: `hsl(${hue}, ${over ? 72 : 62}%, ${over ? 52 : 74}%)`,
    color: over ? "#ffffff" : "#0f172a",
  };
}

function agentMaxInactivite(row: ReservisteRow): number {
  let max = -1;
  for (const c of Object.values(row.cellules)) {
    if (c.joursInactivite !== null && c.joursInactivite > max) max = c.joursInactivite;
  }
  return max;
}

function formatCellLabel(c: CelluleInactivite): string {
  if (c.joursInactivite === null) return "jamais";
  return `${c.joursInactivite} j`;
}

function formatCellTooltip(c: CelluleInactivite, prefixe: string): string {
  if (c.dernierJour === null) return `${prefixe} — aucune affectation JS enregistrée`;
  return `${prefixe} — dernière affectation le ${c.dernierJour} (${c.joursInactivite} jour${c.joursInactivite! > 1 ? "s" : ""})`;
}

export default function ReservistesInactiviteTable({ data }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("inactivite");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? data.reservistes.filter(
          (r) =>
            r.nom.toLowerCase().includes(q) ||
            r.prenom.toLowerCase().includes(q) ||
            r.matricule.toLowerCase().includes(q) ||
            (r.uch ?? "").toLowerCase().includes(q)
        )
      : data.reservistes;

    const sorted = [...filtered];
    if (sort === "nom") {
      sorted.sort((a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));
    } else {
      sorted.sort((a, b) => agentMaxInactivite(b) - agentMaxInactivite(a));
    }
    return sorted;
  }, [data.reservistes, search, sort]);

  if (data.reservistes.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f5] rounded-xl p-8 text-center">
        <p className="text-[13px] text-[#4a5580]">
          Aucun réserviste à afficher
          {data.filterActive ? " (le filtre personnalisé d'agents est actif)." : "."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barre outils */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, matricule, UCH…"
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#e2e8f5] rounded-lg bg-white focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/15 outline-none"
          />
          <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-[#8b93b8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        <div className="flex items-center gap-1 bg-[#f1f5f9] rounded-lg p-1">
          <button
            onClick={() => setSort("inactivite")}
            className={`px-3 py-1.5 text-[12px] font-[600] rounded-md transition-colors ${sort === "inactivite" ? "bg-white text-[#0f1b4c] shadow-sm" : "text-[#4a5580] hover:text-[#0f1b4c]"}`}
          >
            Tri par inactivité
          </button>
          <button
            onClick={() => setSort("nom")}
            className={`px-3 py-1.5 text-[12px] font-[600] rounded-md transition-colors ${sort === "nom" ? "bg-white text-[#0f1b4c] shadow-sm" : "text-[#4a5580] hover:text-[#0f1b4c]"}`}
          >
            Tri par nom
          </button>
        </div>

        <p className="text-[12px] text-[#4a5580] sm:ml-auto">
          {rows.length} / {data.reservistes.length} réserviste{data.reservistes.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#4a5580] bg-[#f8fafc] border border-[#e2e8f5] rounded-lg px-3 py-2">
        <span className="font-[600] text-[#0f1b4c]">Échelle d'inactivité :</span>
        <LegendSwatch days={0} label="0 j" seuil={data.seuilAlerteJours} />
        <LegendSwatch days={45} label="45 j" seuil={data.seuilAlerteJours} />
        <LegendSwatch days={90} label="90 j" seuil={data.seuilAlerteJours} />
        <LegendSwatch days={130} label={`> ${data.seuilAlerteJours} j`} seuil={data.seuilAlerteJours} />
        <LegendSwatch days={180} label="≥ 180 j" seuil={data.seuilAlerteJours} />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded border border-[#cbd5e1]" style={{ background: "#e2e8f0" }} />
          <span>jamais</span>
        </span>
        <span className="ml-auto text-[#64748b]">
          Seuil d'alerte : {data.seuilAlerteJours} j (~4 mois)
        </span>
      </div>

      {/* Tableau croisé */}
      <div className="bg-white border border-[#e2e8f5] rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(15,27,76,0.07)]">
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-full text-[12px] border-collapse">
            <thead className="sticky top-0 z-20 bg-[#0f1b4c] text-white">
              <tr>
                <th className="sticky left-0 z-30 bg-[#0f1b4c] text-left font-[600] px-3 py-2.5 min-w-[160px] border-r border-white/10">
                  Agent
                </th>
                <th className="text-left font-[600] px-3 py-2.5 min-w-[80px] border-r border-white/10">
                  Matricule
                </th>
                <th className="text-left font-[600] px-3 py-2.5 min-w-[60px] border-r border-white/10">
                  UCH
                </th>
                {data.prefixes.map((p) => (
                  <th
                    key={p}
                    className="text-center font-[700] px-2 py-2.5 min-w-[64px] tracking-wide"
                    title={`Préfixe JS ${p}`}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}>
                  <td className={`sticky left-0 z-10 ${i % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"} px-3 py-2 font-[600] text-[#0f1b4c] border-r border-[#e2e8f5]`}>
                    <div className="truncate max-w-[180px]">
                      {row.nom} {row.prenom}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#4a5580] border-r border-[#e2e8f5] font-mono text-[11px]">
                    {row.matricule}
                  </td>
                  <td className="px-3 py-2 text-[#4a5580] border-r border-[#e2e8f5]">
                    {row.uch ?? "—"}
                  </td>
                  {data.prefixes.map((p) => {
                    const c = row.cellules[p];
                    if (!c) {
                      return (
                        <td
                          key={p}
                          className="text-center px-1 py-2 text-[#cbd5e1]"
                          title={`${p} — non habilité`}
                        >
                          ·
                        </td>
                      );
                    }
                    return (
                      <td
                        key={p}
                        className="text-center px-1 py-1"
                        title={formatCellTooltip(c, p)}
                      >
                        <span
                          className="inline-flex items-center justify-center min-w-[52px] px-2 py-1 rounded-md font-[600] text-[11px] leading-tight"
                          style={cellStyle(c.joursInactivite, data.seuilAlerteJours)}
                        >
                          {formatCellLabel(c)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ days, label, seuil }: { days: number; label: string; seuil: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-4 h-4 rounded border border-[#cbd5e1]"
        style={cellStyle(days, seuil)}
      />
      <span>{label}</span>
    </span>
  );
}
