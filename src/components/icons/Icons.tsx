/**
 * Bibliothèque d'icônes SVG (line-icons style Lucide).
 * Style cohérent avec Sidebar.tsx : viewBox 24 24, stroke currentColor, strokeWidth 2, round caps/joins.
 *
 * Usage : <IconMoon className="w-4 h-4 text-indigo-600" />
 */
import type { SVGProps } from "react";

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type P = SVGProps<SVGSVGElement>;

// ── Catégories work-rules ──────────────────────────────────────────────────

export const IconClock = (p: P) => (
  <svg {...baseProps} {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
export const IconBriefcase = (p: P) => (
  <svg {...baseProps} {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
);
export const IconMoon = (p: P) => (
  <svg {...baseProps} {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);
export const IconCalendar = (p: P) => (
  <svg {...baseProps} {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
export const IconCoffee = (p: P) => (
  <svg {...baseProps} {...p}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
);
export const IconBarChart = (p: P) => (
  <svg {...baseProps} {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
);
export const IconSunset = (p: P) => (
  <svg {...baseProps} {...p}><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="16 5 12 9 8 5"/></svg>
);
export const IconSettings = (p: P) => (
  <svg {...baseProps} {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
);

// ── Statuts / feedback ─────────────────────────────────────────────────────

export const IconAlertTriangle = (p: P) => (
  <svg {...baseProps} {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
export const IconInfo = (p: P) => (
  <svg {...baseProps} {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);
export const IconCheckCircle = (p: P) => (
  <svg {...baseProps} {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
export const IconCheck = (p: P) => (
  <svg {...baseProps} {...p}><polyline points="20 6 9 17 4 12"/></svg>
);
export const IconX = (p: P) => (
  <svg {...baseProps} {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
export const IconBan = (p: P) => (
  <svg {...baseProps} {...p}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
);
export const IconXCircle = (p: P) => (
  <svg {...baseProps} {...p}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
);

// ── Actions & objets ───────────────────────────────────────────────────────

export const IconLock = (p: P) => (
  <svg {...baseProps} {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
export const IconLink = (p: P) => (
  <svg {...baseProps} {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
);
export const IconShield = (p: P) => (
  <svg {...baseProps} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
export const IconUsers = (p: P) => (
  <svg {...baseProps} {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);
export const IconClipboard = (p: P) => (
  <svg {...baseProps} {...p}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
);
export const IconDownload = (p: P) => (
  <svg {...baseProps} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
export const IconLightbulb = (p: P) => (
  <svg {...baseProps} {...p}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-5 12c1 1 1.5 2 1.5 3v1h7v-1c0-1 .5-2 1.5-3a7 7 0 0 0-5-12z"/></svg>
);
export const IconZap = (p: P) => (
  <svg {...baseProps} {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);

// ── Chevrons / directions ──────────────────────────────────────────────────

export const IconChevronDown = (p: P) => (
  <svg {...baseProps} {...p}><polyline points="6 9 12 15 18 9"/></svg>
);
export const IconChevronUp = (p: P) => (
  <svg {...baseProps} {...p}><polyline points="18 15 12 9 6 15"/></svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...baseProps} {...p}><polyline points="9 18 15 12 9 6"/></svg>
);
