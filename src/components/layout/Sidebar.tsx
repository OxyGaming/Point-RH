"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconImport = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconAgents = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.85"/>
  </svg>
);
const IconSimulation = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconMultiJs = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconResultats = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IconInscriptions = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const IconRules = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
  </svg>
);
const IconLpa = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);
const IconFlex = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
  </svg>
);
const IconHabilitations = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
  </svg>
);
const IconNpo = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
  </svg>
);
const IconAgentsSupprimes = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
  </svg>
);
const IconParametrage = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const IconUsers = () => (
  <svg className="w-[17px] h-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.85"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
);

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV = [
  { href: "/import",               label: "Import planning",      Icon: IconImport },
  { href: "/agents",               label: "Agents",               Icon: IconAgents },
  { href: "/simulations/multi-js", label: "Simulation multi-JS",  Icon: IconMultiJs },
];

const NAV_ADMIN = [
  { href: "/admin/registrations",    label: "Inscriptions",           Icon: IconInscriptions, badge: true },
  { href: "/admin/work-rules",       label: "Règles de travail",      Icon: IconRules },
  { href: "/lpa",                    label: "LPA & Types JS",         Icon: IconLpa },
  { href: "/admin/js-types",         label: "Flexibilité JS",         Icon: IconFlex },
  { href: "/admin/habilitations",    label: "Préfixes JS",            Icon: IconHabilitations },
  { href: "/admin/npo-exclusions",   label: "Exclusions NPO",         Icon: IconNpo },
  { href: "/admin/agents-supprimes", label: "Agents supprimés",       Icon: IconAgentsSupprimes },
  { href: "/admin/parametrage",      label: "Import/Export config",   Icon: IconParametrage },
  { href: "/admin/users",            label: "Utilisateurs",           Icon: IconUsers },
];

// ─── NavLinks ─────────────────────────────────────────────────────────────────

function NavLinks({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/registrations?status=PENDING")
      .then((r) => r.ok ? r.json() : [])
      .then((data: unknown[]) => setPendingCount(data.length))
      .catch(() => {});
  }, [isAdmin]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="flex flex-col flex-1 overflow-y-auto min-h-0">
      <nav className="flex-1 px-3 py-3 space-y-0.5">

        {/* Section Exploitation */}
        <p className="px-2 pt-1 pb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/25">
          Exploitation
        </p>

        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all relative",
              isActive(href)
                ? "bg-[rgba(37,99,235,0.22)] text-white"
                : "text-white/55 hover:bg-white/7 hover:text-white"
            )}
          >
            {isActive(href) && (
              <span className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#60a5fa] rounded-r" />
            )}
            <Icon />
            <span className="truncate">{label}</span>
          </Link>
        ))}

        {/* Section Administration */}
        {isAdmin && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/25">
                Administration
              </p>
              {NAV_ADMIN.map(({ href, label, Icon, badge }) => {
                const showBadge = badge && pendingCount > 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all relative mb-0.5",
                      isActive(href)
                        ? "bg-[rgba(37,99,235,0.22)] text-white"
                        : "text-white/55 hover:bg-white/7 hover:text-white"
                    )}
                  >
                    {isActive(href) && (
                      <span className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#60a5fa] rounded-r" />
                    )}
                    <Icon />
                    <span className="truncate flex-1">{label}</span>
                    {showBadge && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* Mode opératoire */}
      <div className="mx-3 mb-2">
        <a
          href="/mode-operatoire.html"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[12px] font-medium text-white/40 hover:text-white/75 hover:bg-white/7 transition-all"
        >
          <svg className="w-[15px] h-[15px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>Mode opératoire</span>
        </a>
      </div>

      {/* Footer utilisateur */}
      <div className="mx-3 mb-3 mt-1 border-t border-white/[0.07] pt-3">
        <div className="flex items-center gap-2.5 bg-white/[0.05] rounded-lg px-3 py-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2563eb] to-[#60a5fa] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-600 text-white truncate leading-tight">{user?.name}</p>
            <p className="text-[10px] font-semibold text-[#93c5fd] mt-0.5 bg-[rgba(96,165,250,0.12)] px-1.5 py-px rounded inline-block">
              {user?.role === "ADMIN" ? "Admin" : "Utilisateur"}
            </p>
          </div>
          <button
            onClick={logout}
            title="Se déconnecter"
            className="text-white/25 hover:text-[#93c5fd] transition-colors p-1 rounded"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

export function DesktopSidebar() {
  return (
    <aside className="hidden lg:flex flex-col shrink-0 w-[228px] min-h-screen bg-[#1a3070] relative overflow-hidden">
      {/* Bande de couleur en haut */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#60a5fa] to-[#2563eb]" />
      {/* Motif diagonal subtil */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize: "12px 12px" }}
      />

      {/* Header */}
      <div className="px-5 pt-7 pb-5 border-b border-white/[0.07]">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#93c5fd] mb-1">SNCF Réseau</p>
        <p className="text-[19px] font-[800] text-white tracking-tight leading-none">Point RH</p>
        <p className="text-[10px] text-white/30 mt-1.5">Imprévus ferroviaires</p>
      </div>

      <NavLinks />
    </aside>
  );
}

// ─── Mobile Nav ───────────────────────────────────────────────────────────────

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#1a3070] text-white flex items-center justify-between px-4 h-14 shadow-lg">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#93c5fd] leading-none">SNCF Réseau</p>
          <p className="text-[15px] font-[800] leading-tight tracking-tight">Point RH</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Ouvrir le menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="relative w-[260px] max-w-[85vw] bg-[#1a3070] text-white flex flex-col h-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#60a5fa] to-[#2563eb]" />
            <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.07]">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#93c5fd] mb-0.5">SNCF Réseau</p>
                <p className="text-[15px] font-[800] text-white tracking-tight">Point RH</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <NavLinks onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

export default function Sidebar() {
  return <DesktopSidebar />;
}
