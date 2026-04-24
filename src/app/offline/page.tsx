import type { Metadata } from "next";
import { RetryButton } from "./RetryButton";

export const metadata: Metadata = {
  title: "Hors ligne — Point RH",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#1a3070] flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className="text-[22px] font-[800] text-[#0f1b4c] mb-2">
          Vous êtes hors ligne
        </h1>
        <p className="text-[14px] text-[#4a5580] leading-relaxed mb-6">
          Point RH nécessite une connexion pour accéder aux données RH à jour.
          Les pages déjà consultées peuvent rester accessibles en lecture seule.
        </p>

        <div className="text-left bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 mb-6 text-[12px] text-[#64748b] space-y-2">
          <p className="font-[600] text-[#1e293b]">Pendant la coupure :</p>
          <ul className="space-y-1 list-disc pl-5">
            <li>Aucune nouvelle donnée n&apos;est synchronisée.</li>
            <li>Les simulations et imports sont indisponibles.</li>
            <li>Les données affichées peuvent être obsolètes.</li>
          </ul>
        </div>

        <RetryButton />
      </div>
    </div>
  );
}
