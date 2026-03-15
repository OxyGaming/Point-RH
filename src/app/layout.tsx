import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { DesktopSidebar, MobileNav } from "@/components/layout/Sidebar";
import { AuthProvider } from "@/components/auth/AuthProvider";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Point RH — Gestion des imprévus ferroviaires",
  description: "Outil de simulation de mobilisation d'agents ferroviaires",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${geist.variable} antialiased bg-gray-50 min-h-screen`}>
        <AuthProvider>
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
        </AuthProvider>
      </body>
    </html>
  );
}
