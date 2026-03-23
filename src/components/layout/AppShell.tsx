"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DesktopSidebar, MobileNav } from "@/components/layout/Sidebar";

const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "dev";

/** Pied de page discret affichant le numéro de commit du build courant. */
function AppFooter() {
  return (
    <footer className="shrink-0 border-t border-gray-100 bg-white px-4 py-1.5 text-right">
      <span className="font-mono text-[10px] text-gray-300 select-none">
        build&nbsp;
        <span className="text-gray-400">{COMMIT_SHA}</span>
      </span>
    </footer>
  );
}

/**
 * Enveloppe client qui affiche la navigation uniquement lorsque
 * l'utilisateur est authentifié. Sur les pages /auth/*, le volet
 * est toujours masqué.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isAuthPage = pathname.startsWith("/auth/");

  // Affiche la navigation dès que l'utilisateur est confirmé connecté
  // et que l'on n'est pas sur une page d'authentification.
  const showNav = !isAuthPage && (loading || user !== null);

  if (!showNav) {
    return <main className="flex-1 min-w-0 overflow-auto">{children}</main>;
  }

  return (
    <>
      {/* Barre de navigation mobile (fixed top) */}
      <MobileNav />

      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 min-h-0">
          {/* Sidebar desktop */}
          <DesktopSidebar />

          {/* Contenu principal — décalé sur mobile pour la top bar fixe */}
          <main className="flex-1 min-w-0 overflow-auto pt-14 lg:pt-0">
            {children}
          </main>
        </div>

        {/* Pied de page : numéro de build */}
        <AppFooter />
      </div>
    </>
  );
}
