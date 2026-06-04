import { useEffect, useState } from "react";
import { useListAccounts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Search, MessageSquare, Play, Eye, CheckCircle2, XCircle, AlertTriangle, Clock, Trash2, Power, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";

type SearchTweet = {
  id: string;
  text: string | null;
  username: string;
  name: string | null;
  createdAt: string | null;
};

type CommentResult = {
  tweetId: string;
  username: string;
  ok: boolean;
  replyId?: string;
  error?: string;
  commentText?: string;
};

type AutoCommentSchedule = {
  id: number;
  account_id: number;
  account_username?: string;
  keyword: string;
  comment_text: string;
  link_rotator?: string | null;
  ai_enabled?: boolean;
  ai_provider?: "openai" | "groq";
  ai_api_key?: string | null;
  ai_prompt?: string | null;
  max_comments: number;
  delay_seconds: number;
  schedule_minutes: number;
  is_active: boolean;
  status: string;
  runs_count: number;
  last_run: string | null;
  next_run: string | null;
  last_error?: string | null;
};

export default function AutoComments() {
  const { data: accounts } = useListAccounts();
  const { toast } = useToast();

  const [accountId, setAccountId] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [commentText, setCommentText] = useState("");
  const [linkRotator, setLinkRotator] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<"openai" | "groq">("openai");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [maxComments, setMaxComments] = useState(3);
  const [delaySeconds, setDelaySeconds] = useState(30);
  const [scheduleMinutes, setScheduleMinutes] = useState(60);

  const [isSearching, setIsSearching] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchTweet[]>([]);
  const [commentResults, setCommentResults] = useState<CommentResult[]>([]);
  const [lastAction, setLastAction] = useState<"search" | "comment" | null>(null);
  const [schedules, setSchedules] = useState<AutoCommentSchedule[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);

  const cookieAccounts = accounts?.filter((acc: any) => acc.authMode === "cookies") ?? [];

  const loadSchedules = async () => {
    setIsLoadingSchedules(true);
    try {
      const response = await fetch("/api/auto-comments/schedules");
      const result = await response.json();
      if (result.ok) setSchedules(result.schedules ?? []);
    } finally {
      setIsLoadingSchedules(false);
    }
  };

  useEffect(() => {
    void loadSchedules();
  }, []);

  const handleCreateSchedule = async () => {
    if (!accountId || !keyword.trim() || (!aiEnabled && !commentText.trim()) || (aiEnabled && !aiApiKey.trim())) {
      toast({ title: "Missing fields", description: aiEnabled ? "Pilih account, keyword, dan AI API key." : "Pilih account, keyword, dan comment text.", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch("/api/auto-comments/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: Number(accountId), keyword: keyword.trim(), commentText: commentText.trim(), linkRotator: linkRotator.trim(), aiEnabled, aiProvider, aiApiKey: aiApiKey.trim(), aiPrompt: aiPrompt.trim(), maxComments, delaySeconds, scheduleMinutes }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Failed to create schedule");
      toast({ title: "Schedule created", description: `Auto comment akan jalan setiap ${scheduleMinutes} menit.` });
      await loadSchedules();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create schedule", variant: "destructive" });
    }
  };

  const resetScheduleForm = () => {
    setEditingScheduleId(null);
    setAccountId("");
    setKeyword("");
    setCommentText("");
    setLinkRotator("");
    setAiEnabled(false);
    setAiProvider("openai");
    setAiApiKey("");
    setAiPrompt("");
    setMaxComments(3);
    setDelaySeconds(30);
    setScheduleMinutes(60);
  };

  const handleEditSchedule = (schedule: AutoCommentSchedule) => {
    setEditingScheduleId(schedule.id);
    setAccountId(String(schedule.account_id));
    setKeyword(schedule.keyword);
    setCommentText(schedule.comment_text ?? "");
    setLinkRotator(schedule.link_rotator ?? "");
    setAiEnabled(Boolean(schedule.ai_enabled));
    setAiProvider(schedule.ai_provider === "groq" ? "groq" : "openai");
    setAiApiKey(schedule.ai_api_key ?? "");
    setAiPrompt(schedule.ai_prompt ?? "");
    setMaxComments(schedule.max_comments);
    setDelaySeconds(schedule.delay_seconds);
    setScheduleMinutes(schedule.schedule_minutes);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUpdateSchedule = async () => {
    if (!editingScheduleId) return;
    if (!accountId || !keyword.trim() || (!aiEnabled && !commentText.trim()) || (aiEnabled && !aiApiKey.trim())) {
      toast({ title: "Missing fields", description: aiEnabled ? "Pilih account, keyword, dan AI API key." : "Pilih account, keyword, dan comment text.", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch(`/api/auto-comments/schedules/${editingScheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: Number(accountId), keyword: keyword.trim(), commentText: commentText.trim(), linkRotator: linkRotator.trim(), aiEnabled, aiProvider, aiApiKey: aiApiKey.trim(), aiPrompt: aiPrompt.trim(), maxComments, delaySeconds, scheduleMinutes }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Failed to update schedule");
      toast({ title: "Schedule updated", description: "Perubahan schedule tersimpan." });
      setEditingScheduleId(null);
      await loadSchedules();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update schedule", variant: "destructive" });
    }
  };

  const handleToggleSchedule = async (id: number) => {
    const response = await fetch(`/api/auto-comments/schedules/${id}/toggle`, { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      toast({ title: "Error", description: result.error ?? "Failed to toggle schedule", variant: "destructive" });
      return;
    }
    await loadSchedules();
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm("Delete this auto comment schedule?")) return;
    const response = await fetch(`/api/auto-comments/schedules/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      toast({ title: "Error", description: result.error ?? "Failed to delete schedule", variant: "destructive" });
      return;
    }
    await loadSchedules();
  };

  const handleSearch = async () => {
    if (!accountId || !keyword.trim()) {
      toast({ title: "Missing fields", description: "Pilih account dan masukkan keyword.", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    setCommentResults([]);
    setLastAction("search");
    try {
      const response = await fetch("/api/auto-comments/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: Number(accountId), keyword: keyword.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast({ title: "Search failed", description: result.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      setSearchResults(result.tweets ?? []);
      toast({ title: "Search complete", description: `Found ${result.tweets?.length ?? 0} tweets for "${keyword}"` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Search failed", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAutoComment = async () => {
    if (!accountId || !keyword.trim() || (!aiEnabled && !commentText.trim()) || (aiEnabled && !aiApiKey.trim())) {
      toast({ title: "Missing fields", description: aiEnabled ? "Pilih account, keyword, dan AI API key." : "Pilih account, keyword, dan comment text.", variant: "destructive" });
      return;
    }
    setIsCommenting(true);
    setCommentResults([]);
    setLastAction("comment");
    try {
      const response = await fetch("/api/auto-comments/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(accountId),
          keyword: keyword.trim(),
          commentText: commentText.trim(),
          linkRotator: linkRotator.trim(),
          aiEnabled,
          aiProvider,
          aiApiKey: aiApiKey.trim(),
          aiPrompt: aiPrompt.trim(),
          maxComments,
          delaySeconds,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast({ title: "Auto comment failed", description: result.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      setCommentResults(result.results ?? []);
      const successCount = (result.results ?? []).filter((r: CommentResult) => r.ok).length;
      toast({ title: "Auto comment complete", description: `${successCount}/${result.attempted} comments posted successfully. Skipped duplicates: ${result.skippedDuplicates ?? 0}.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Auto comment failed", variant: "destructive" });
    } finally {
      setIsCommenting(false);
    }
  };

  const handlePreview = async () => {
    if (!accountId || !keyword.trim()) {
      toast({ title: "Missing fields", description: "Pilih account dan masukkan keyword.", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setCommentResults([]);
    setLastAction("search");
    try {
      const response = await fetch("/api/auto-comments/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(accountId),
          keyword: keyword.trim(),
          commentText: commentText.trim() || "(preview)",
          linkRotator: linkRotator.trim(),
          maxComments,
          delaySeconds,
          dryRun: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        toast({ title: "Preview failed", description: result.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      setSearchResults(result.selected ?? []);
      toast({ title: "Preview ready", description: `${result.selected?.length ?? 0} tweets will be commented. Skipped duplicates: ${result.skippedDuplicates ?? 0}.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Preview failed", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auto Comments</h1>
          <p className="text-muted-foreground">Search tweets by keyword and auto reply/comment</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {cookieAccounts.map((acc: any) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      @{acc.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cookieAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">No cookie auth accounts available.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Search Keyword</Label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. crypto, nft, web3..."
              />
              <p className="text-xs text-muted-foreground">Keyword untuk mencari tweets di X</p>
            </div>

            <div className="space-y-2">
              <Label>Comment Text / Message Rotator</Label>
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={`Tulis beberapa variasi, satu per baris:\nNice post!\nGreat content 🔥\nThanks for sharing!\n\nAtau pakai --- untuk pesan multi-line.`}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Rotator aktif otomatis: tiap tweet memakai variasi berbeda bergiliran. Pisah variasi dengan baris baru, atau pakai <code>---</code> untuk pesan multi-line.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Link Rotator (optional)</Label>
              <Textarea
                value={linkRotator}
                onChange={(e) => setLinkRotator(e.target.value)}
                placeholder={`https://example.com/a\nhttps://example.com/b\nhttps://example.com/c`}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Isi satu link per baris atau pisahkan dengan koma. Link akan ditambahkan di bawah comment dan diputar bergiliran.
              </p>
            </div>

            {/* AI Comment Mode */}
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">AI Comment Mode</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Biarkan AI buat komentar otomatis sesuai isi tweet</p>
                </div>
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
              </div>

              {aiEnabled && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">AI Provider</Label>
                    <Select value={aiProvider} onValueChange={(v) => setAiProvider(v as "openai" | "groq")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI (gpt-4o-mini)</SelectItem>
                        <SelectItem value="groq">Groq (llama-3.1-8b-instant)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">API Key</Label>
                    <Input
                      type="password"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder={aiProvider === "openai" ? "sk-..." : "gsk_..."}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Custom System Prompt (optional)</Label>
                    <Textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Kosongkan untuk pakai prompt default. Contoh: Balas dalam bahasa Indonesia, singkat dan ramah, max 150 karakter."
                      rows={3}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Jika kosong, AI akan balas sesuai bahasa tweet (Indonesia/English), 1-2 kalimat, natural.
                    </p>
                  </div>

                  <div className="rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                    💡 AI membaca isi tweet lalu buat balasan yang nyambung. Comment Text di atas jadi fallback jika AI gagal.
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Max Comments: {maxComments}</Label>
              <Slider
                value={[maxComments]}
                onValueChange={(v) => setMaxComments(v[0])}
                min={1}
                max={10}
                step={1}
              />
              <p className="text-xs text-muted-foreground">Jumlah maksimal comment per run (1-10)</p>
            </div>

            <div className="space-y-2">
              <Label>Delay Between Comments: {delaySeconds}s</Label>
              <Slider
                value={[delaySeconds]}
                onValueChange={(v) => setDelaySeconds(v[0])}
                min={5}
                max={300}
                step={5}
              />
              <p className="text-xs text-muted-foreground">Jeda antar comment untuk menghindari rate limit (5-300 detik)</p>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/20">
              <Label className="flex items-center gap-2"><Clock className="h-4 w-4" /> Schedule Auto Run</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={scheduleMinutes}
                  min={5}
                  max={1440}
                  onChange={(e) => setScheduleMinutes(Math.max(5, Math.min(Number(e.target.value) || 60, 1440)))}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">minutes interval</span>
                {editingScheduleId ? (
                  <div className="ml-auto flex gap-2">
                    <Button onClick={handleUpdateSchedule} variant="secondary" disabled={!accountId || !keyword.trim() || (!aiEnabled && !commentText.trim()) || (aiEnabled && !aiApiKey.trim())}>
                      <Pencil className="mr-2 h-4 w-4" /> Update Schedule
                    </Button>
                    <Button onClick={resetScheduleForm} variant="outline">
                      <X className="mr-2 h-4 w-4" /> Cancel
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleCreateSchedule} variant="secondary" className="ml-auto" disabled={!accountId || !keyword.trim() || (!aiEnabled && !commentText.trim()) || (aiEnabled && !aiApiKey.trim())}>
                    <Clock className="mr-2 h-4 w-4" /> Save Schedule
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Scheduler berjalan otomatis di server. Minimal interval 5 menit.</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSearch} disabled={isSearching || isCommenting} variant="outline" className="flex-1">
                {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Search
              </Button>
              <Button onClick={handlePreview} disabled={isSearching || isCommenting} variant="outline" className="flex-1">
                {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Preview
              </Button>
              <Button onClick={handleAutoComment} disabled={isSearching || isCommenting || !commentText.trim()} className="flex-1">
                {isCommenting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Run
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tips Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Tips & Safety
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Alert className="border-amber-500/20 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-600">Gunakan dengan bijak</AlertTitle>
              <AlertDescription className="text-amber-600/80">
                Auto comment yang terlalu agresif bisa menyebabkan akun kena suspend.
              </AlertDescription>
            </Alert>
            <div className="space-y-2 text-muted-foreground">
              <p>✅ <strong>Max 5-10 comments per jam</strong></p>
              <p>✅ <strong>Delay minimal 30 detik</strong> antar comment</p>
              <p>✅ <strong>Variasi text</strong> - jangan copy-paste yang sama terus</p>
              <p>✅ <strong>Keyword spesifik</strong> - target niche yang relevan</p>
              <p>❌ <strong>Jangan spam</strong> - comment harus relevan</p>
              <p>❌ <strong>Jangan link spam</strong> - hindari link di setiap comment</p>
              <p>❌ <strong>Jangan 24/7</strong> - gunakan di jam aktif saja</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Scheduled Auto Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Keyword</TableHead>
                <TableHead>Every</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {isLoadingSchedules ? "Loading schedules..." : "No schedules yet."}
                  </TableCell>
                </TableRow>
              ) : schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">@{schedule.account_username ?? schedule.account_id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{schedule.keyword}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[260px]">{schedule.comment_text}</div>
                    <div className="text-[10px] text-muted-foreground">Message variants: {schedule.comment_text.includes("---") ? schedule.comment_text.split(/\n\s*---\s*\n/g).filter(Boolean).length : schedule.comment_text.split(/\n+/g).filter(Boolean).length}</div>
                    {schedule.link_rotator && <div className="text-[10px] text-muted-foreground">Link variants: {schedule.link_rotator.split(/[\n,]+/g).filter(Boolean).length}</div>}
                    {schedule.last_error && <div className="text-xs text-destructive truncate max-w-[260px]">{schedule.last_error}</div>}
                  </TableCell>
                  <TableCell>{schedule.schedule_minutes}m</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      schedule.status === "running" ? "text-primary border-primary bg-primary/10 animate-pulse" :
                      !schedule.is_active ? "text-muted-foreground border-border bg-muted/20" :
                      schedule.status === "error" ? "text-destructive border-destructive bg-destructive/10" :
                      "text-green-600 border-green-500/20 bg-green-500/10"
                    }>
                      {schedule.status === "running" ? "RUNNING" : !schedule.is_active ? "PAUSED" : schedule.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{schedule.runs_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditSchedule(schedule)}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggleSchedule(schedule.id)}>
                      <Power className="mr-1 h-3 w-3" /> {schedule.is_active ? "Pause" : "Resume"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteSchedule(schedule.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Search Results */}
      {lastAction === "search" && searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Results ({searchResults.length} tweets)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">User</TableHead>
                  <TableHead>Tweet</TableHead>
                  <TableHead className="w-[100px]">ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((tweet) => (
                  <TableRow key={tweet.id}>
                    <TableCell className="font-medium text-primary">@{tweet.username}</TableCell>
                    <TableCell className="max-w-[400px] truncate text-sm">{tweet.text}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{tweet.id.slice(-8)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Comment Results */}
      {lastAction === "comment" && commentResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Comment Results
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[120px]">User</TableHead>
                  <TableHead>Tweet ID</TableHead>
                  <TableHead>Comment Used</TableHead>
                  <TableHead>Reply ID / Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commentResults.map((result, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {result.ok ? (
                        <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10 gap-1">
                          <XCircle className="h-3 w-3" /> Fail
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-primary">@{result.username}</TableCell>
                    <TableCell className="font-mono text-xs">{result.tweetId}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate">{result.commentText}</TableCell>
                    <TableCell className="text-xs">
                      {result.ok ? (
                        <span className="text-green-600 font-mono">{result.replyId}</span>
                      ) : (
                        <span className="text-destructive">{result.error}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!lastAction && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Ready to auto comment</p>
            <p className="text-sm mt-1">Pilih account, masukkan keyword, tulis comment, lalu klik Search atau Run.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
