"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { DesktopSidebar, MobileNav } from "@/components/layout/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isAuthPage = pathname.startsWith("/auth/");
  const showNav = !isAuthPage && (loading || user !== null);

  if (!showNav) {
    return <main className="flex-1 min-w-0 overflow-auto">{children}</main>;
  }

  return (
    <>
      <MobileNav />
      <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
        <DesktopSidebar />
        <main className="flex-1 min-w-0 overflow-auto pt-14 lg:pt-0">
          {children}
        </main>
      </div>
    </>
  );
}
