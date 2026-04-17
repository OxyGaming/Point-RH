"use client";

import type { ComponentType, SVGProps } from "react";
import { useEffect, useState, useCallback } from "react";
import { CATEGORY_LABELS, type RuleMetadata } from "@/lib/rules/workRules";
import {
  IconClock,
  IconBriefcase,
  IconMoon,
  IconCalendar,
  IconCoffee,
  IconBarChart,
  IconSunset,
  IconSettings,
  IconAlertTriangle,
} from "@/components/icons/Icons";

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
  "periodeNocturne",
];

/** Icône par catégorie */
const CATEGORY_ICON: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  amplitude: IconClock,
  travailEffectif: IconBriefcase,
  reposJournalier: IconMoon,
  reposPeriodique: IconCalendar,
  pause: IconCoffee,
  gpt: IconBarChart,
  periodeNocturne: IconSunset,
};

/** Vérifie la cohérence inter-règles et retourne les avertissements */
function getCoherenceWarnings(values: Record<string, number>): string[] {
  const w: string[] = [];
  const v = (key: string) => values[key] ?? 0;

  if (v("reposJournalier.reduitReserve") >= v("reposJournalier.standard"))
    w.push("Le repos réduit réserve doit être inférieur au repos standard.");
  if (v("reposJournalier.standard") >= v("reposJournalier.apresNuit"))
    w.push("Le repos après nuit doit être supérieur au repos standard.");
  if (v("gpt.maxAvantRP") >= v("gpt.max"))
    w.push("GPT max avant RP doit être strictement inférieur au GPT maximum.");
  if (v("gpt.min") > v("gpt.max"))
    w.push("GPT minimum ne peut pas dépasser GPT maximum.");
  if (v("reposPeriodique.simple") >= v("reposPeriodique.double"))
    w.push("RP double doit être strictement supérieur au RP simple.");
  if (v("reposPeriodique.double") >= v("reposPeriodique.triple"))
    w.push("RP triple doit être strictement supérieur au RP double.");
  if (v("amplitude.nuitReserve") > v("amplitude.nuit"))
    w.push("L'amplitude nuit réserve ne devrait pas dépasser l'amplitude nuit générale.");
  if (v("periodeNocturne.debutSoir") <= v("periodeNocturne.finMatin"))
    w.push("L'heure de début de la plage nocturne doit être supérieure à l'heure de fin (ex : 21h30 > 06h30).");
  if (v("periodeNocturne.seuilJsNuit") <= 0)
    w.push("Le seuil de chevauchement pour JS de nuit doit être > 0.");

  return w;
}

/** Vérifie si une valeur individuelle est hors limites */
function getFieldError(value: number, meta: RuleMetadata): string | null {
  if (meta.min !== undefined && value < meta.min)
    return `Valeur minimale : ${meta.min} ${meta.unit}`;
  if (meta.max !== undefined && value > meta.max)
    return `Valeur maximale : ${meta.max} ${meta.unit}`;
  return null;
}

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

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function handleChange(key: string, raw: string) {
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      setValues((prev) => ({ ...prev, [key]: num }));
      setHasChanges(true);
    }
  }

  async function handleSave() {
    // Vérification des erreurs avant sauvegarde
    const fieldErrors: string[] = [];
    for (const [key, meta] of Object.entries(metadata)) {
      const err = getFieldError(values[key] ?? meta.defaultValue, meta);
      if (err) fieldErrors.push(`${meta.label} : ${err}`);
    }
    if (fieldErrors.length > 0) {
      setMessage({ type: "error", text: `Valeurs invalides :\n${fieldErrors.join("\n")}` });
      return;
    }

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
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data.error ?? "Erreur lors de la sauvegarde." });
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

  // Avertissements de cohérence
  const coherenceWarnings = Object.keys(values).length > 0 ? getCoherenceWarnings(values) : [];

  // Nombre total d'erreurs de champs
  const fieldErrorCount = Object.entries(metadata).filter(([key, meta]) => {
    const v = values[key] ?? meta.defaultValue;
    return getFieldError(v, meta) !== null;
  }).length;

  const modifiedCount = Object.entries(metadata).filter(([key, meta]) => {
    return (values[key] ?? meta.defaultValue) !== meta.defaultValue;
  }).length;

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm">Chargement des règles...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-5 sm:p-7 lg:p-8">
      <div className="mb-7">
        <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Administration</p>
        <h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">Règles de travail</h1>
        <p className="mt-2 text-[13px] text-[#4a5580]">
          Configurez les seuils réglementaires utilisés par le moteur de simulation.
        </p>
        {modifiedCount > 0 && (
          <p className="mt-2 text-xs text-blue-600 font-medium">
            {modifiedCount} règle{modifiedCount > 1 ? "s" : ""} modifiée{modifiedCount > 1 ? "s" : ""} par rapport aux valeurs réglementaires par défaut.
          </p>
        )}
      </div>

      {/* Feedback */}
      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium whitespace-pre-line ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Avertissements de cohérence */}
      {coherenceWarnings.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200">
          <p className="text-sm font-semibold text-orange-800 mb-1 flex items-center gap-2">
            <IconAlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            Incohérences détectées entre règles liées
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {coherenceWarnings.map((w, i) => (
              <li key={i} className="text-xs text-orange-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Erreurs de champs */}
      {fieldErrorCount > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm font-semibold text-red-800">
            {fieldErrorCount} champ{fieldErrorCount > 1 ? "s" : ""} hors limites — la sauvegarde est bloquée.
          </p>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-8">
        {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((cat) => (
          <section key={cat} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              {(() => {
                const Icon = CATEGORY_ICON[cat] ?? IconSettings;
                return <Icon className="w-5 h-5 shrink-0 text-slate-600" aria-hidden="true" />;
              })()}
              <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                {CATEGORY_LABELS[cat] ?? cat}
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {grouped[cat].map((key) => {
                const meta = metadata[key];
                const value = values[key] ?? meta.defaultValue;
                const isModified = value !== meta.defaultValue;
                const error = getFieldError(value, meta);
                return (
                  <div key={key} className={`px-5 py-3 ${error ? "bg-red-50" : ""}`}>
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <label htmlFor={key} className="block text-sm font-medium text-slate-700">
                          {meta.label}
                          {isModified && (
                            <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              modifié
                            </span>
                          )}
                        </label>
                        {meta.description && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{meta.description}</p>
                        )}
                        {meta.min !== undefined && meta.max !== undefined && (
                          <p className="text-xs text-slate-300 mt-0.5">
                            Plage autorisée : {meta.min}–{meta.max} {meta.unit}
                          </p>
                        )}
                        {error && (
                          <p className="text-xs text-red-600 mt-0.5 font-medium">{error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        <input
                          id={key}
                          type="number"
                          step={meta.step ?? (meta.unit === "h" ? 0.5 : 1)}
                          min={meta.min ?? 0}
                          max={meta.max}
                          value={value}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className={`w-24 text-right text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            error
                              ? "border-red-400 bg-red-50"
                              : "border-slate-300"
                          }`}
                        />
                        <span className="text-xs text-slate-400 w-8">{meta.unit}</span>
                        {isModified && !error && (
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            (défaut&nbsp;: {meta.defaultValue})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges || fieldErrorCount > 0}
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
        {!hasChanges && !saving && fieldErrorCount === 0 && (
          <span className="text-xs text-slate-400">Aucune modification en attente</span>
        )}
      </div>

      {/* Note technique */}
      <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 space-y-1">
        <p className="font-semibold">Note sur les règles non évaluées automatiquement</p>
        <p>• <strong>Coupure en plage horaire [11h-14h] / [18h-21h]</strong> : valeur configurée, logique à implémenter dans le moteur.</p>
        <p>• <strong>GPT minimum dimanche (2 jours avec accord agent)</strong> : valeur configurée, non évaluée automatiquement.</p>
      </div>
    </div>
  );
}
