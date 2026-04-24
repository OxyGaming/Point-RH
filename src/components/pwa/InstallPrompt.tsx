"use client";

import { useEffect, useState } from "react";

/**
 * Invitation discrète à installer l'app sur l'écran d'accueil.
 * - N'apparaît que si le navigateur émet `beforeinstallprompt` (Android / Chrome desktop / Edge)
 *   ou si iOS détecté et non déjà installée.
 * - Masquée automatiquement après installation ou refus, avec cooldown persistant.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pointrh.pwa.install.dismissed";
const COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 14 jours

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}

function isDismissedRecently() {
  if (typeof localStorage === "undefined") return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  return Number.isFinite(ts) && Date.now() - ts < COOLDOWN_MS;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || isDismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setDeferred(null);
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS n'émet pas beforeinstallprompt → fallback visuel après un court délai
    if (isIos()) {
      const t = window.setTimeout(() => {
        setShowIos(true);
        setVisible(true);
      }, 4000);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage non dispo : on masque malgré tout */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "dismissed") dismiss();
      else setVisible(false);
    } catch {
      dismiss();
    } finally {
      setDeferred(null);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Installer Point RH"
      className="fixed inset-x-3 bottom-3 z-40 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-sm bg-white border border-[#e2e8f0] rounded-xl shadow-2xl p-3 pb-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-[#1a3070] flex items-center justify-center">
          <span className="text-white text-[11px] font-[800] tracking-wider">PRH</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-[700] text-[#0f1b4c] leading-tight">
            Installer Point RH
          </p>
          <p className="text-[12px] text-[#4a5580] mt-0.5 leading-snug">
            {showIos && !deferred
              ? "Dans Safari : touchez \u2191 Partager puis « Sur l'écran d'accueil »."
              : "Ajoutez l'application à votre écran d'accueil pour un accès rapide."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Plus tard"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-[#8b93b8] hover:text-[#0f1b4c] hover:bg-[#f1f5f9] transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {deferred && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 min-h-[40px] px-3 text-[13px] font-[600] text-[#4a5580] rounded-md hover:bg-[#f1f5f9] transition-colors"
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={install}
            className="flex-1 min-h-[40px] px-3 text-[13px] font-[700] text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-md transition-colors"
          >
            Installer
          </button>
        </div>
      )}
    </div>
  );
}
