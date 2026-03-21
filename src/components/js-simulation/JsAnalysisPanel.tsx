"use client";

import { useState } from "react";
import { minutesToTime } from "@/lib/utils";
import type { JsCible, ImpreuvuConfig, JsSimulationResultat } from "@/types/js-simulation";
import JsResultatsTabs from "./JsResultatsTabs";

interface JsAnalysisPanelProps {
  jsCible: JsCible;
  onClose: () => void;
}

export default function JsAnalysisPanel({ jsCible, onClose }: JsAnalysisPanelProps) {
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<JsSimulationResultat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imprevu, setImprevu] = useState<ImpreuvuConfig>({
    partiel: false,
    heureDebutReel: jsCible.heureDebut,
    heureFinEstimee: jsCible.heureFin,
    // deplacement est maintenant calculé automatiquement côté serveur (LPA-based)
    // on conserve le champ pour rétrocompatibilité mais il n'est plus affiché
    deplacement: false,
    remplacement: true,
    commentaire: "",
  });

  const handleAnalyse = async () => {
    setLoading(true);
    setError(null);
    setResultat(null);
    try {
      const res = await fetch("/api/js-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsCible, imprevu }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erreur serveur");
        return;
      }
      const data: JsSimulationResultat = await res.json();
      setResultat(data);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col xl:h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-blue-50">
        <div>
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Analyse d&apos;imprévu
          </p>
          <h3 className="font-bold text-gray-900">
            JS {jsCible.date} · {jsCible.heureDebut}→{jsCible.heureFin}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-xl font-light leading-none"
        >
          ×
        </button>
      </div>

      <div className="xl:flex-1 xl:overflow-y-auto">
        {/* Informations JS */}
        <section className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Journée de Service cible
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Agent initial", value: `${jsCible.agentNom} ${jsCible.agentPrenom}` },
              { label: "Matricule", value: jsCible.agentMatricule },
              { label: "Code JS", value: jsCible.codeJs ?? "—" },
              { label: "Amplitude", value: minutesToTime(jsCible.amplitudeMin) },
              { label: "Date", value: new Date(jsCible.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) },
              { label: "Horaires", value: `${jsCible.heureDebut} → ${jsCible.heureFin}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-medium text-gray-800 text-xs">{value}</p>
              </div>
            ))}
            {jsCible.isNuit && (
              <div className="col-span-2">
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">
                  🌙 Poste de nuit
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Contexte simulation */}
        <section className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Contexte de l&apos;imprévu
          </p>

          <div className="space-y-3">
            {/* Partiel */}
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={imprevu.partiel}
                onChange={(e) => setImprevu((f) => ({ ...f, partiel: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-gray-700">Imprévu partiel (heure différente)</span>
            </label>

            {imprevu.partiel && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Début réel</label>
                  <input
                    type="time"
                    value={imprevu.heureDebutReel}
                    onChange={(e) => setImprevu((f) => ({ ...f, heureDebutReel: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fin estimée</label>
                  <input
                    type="time"
                    value={imprevu.heureFinEstimee}
                    onChange={(e) => setImprevu((f) => ({ ...f, heureFinEstimee: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={imprevu.remplacement}
                onChange={(e) => setImprevu((f) => ({ ...f, remplacement: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-gray-700">Remplacement (agent remplaçant)</span>
            </label>

            {/* Info : déplacement calculé automatiquement */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800">
              <p className="font-semibold mb-0.5">Déplacement calculé automatiquement</p>
              <p className="text-blue-700">
                Le déplacement est déterminé par la LPA de chaque candidat.
                Configurez les LPA dans <a href="/lpa" className="underline font-medium">Gestion LPA</a>.
              </p>
            </div>

            {/* Commentaire */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Commentaire</label>
              <textarea
                value={imprevu.commentaire ?? ""}
                onChange={(e) => setImprevu((f) => ({ ...f, commentaire: e.target.value }))}
                rows={2}
                placeholder="Motif, contexte…"
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </section>

        {/* Bouton analyse */}
        <div className="px-5 py-4">
          <button
            onClick={handleAnalyse}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            {loading ? "Analyse en cours…" : "⚡ Analyser l'imprévu"}
          </button>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mx-5 mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Résultats */}
        {resultat && <JsResultatsTabs resultat={resultat} />}
      </div>
    </div>
  );
}
