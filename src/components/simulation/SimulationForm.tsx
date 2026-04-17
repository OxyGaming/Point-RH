"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IconZap } from "@/components/icons/Icons";

interface PlanningImport {
  id: string;
  filename: string;
  importedAt: string;
  nbAgents: number;
  nbLignes: number;
  isActive: boolean;
}

export default function SimulationForm() {
  const router = useRouter();
  const [imports, setImports] = useState<PlanningImport[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    importId: "",
    dateDebut: "",
    heureDebut: "",
    dateFin: "",
    heureFin: "",
    poste: "",
    remplacement: false,
    deplacement: false,
    posteNuit: false,
    commentaire: "",
  });

  useEffect(() => {
    fetch("/api/import")
      .then((r) => r.json())
      .then((data: PlanningImport[]) => {
        setImports(data);
        // Pré-sélectionner l'import actif, sinon le premier
        const active = data.find((d) => d.isActive) ?? data[0];
        if (active) setForm((f) => ({ ...f, importId: active.id }));
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, codeJs: form.poste || null }),
      });
      const data = await res.json();
      if (res.ok && data.simulationId) {
        router.push(`/resultats/${data.simulationId}`);
      } else {
        alert(data.error ?? "Erreur lors de la simulation");
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const set = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Planning */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Planning importé *</label>
        <select
          value={form.importId}
          onChange={(e) => set("importId", e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Sélectionner un import…</option>
          {imports.map((imp) => (
            <option key={imp.id} value={imp.id}>
              {imp.isActive ? "✓ " : ""}{imp.filename} — {imp.nbAgents} agents — {new Date(imp.importedAt).toLocaleDateString("fr-FR")}{imp.isActive ? " (actif)" : ""}
            </option>
          ))}
        </select>
        {imports.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">Aucun planning importé. <a href="/import" className="underline">Importer d&apos;abord un fichier.</a></p>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Date de début *</label>
          <input
            type="date"
            value={form.dateDebut}
            onChange={(e) => set("dateDebut", e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Heure de début *</label>
          <input
            type="time"
            value={form.heureDebut}
            onChange={(e) => set("heureDebut", e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Date de fin *</label>
          <input
            type="date"
            value={form.dateFin}
            onChange={(e) => set("dateFin", e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Heure de fin *</label>
          <input
            type="time"
            value={form.heureFin}
            onChange={(e) => set("heureFin", e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Référence JS */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Début de la référence JS *</label>
        <input
          type="text"
          value={form.poste}
          onChange={(e) => set("poste", e.target.value.toUpperCase())}
          required
          placeholder="ex: GIC, GIR, GIV…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">Préfixe utilisé pour vérifier les habilitations des agents</p>
      </div>

      {/* Options */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700 mb-2">Caractéristiques de l&apos;imprévu</p>
        {[
          { key: "remplacement", label: "Remplacement (agent remplaçant un autre)" },
          { key: "deplacement", label: "Déplacement requis" },
          { key: "posteNuit", label: "Poste de nuit (> 2h30 entre 21h30 et 06h30)" },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form[key as keyof typeof form] as boolean}
              onChange={(e) => set(key, e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {/* Commentaire */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Commentaire</label>
        <textarea
          value={form.commentaire}
          onChange={(e) => set("commentaire", e.target.value)}
          rows={3}
          placeholder="Contexte, motif de l'imprévu…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !form.importId}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
      >
        {loading ? (
          "Analyse en cours…"
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5">
            Lancer la simulation
            <IconZap className="w-4 h-4" aria-hidden="true" />
          </span>
        )}
      </button>
    </form>
  );
}
