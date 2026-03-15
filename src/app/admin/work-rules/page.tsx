"use client";

import { useEffect, useState, useCallback } from "react";
import { CATEGORY_LABELS, type RuleMetadata } from "@/lib/rules/workRules";

interface RulesResponse {
  values: Record<string, number>;
  metadata: Record<string, RuleMetadata>;
}

const CATEGORY_ORDER = [
  "amplitude",
  "travailEffectif",
  "reposJournalier",
  "reposPeriodique",
  "pause",
  "gpt",
];

export default function WorkRulesPage() {
  const [values, setValues] = useState<Record<string, number>>({});
  const [metadata, setMetadata] = useState<Record<string, RuleMetadata>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/work-rules");
      const data: RulesResponse = await res.json();
      setValues(data.values);
      setMetadata(data.metadata);
    } catch {
      setMessage({ type: "error", text: "Erreur lors du chargement des règles." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  function handleChange(key: string, raw: string) {
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      setValues((prev) => ({ ...prev, [key]: num }));
      setHasChanges(true);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const rules = Object.entries(values).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/admin/work-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Règles sauvegardées avec succès." });
        setHasChanges(false);
      } else {
        setMessage({ type: "error", text: "Erreur lors de la sauvegarde." });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur réseau." });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Réinitialiser toutes les règles aux valeurs réglementaires par défaut ?")) return;
    setSaving(true);
    setMessage(null);
    try {
      await fetch("/api/admin/work-rules", { method: "DELETE" });
      await fetchRules();
      setMessage({ type: "success", text: "Règles réinitialisées aux valeurs par défaut." });
      setHasChanges(false);
    } catch {
      setMessage({ type: "error", text: "Erreur lors de la réinitialisation." });
    } finally {
      setSaving(false);
    }
  }

  // Grouper les clés par catégorie
  const grouped: Record<string, string[]> = {};
  for (const key of Object.keys(metadata)) {
    const cat = metadata[key].category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(key);
  }

  if (loading) {
    return (
      <div className="p-8 text-slate-500 text-sm">Chargement des règles...</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 px-4 sm:px-6">
      {/* En-tête */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Paramétrage des règles de travail</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configurez les seuils réglementaires utilisés par le moteur de simulation.
          Les valeurs sont en <strong>heures</strong> (ou jours pour la GPT), sauf indication contraire.
        </p>
      </div>

      {/* Feedback */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-8">
        {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((cat) => (
          <section key={cat} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
              <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {grouped[cat].map((key) => {
                const meta = metadata[key];
                const value = values[key] ?? meta.defaultValue;
                const isModified = value !== meta.defaultValue;
                return (
                  <div key={key} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor={key}
                        className="block text-sm font-medium text-slate-700"
                      >
                        {meta.label}
                        {isModified && (
                          <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            modifié
                          </span>
                        )}
                      </label>
                      {meta.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        id={key}
                        type="number"
                        step={meta.unit === "h" ? "0.5" : "1"}
                        min={0}
                        value={value}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="w-24 text-right text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-xs text-slate-400 w-8">{meta.unit}</span>
                      {isModified && (
                        <span className="text-xs text-slate-400">
                          (défaut&nbsp;: {meta.defaultValue})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
        </button>
        <button
          onClick={handleReset}
          disabled={saving}
          className="px-4 py-2.5 text-sm text-slate-600 hover:text-red-600 border border-slate-300 hover:border-red-300 rounded-lg transition-colors"
        >
          Réinitialiser les défauts
        </button>
        {!hasChanges && !saving && (
          <span className="text-xs text-slate-400">Aucune modification en attente</span>
        )}
      </div>

      {/* Note technique */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1">
        <p className="font-semibold">Note sur les règles non évaluées</p>
        <p>• <strong>Coupure en plage horaire [11h-14h] / [18h-21h]</strong> : valeur configurée, logique à implémenter dans le moteur.</p>
        <p>• <strong>GPT minimum dimanche (2 jours avec accord agent)</strong> : valeur configurée, non évaluée automatiquement.</p>
      </div>
    </div>
  );
}
