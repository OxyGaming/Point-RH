"use client";

import { useEffect } from "react";

/**
 * Enregistre le Service Worker généré par Serwist (/sw.js).
 * Monté une seule fois dans le layout racine.
 * Inactif en dev : Serwist est désactivé côté build, /sw.js n'existe pas.
 */
export function PwaRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("[PWA] Échec enregistrement SW :", err);
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
