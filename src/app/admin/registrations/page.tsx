"use client";

/**
 * Page de gestion des demandes d'inscription — Admin uniquement.
 * Protégée côté serveur par le middleware (route /admin/*).
 * Permet : consulter, approuver, refuser les demandes.
 */
import { useEffect, useState, useCallback } from "react";

interface RegistrationUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  registrationStatus: string;
  registrationComment: string | null;
  createdAt: string;
}

type StatusFilter = "all" | "PENDING" | "APPROVED" | "REJECTED";

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  PENDING:  { label: "En attente", classes: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approuvé",   classes: "bg-green-100 text-green-700" },
  REJECTED: { label: "Refusé",     classes: "bg-red-100 text-red-600" },
};

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "all",      label: "Toutes" },
  { value: "PENDING",  label: "En attente" },
  { value: "APPROVED", label: "Approuvées" },
  { value: "REJECTED", label: "Refusées" },
];

export default function RegistrationsAdminPage() {
  const [users, setUsers] = useState<RegistrationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Rôle à assigner lors de l'approbation (par utilisateur)
  const [approvalRoles, setApprovalRoles] = useState<Record<string, string>>({});

  const fetchUsers = useCallback(async (status: StatusFilter = filter) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/registrations${status !== "all" ? `?status=${status}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) { setError("Accès refusé."); return; }
      const data = await res.json() as RegistrationUser[];
      setUsers(data);
    } catch {
      setError("Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Compte les pending pour le badge
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/registrations?status=PENDING");
      if (!res.ok) return;
      const data = await res.json() as RegistrationUser[];
      setPendingCount(data.length);
    } catch { /* silencieux */ }
  }, []);

  useEffect(() => {
    fetchUsers(filter);
    fetchPendingCount();
  }, [filter, fetchUsers, fetchPendingCount]);

  async function handleAction(userId: string, action: "approve" | "reject") {
    setActionLoading(userId + action);
    try {
      const role = approvalRoles[userId] ?? "USER";
      const res = await fetch(`/api/admin/registrations/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, role }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        alert(data.error ?? "Erreur.");
        return;
      }
      await fetchUsers(filter);
      await fetchPendingCount();
    } catch {
      alert("Erreur réseau.");
    } finally {
      setActionLoading(null);
    }
  }

  const pendingUsers = users.filter((u) => u.registrationStatus === "PENDING");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      {/* En-tête */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Demandes d&apos;inscription</h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-amber-500 text-white rounded-full">
              {pendingCount}
            </span>
          )}
        </div>
        <p className="text-gray-500 text-sm">
          Validez ou refusez les demandes d&apos;accès à l&apos;application.
        </p>
      </div>

      {/* Onglets filtre */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bloc d'info si demandes en attente */}
      {filter === "PENDING" && pendingUsers.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          {pendingUsers.length} demande{pendingUsers.length > 1 ? "s" : ""} en attente de validation.
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <p className="text-gray-400 text-sm">Chargement...</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : users.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Aucune demande{filter !== "all" ? ` ${TABS.find(t => t.value === filter)?.label.toLowerCase()}` : ""}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const statusInfo = STATUS_LABELS[user.registrationStatus] ?? { label: user.registrationStatus, classes: "bg-gray-100 text-gray-600" };
            const isPending = user.registrationStatus === "PENDING";
            const isLoading = actionLoading?.startsWith(user.id);

            return (
              <div
                key={user.id}
                className={`bg-white border rounded-xl p-4 sm:p-5 ${
                  isPending ? "border-amber-200 shadow-sm" : "border-gray-200"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  {/* Infos utilisateur */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-gray-900">{user.name}</p>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${statusInfo.classes}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{user.email}</p>

                    {user.registrationComment && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2">
                        <p className="text-xs font-medium text-gray-500 mb-0.5">Motif de la demande</p>
                        <p className="text-sm text-gray-700 leading-snug">{user.registrationComment}</p>
                      </div>
                    )}

                    <p className="text-xs text-gray-400">
                      Demande reçue le {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {!isPending && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Rôle attribué : <span className="font-medium text-gray-600">{user.role === "ADMIN" ? "Administrateur" : "Utilisateur"}</span>
                      </p>
                    )}
                  </div>

                  {/* Actions (uniquement pour les demandes en attente) */}
                  {isPending && (
                    <div className="flex flex-col gap-2 sm:items-end shrink-0">
                      {/* Sélecteur de rôle */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Rôle :</label>
                        <select
                          value={approvalRoles[user.id] ?? "USER"}
                          onChange={(e) => setApprovalRoles((prev) => ({ ...prev, [user.id]: e.target.value }))}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="USER">Utilisateur</option>
                          <option value="ADMIN">Administrateur</option>
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(user.id, "approve")}
                          disabled={isLoading}
                          className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          {isLoading && actionLoading === user.id + "approve" ? "..." : "Approuver"}
                        </button>
                        <button
                          onClick={() => handleAction(user.id, "reject")}
                          disabled={isLoading}
                          className="px-4 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-xs font-semibold transition-colors"
                        >
                          {isLoading && actionLoading === user.id + "reject" ? "..." : "Refuser"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
