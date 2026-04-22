"use client";

import { useEffect, useMemo, useState } from "react";

interface Proposal {
  codeJs: string;
  nbJoursTenus: number;
  dernierJour: string; // ISO
}

interface AgentProposals {
  agentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  habilitationsActuelles: string[];
  propositions: Proposal[];
}

interface ApiResponse {
  agents: AgentProposals[];
  totalAgents: number;
  totalPropositions: number;
}

type Phase =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; data: ApiResponse };

export default function HabilitationsProposalsPanel() {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ agents: number; prefixes: number } | null>(null);
  const [search, setSearch] = useState("");

  // ── Fetch initial ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/habilitations/propositions");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setPhase({
              status: "error",
              message: body?.error ?? `HTTP ${res.status}`,
            });
          }
          return;
        }
        const data: ApiResponse = await res.json();
        if (cancelled) return;
        if (data.totalPropositions === 0) {
          setPhase({ status: "empty" });
          return;
        }
        // Cases cochées par défaut (optimiste)
        const initialChecked: Record<string, boolean> = {};
        for (const a of data.agents) {
          for (const p of a.propositions) {
            initialChecked[key(a.agentId, p.codeJs)] = true;
          }
        }
        setChecked(initialChecked);
        setPhase({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setPhase({
            status: "error",
            message: err instanceof Error ? err.message : "Erreur réseau.",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Agents filtrés par recherche ──────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    if (phase.status !== "ready") return [];
    const q = search.trim().toLowerCase();
    if (!q) return phase.data.agents;
    return phase.data.agents.filter(
      (a) =>
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        a.matricule.toLowerCase().includes(q),
    );
  }, [phase, search]);

  // ── Compteurs ──────────────────────────────────────────────────────────────
  const totalChecked = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  function toggleOne(agentId: string, codeJs: string) {
    setChecked((prev) => ({ ...prev, [key(agentId, codeJs)]: !prev[key(agentId, codeJs)] }));
  }

  function setAllVisible(value: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      for (const a of filteredAgents) {
        for (const p of a.propositions) {
          next[key(a.agentId, p.codeJs)] = value;
        }
      }
      return next;
    });
  }

  async function submit() {
    if (phase.status !== "ready") return;
    setSubmitError(null);
    setSubmitSuccess(null);

    const validations = phase.data.agents
      .map((a) => ({
        agentId: a.agentId,
        prefixesAAjouter: a.propositions
          .filter((p) => checked[key(a.agentId, p.codeJs)])
          .map((p) => p.codeJs),
      }))
      .filter((v) => v.prefixesAAjouter.length > 0);

    if (validations.length === 0) {
      setSubmitError("Aucune proposition sélectionnée.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/habilitations/propositions/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validations }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        setSubmitError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmitSuccess({ agents: body.agentsMisAJour, prefixes: body.prefixesAjoutes });
      // Retirer les propositions validées : re-fetch pour refléter l'état réel
      const refetch = await fetch("/api/habilitations/propositions");
      if (refetch.ok) {
        const newData: ApiResponse = await refetch.json();
        if (newData.totalPropositions === 0) {
          setPhase({ status: "empty" });
        } else {
          const initialChecked: Record<string, boolean> = {};
          for (const a of newData.agents) {
            for (const p of a.propositions) {
              initialChecked[key(a.agentId, p.codeJs)] = true;
            }
          }
          setChecked(initialChecked);
          setPhase({ status: "ready", data: newData });
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (phase.status === "loading") {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-white border-gray-200 text-sm text-gray-500">
        Calcul des propositions d&apos;habilitations…
      </div>
    );
  }

  if (phase.status === "error") {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-red-50 border-red-200 text-sm text-red-800">
        Impossible de charger les propositions : {phase.message}
      </div>
    );
  }

  if (phase.status === "empty") {
    return (
      <div className="mt-6 rounded-xl p-5 border bg-green-50 border-green-200 text-sm text-green-800">
        ✓ Aucune habilitation à ajuster — toutes les JS tenues sont déjà couvertes.
      </div>
    );
  }

  const { agents, totalAgents, totalPropositions } = phase.data;
  const showSearch = totalAgents >= 20;

  return (
    <div className="mt-6 rounded-xl p-5 border bg-white border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Habilitations proposées</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalAgents} agent{totalAgents > 1 ? "s" : ""} — {totalPropositions} préfixe{totalPropositions > 1 ? "s" : ""} à examiner
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAllVisible(true)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            disabled={submitting}
          >
            Tout sélectionner
          </button>
          <button
            type="button"
            onClick={() => setAllVisible(false)}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            disabled={submitting}
          >
            Tout désélectionner
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || totalChecked === 0}
            className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg"
          >
            {submitting ? "Validation…" : `Valider (${totalChecked})`}
          </button>
        </div>
      </div>

      {submitError && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-800">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-green-50 border border-green-200 text-green-800">
          ✓ {submitSuccess.agents} agent{submitSuccess.agents > 1 ? "s" : ""} mis à jour, {submitSuccess.prefixes} préfixe{submitSuccess.prefixes > 1 ? "s" : ""} ajouté{submitSuccess.prefixes > 1 ? "s" : ""}.
        </div>
      )}

      {showSearch && (
        <input
          type="text"
          placeholder="Rechercher par nom, prénom, matricule…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-3 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div className="space-y-4">
        {filteredAgents.map((a) => (
          <div key={a.agentId} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="font-medium text-gray-900">{a.nom} {a.prenom}</span>
                <span className="ml-2 font-mono text-xs text-gray-400">{a.matricule}</span>
              </div>
              <div className="text-xs text-gray-500">
                Actuelles :{" "}
                {a.habilitationsActuelles.length === 0
                  ? <span className="italic">aucune</span>
                  : a.habilitationsActuelles.join(", ")}
              </div>
            </div>
            <ul className="mt-2 space-y-1">
              {a.propositions.map((p) => (
                <li key={p.codeJs} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={!!checked[key(a.agentId, p.codeJs)]}
                    onChange={() => toggleOne(a.agentId, p.codeJs)}
                    disabled={submitting}
                    className="h-4 w-4"
                  />
                  <span className="font-mono font-medium text-blue-700">{p.codeJs}</span>
                  <span className="text-xs text-gray-500">
                    {p.nbJoursTenus} jour{p.nbJoursTenus > 1 ? "s" : ""}, dernier le{" "}
                    {formatDateFr(p.dernierJour)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function key(agentId: string, codeJs: string) {
  return `${agentId}|${codeJs}`;
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
