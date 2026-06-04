import React from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Activity, LayoutDashboard, Users, Crosshair, Briefcase, Image as ImageIcon, CalendarClock, Settings, Code, Download, UploadCloud, Megaphone, Cpu, MessageSquare, Clock, ListTree, Link2 } from "lucide-react";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Accounts", url: "/accounts", icon: Users },
  { title: "Targets", url: "/targets", icon: Crosshair },
  { title: "Jobs", url: "/jobs", icon: Briefcase },
  { title: "Media", url: "/media", icon: ImageIcon },
  { title: "Posts", url: "/posts", icon: CalendarClock },
  { title: "Auto Comments", url: "/auto-comments", icon: MessageSquare },
  { title: "Schedule Mass Grab", url: "/mass-grab-schedules", icon: Clock },
  { title: "Warm Account Daily", url: "/warm-accounts", icon: Activity },
  { title: "Background Logs", url: "/background-jobs", icon: ListTree },
  { title: "Embeds", url: "/embeds", icon: Code },
  { title: "Affiliate Links", url: "/affiliate-links", icon: Link2 },
  { title: "Ads", url: "/ads", icon: Megaphone },
  { title: "Downloader", url: "/downloader", icon: Download },
  { title: "Extractor Rules", url: "/extractor-profiles", icon: Cpu },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "App Update", url: "/update", icon: UploadCloud },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/20 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-none tracking-tight text-sidebar-foreground">
              X-AUTO
            </span>
            <span className="text-[10px] leading-none text-muted-foreground uppercase tracking-widest mt-1">
              Command Center
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-widest text-muted-foreground uppercase font-mono">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} className="font-mono text-sm data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold">
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
