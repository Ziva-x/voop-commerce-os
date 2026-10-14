"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { MoreBottomSheet } from "@/components/navigation/MoreBottomSheet";
import { SyncIndicator } from "@/components/SyncIndicator";
import { StoreProvider } from "@/components/store/StoreContext";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const pathname = usePathname();

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/onboarding" ||
    pathname === "/pricing" ||
    pathname === "/subscribe" ||
    pathname?.startsWith("/admin");

  if (isAuthPage) {
    return (
      <div
        className="h-screen w-screen overflow-auto antialiased"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
        {children}
      </div>
    );
  }

  return (
    <StoreProvider>
      <div
        className="flex h-screen w-screen overflow-hidden antialiased print:h-auto print:w-auto print:overflow-visible print:bg-white print:text-black"
        style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      >
      {/* Desktop Sidebar (Only visible on screens >= 768px, hidden on print) */}
      <div className="hidden md:block print:hidden shrink-0">
        <Sidebar />
      </div>

      {/* Main Content Viewport */}
      <div
        className="flex-1 flex flex-col min-w-0 h-full overflow-hidden print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0"
        style={{ background: "var(--bg-primary)" }}
      >
        {/* Top Header (Compact on mobile, full on desktop) */}
        <div className="print:hidden">
          <Header />
        </div>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden print:p-0 print:m-0 print:overflow-visible print:bg-white print:h-auto"
          style={{ background: "var(--bg-primary)" }}
        >
          <div
            className="w-full mx-auto print:p-0 print:m-0"
            style={{
              padding: "16px",
              paddingBottom: "calc(96px + env(safe-area-inset-bottom, 16px))",
            }}
          >
            {children}
          </div>
        </main>

        {/* Mobile Android 4-item Bottom Navigation Bar */}
        <div className="print:hidden">
          <MobileBottomNav
            onOpenMore={() => setMoreSheetOpen(true)}
            isMoreOpen={moreSheetOpen}
          />
        </div>
      </div>

      {/* Mobile Android More Menu Bottom Sheet */}
      <MoreBottomSheet
        isOpen={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
      />

      {/* Global Sync Indicator — fixed bottom-right on desktop (Hidden on Print) */}
      <div className="hidden md:block print:hidden">
        <SyncIndicator />
      </div>
    </div>
    </StoreProvider>
  );
}
