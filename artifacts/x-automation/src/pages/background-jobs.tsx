import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BackgroundJob = {
  id: number;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  payload: any;
  result: any;
  progress: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

const statusClass: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  running: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  completed: "text-green-400 border-green-500/30 bg-green-500/10",
  failed: "text-red-400 border-red-500/30 bg-red-500/10",
  cancelled: "text-muted-foreground border-border bg-muted",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getProgressId(job: BackgroundJob) {
  const match = String(job.progress || "").match(/Progress ID:\s*([^\s]+)/i);
  return match?.[1] || (job.type === "mass-grab-x" ? `background-${job.id}` : null);
}

export default function BackgroundJobsPage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Record<number, string[]>>({});

  const fetchJobs = async () => {
    try {
      const response = await fetch(`/api/background-jobs?limit=100&t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to load jobs");
      setJobs(data.jobs || []);
    } catch (error) {
      toast({ title: "Failed to load background jobs", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const sources: EventSource[] = [];
    for (const job of jobs.filter((job) => job.status === "running" || job.status === "pending")) {
      const progressId = getProgressId(job);
      if (!progressId) continue;
      const source = new EventSource(`/api/media/mass-grab-progress/${progressId}`);
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message) {
            setLogs((prev) => ({ ...prev, [job.id]: [...(prev[job.id] || []), data.message].slice(-200) }));
          }
        } catch {}
      };
      sources.push(source);
    }
    return () => sources.forEach((source) => source.close());
  }, [jobs.map((job) => `${job.id}:${job.status}`).join(",")]);

  const cancelJob = async (job: BackgroundJob) => {
    if (!confirm(`Cancel background job #${job.id}?`)) return;
    try {
      const response = await fetch(`/api/background-jobs/${job.id}/cancel`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to cancel job");
      toast({ title: "Job cancelled" });
      fetchJobs();
    } catch (error) {
      toast({ title: "Failed to cancel job", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const deleteJob = async (job: BackgroundJob) => {
    if (!confirm(`Delete background job #${job.id}?`)) return;
    try {
      const response = await fetch(`/api/background-jobs/${job.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Failed to delete job");
      toast({ title: "Job deleted" });
      fetchJobs();
    } catch (error) {
      toast({ title: "Failed to delete job", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Background Logs</h2>
          <p className="text-sm text-muted-foreground mt-2">Monitor mass grab background jobs, status, result, and live progress logs.</p>
        </div>
        <Button variant="outline" onClick={fetchJobs} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-primary font-mono animate-pulse">Loading background jobs...</div>
      ) : jobs.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No background jobs yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const jobLogs = logs[job.id] || [];
            return (
              <Card key={job.id} className="border-border bg-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="font-mono text-base">#{job.id} {job.type}</CardTitle>
                      <CardDescription>
                        Created {formatDate(job.created_at)} | Started {formatDate(job.started_at)} | Updated {formatDate(job.updated_at)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusClass[job.status] || statusClass.cancelled}>{job.status}</Badge>
                      {(job.status === "pending" || job.status === "running") && (
                        <Button size="icon" variant="outline" onClick={() => cancelJob(job)} title="Cancel job"><XCircle className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="outline" onClick={() => deleteJob(job)} title="Delete job"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {job.progress && <p className="text-xs font-mono text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded p-2">{job.progress}</p>}
                  {job.error && <p className="text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/20 rounded p-2">{job.error}</p>}

                  {job.result && (
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div className="rounded border border-border p-2"><span className="text-muted-foreground">Inserted</span><div className="text-lg text-primary">{job.result.inserted ?? 0}</div></div>
                      <div className="rounded border border-border p-2"><span className="text-muted-foreground">Uploaded</span><div className="text-lg text-green-400">{job.result.uploaded ?? 0}</div></div>
                      <div className="rounded border border-border p-2"><span className="text-muted-foreground">Failed</span><div className="text-lg text-red-400">{job.result.failed ?? 0}</div></div>
                    </div>
                  )}

                  <details className="rounded border border-border bg-muted/20 p-3" open={job.status === "running"}>
                    <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted-foreground">Live / Saved Log</summary>
                    <div className="mt-3 max-h-80 overflow-y-auto space-y-1">
                      {(jobLogs.length > 0 ? jobLogs : [job.progress || "No live log buffered for this job."]).map((line, index) => (
                        <p key={index} className="text-xs font-mono text-foreground/80 break-all">{line}</p>
                      ))}
                    </div>
                  </details>

                  <details className="rounded border border-border bg-muted/10 p-3">
                    <summary className="cursor-pointer text-xs uppercase tracking-widest text-muted-foreground">Payload / Result JSON</summary>
                    <pre className="mt-3 max-h-80 overflow-y-auto text-xs whitespace-pre-wrap break-all">{JSON.stringify({ payload: job.payload, result: job.result }, null, 2)}</pre>
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
