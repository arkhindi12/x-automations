import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground font-mono">
        <AppSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-6 lg:h-[60px]">
            <SidebarTrigger className="text-muted-foreground hover:text-primary" />
            <div className="flex flex-1 items-center justify-between">
              <h1 className="text-sm font-bold tracking-widest uppercase text-primary/80">
                System Ops
              </h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <span className="text-muted-foreground uppercase tracking-wider">System Online</span>
                </div>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-6xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
