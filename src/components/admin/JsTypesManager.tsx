"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { IconMoon } from "@/components/icons/Icons";

type FlexibiliteJs = "OBLIGATOIRE" | "DERNIER_RECOURS";

interface JsType {
  id: string;
  code: string;
  libelle: string;
  heureDebutStandard: string;
  heureFinStandard: string;
  dureeStandard: number;
  estNuit: boolean;
  regime: string | null;
  flexibilite: FlexibiliteJs;
  actif: boolean;
  _count: { lpaJsTypes: number };
}

type SaveState = "idle" | "saving" | "saved" | "error";

function FlexibiliteBadge({ flexibilite }: { flexibilite: FlexibiliteJs }) {
  if (flexibilite === "OBLIGATOIRE") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
        OBLIGATOIRE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
      DERNIER RECOURS
    </span>
  );
}

const FLEXIBILITE_DESCRIPTIONS: Record<FlexibiliteJs, string> = {
  OBLIGATOIRE: "Priorité maximale — pénalité forte si non couverte",
  DERNIER_RECOURS: "Priorité réduite — agent figeable pour libérer un remplaçant",
};

export default function JsTypesManager() {
  const [jsTypes, setJsTypes] = useState<JsType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire création
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: "",
    libelle: "",
    heureDebutStandard: "",
    heureFinStandard: "",
    dureeStandard: "",
    estNuit: false,
    regime: "",
    flexibilite: "OBLIGATOIRE" as FlexibiliteJs,
  });
  const [addState, setAddState] = useState<SaveState>("idle");
  const [addError, setAddError] = useState<string | null>(null);

  // États des lignes
  const [rowStates, setRowStates] = useState<Record<string, SaveState>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchJsTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/js-types");
      if (!res.ok) throw new Error("Impossible de charger les types JS.");
      const data: JsType[] = await res.json();
      setJsTypes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJsTypes(); }, [fetchJsTypes]);

  // ── Patch inline ───────────────────────────────────────────────────────────
  async function patchJsType(id: string, patch: Record<string, unknown>) {
    setRowStates((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const res = await fetch(`/api/js-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const updated: JsType = await res.json();
      setJsTypes((prev) => prev.map((t) => (t.id === id ? { ...updated, _count: t._count } : t)));
      setRowStates((prev) => ({ ...prev, [id]: "saved" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 1500);
    } catch {
      setRowStates((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 2500);
    }
  }

  // ── Suppression ────────────────────────────────────────────────────────────
  async function deleteJsType(id: string) {
    setRowStates((prev) => ({ ...prev, [id]: "saving" }));
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/js-types/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setJsTypes((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setRowStates((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 2500);
    }
  }

  // ── Création ───────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setAddState("saving");
    setAddError(null);
    try {
      const res = await fetch("/api/js-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          libelle: form.libelle,
          heureDebutStandard: form.heureDebutStandard,
          heureFinStandard: form.heureFinStandard,
          dureeStandard: Number(form.dureeStandard),
          estNuit: form.estNuit,
          regime: form.regime.trim() || null,
          flexibilite: form.flexibilite,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur création");
      }
      await fetchJsTypes();
      setForm({ code: "", libelle: "", heureDebutStandard: "", heureFinStandard: "", dureeStandard: "", estNuit: false, regime: "", flexibilite: "OBLIGATOIRE" });
      setShowForm(false);
      setAddState("saved");
      setTimeout(() => setAddState("idle"), 1500);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Erreur inconnue.");
      setAddState("error");
      setTimeout(() => setAddState("idle"), 3000);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500 py-6">Chargement des types JS…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Légende flexibilité ─────────────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
          Flexibilité des types JS
        </p>
        <div className="space-y-1.5">
          {(["OBLIGATOIRE", "DERNIER_RECOURS"] as FlexibiliteJs[]).map((f) => (
            <div key={f} className="flex items-center gap-2">
              <FlexibiliteBadge flexibilite={f} />
              <span className="text-xs text-blue-700">{FLEXIBILITE_DESCRIPTIONS[f]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Formulaire création ─────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left text-sm font-semibold text-gray-700"
        >
          <span>➕ Nouveau type JS</span>
          <span className="text-gray-400">{showForm ? "▲" : "▼"}</span>
        </button>

        {showForm && (
          <form onSubmit={handleCreate} className="px-4 py-4 space-y-4 bg-white border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Code *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: GIV001"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Libellé *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Service de jour Givors"
                  value={form.libelle}
                  onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Début standard *</label>
                <input
                  type="time"
                  required
                  value={form.heureDebutStandard}
                  onChange={(e) => setForm((f) => ({ ...f, heureDebutStandard: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Fin standard *</label>
                <input
                  type="time"
                  required
                  value={form.heureFinStandard}
                  onChange={(e) => setForm((f) => ({ ...f, heureFinStandard: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Durée standard (min) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="ex: 480"
                  value={form.dureeStandard}
                  onChange={(e) => setForm((f) => ({ ...f, dureeStandard: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Régime</label>
                <input
                  type="text"
                  placeholder="ex: B, C"
                  value={form.regime}
                  onChange={(e) => setForm((f) => ({ ...f, regime: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Flexibilité *</label>
                <select
                  value={form.flexibilite}
                  onChange={(e) => setForm((f) => ({ ...f, flexibilite: e.target.value as FlexibiliteJs }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="OBLIGATOIRE">OBLIGATOIRE</option>
                  <option value="DERNIER_RECOURS">DERNIER_RECOURS</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1">{FLEXIBILITE_DESCRIPTIONS[form.flexibilite]}</p>
              </div>
              <div className="flex items-center gap-3 pt-4">
                <input
                  type="checkbox"
                  id="estNuit-new"
                  checked={form.estNuit}
                  onChange={(e) => setForm((f) => ({ ...f, estNuit: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="estNuit-new" className="text-sm text-gray-700">Poste de nuit</label>
              </div>
            </div>

            {addError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {addError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={addState === "saving"}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {addState === "saving" ? "Création…" : "Créer le type JS"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Tableau ─────────────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Libellé</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Horaires</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Durée</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Flexibilité</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actif</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jsTypes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 italic">
                    Aucun type JS défini.
                  </td>
                </tr>
              )}
              {jsTypes.map((t) => {
                const state = rowStates[t.id] ?? "idle";
                return (
                  <tr key={t.id} className={cn("bg-white hover:bg-gray-50 transition-colors", !t.actif && "opacity-60")}>
                    {/* Code */}
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-gray-800">{t.code}</span>
                      {t.estNuit && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                          <IconMoon className="w-3 h-3" aria-hidden="true" />
                          Nuit
                        </span>
                      )}
                      {t.regime && (
                        <span className="ml-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          {t.regime}
                        </span>
                      )}
                    </td>

                    {/* Libellé */}
                    <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate" title={t.libelle}>
                      {t.libelle}
                    </td>

                    {/* Horaires */}
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {t.heureDebutStandard}–{t.heureFinStandard}
                    </td>

                    {/* Durée */}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {Math.floor(t.dureeStandard / 60)}h{(t.dureeStandard % 60).toString().padStart(2, "0")}
                    </td>

                    {/* Flexibilité — sélecteur inline */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={t.flexibilite}
                          disabled={state === "saving"}
                          onChange={(e) => patchJsType(t.id, { flexibilite: e.target.value })}
                          className={cn(
                            "text-[10px] font-semibold rounded px-1.5 py-1 border focus:outline-none focus:ring-1",
                            t.flexibilite === "OBLIGATOIRE"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-400"
                              : "bg-amber-50 text-amber-700 border-amber-200 focus:ring-amber-400"
                          )}
                        >
                          <option value="OBLIGATOIRE">OBLIGATOIRE</option>
                          <option value="DERNIER_RECOURS">DERNIER RECOURS</option>
                        </select>
                        {state === "saving" && <span className="text-[10px] text-gray-400">…</span>}
                        {state === "saved" && <span className="text-[10px] text-emerald-600">✓</span>}
                        {state === "error" && <span className="text-[10px] text-red-600">✗</span>}
                      </div>
                    </td>

                    {/* Actif toggle */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={state === "saving"}
                        onClick={() => patchJsType(t.id, { actif: !t.actif })}
                        className={cn(
                          "w-10 h-5 rounded-full transition-colors relative",
                          t.actif ? "bg-blue-500" : "bg-gray-300"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                            t.actif ? "translate-x-5" : "translate-x-0.5"
                          )}
                        />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {confirmDelete === t.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600">Confirmer ?</span>
                          <button
                            type="button"
                            onClick={() => deleteJsType(t.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold"
                          >
                            Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={t._count.lpaJsTypes > 0 || state === "saving"}
                          onClick={() => setConfirmDelete(t.id)}
                          title={t._count.lpaJsTypes > 0 ? `Utilisé par ${t._count.lpaJsTypes} LPA(s)` : "Supprimer"}
                          className="text-xs text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {jsTypes.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            {jsTypes.length} type{jsTypes.length > 1 ? "s" : ""} JS
          </div>
        )}
      </div>
    </div>
  );
}
