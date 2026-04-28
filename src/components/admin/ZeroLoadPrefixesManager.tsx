"use client";

import { useEffect, useState, useCallback } from "react";

interface ZeroLoadPrefix {
  id: string;
  prefixe: string;
  libelle: string;
  actif: boolean;
  createdAt: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ZeroLoadPrefixesManager() {
  const [items, setItems] = useState<ZeroLoadPrefix[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newPrefixe, setNewPrefixe] = useState("");
  const [newLibelle, setNewLibelle] = useState("");
  const [addState, setAddState] = useState<SaveState>("idle");
  const [addError, setAddError] = useState<string | null>(null);

  const [rowStates, setRowStates] = useState<Record<string, SaveState>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/zero-load-prefixes");
      if (!res.ok) throw new Error("Impossible de charger les préfixes.");
      const data: ZeroLoadPrefix[] = await res.json();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function toggleActif(id: string, current: boolean) {
    setRowStates((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const res = await fetch(`/api/admin/zero-load-prefixes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !current }),
      });
      if (!res.ok) throw new Error();
      const updated: ZeroLoadPrefix = await res.json();
      setItems((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setRowStates((prev) => ({ ...prev, [id]: "saved" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 1500);
    } catch {
      setRowStates((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 2000);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDelete(null);
    setRowStates((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const res = await fetch(`/api/admin/zero-load-prefixes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setRowStates((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 2000);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const prefixe = newPrefixe.trim().toUpperCase();
    const libelle = newLibelle.trim();
    if (!prefixe || !libelle) return;

    setAddState("saving");
    setAddError(null);
    try {
      const res = await fetch("/api/admin/zero-load-prefixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixe, libelle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Erreur lors de la création.");
        setAddState("error");
        setTimeout(() => setAddState("idle"), 3000);
        return;
      }
      setItems((prev) => [...prev, data as ZeroLoadPrefix].sort((a, b) => a.prefixe.localeCompare(b.prefixe)));
      setNewPrefixe("");
      setNewLibelle("");
      setAddState("saved");
      setTimeout(() => setAddState("idle"), 2000);
    } catch {
      setAddError("Erreur réseau.");
      setAddState("error");
      setTimeout(() => setAddState("idle"), 3000);
    }
  }

  const nbActifs = items.filter((c) => c.actif).length;

  return (
    <div className="space-y-6">
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Confirmer la suppression</h3>
            <p className="text-sm text-gray-600">
              Le préfixe{" "}
              <span className="font-mono font-semibold text-red-600">
                {items.find((c) => c.id === confirmDelete)?.prefixe}
              </span>{" "}
              sera définitivement supprimé. Les codes JS commençant par ce préfixe ne seront plus
              traités comme JS Z (ils redeviennent des JS « avec charge »).
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Supprimer
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-purple-50 border border-purple-200 rounded-xl px-5 py-4 text-sm text-purple-900 space-y-1.5">
        <p className="font-semibold">Comment fonctionnent les préfixes JS Z additionnels ?</p>
        <p className="text-xs text-purple-800">
          Chaque préfixe est appliqué au champ <span className="font-medium">code JS</span> des événements de planning.
          Toute ligne JS dont le code <em>commence par</em> l'un de ces préfixes est traitée comme une JS Z :
          mobilisation directe (pas de cascade), <strong>+15 pts</strong> au scoring,
          badge violet « JS Z », exclusion des propositions d'habilitation post-import.
        </p>
        <p className="text-xs text-purple-800">
          Ces préfixes <strong>s'ajoutent</strong> aux règles built-in (suffixe{" "}
          <span className="font-mono bg-purple-100 px-1 rounded">« Z »</span>, préfixe{" "}
          <span className="font-mono bg-purple-100 px-1 rounded">FO</span>, typeJs{" "}
          <span className="font-mono bg-purple-100 px-1 rounded">DIS</span>) — ne re-saisissez pas ces 3 cas.
        </p>
        <p className="text-xs text-purple-800">
          Exemple : le préfixe{" "}
          <span className="font-mono bg-purple-100 px-1 rounded">DISP</span>{" "}
          assimile <span className="font-mono bg-purple-100 px-1 rounded">DISP</span>,{" "}
          <span className="font-mono bg-purple-100 px-1 rounded">DISP01</span>,{" "}
          <span className="font-mono bg-purple-100 px-1 rounded">DISPO_FORMATION</span>… à des JS Z.
        </p>
      </div>

      {!loading && !error && (
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              nbActifs > 0
                ? "bg-purple-100 text-purple-700 border border-purple-200"
                : "bg-gray-100 text-gray-600 border border-gray-200"
            }`}
          >
            {nbActifs > 0
              ? `${nbActifs} préfixe${nbActifs > 1 ? "s" : ""} actif${nbActifs > 1 ? "s" : ""}`
              : "Aucun préfixe additionnel — seules les règles built-in s'appliquent"}
          </span>
          <span className="text-gray-400 text-xs">
            {items.length} entrée{items.length !== 1 ? "s" : ""} au total
          </span>
        </div>
      )}

      {loading && <div className="text-center py-10 text-gray-400 text-sm">Chargement…</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Préfixe</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Libellé</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28 text-center">Statut</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">
                      Aucun préfixe configuré. Les règles built-in (suffixe « Z », préfixe FO, typeJs DIS) restent actives.
                    </td>
                  </tr>
                )}
                {items.map((c) => {
                  const rowState = rowStates[c.id] ?? "idle";
                  return (
                    <tr key={c.id} className={`transition-colors ${!c.actif ? "bg-gray-50 opacity-60" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                          {c.prefixe}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{c.libelle}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActif(c.id, c.actif)}
                          disabled={rowState === "saving"}
                          title={c.actif ? "Cliquer pour désactiver" : "Cliquer pour activer"}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            c.actif
                              ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                              : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {rowState === "saving" ? (
                            <SpinIcon />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full ${c.actif ? "bg-green-500" : "bg-gray-400"}`} />
                          )}
                          {c.actif ? "Actif" : "Inactif"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {rowState === "saved" ? (
                          <span className="text-xs text-green-600 font-medium">✓ Enregistré</span>
                        ) : rowState === "error" ? (
                          <span className="text-xs text-red-600 font-medium">✗ Erreur</span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(c.id)}
                            disabled={rowState === "saving"}
                            className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
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
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 bg-slate-50/50 rounded-t-xl">
            <h2 className="font-semibold text-slate-800 text-sm">Ajouter un préfixe</h2>
          </div>
          <form onSubmit={handleAdd} className="px-5 py-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-1 sm:w-32">
                <label className="text-xs text-gray-500 font-medium">Préfixe *</label>
                <input
                  type="text"
                  value={newPrefixe}
                  onChange={(e) => setNewPrefixe(e.target.value.toUpperCase())}
                  placeholder="ex : DISP"
                  maxLength={20}
                  className="font-mono text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-500 font-medium">Libellé *</label>
                <input
                  type="text"
                  value={newLibelle}
                  onChange={(e) => setNewLibelle(e.target.value)}
                  placeholder="ex : Disponibilité programmée"
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex flex-col justify-end gap-1">
                <label className="text-xs text-gray-500 opacity-0 select-none">action</label>
                <button
                  type="submit"
                  disabled={!newPrefixe.trim() || !newLibelle.trim() || addState === "saving"}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {addState === "saving" ? (
                    <>
                      <SpinIcon /> Ajout…
                    </>
                  ) : (
                    "+ Ajouter"
                  )}
                </button>
              </div>
            </div>

            {addError && <p className="mt-2 text-xs text-red-600 font-medium">{addError}</p>}
            {addState === "saved" && <p className="mt-2 text-xs text-green-600 font-medium">✓ Préfixe ajouté avec succès.</p>}
          </form>
        </div>
      )}
    </div>
  );
}

function SpinIcon() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
