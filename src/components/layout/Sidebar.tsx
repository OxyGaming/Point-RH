"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV = [
  { href: "/import",            label: "Import planning",      icon: "📥" },
  { href: "/agents",            label: "Agents",               icon: "👥" },
  { href: "/lpa",               label: "LPA & Types JS",       icon: "📍" },
  { href: "/simulation",        label: "Nouvelle simulation",  icon: "⚡" },
  { href: "/simulations/multi-js", label: "Simulation multi-JS", icon: "🎯" },
  { href: "/resultats",         label: "Résultats",            icon: "📊" },
];

const NAV_ADMIN = [
  { href: "/admin/registrations", label: "Inscriptions",         icon: "📋" },
  { href: "/admin/work-rules",    label: "Règles de travail",    icon: "⚙️" },
  { href: "/admin/users",         label: "Utilisateurs",         icon: "🔑" },
  { href: "/admin/parametrage",   label: "Import/Export Excel",  icon: "📑" },
];

function NavLinks({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const linkClass = (href: string) =>
    cn(
      "flex items-center gap-3 px-5 py-3 text-sm transition-colors rounded-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400",
      isActive(href)
        ? "bg-blue-600 text-white font-semibold"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    );

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <nav className="flex-1 py-4" aria-label="Navigation principale">
        {NAV.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={linkClass(href)}
            onClick={onClose}
            aria-current={isActive(href) ? "page" : undefined}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </Link>
        ))}

        {/* Section Administration — visible uniquement par les admins */}
        {isAdmin && (
          <>
            <div className="mx-4 my-3 border-t border-slate-700" role="separator" />
            <p
              className="px-5 pb-1 text-xs font-semibold uppercase tracking-widest text-slate-500"
              id="nav-admin-label"
            >
              Administration
            </p>
            <nav aria-labelledby="nav-admin-label">
              {NAV_ADMIN.map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={linkClass(href)}
                  onClick={onClose}
                  aria-current={isActive(href) ? "page" : undefined}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </nav>

      {/* Pied de sidebar : utilisateur connecté + déconnexion */}
      <div className="px-4 py-4 border-t border-slate-700 space-y-2">
        {user && (
          <div className="px-1">
            <p className="text-xs text-white font-medium truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
            <span className={cn(
              "inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-medium",
              user.role === "ADMIN"
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300"
            )}>
              {user.role === "ADMIN" ? "Administrateur" : "Utilisateur"}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full text-left flex items-center gap-2 px-1 py-1.5 text-xs text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
        >
          <span aria-hidden="true">↩</span> Se déconnecter
        </button>
        <p className="text-xs text-slate-600 pt-1">Point RH v1.1</p>
      </div>
    </div>
  );
}

// ─── Sidebar desktop ─────────────────────────────────────────────────────────

export function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex w-56 min-h-screen bg-slate-900 text-white flex-col shrink-0">
      <div className="px-5 py-6 border-b border-slate-700">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Point RH</p>
        <p className="text-sm font-bold text-white leading-tight">Gestion des imprévus ferroviaires</p>
      </div>
      <NavLinks />
    </aside>
  );
}

// ─── Barre mobile (top bar + drawer) ─────────────────────────────────────────

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Top bar mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900 text-white flex items-center justify-between px-4 h-14 shadow-lg">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 leading-none">Point RH</p>
          <p className="text-sm font-bold leading-tight">Imprévus ferroviaires</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          aria-label="Ouvrir le menu de navigation"
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Drawer overlay — avec transition */}
      <div
        id="mobile-nav-drawer"
        className={cn(
          "lg:hidden fixed inset-0 z-50 flex transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        onClick={() => setOpen(false)}
      >
        {/* Fond semi-transparent */}
        <div className="absolute inset-0 bg-black/60" />

        {/* Panneau de navigation — avec slide */}
        <aside
          className={cn(
            "relative w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col h-full shadow-2xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">Point RH</p>
              <p className="text-sm font-bold text-white">Gestion des imprévus</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Fermer le menu de navigation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <NavLinks onClose={() => setOpen(false)} />
        </aside>
      </div>
    </>
  );
}

// Export par défaut pour compatibilité avec l'ancien layout
export default function Sidebar() {
  return <DesktopSidebar />;
}
