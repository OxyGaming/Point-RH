"use client";
import type { ImportResult } from "@/types/planning";
import { IconCheckCircle } from "@/components/icons/Icons";

interface Props {
  result: ImportResult;
}

export default function ImportResultMessage({ result }: Props) {
  if (!result.success) {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-red-50 border-red-200">
        <p className="font-semibold text-red-800 mb-2">❌ Échec de l&apos;import</p>
        {result.erreurs.length > 0 && (
          <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
            {result.erreurs.map((e, i) => (
              <div key={i} className="text-xs text-red-800 bg-red-100 rounded px-2 py-1">
                Ligne {e.ligne}{e.champ ? ` [${e.champ}]` : ""} — {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const rows = [
    { label: "Lignes créées",       value: result.lignesCreees,     color: "text-green-700" },
    { label: "Lignes mises à jour", value: result.lignesMisesAJour, color: "text-blue-700"  },
    { label: "Agents créés",        value: result.agentsCreated,    color: "text-green-700" },
    { label: "Agents mis à jour",   value: result.agentsUpdated,    color: "text-blue-700"  },
  ];

  return (
    <div className="mt-6 rounded-xl p-5 border bg-green-50 border-green-200">
      <p className="font-semibold text-green-800 mb-3 inline-flex items-center gap-1.5">
        <IconCheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
        Import terminé
      </p>
      <div className="space-y-1.5">
        {rows.map(({ label, value, color }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-green-700">{label}</span>
            <span className={`font-mono font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
      {result.erreurs.length > 0 && (
        <>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-yellow-700">Erreurs ignorées</span>
            <span className="font-mono font-semibold text-yellow-700">{result.erreurs.length}</span>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
            {result.erreurs.map((e, i) => (
              <div key={i} className="text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1">
                Ligne {e.ligne}{e.champ ? ` [${e.champ}]` : ""} — {e.message}
              </div>
            ))}
          </div>
        </>
      )}
      {result.fileType && (
        <p className="text-xs text-green-600 mt-2">
          Format : {result.fileType === "excel" ? "Excel" : "TXT tabulé"}
        </p>
      )}
    </div>
  );
}
