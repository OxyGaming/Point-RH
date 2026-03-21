"use client";

import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type Mode = "login" | "register";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/import";

  const [mode, setMode] = useState<Mode>("login");

  // ── État connexion ───────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // ── État inscription ─────────────────────────────────────────────────────────
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [motif, setMotif] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  // ── Connexion ────────────────────────────────────────────────────────────────
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as { error?: string };

      if (!res.ok) {
        setLoginError(data.error ?? "Erreur de connexion.");
        return;
      }

      window.location.href = from;
    } catch {
      setLoginError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Inscription ──────────────────────────────────────────────────────────────
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegisterError(null);

    if (regPassword !== regConfirm) {
      setRegisterError("Les mots de passe ne correspondent pas.");
      return;
    }

    setRegisterLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prenom,
          nom,
          email: regEmail,
          password: regPassword,
          confirmPassword: regConfirm,
          motif,
        }),
      });

      const data = await res.json() as { error?: string; message?: string };

      if (!res.ok) {
        setRegisterError(data.error ?? "Erreur lors de l'inscription.");
        return;
      }

      setRegisterSuccess(true);
    } catch {
      setRegisterError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setRegisterLoading(false);
    }
  }

  // ── Succès inscription ───────────────────────────────────────────────────────
  if (registerSuccess) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Demande envoyée</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Votre demande d&apos;inscription a bien été enregistrée.
            Elle doit être validée par un administrateur avant que vous puissiez vous connecter.
          </p>
          <p className="text-xs text-gray-400 mt-3">
            Vous recevrez une confirmation lors de la validation de votre compte.
          </p>
        </div>
        <button
          onClick={() => { setRegisterSuccess(false); setMode("login"); }}
          className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Onglets */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
            mode === "login"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Connexion
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
            mode === "register"
              ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Demande d&apos;accès
        </button>
      </div>

      {/* Formulaire connexion */}
      {mode === "login" && (
        <form onSubmit={handleLogin} className="p-8 space-y-5">
          {loginError && (
            <div className={`border text-sm px-4 py-3 rounded-lg ${
              loginError.includes("attente") || loginError.includes("refusée")
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-700"
            }`}>
              {loginError}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="votre@email.fr"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            {loginLoading ? "Connexion en cours..." : "Se connecter"}
          </button>
        </form>
      )}

      {/* Formulaire inscription */}
      {mode === "register" && (
        <form onSubmit={handleRegister} className="p-8 space-y-4">
          <p className="text-xs text-gray-500 leading-snug">
            Votre demande sera examinée par un administrateur avant activation de votre compte.
          </p>

          {registerError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {registerError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Prénom</label>
              <input
                type="text"
                required
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Jean"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom</label>
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Dupont"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse e-mail</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="votre@email.fr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mot de passe <span className="text-gray-400 font-normal">(min. 8 caractères)</span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmer le mot de passe</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={regConfirm}
              onChange={(e) => setRegConfirm(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Motif de la demande <span className="text-gray-400 font-normal">(min. 10 caractères)</span>
            </label>
            <textarea
              required
              minLength={10}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Précisez votre fonction et la raison de votre demande d'accès..."
            />
          </div>

          <button
            type="submit"
            disabled={registerLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            {registerLoading ? "Envoi en cours..." : "Envoyer la demande"}
          </button>
        </form>
      )}
    </div>
  );
}
