"use client";

import { useEffect, useState, useCallback } from "react";

interface NpoExclusionCode {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  createdAt: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function NpoExclusionsManager() {
  const [codes, setCodes] = useState<NpoExclusionCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire d'ajout
  const [newCode, setNewCode] = useState("");
  const [newLibelle, setNewLibelle] = useState("");
  const [addState, setAddState] = useState<SaveState>("idle");
  const [addError, setAddError] = useState<string | null>(null);

  // États des lignes en cours de sauvegarde / suppression
  const [rowStates, setRowStates] = useState<Record<string, SaveState>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/npo-exclusions");
      if (!res.ok) throw new Error("Impossible de charger les codes.");
      const data: NpoExclusionCode[] = await res.json();
      setCodes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  // ── Toggle actif ──────────────────────────────────────────────────────────────
  async function toggleActif(id: string, current: boolean) {
    setRowStates((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const res = await fetch(`/api/admin/npo-exclusions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !current }),
      });
      if (!res.ok) throw new Error();
      const updated: NpoExclusionCode = await res.json();
      setCodes((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setRowStates((prev) => ({ ...prev, [id]: "saved" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 1500);
    } catch {
      setRowStates((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 2000);
    }
  }

  // ── Supprimer ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    setConfirmDelete(null);
    setRowStates((prev) => ({ ...prev, [id]: "saving" }));
    try {
      const res = await fetch(`/api/admin/npo-exclusions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCodes((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setRowStates((prev) => ({ ...prev, [id]: "error" }));
      setTimeout(() => setRowStates((prev) => ({ ...prev, [id]: "idle" })), 2000);
    }
  }

  // ── Ajouter ───────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const code = newCode.trim().toUpperCase();
    const libelle = newLibelle.trim();
    if (!code || !libelle) return;

    setAddState("saving");
    setAddError(null);
    try {
      const res = await fetch("/api/admin/npo-exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, libelle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Erreur lors de la création.");
        setAddState("error");
        setTimeout(() => setAddState("idle"), 3000);
        return;
      }
      setCodes((prev) => [...prev, data as NpoExclusionCode].sort((a, b) => a.code.localeCompare(b.code)));
      setNewCode("");
      setNewLibelle("");
      setAddState("saved");
      setTimeout(() => setAddState("idle"), 2000);
    } catch {
      setAddError("Erreur réseau.");
      setAddState("error");
      setTimeout(() => setAddState("idle"), 3000);
    }
  }

  const nbActifs = codes.filter((c) => c.actif).length;

  return (
    <div className="space-y-6">
      {/* Modal de confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Confirmer la suppression</h3>
            <p className="text-sm text-gray-600">
              Le code{" "}
              <span className="font-mono font-semibold text-red-600">
                {codes.find((c) => c.id === confirmDelete)?.code}
              </span>{" "}
              sera définitivement supprimé. Les agents portant ce type de NPO pourront à nouveau
              être sollicités lors des simulations.
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

      {/* Encart d'information */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 space-y-1.5">
        <p className="font-semibold text-amber-900">Comment fonctionnent les codes NPO exclus ?</p>
        <p className="text-xs text-amber-700">
          Chaque code est un <span className="font-medium">préfixe</span> appliqué au champ "Code JS" des événements NPO
          du planning. Un agent dont le planning contient un NPO dont le code <em>commence par</em> l'un de ces préfixes,
          et qui chevauche l'imprévu simulé, est automatiquement exclu de toutes les simulations (simples et multi-JS).
        </p>
        <p className="text-xs text-amber-700">
          Exemple : le préfixe{" "}
          <span className="font-mono bg-amber-100 px-1 rounded">MA</span>{" "}
          exclut les NPO <span className="font-mono bg-amber-100 px-1 rounded">MA01</span>,{" "}
          <span className="font-mono bg-amber-100 px-1 rounded">MAL</span>,{" "}
          <span className="font-mono bg-amber-100 px-1 rounded">MALADIE</span>…
        </p>
      </div>

      {/* Bande de statut global */}
      {!loading && !error && (
        <div className="flex items-center gap-3 text-sm">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            nbActifs > 0
              ? "bg-green-100 text-green-700 border border-green-200"
              : "bg-red-100 text-red-700 border border-red-200"
          }`}>
            {nbActifs > 0
              ? `${nbActifs} code${nbActifs > 1 ? "s" : ""} actif${nbActifs > 1 ? "s" : ""}`
              : "Aucun code actif — aucune exclusion NPO en vigueur"}
          </span>
          <span className="text-gray-400 text-xs">{codes.length} code{codes.length !== 1 ? "s" : ""} au total</span>
        </div>
      )}

      {/* États de chargement/erreur */}
      {loading && <div className="text-center py-10 text-gray-400 text-sm">Chargement…</div>}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>}

      {/* Tableau des codes */}
      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Préfixe</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Libellé</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28 text-center">Statut</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {codes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Aucun code configuré.
                  </td>
                </tr>
              )}
              {codes.map((c) => {
                const rowState = rowStates[c.id] ?? "idle";
                return (
                  <tr key={c.id} className={`transition-colors ${!c.actif ? "bg-gray-50 opacity-60" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                        {c.code}
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
      )}

      {/* Formulaire d'ajout */}
      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 bg-slate-50/50 rounded-t-xl">
            <h2 className="font-semibold text-slate-800 text-sm">Ajouter un code</h2>
          </div>
          <form onSubmit={handleAdd} className="px-5 py-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-1 sm:w-32">
                <label className="text-xs text-gray-500 font-medium">Préfixe *</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="ex : CLM"
                  maxLength={10}
                  className="font-mono text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-gray-500 font-medium">Libellé *</label>
                <input
                  type="text"
                  value={newLibelle}
                  onChange={(e) => setNewLibelle(e.target.value)}
                  placeholder="ex : Congé longue maladie"
                  className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col justify-end gap-1">
                <label className="text-xs text-gray-500 opacity-0 select-none">action</label>
                <button
                  type="submit"
                  disabled={!newCode.trim() || !newLibelle.trim() || addState === "saving"}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {addState === "saving" ? <><SpinIcon /> Ajout…</> : "+ Ajouter"}
                </button>
              </div>
            </div>

            {addError && (
              <p className="mt-2 text-xs text-red-600 font-medium">{addError}</p>
            )}
            {addState === "saved" && (
              <p className="mt-2 text-xs text-green-600 font-medium">✓ Code ajouté avec succès.</p>
            )}
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
