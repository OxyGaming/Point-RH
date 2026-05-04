"use client";

/**
 * Page de gestion des utilisateurs — Admin uniquement.
 * Protégée côté serveur par le middleware (route /admin/*).
 * Sections :
 *  1. Demandes d'accès en attente (registrationStatus = PENDING)
 *  2. Utilisateurs actifs / désactivés
 */
import { useEffect, useState, useCallback } from "react";
import { formatInTimeZone } from "date-fns-tz";

const fmtJourParis = (iso: string) =>
  formatInTimeZone(new Date(iso), "Europe/Paris", "dd/MM/yyyy");

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  registrationStatus: string;
  registrationComment: string | null;
  createdAt: string;
}

interface NewUserForm {
  email: string;
  name: string;
  password: string;
  role: string;
}

const EMPTY_FORM: NewUserForm = { email: "", name: "", password: "", role: "USER" };

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) { setError("Accès refusé."); return; }
      const data = await res.json() as User[];
      setUsers(data);
    } catch {
      setError("Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setCreateError(data.error ?? "Erreur."); return; }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchUsers();
    } catch {
      setCreateError("Erreur réseau.");
    } finally {
      setCreating(false);
    }
  }

  async function handleApprove(user: User) {
    setProcessingId(user.id);
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationStatus: "APPROVED" }),
    });
    setProcessingId(null);
    await fetchUsers();
  }

  async function handleReject(user: User) {
    setProcessingId(user.id);
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationStatus: "REJECTED" }),
    });
    setProcessingId(null);
    await fetchUsers();
  }

  async function handleToggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    await fetchUsers();
  }

  async function handleToggleRole(user: User) {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await fetchUsers();
  }

  async function handleDelete(user: User) {
    if (!confirm(`Supprimer définitivement ${user.name} (${user.email}) ?`)) return;
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    await fetchUsers();
  }

  const pending = users.filter((u) => u.registrationStatus === "PENDING");
  const others = users.filter((u) => u.registrationStatus !== "PENDING");

  return (
    <div className="p-5 sm:p-7 lg:p-8 max-w-4xl">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Administration</p><h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">Utilisateurs</h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les comptes et validez les demandes d'accès.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {showForm ? "Annuler" : "+ Nouvel utilisateur"}
        </button>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Créer un compte</h2>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet</label>
              <input
                type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Prénom Nom"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Adresse e-mail</label>
              <input
                type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@sncf.fr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe (min. 8 car.)</label>
              <input
                type="password" required minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="USER">Utilisateur standard</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
            {createError && (
              <div className="sm:col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {createError}
              </div>
            )}
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit" disabled={creating}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {creating ? "Création..." : "Créer le compte"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement...</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : (
        <div className="space-y-8">

          {/* ── Demandes en attente ──────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-base font-semibold text-gray-800">Demandes d&apos;accès en attente</h2>
              {pending.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs font-bold rounded-full">
                  {pending.length}
                </span>
              )}
            </div>

            {pending.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-6 text-center text-gray-400 text-sm">
                Aucune demande en attente
              </div>
            ) : (
              <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {pending.map((user) => (
                  <div key={user.id} className="px-4 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Demande le {fmtJourParis(user.createdAt)}
                        </p>
                        {user.registrationComment && (
                          <p className="mt-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-snug">
                            &ldquo;{user.registrationComment}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleApprove(user)}
                          disabled={processingId === user.id}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
                        >
                          {processingId === user.id ? "..." : "Approuver"}
                        </button>
                        <button
                          onClick={() => handleReject(user)}
                          disabled={processingId === user.id}
                          className="px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          {processingId === user.id ? "..." : "Refuser"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Liste des utilisateurs ───────────────────────────────── */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Utilisateurs</h2>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Utilisateur</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Rôle</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Statut</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Créé le</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((user) => (
                      <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                          {user.registrationStatus === "REJECTED" && (
                            <span className="text-xs text-red-500 font-medium">Refusé</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${
                            user.role === "ADMIN"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {user.role === "ADMIN" ? "Admin" : "Utilisateur"}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${
                            user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                          }`}>
                            {user.isActive ? "Actif" : "Désactivé"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                          {fmtJourParis(user.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => handleToggleRole(user)}
                              className="text-xs px-2 min-h-[36px] sm:min-h-0 sm:py-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                              title="Changer le rôle"
                            >
                              {user.role === "ADMIN" ? "→ User" : "→ Admin"}
                            </button>
                            <button
                              onClick={() => handleToggleActive(user)}
                              className="text-xs px-2 min-h-[36px] sm:min-h-0 sm:py-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                            >
                              {user.isActive ? "Désactiver" : "Activer"}
                            </button>
                            <button
                              onClick={() => handleDelete(user)}
                              className="text-xs px-2 min-h-[36px] sm:min-h-0 sm:py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {others.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">Aucun utilisateur</p>
              )}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
