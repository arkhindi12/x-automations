import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Heart, Play, Pause, Trash2, Plus, Loader2, Repeat, History } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Account = { id: number; username: string; authMode: string };
type Schedule = {
  id: number;
  account_id: number;
  account_username: string;
  actions: string;
  keywords: string;
  max_actions_per_run: number;
  schedule_hours: number;
  warm_days: number;
  started_at: string;
  is_active: boolean;
  status: string;
  runs_count: number;
  last_run: string | null;
  next_run: string | null;
  last_error: string | null;
  created_at: string;
};

type HistoryItem = {
  id: number;
  account_id: number;
  account_username: string;
  tweet_id: string;
  action: string;
  keyword: string;
  created_at: string;
};

export default function WarmAccountsPage() {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [actionLike, setActionLike] = useState(true);
  const [actionRetweet, setActionRetweet] = useState(true);
  const [enableAdvanced, setEnableAdvanced] = useState(true);
  const [maxActionsPerRun, setMaxActionsPerRun] = useState(5);
  const [scheduleHours, setScheduleHours] = useState(24);
  const [warmDays, setWarmDays] = useState(30);
  const [creating, setCreating] = useState(false);

  const fetchSchedules = async () => {
    try {
      const response = await fetch("/api/warm-accounts/schedules");
      const data = await response.json();
      if (data.ok) setSchedules(data.schedules);
    } catch (error) {
      toast({ title: "Failed to load schedules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/accounts");
      const data = await response.json();
      setAccounts(data.filter((acc: Account) => acc.authMode === "cookies"));
    } catch (error) {
      toast({ title: "Failed to load accounts", variant: "destructive" });
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch("/api/warm-accounts/history?limit=100");
      const data = await response.json();
      if (data.ok) setHistory(data.history);
    } catch (error) {
      toast({ title: "Failed to load history", variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchSchedules();
    fetchAccounts();
  }, []);

  const handleCreate = async () => {
    if (!accountId || !keywords.trim()) {
      toast({ title: "Missing fields", description: "Account and keywords are required.", variant: "destructive" });
      return;
    }
    if (!actionLike && !actionRetweet) {
      toast({ title: "Missing actions", description: "Select at least one action.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const actions = [actionLike && "like", actionRetweet && "retweet"].filter(Boolean).join(",");
      const response = await fetch("/api/warm-accounts/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(accountId),
          actions,
          keywords: keywords.trim(),
          maxActionsPerRun,
          scheduleHours,
          enableAdvanced,
          warmDays,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to create schedule.");
      toast({ title: "Schedule created", description: `Next run in ${scheduleHours} hours.` });
      setDialogOpen(false);
      setKeywords("");
      fetchSchedules();
    } catch (error) {
      toast({ title: "Failed to create schedule", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const response = await fetch(`/api/warm-accounts/schedules/${id}/toggle`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to toggle schedule.");
      toast({ title: "Schedule updated" });
      fetchSchedules();
    } catch (error) {
      toast({ title: "Failed to toggle schedule", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      const response = await fetch(`/api/warm-accounts/schedules/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to delete schedule.");
      toast({ title: "Schedule deleted" });
      fetchSchedules();
    } catch (error) {
      toast({ title: "Failed to delete schedule", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Warm Account Daily</h1>
          <p className="text-muted-foreground mt-1">Jaga akun tetap aktif dengan like & retweet otomatis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { fetchHistory(); setHistoryDialogOpen(true); }}>
            <History className="h-4 w-4 mr-2" />
            History
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {schedules.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Belum ada schedule. Klik "New Schedule" untuk membuat.
            </CardContent>
          </Card>
        )}

        {schedules.map((schedule) => (
          <Card key={schedule.id} className={schedule.is_active ? "" : "opacity-60"}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    @{schedule.account_username} · Every {schedule.schedule_hours}h
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Actions: {schedule.actions.split(",").map(a => a.trim()).join(", ")} · Max {schedule.max_actions_per_run} per run
                  </CardDescription>
                  <CardDescription className="text-xs">
                    {(() => {
                      const start = new Date(schedule.started_at || schedule.created_at);
                      const day = Math.max(1, Math.ceil((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)));
                      const phase = day <= 7 ? "Gentle" : day <= 14 ? "Active" : day <= 30 ? "Normal" : "Full";
                      const color = day <= 7 ? "text-green-400" : day <= 14 ? "text-blue-400" : day <= 30 ? "text-purple-400" : "text-primary";
                      return <span className={color}>Day {day} — {phase} mode</span>;
                    })()}
                  </CardDescription>
                  <CardDescription className="text-xs text-muted-foreground/70">
                    Keywords: {schedule.keywords.split("\n")[0]}
                    {schedule.keywords.split("\n").length > 1 && ` (+${schedule.keywords.split("\n").length - 1} more)`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleToggle(schedule.id)}>
                    {schedule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(schedule.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className={schedule.status === "running" ? "text-yellow-500" : schedule.status === "error" ? "text-red-500" : "text-green-500"}>
                    {schedule.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Runs:</span> {schedule.runs_count}
                </div>
              </div>
              {schedule.last_run && (
                <div className="text-xs text-muted-foreground">
                  Last run: {new Date(schedule.last_run).toLocaleString()}
                </div>
              )}
              {schedule.next_run && schedule.is_active && (
                <div className="text-xs text-muted-foreground">
                  Next run: {new Date(schedule.next_run).toLocaleString()}
                </div>
              )}
              {schedule.last_error && (
                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
                  Error: {schedule.last_error}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Warm Account Schedule</DialogTitle>
            <DialogDescription>Buat jadwal otomatis untuk like & retweet secara berkala.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Cookie Account</Label>
              <select
                className="w-full border border-input bg-background px-3 py-2 rounded-md"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Select account...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Keywords (one per line)</Label>
              <Textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="viral&#10;trending&#10;fyp"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Bot akan random pilih 1 keyword per run untuk search tweets.
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">🤖 Natural Behavior:</p>
              <ul className="list-disc list-inside text-blue-800 dark:text-blue-200 space-y-0.5">
                <li>Random delay 8-25 detik antar action</li>
                <li>20% chance skip tweet (tidak semua di-interact)</li>
                <li>Like: 85% probability, Retweet: 40% probability</li>
                <li>Simulate reading: 2-6 detik per tweet</li>
                <li>Schedule variance ±10% (tidak selalu tepat waktu)</li>
              </ul>
              {enableAdvanced && (
                <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                  <p className="font-medium text-blue-900 dark:text-blue-100">✨ Advanced Mode:</p>
                  <ul className="list-disc list-inside text-blue-800 dark:text-blue-200 space-y-0.5">
                    <li>Fetch trending topics (simulate klik trends)</li>
                    <li>Browse home timeline (simulate scroll)</li>
                    <li>View 3 random tweets (simulate klik)</li>
                    <li>30% chance like tweets from home</li>
                    <li>50% chance klik trending topic sebagai keyword</li>
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Actions</Label>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="action-like" checked={actionLike} onCheckedChange={(checked) => setActionLike(!!checked)} />
                  <label htmlFor="action-like" className="text-sm cursor-pointer">Like</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="action-retweet" checked={actionRetweet} onCheckedChange={(checked) => setActionRetweet(!!checked)} />
                  <label htmlFor="action-retweet" className="text-sm cursor-pointer">Retweet</label>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Enable Advanced Behavior</Label>
                <Checkbox id="enable-advanced" checked={enableAdvanced} onCheckedChange={(checked) => setEnableAdvanced(!!checked)} />
              </div>
              <p className="text-xs text-muted-foreground">
                Trending topics, home timeline, scroll, view tweets (lebih natural tapi lebih lama)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Actions per Run</Label>
                <Input type="number" min={1} max={20} value={maxActionsPerRun} onChange={(e) => setMaxActionsPerRun(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Schedule (hours)</Label>
                <Input type="number" min={1} max={168} value={scheduleHours} onChange={(e) => setScheduleHours(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Warm-up Plan</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={warmDays}
                onChange={(e) => setWarmDays(Number(e.target.value))}
              >
                <option value={7}>7 Hari — Akun sangat baru</option>
                <option value={14}>14 Hari — Akun baru</option>
                <option value={30}>30 Hari — Standard (recommended)</option>
                <option value={60}>60 Hari — Extra safe</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Sistem otomatis menyesuaikan intensitas berdasarkan fase:<br/>
                <span className="text-green-400">Day 1-7:</span> Hanya browse & like pelan<br/>
                <span className="text-blue-400">Day 8-14:</span> Like + retweet + follow<br/>
                <span className="text-purple-400">Day 15-30:</span> Post tweet + update bio<br/>
                <span className="text-primary">Day 30+:</span> Full mode
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1" disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} className="flex-1" disabled={creating || !accountId || !keywords.trim()}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Warm Account History</DialogTitle>
            <DialogDescription>Recent like & retweet activities</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-4">
            {history.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No history yet.</p>
            )}
            {history.map((item) => (
              <div key={item.id} className="border border-border rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.action === "like" ? <Heart className="h-4 w-4 text-red-500" /> : <Repeat className="h-4 w-4 text-green-500" />}
                    <span className="font-medium">@{item.account_username}</span>
                    <span className="text-muted-foreground">{item.action}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Tweet: {item.tweet_id} · Keyword: {item.keyword}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
