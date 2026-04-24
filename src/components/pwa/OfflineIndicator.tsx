"use client";

import { useEffect, useState } from "react";

/**
 * Bandeau discret quand le navigateur signale une coupure réseau.
 * Remplace les éventuels toasts : affichage instantané, non bloquant.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);

    const on = () => setOnline(true);
    const off = () => setOnline(false);

    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#b45309] text-white text-[12px] font-[600] shadow-lg"
    >
      <span className="inline-block w-2 h-2 rounded-full bg-white/80 animate-pulse" aria-hidden />
      Hors ligne — données potentiellement obsolètes
    </div>
  );
}
