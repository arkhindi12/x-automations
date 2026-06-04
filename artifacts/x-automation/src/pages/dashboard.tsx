import React from "react";
import { useGetDashboardStats, useGetActivity } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Briefcase, Image as ImageIcon, CalendarClock, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend, ResponsiveContainer } from "recharts";

type ChartsData = {
  mediaPerDay: { day: string; grabbed: number; doodSuccess: number; doodFailed: number }[];
  postsPerDay: { day: string; posted: number; failed: number; pending: number }[];
  doodOverall: { done: number; failed: number; uploading: number };
};

function formatDay(dayStr: string) {
  const d = new Date(dayStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DOOD_COLORS = ["#22c55e", "#ef4444", "#f59e0b"];
const POST_COLORS = ["#6366f1", "#ef4444", "#64748b"];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useGetActivity();
  const { data: charts, isLoading: chartsLoading } = useQuery<ChartsData>({
    queryKey: ["stats-charts"],
    queryFn: async () => {
      const r = await fetch("/api/stats/charts");
      if (!r.ok) throw new Error("Failed to load charts");
      return r.json();
    },
    refetchInterval: 30000,
  });

  if (statsLoading || activitiesLoading) {
    return <div className="text-primary font-mono animate-pulse">Loading system telemetry...</div>;
  }

  const mediaChartConfig = {
    grabbed: { label: "Grabbed", color: "#6366f1" },
    doodSuccess: { label: "Dood OK", color: "#22c55e" },
    doodFailed: { label: "Dood Failed", color: "#ef4444" },
  };

  const postsChartConfig = {
    posted: { label: "Posted", color: "#6366f1" },
    failed: { label: "Failed", color: "#ef4444" },
    pending: { label: "Pending", color: "#64748b" },
  };

  const doodPieData = [
    { name: "Done", value: Number(charts?.doodOverall.done ?? 0) },
    { name: "Failed", value: Number(charts?.doodOverall.failed ?? 0) },
    { name: "Uploading", value: Number(charts?.doodOverall.uploading ?? 0) },
  ].filter((d) => d.value > 0);

  const mediaData = (charts?.mediaPerDay ?? []).map((d) => ({ ...d, day: formatDay(d.day) }));
  const postsData = (charts?.postsPerDay ?? []).map((d) => ({ ...d, day: formatDay(d.day) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Telemetry</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Active Accounts
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.totalAccounts || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Running Jobs
            </CardTitle>
            <Briefcase className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.activeJobs || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.jobsByStatus?.error || 0} in error state
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Media Grabbed
            </CardTitle>
            <ImageIcon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.totalMediaGrabbed || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.mediaByType?.videos || 0} videos uploaded
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Pending Posts
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.pendingPosts || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.totalPostsMade || 0} total posts made
            </p>
          </CardContent>
        </Card>
      </div>

      {!chartsLoading && charts && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="col-span-2 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Media Grabbed — Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={mediaChartConfig} className="h-[220px]">
                <BarChart data={mediaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="grabbed" fill="#6366f1" radius={[3, 3, 0, 0]} name="Grabbed" />
                  <Bar dataKey="doodSuccess" fill="#22c55e" radius={[3, 3, 0, 0]} name="Dood OK" />
                  <Bar dataKey="doodFailed" fill="#ef4444" radius={[3, 3, 0, 0]} name="Dood Failed" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">DoodStream Success Rate</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {doodPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={doodPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {doodPieData.map((_, i) => <Cell key={i} fill={DOOD_COLORS[i % DOOD_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">No upload data yet.</div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-2 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Posts Performance — Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={postsChartConfig} className="h-[220px]">
                <BarChart data={postsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="posted" fill="#6366f1" radius={[3, 3, 0, 0]} name="Posted" />
                  <Bar dataKey="failed" fill="#ef4444" radius={[3, 3, 0, 0]} name="Failed" />
                  <Bar dataKey="pending" fill="#64748b" radius={[3, 3, 0, 0]} name="Pending" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Main Process</span>
                  <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">ONLINE</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">CONNECTED</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Worker Queue</span>
                  <Badge variant="outline" className="text-primary border-primary/20 bg-primary/10">
                    {stats?.jobsByStatus?.active ? "RUNNING" : "IDLE"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Error Jobs</span>
                  <Badge variant="outline" className={stats?.jobsByStatus?.error ? "text-destructive border-destructive/20 bg-destructive/10" : "text-green-500 border-green-500/20 bg-green-500/10"}>
                    {stats?.jobsByStatus?.error || 0}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-1">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Activity Feed</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {activities?.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 border-b border-border/50 pb-4 last:border-0 last:pb-0">
                    <div className="mt-0.5 p-1.5 rounded bg-primary/10 text-primary">
                      {activity.type === "job_error" || activity.type === "error" ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Activity className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground">
                        {activity.message}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(activity.createdAt).toLocaleString()}</span>
                        {activity.accountUsername && (
                          <>
                            <span>•</span>
                            <span className="text-primary/70">@{activity.accountUsername}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant={activity.type === "job_error" || activity.type === "error" ? "destructive" : "outline"} className="uppercase text-[10px] tracking-wider">
                      {activity.type.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
                {!activities?.length && (
                  <div className="text-center py-8 text-muted-foreground text-sm">No recent activity detected.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
