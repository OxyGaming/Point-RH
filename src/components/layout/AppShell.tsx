"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DesktopSidebar, MobileNav } from "@/components/layout/Sidebar";

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

      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <DesktopSidebar />

        {/* Contenu principal — décalé sur mobile pour la top bar fixe */}
        <main className="flex-1 min-w-0 overflow-auto pt-14 lg:pt-0">
          {children}
        </main>
      </div>
    </>
  );
}
