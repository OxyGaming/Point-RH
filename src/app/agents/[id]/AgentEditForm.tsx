"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

interface AgentData {
  id: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  regimeB: boolean;
  regimeC: boolean;
  habilitations: string[];
}

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
  });

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
      body: JSON.stringify({ ...formData, habilitations }),
    });
    setSaving(false);
    router.refresh();
  };

  const toggle = (key: string) => setForm((f) => ({ ...f, [key]: !f[key as keyof typeof f] }));

  return (
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
            { key: "peutEtreDeplace", label: "Peut être déplacé" },
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
            Ex : <span className="font-mono">GIC, BAD, PEY</span> — autorise toutes les JS dont le code commence par ces préfixes. <span className="text-red-500 font-medium">Vide = agent exclu de toute simulation.</span>
          </p>
          <input
            type="text"
            value={form.habilitationsStr}
            onChange={(e) => setForm((f) => ({ ...f, habilitationsStr: e.target.value }))}
            placeholder="ex: GIC, BAD, PEY"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
  );
}
