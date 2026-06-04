import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Clock, Play, Pause, Trash2, Plus, Loader2, Edit2 } from "lucide-react";

type Account = { id: number; username: string; authMode: string };
type Schedule = {
  id: number;
  account_id: number;
  account_username: string;
  status_urls: string;
  upload_to_streamtape: boolean;
  upload_to_dood: boolean;
  scan_replies: boolean;
  max_tweets_per_profile: number;
  schedule_minutes: number;
  is_active: boolean;
  status: string;
  runs_count: number;
  last_run: string | null;
  next_run: string | null;
  last_error: string | null;
  created_at: string;
};

export default function MassGrabSchedulesPage() {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [statusUrls, setStatusUrls] = useState("");
  const [uploadToStreamtape, setUploadToStreamtape] = useState(false);
  const [uploadToDood, setUploadToDood] = useState(false);
  const [scanReplies, setScanReplies] = useState(true);
  const [maxTweetsPerProfile, setMaxTweetsPerProfile] = useState(5);
  const [scheduleMinutes, setScheduleMinutes] = useState(60);
  const [creating, setCreating] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editStatusUrls, setEditStatusUrls] = useState("");

  const fetchSchedules = async () => {
    try {
      const response = await fetch("/api/mass-grab-schedules");
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

  useEffect(() => {
    fetchSchedules();
    fetchAccounts();
  }, []);

  const handleCreate = async () => {
    if (!accountId || !statusUrls.trim()) {
      toast({ title: "Missing fields", description: "Account and URLs are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/mass-grab-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(accountId),
          statusUrls: statusUrls.trim(),
          uploadToStreamtape,
          uploadToDood,
          scanReplies,
          maxTweetsPerProfile,
          scheduleMinutes,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to create schedule.");
      toast({ title: "Schedule created", description: `Next run in ${scheduleMinutes} minutes.` });
      setDialogOpen(false);
      setStatusUrls("");
      fetchSchedules();
    } catch (error) {
      toast({ title: "Failed to create schedule", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const response = await fetch(`/api/mass-grab-schedules/${id}/toggle`, { method: "POST" });
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
      const response = await fetch(`/api/mass-grab-schedules/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to delete schedule.");
      toast({ title: "Schedule deleted" });
      fetchSchedules();
    } catch (error) {
      toast({ title: "Failed to delete schedule", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const openEditDialog = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setEditStatusUrls(schedule.status_urls);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingSchedule || !editStatusUrls.trim()) {
      toast({ title: "URLs required", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch(`/api/mass-grab-schedules/${editingSchedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusUrls: editStatusUrls.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Failed to update");
      toast({ title: "Schedule updated" });
      setEditDialogOpen(false);
      setEditingSchedule(null);
      fetchSchedules();
    } catch (error) {
      toast({ title: "Failed to update schedule", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
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
          <h1 className="text-3xl font-bold tracking-tight">Schedule Mass Grab</h1>
          <p className="text-muted-foreground mt-1">Otomatis grab profile/status secara berkala</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
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
                    <Clock className="h-4 w-4" />
                    @{schedule.account_username} · Every {schedule.schedule_minutes}m
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {schedule.status_urls.split("\n").length} URLs (batches of 5, 30s delay)
                  </CardDescription>
                  <CardDescription className="text-xs text-muted-foreground/70">
                    {schedule.status_urls.split("\n")[0]}
                    {schedule.status_urls.split("\n").length > 1 && ` (+${schedule.status_urls.split("\n").length - 1} more)`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(schedule)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
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
                <div>
                  <span className="text-muted-foreground">Max Tweets:</span> {schedule.max_tweets_per_profile}
                </div>
                <div>
                  <span className="text-muted-foreground">Scan Replies:</span> {schedule.scan_replies ? "Yes" : "No"}
                </div>
                <div>
                  <span className="text-muted-foreground">Streamtape:</span> {schedule.upload_to_streamtape ? "Yes" : "No"}
                </div>
                <div>
                  <span className="text-muted-foreground">Dood:</span> {schedule.upload_to_dood ? "Yes" : "No"}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Mass Grab Schedule</DialogTitle>
            <DialogDescription>Buat jadwal otomatis untuk grab profile/status secara berkala.</DialogDescription>
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
              <Label>Profile/Status URLs (one per line)</Label>
              <Textarea
                value={statusUrls}
                onChange={(e) => setStatusUrls(e.target.value)}
                placeholder="https://x.com/username&#10;https://x.com/username/status/123"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                URLs akan diproses dalam batch 5 URLs dengan delay 30 detik antar batch untuk menghindari overload.
                {statusUrls.split("\n").filter(Boolean).length > 0 && (
                  <span className="block mt-1 text-primary">
                    {statusUrls.split("\n").filter(Boolean).length} URLs = ~{Math.ceil(statusUrls.split("\n").filter(Boolean).length / 5)} batches
                    (~{Math.ceil(statusUrls.split("\n").filter(Boolean).length / 5) * 0.5} menit per run)
                  </span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Tweets per Profile</Label>
                <Input type="number" min={1} max={50} value={maxTweetsPerProfile} onChange={(e) => setMaxTweetsPerProfile(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Schedule (minutes)</Label>
                <Input type="number" min={5} max={1440} value={scheduleMinutes} onChange={(e) => setScheduleMinutes(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Scan Replies</Label>
                <Switch checked={scanReplies} onCheckedChange={setScanReplies} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Upload to Streamtape</Label>
                <Switch checked={uploadToStreamtape} onCheckedChange={setUploadToStreamtape} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Upload to DoodStream</Label>
                <Switch checked={uploadToDood} onCheckedChange={setUploadToDood} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1" disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} className="flex-1" disabled={creating || !accountId || !statusUrls.trim()}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Mass Grab Schedule</DialogTitle>
            <DialogDescription>Tambah atau ubah link. Edit hanya disarankan saat status idle.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Profile/Status URLs (one per line)</Label>
              <Textarea
                value={editStatusUrls}
                onChange={(e) => setEditStatusUrls(e.target.value)}
                placeholder="https://x.com/username&#10;https://x.com/username/status/123"
                rows={10}
              />
              <p className="text-xs text-muted-foreground">
                {editStatusUrls.split("\n").filter(Boolean).length} URLs saved for this schedule.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleEditSubmit} className="flex-1" disabled={!editStatusUrls.trim() || editingSchedule?.status !== "idle"}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
