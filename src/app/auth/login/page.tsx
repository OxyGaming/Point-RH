import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion — Point RH",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / titre */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Point RH
          </p>
          <h1 className="text-2xl font-bold text-white leading-tight">
            Gestion des imprévus ferroviaires
          </h1>
          <p className="text-slate-400 text-sm mt-2">Connectez-vous pour continuer</p>
        </div>

        <Suspense fallback={<div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm">Chargement...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
