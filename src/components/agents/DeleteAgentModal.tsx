"use client";

/**
 * Modale de confirmation de suppression d'agent.
 *
 * Rappel métier affiché :
 * - Les agents importés sont rémanents
 * - La suppression est une décision administrative explicite
 * - Elle est logique (historique préservé) mais irréversible depuis l'interface
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertTriangle } from "@/components/icons/Icons";

interface Props {
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
}

export default function DeleteAgentModal({
  agentId,
  agentNom,
  agentPrenom,
  agentMatricule,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la suppression.");
        return;
      }
      router.push("/agents");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Bouton déclencheur */}
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium transition-colors"
      >
        Supprimer cet agent
      </button>

      {/* Modale */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconAlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Supprimer un agent</h2>
                <p className="text-sm text-gray-500 mt-0.5">Action administrative irréversible</p>
              </div>
            </div>

            {/* Agent concerné */}
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
              <p className="font-medium text-gray-900">
                {agentNom} {agentPrenom}
              </p>
              <p className="text-gray-500 font-mono text-xs mt-0.5">{agentMatricule}</p>
            </div>

            {/* Rappel de la règle métier */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Rappel — Règle de gestion</p>
              <p>
                Les agents importés sont <strong>rémanents</strong> : ils restent en base même
                s&apos;ils n&apos;apparaissent plus dans un import ultérieur.
              </p>
              <p>
                Leur suppression est une <strong>décision administrative</strong> explicite.
                L&apos;historique (plannings, résultats de simulation) est conservé.
              </p>
              <p>
                Cette action est <strong>irréversible</strong> depuis l&apos;interface.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Suppression..." : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
