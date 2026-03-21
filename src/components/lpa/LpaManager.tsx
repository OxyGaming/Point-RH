"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsType {
  id: string;
  code: string;
  libelle: string;
  heureDebutStandard: string;
  heureFinStandard: string;
  dureeStandard: number;
  estNuit: boolean;
  actif: boolean;
  _count?: { lpaJsTypes: number };
}

interface Lpa {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  lpaJsTypes: Array<{ id: string; jsTypeId: string; jsType: JsType }>;
  _count: { agents: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

// ─── Sous-composant : formulaire création LPA ────────────────────────────────

function NewLpaForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/lpa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, libelle }),
    });
    setSaving(false);
    if (res.ok) {
      setCode("");
      setLibelle("");
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error ?? "Erreur");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-wrap">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Code LPA</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ex: GIVORS"
          required
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Libellé</label>
        <input
          type="text"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="ex: Givors"
          required
          className="border border-gray-300 rounded px-2 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-1.5 rounded transition-colors"
      >
        {saving ? "…" : "+ Créer"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

// ─── Sous-composant : formulaire création JsType ──────────────────────────────

function NewJsTypeForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    code: "",
    libelle: "",
    heureDebutStandard: "06:00",
    heureFinStandard: "14:00",
    dureeStandard: 480,
    estNuit: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/js-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ code: "", libelle: "", heureDebutStandard: "06:00", heureFinStandard: "14:00", dureeStandard: 480, estNuit: false });
      setOpen(false);
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error ?? "Erreur");
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-blue-600 hover:underline">
        + Nouveau type JS
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-blue-800">Nouveau type JS</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Code</label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="ex: GIV"
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Libellé</label>
          <input
            type="text"
            value={form.libelle}
            onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
            placeholder="ex: Givors matin"
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Début standard</label>
          <input
            type="time"
            value={form.heureDebutStandard}
            onChange={(e) => setForm((f) => ({ ...f, heureDebutStandard: e.target.value }))}
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Fin standard</label>
          <input
            type="time"
            value={form.heureFinStandard}
            onChange={(e) => setForm((f) => ({ ...f, heureFinStandard: e.target.value }))}
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Durée standard (min)</label>
          <input
            type="number"
            value={form.dureeStandard}
            onChange={(e) => setForm((f) => ({ ...f, dureeStandard: parseInt(e.target.value) || 0 }))}
            min={1}
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            id="estNuit"
            checked={form.estNuit}
            onChange={(e) => setForm((f) => ({ ...f, estNuit: e.target.checked }))}
            className="w-4 h-4"
          />
          <label htmlFor="estNuit" className="text-sm text-gray-700">Poste de nuit</label>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-1.5 rounded transition-colors"
        >
          {saving ? "…" : "Créer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ─── Sous-composant : ligne édition JsType ────────────────────────────────────

function JsTypeEditRow({
  jt,
  onSaved,
  onCancel,
}: {
  jt: JsType;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    code: jt.code,
    libelle: jt.libelle,
    heureDebutStandard: jt.heureDebutStandard,
    heureFinStandard: jt.heureFinStandard,
    dureeStandard: jt.dureeStandard,
    estNuit: jt.estNuit,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/js-types/${jt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error ?? "Erreur");
    }
  };

  return (
    <>
      <tr className="bg-amber-50 border-b border-amber-200">
        <td className="py-2 px-3">
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="w-24 border border-gray-300 rounded px-1.5 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </td>
        <td className="py-2 px-3">
          <input
            type="text"
            value={form.libelle}
            onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
            className="w-full border border-gray-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </td>
        <td className="py-2 px-3">
          <div className="flex gap-1 items-center">
            <input
              type="time"
              value={form.heureDebutStandard}
              onChange={(e) => setForm((f) => ({ ...f, heureDebutStandard: e.target.value }))}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="time"
              value={form.heureFinStandard}
              onChange={(e) => setForm((f) => ({ ...f, heureFinStandard: e.target.value }))}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </td>
        <td className="py-2 px-3">
          <input
            type="number"
            value={form.dureeStandard}
            onChange={(e) => setForm((f) => ({ ...f, dureeStandard: parseInt(e.target.value) || 0 }))}
            min={1}
            className="w-20 border border-gray-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <span className="text-xs text-gray-400 ml-1">min</span>
        </td>
        <td className="py-2 px-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.estNuit}
              onChange={(e) => setForm((f) => ({ ...f, estNuit: e.target.checked }))}
              className="w-4 h-4"
            />
            <span className="text-xs text-gray-600">nuit</span>
          </label>
        </td>
        <td className="py-2 px-3 text-right">
          <div className="flex gap-2 justify-end items-center">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-semibold px-3 py-1 rounded transition-colors"
            >
              {saving ? "…" : "Enregistrer"}
            </button>
            <button
              onClick={onCancel}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
            >
              Annuler
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

// ─── Sous-composant : carte LPA ───────────────────────────────────────────────

function LpaCard({
  lpa,
  allJsTypes,
  onRefresh,
}: {
  lpa: Lpa;
  allJsTypes: JsType[];
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [selectedJsTypeId, setSelectedJsTypeId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ code: lpa.code, libelle: lpa.libelle });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const associatedIds = new Set(lpa.lpaJsTypes.map((ljt) => ljt.jsTypeId));
  const available = allJsTypes.filter((jt) => jt.actif && !associatedIds.has(jt.id));

  const handleAdd = async () => {
    if (!selectedJsTypeId) return;
    setAdding(true);
    await fetch(`/api/lpa/${lpa.id}/js-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsTypeId: selectedJsTypeId }),
    });
    setSelectedJsTypeId("");
    setAdding(false);
    onRefresh();
  };

  const handleRemove = async (jsTypeId: string) => {
    setDeleting(true);
    await fetch(`/api/lpa/${lpa.id}/js-types`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsTypeId }),
    });
    setDeleting(false);
    onRefresh();
  };

  const handleDeleteLpa = async () => {
    if (!confirm(`Supprimer la LPA "${lpa.code}" ? Cette action est irréversible.`)) return;
    await fetch(`/api/lpa/${lpa.id}`, { method: "DELETE" });
    onRefresh();
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    setEditError(null);
    const res = await fetch(`/api/lpa/${lpa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      onRefresh();
    } else {
      const data = await res.json();
      setEditError(data.error ?? "Erreur");
    }
  };

  const handleCancelEdit = () => {
    setEditForm({ code: lpa.code, libelle: lpa.libelle });
    setEditError(null);
    setEditing(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
      {/* En-tête LPA */}
      <div className="flex items-start justify-between">
        {editing ? (
          <div className="flex-1 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Code</label>
                <input
                  type="text"
                  value={editForm.code}
                  onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-28 border border-amber-300 rounded px-2 py-1 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Libellé</label>
                <input
                  type="text"
                  value={editForm.libelle}
                  onChange={(e) => setEditForm((f) => ({ ...f, libelle: e.target.value }))}
                  className="w-48 border border-amber-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            {editError && <p className="text-xs text-red-600">{editError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="text-xs bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-semibold px-3 py-1 rounded transition-colors"
              >
                {saving ? "…" : "Enregistrer"}
              </button>
              <button
                onClick={handleCancelEdit}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="font-bold text-gray-900 text-lg">{lpa.code}</h3>
            <p className="text-sm text-gray-500">{lpa.libelle}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {lpa._count.agents} agent(s) sur cette LPA
            </p>
          </div>
        )}

        {!editing && (
          <div className="flex gap-3 ml-4 shrink-0">
            <button
              onClick={() => { setEditForm({ code: lpa.code, libelle: lpa.libelle }); setEditing(true); }}
              className="text-xs text-amber-600 hover:text-amber-800 transition-colors font-semibold"
            >
              Éditer
            </button>
            <button
              onClick={handleDeleteLpa}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>

      {/* JS types dans la LPA */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          JS dans la LPA ({lpa.lpaJsTypes.length})
        </p>
        {lpa.lpaJsTypes.length === 0 ? (
          <p className="text-xs text-amber-600 italic">
            Aucun type JS associé — tous les JS seront hors LPA
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lpa.lpaJsTypes.map(({ jsType }) => (
              <div
                key={jsType.id}
                className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 text-sm"
              >
                <span className="font-mono font-semibold text-green-800">{jsType.code}</span>
                <span className="text-green-700">{jsType.libelle}</span>
                <span className="text-xs text-green-600">
                  {jsType.heureDebutStandard}→{jsType.heureFinStandard}
                </span>
                {jsType.estNuit && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 rounded px-1">nuit</span>
                )}
                <button
                  onClick={() => handleRemove(jsType.id)}
                  disabled={deleting}
                  className="text-green-500 hover:text-red-500 font-bold text-xs ml-1 transition-colors"
                  title="Retirer de la LPA"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ajouter un JS type */}
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selectedJsTypeId}
            onChange={(e) => setSelectedJsTypeId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Ajouter un JS type…</option>
            {available.map((jt) => (
              <option key={jt.id} value={jt.id}>
                {jt.code} — {jt.libelle} ({jt.heureDebutStandard}→{jt.heureFinStandard})
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedJsTypeId || adding}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
          >
            {adding ? "…" : "Associer"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal LpaManager ──────────────────────────────────────────

export default function LpaManager() {
  const [lpas, setLpas] = useState<Lpa[]>([]);
  const [jsTypes, setJsTypes] = useState<JsType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"lpa" | "js-types">("lpa");
  const [editingJsTypeId, setEditingJsTypeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [lpaRes, jsRes] = await Promise.all([
      fetch("/api/lpa").then((r) => r.json()),
      fetch("/api/js-types").then((r) => r.json()),
    ]);
    setLpas(lpaRes);
    setJsTypes(jsRes);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteJsType = async (id: string) => {
    if (!confirm("Supprimer ce type JS ? Toutes les associations LPA seront perdues.")) return;
    await fetch(`/api/js-types/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-6">
      {/* Onglets */}
      <div className="border-b border-gray-200 flex gap-1">
        {(["lpa", "js-types"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "lpa" ? "LPA" : "Types JS"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : activeTab === "lpa" ? (
        /* ─── Onglet LPA ─── */
        <div className="space-y-6">
          <NewLpaForm onCreated={load} />

          {lpas.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Aucune LPA configurée.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {lpas.map((lpa) => (
                <LpaCard
                  key={lpa.id}
                  lpa={lpa}
                  allJsTypes={jsTypes}
                  onRefresh={load}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ─── Onglet Types JS ─── */
        <div className="space-y-6">
          <NewJsTypeForm onCreated={load} />

          {jsTypes.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Aucun type JS configuré.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Libellé</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Horaires</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Durée</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Nuit</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {jsTypes.map((jt) =>
                    editingJsTypeId === jt.id ? (
                      <JsTypeEditRow
                        key={jt.id}
                        jt={jt}
                        onSaved={() => { setEditingJsTypeId(null); load(); }}
                        onCancel={() => setEditingJsTypeId(null)}
                      />
                    ) : (
                      <tr key={jt.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono font-semibold text-gray-900">
                          {jt.code}
                          {!jt.actif && (
                            <span className="ml-1.5 text-xs bg-gray-200 text-gray-500 rounded px-1">inactif</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-700">{jt.libelle}</td>
                        <td className="py-2 px-3 text-gray-600 font-mono text-xs">
                          {jt.heureDebutStandard}→{jt.heureFinStandard}
                        </td>
                        <td className="py-2 px-3 text-gray-600 text-xs">
                          {minutesToTime(jt.dureeStandard)}
                        </td>
                        <td className="py-2 px-3">
                          {jt.estNuit ? (
                            <span className="text-xs bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5">nuit</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex gap-3 justify-end">
                            <button
                              onClick={() => setEditingJsTypeId(jt.id)}
                              className="text-xs text-amber-600 hover:text-amber-800 transition-colors font-semibold"
                            >
                              Éditer
                            </button>
                            <button
                              onClick={() => handleDeleteJsType(jt.id)}
                              className="text-xs text-red-500 hover:text-red-700 transition-colors"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
