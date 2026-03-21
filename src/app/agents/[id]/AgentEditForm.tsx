"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentData {
  id: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  regimeB: boolean;
  regimeC: boolean;
  habilitations: string[];
  lpaBaseId: string | null;
}

interface Lpa {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface JsType {
  id: string;
  code: string;
  libelle: string;
}

interface DeplacementRule {
  id: string;
  jsTypeId: string | null;
  prefixeJs: string | null;
  horsLpa: boolean | null;
  tempsTrajetAllerMinutes: number;
  tempsTrajetRetourMinutes: number;
  actif: boolean;
  jsType: JsType | null;
}

// ─── Formulaire profil agent ──────────────────────────────────────────────────

export default function AgentEditForm({ agent }: { agent: AgentData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    posteAffectation: agent.posteAffectation ?? "",
    agentReserve: agent.agentReserve,
    peutFaireNuit: agent.peutFaireNuit,
    peutEtreDeplace: agent.peutEtreDeplace,
    regimeB: agent.regimeB,
    regimeC: agent.regimeC,
    habilitationsStr: agent.habilitations.join(", "),
    lpaBaseId: agent.lpaBaseId ?? "",
  });

  const [lpas, setLpas] = useState<Lpa[]>([]);
  const [jsTypes, setJsTypes] = useState<JsType[]>([]);
  const [rules, setRules] = useState<DeplacementRule[]>([]);

  const loadRules = useCallback(async () => {
    const res = await fetch(`/api/agents/${agent.id}/deplacement-rules`);
    if (res.ok) setRules(await res.json());
  }, [agent.id]);

  useEffect(() => {
    fetch("/api/lpa").then((r) => r.json()).then((data: Lpa[]) => setLpas(data.filter((l) => l.actif)));
    fetch("/api/js-types").then((r) => r.json()).then(setJsTypes);
    loadRules();
  }, [loadRules]);

  const handleSave = async () => {
    setSaving(true);
    const habilitations = [...new Set(
      form.habilitationsStr
        .split(/[,;]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    )];

    const { habilitationsStr: _, ...formData } = form;
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...formData,
        habilitations,
        lpaBaseId: formData.lpaBaseId || null,
      }),
    });
    setSaving(false);
    router.refresh();
  };

  const toggle = (key: string) => setForm((f) => ({ ...f, [key]: !f[key as keyof typeof f] }));

  return (
    <div className="space-y-4">
      {/* ── Profil RH ── */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-800">Modifier le profil</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Poste d&apos;affectation</label>
            <input
              type="text"
              value={form.posteAffectation}
              onChange={(e) => setForm((f) => ({ ...f, posteAffectation: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            {[
              { key: "agentReserve", label: "Agent de réserve" },
              { key: "peutFaireNuit", label: "Peut faire nuit" },
              { key: "peutEtreDeplace", label: "Peut être déplacé (autorisation générale)" },
              { key: "regimeB", label: "Régime B" },
              { key: "regimeC", label: "Régime C" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={() => toggle(key)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                {label}
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Préfixes JS autorisés
            </label>
            <p className="text-xs text-gray-500 mb-1">
              Ex : <span className="font-mono">GIC, BAD, PEY</span> — <span className="text-red-500 font-medium">Vide = exclu de toute simulation.</span>
            </p>
            <input
              type="text"
              value={form.habilitationsStr}
              onChange={(e) => setForm((f) => ({ ...f, habilitationsStr: e.target.value }))}
              placeholder="ex: GIC, BAD, PEY"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* ── LPA de base ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              LPA de base (Lieu de Prise d&apos;Attachement)
            </label>
            <p className="text-xs text-gray-500 mb-1">
              Détermine automatiquement si une JS est en déplacement lors des simulations.
            </p>
            <select
              value={form.lpaBaseId}
              onChange={(e) => setForm((f) => ({ ...f, lpaBaseId: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Aucune LPA configurée (déplacement indéterminable) —</option>
              {lpas.map((lpa) => (
                <option key={lpa.id} value={lpa.id}>
                  {lpa.code} — {lpa.libelle}
                </option>
              ))}
            </select>
            {lpas.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Aucune LPA disponible.{" "}
                <a href="/lpa" className="underline">Créer des LPA d&apos;abord.</a>
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </CardBody>
      </Card>

      {/* ── Règles de déplacement spécifiques ── */}
      <DeplacementRulesSection
        agentId={agent.id}
        rules={rules}
        jsTypes={jsTypes}
        onRefresh={loadRules}
      />
    </div>
  );
}

// ─── Section règles de déplacement ───────────────────────────────────────────

function DeplacementRulesSection({
  agentId,
  rules,
  jsTypes,
  onRefresh,
}: {
  agentId: string;
  rules: DeplacementRule[];
  jsTypes: JsType[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newRule, setNewRule] = useState({
    matchType: "prefixe" as "prefixe" | "jsType",
    jsTypeId: "",
    prefixeJs: "",
    horsLpa: "" as "" | "true" | "false",
    tempsTrajetAllerMinutes: 0,
    tempsTrajetRetourMinutes: 0,
  });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    setSaving(true);
    await fetch(`/api/agents/${agentId}/deplacement-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsTypeId: newRule.matchType === "jsType" ? newRule.jsTypeId || null : null,
        prefixeJs: newRule.matchType === "prefixe" ? newRule.prefixeJs || null : null,
        horsLpa: newRule.horsLpa === "" ? null : newRule.horsLpa === "true",
        tempsTrajetAllerMinutes: newRule.tempsTrajetAllerMinutes,
        tempsTrajetRetourMinutes: newRule.tempsTrajetRetourMinutes,
      }),
    });
    setShowForm(false);
    setNewRule({ matchType: "prefixe", jsTypeId: "", prefixeJs: "", horsLpa: "", tempsTrajetAllerMinutes: 0, tempsTrajetRetourMinutes: 0 });
    setSaving(false);
    onRefresh();
  };

  const handleToggleActive = async (rule: DeplacementRule) => {
    await fetch(`/api/agents/${agentId}/deplacement-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif: !rule.actif }),
    });
    onRefresh();
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Supprimer cette règle ?")) return;
    await fetch(`/api/agents/${agentId}/deplacement-rules/${ruleId}`, { method: "DELETE" });
    onRefresh();
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Règles de déplacement spécifiques</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-blue-600 hover:underline"
        >
          + Ajouter
        </button>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-gray-500">
          Permet de définir les temps de trajet et d&apos;éventuels overrides
          hors/dans LPA pour des JS spécifiques de cet agent.
        </p>

        {/* Formulaire ajout */}
        {showForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-800">Nouvelle règle</p>

            {/* Type de matching */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Critère de matching</label>
              <select
                value={newRule.matchType}
                onChange={(e) => setNewRule((r) => ({ ...r, matchType: e.target.value as "prefixe" | "jsType" }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="prefixe">Préfixe de code JS</option>
                <option value="jsType">Type JS (référentiel)</option>
              </select>
            </div>

            {newRule.matchType === "prefixe" ? (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Préfixe JS</label>
                <input
                  type="text"
                  value={newRule.prefixeJs}
                  onChange={(e) => setNewRule((r) => ({ ...r, prefixeJs: e.target.value.toUpperCase() }))}
                  placeholder="ex: GIV"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Type JS</label>
                <select
                  value={newRule.jsTypeId}
                  onChange={(e) => setNewRule((r) => ({ ...r, jsTypeId: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner…</option>
                  {jsTypes.map((jt) => (
                    <option key={jt.id} value={jt.id}>{jt.code} — {jt.libelle}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Trajet aller (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newRule.tempsTrajetAllerMinutes}
                  onChange={(e) => setNewRule((r) => ({ ...r, tempsTrajetAllerMinutes: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Trajet retour (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={newRule.tempsTrajetRetourMinutes}
                  onChange={(e) => setNewRule((r) => ({ ...r, tempsTrajetRetourMinutes: parseInt(e.target.value) || 0 }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Override hors LPA
              </label>
              <select
                value={newRule.horsLpa}
                onChange={(e) => setNewRule((r) => ({ ...r, horsLpa: e.target.value as "" | "true" | "false" }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pas d&apos;override (utiliser la LPA)</option>
                <option value="true">Forcer HORS LPA</option>
                <option value="false">Forcer DANS LPA</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={saving || (newRule.matchType === "jsType" && !newRule.jsTypeId) || (newRule.matchType === "prefixe" && !newRule.prefixeJs)}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors"
              >
                {saving ? "…" : "Ajouter"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Liste des règles */}
        {rules.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Aucune règle spécifique.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`border rounded-lg px-3 py-2 text-sm flex items-start gap-3 ${
                  rule.actif ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {rule.jsType ? (
                      <span className="font-mono font-semibold text-gray-800">
                        {rule.jsType.code}
                      </span>
                    ) : rule.prefixeJs ? (
                      <span className="font-mono font-semibold text-gray-800">
                        préfixe: {rule.prefixeJs}
                      </span>
                    ) : null}
                    <span className="text-xs text-gray-500">
                      aller: {rule.tempsTrajetAllerMinutes}min / retour: {rule.tempsTrajetRetourMinutes}min
                    </span>
                    {rule.horsLpa !== null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        rule.horsLpa
                          ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700"
                      }`}>
                        {rule.horsLpa ? "forcé hors LPA" : "forcé dans LPA"}
                      </span>
                    )}
                    {!rule.actif && (
                      <span className="text-xs bg-gray-200 text-gray-500 rounded px-1">inactif</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
                  >
                    {rule.actif ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Suppr.
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
