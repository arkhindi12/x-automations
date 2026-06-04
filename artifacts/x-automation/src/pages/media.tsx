import { useState, useEffect } from "react";
import { useListMedia, useDeleteMedia, useListAccounts, getListMediaQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Trash2, ExternalLink, Video, Image as ImageIcon, Plus, Loader2,
  Copy, Check, Link, Zap, ArrowRight, AlertCircle, Edit2, Search, UploadCloud,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExtractResult {
  success: boolean;
  directUrl: string;
  method: "ytdlp" | "html" | "original";
  chain: string[];
  title: string | null;
  thumbnail: string | null;
  error?: string;
}

interface ManualResult {
  image?: { id: number; originalUrl: string; sourceUrl?: string | null };
  video?: { id: number; originalUrl: string; doodUrl: string | null; doodStatus: string; embedUrl: string | null; sourceUrl?: string | null };
  error?: string;
}

type BatchExtractResult = ExtractResult & {
  url: string;
  normalizedUrl: string;
  ok: boolean;
  isValidVideo?: boolean;
  validationError?: string | null;
};

const METHOD_LABEL: Record<string, string> = {
  ytdlp: "yt-dlp",
  html: "HTML Fallback",
  original: "Original URL",
};

const METHOD_COLOR: Record<string, string> = {
  ytdlp: "text-green-400 border-green-500/30 bg-green-500/10",
  html: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  original: "text-muted-foreground border-border bg-muted",
};

export default function Media() {
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const { data: mediaItems, isLoading } = useListMedia({ type: filter === "all" ? undefined : filter });
  const { data: accounts } = useListAccounts();
  const deleteMedia = useDeleteMedia();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [isCleaningNoVideo, setIsCleaningNoVideo] = useState(false);
  const [retryBgStatus, setRetryBgStatus] = useState<{ running: boolean; total: number; processed: number; success: number; failed: number } | null>(null);

  // Check if mass regrab is already running on page load
  useEffect(() => {
    fetch("/api/media/mass-regrab-background/status")
      .then(r => r.json())
      .then(data => {
        if (data.running) {
          setRetryBgStatus(data);
          pollRetryBgStatus();
        }
      })
      .catch(() => {});
  }, []);
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [statusUrl, setStatusUrl] = useState("");
  const [targetUsername, setTargetUsername] = useState("manual");
  const [doodUrl, setDoodUrl] = useState("");
  const [doodApiKey, setDoodApiKey] = useState("");
  const [autoEmbed, setAutoEmbed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [result, setResult] = useState<ManualResult | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [massDialogOpen, setMassDialogOpen] = useState(false);
  const [massAccountId, setMassAccountId] = useState("");
  const [massStatusUrls, setMassStatusUrls] = useState("");
  const [massUploadToDood, setMassUploadToDood] = useState(false);
  const [massUploadToStreamtape, setMassUploadToStreamtape] = useState(true);
  const [massScanReplies, setMassScanReplies] = useState(true);
  const [massDoodApiKey, setMassDoodApiKey] = useState("");
  const [massMaxTweets, setMassMaxTweets] = useState(50);
  const [isMassGrabbing, setIsMassGrabbing] = useState(false);
  const [massGrabLogs, setMassGrabLogs] = useState<string[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<any | null>(null);
  const [editTargetUsername, setEditTargetUsername] = useState("");
  const [editOriginalUrl, setEditOriginalUrl] = useState("");
  const [editStatusUrl, setEditStatusUrl] = useState("");
  const [editDoodUrl, setEditDoodUrl] = useState("");
  const [rescrapingIds, setRescrapingIds] = useState<Set<number>>(new Set());
  const [extractBatchDialogOpen, setExtractBatchDialogOpen] = useState(false);
  const [batchUrls, setBatchUrls] = useState("");
  const [batchResults, setBatchResults] = useState<BatchExtractResult[]>([]);
  const [isBatchExtracting, setIsBatchExtracting] = useState(false);

  const getSourceStatusUrl = (item: any) => {
    if (item.sourceTweetId && item.targetUsername && item.targetUsername !== "manual") {
      return `https://x.com/${String(item.targetUsername).replace(/^@/, "")}/status/${item.sourceTweetId}`;
    }
    return item.originalUrl;
  };

  const openEditDialog = (item: any) => {
    setEditingMedia(item);
    setEditTargetUsername(item.targetUsername ?? "manual");
    setEditOriginalUrl(item.originalUrl ?? "");
    setEditStatusUrl(item.sourceTweetId && item.targetUsername ? `https://x.com/${String(item.targetUsername).replace(/^@/, "")}/status/${item.sourceTweetId}` : "");
    setEditDoodUrl(item.doodUrl ?? "");
    setEditDialogOpen(true);
  };

  const cookieAccounts = accounts?.filter((acc: any) => acc.authMode === "cookies") ?? [];
  const regrabTotal = retryBgStatus?.total ?? 0;
  const regrabProcessed = retryBgStatus?.processed ?? 0;
  const regrabPercent = regrabTotal > 0 ? Math.min(100, Math.round((regrabProcessed / regrabTotal) * 100)) : 0;
  const regrabRemaining = Math.max(0, regrabTotal - regrabProcessed);

  const handleMassGrab = async () => {
    if (!massAccountId || !massStatusUrls.trim()) {
      toast({ title: "Missing fields", description: "Pilih cookie account dan isi profile/status URLs.", variant: "destructive" });
      return;
    }
    setIsMassGrabbing(true);
    setMassGrabLogs([]);
    const progressId = `mass-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const eventSource = new EventSource(`/api/media/mass-grab-progress/${progressId}`);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.message) setMassGrabLogs((prev) => [...prev, data.message]);
      } catch {}
    };
    try {
      const response = await fetch("/api/media/mass-grab-x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(massAccountId),
          statusUrls: massStatusUrls.trim(),
          uploadToDood: massUploadToDood,
          uploadToStreamtape: massUploadToStreamtape,
          scanReplies: massScanReplies,
          maxTweetsPerProfile: massMaxTweets,
          doodApiKey: massDoodApiKey.trim() || undefined,
          progressId,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Mass grab failed.");
      eventSource.close();
      await queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({ title: "Mass grab complete", description: `Inserted ${data.inserted} media. Uploaded ${data.uploaded}. Failed ${data.failed}.` });
      setMassDialogOpen(false);
    } catch (err) {
      eventSource.close();
      toast({ title: "Mass grab failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsMassGrabbing(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingMedia) return;
    if (!editOriginalUrl.trim()) {
      toast({ title: "Original URL required", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch(`/api/media/${editingMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUsername: editTargetUsername.trim() || "manual",
          originalUrl: editOriginalUrl.trim(),
          statusUrl: editStatusUrl.trim(),
          doodUrl: editDoodUrl.trim() || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Failed to update media.");
      await queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({ title: "Media updated" });
      setEditDialogOpen(false);
      setEditingMedia(null);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update media.", variant: "destructive" });
    }
  };

  const handleRescrapeVideo = async (item: any) => {
    const sourceUrl = getSourceStatusUrl(item);
    const confirmed = confirm(`Re-scrape video dari source ini lalu upload ke Streamtape?\n\n${sourceUrl}`);
    if (!confirmed) return;

    setRescrapingIds((prev) => new Set(prev).add(item.id));
    try {
      const response = await fetch(`/api/media/${item.id}/rescrape-video-streamtape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: cookieAccounts[0]?.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error ?? "Failed to re-scrape video.");
      await queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({ title: "Video re-scraped", description: "Video URL dan Streamtape sudah di-update." });
    } catch (err) {
      toast({ title: "Re-scrape failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRescrapingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleCleanDuplicates = async () => {
    const confirmed = confirm(`Clean duplicate ${filter === "all" ? "media" : filter + " media"}? Sistem akan menyisakan item pertama dan hapus duplicate berdasarkan URL media.`);
    if (!confirmed) return;

    setIsCleaningDuplicates(true);
    try {
      const response = await fetch(`/api/media/clean-duplicates?type=${encodeURIComponent(filter)}`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { deleted?: number; duplicates?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to clean duplicates.");
      await queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({ title: "Duplicates cleaned", description: `${payload?.deleted ?? 0} duplicate item(s) removed.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to clean duplicates.", variant: "destructive" });
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const handleDeleteAll = async () => {
    const total = mediaItems?.length ?? 0;
    if (total === 0) return;

    const label = filter === "all" ? "semua media" : `semua media ${filter}`;
    const confirmed = confirm(`Hapus ${label} (${total} item)? Tindakan ini tidak bisa dibatalkan.`);
    if (!confirmed) return;

    setIsDeletingAll(true);
    try {
      const url = filter === "all" ? "/api/media" : `/api/media?type=${encodeURIComponent(filter)}`;
      const response = await fetch(url, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { deleted?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to delete all media.");
      queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({ title: "Media deleted", description: `${payload?.deleted ?? total} item(s) removed.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete all media.", variant: "destructive" });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleCleanupNoVideo = async () => {
    const confirmed = confirm("Hapus semua video yang tidak punya Streamtape/DoodStream URL? Video tanpa link hosting akan dihapus.");
    if (!confirmed) return;

    setIsCleaningNoVideo(true);
    try {
      const response = await fetch("/api/media/cleanup-no-video", { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { deleted?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to cleanup.");
      queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({ title: "Cleanup done", description: `${payload?.deleted ?? 0} video tanpa URL dihapus.` });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Cleanup failed.", variant: "destructive" });
    } finally {
      setIsCleaningNoVideo(false);
    }
  };

  const handleRetryStreamtapeBg = async () => {
    const confirmed = confirm("Mulai mass grab ulang semua media yang belum ada video/streamtape URL? Sistem akan re-fetch tweet dan extract video secara background.");
    if (!confirmed) return;

    // Use first account (or could add account picker)
    try {
      const accRes = await fetch("/api/accounts");
      const accounts = await accRes.json();
      const cookieAccount = accounts.find((a: any) => a.authMode === "cookies" && a.isActive);
      if (!cookieAccount) {
        toast({ title: "Error", description: "Tidak ada akun cookie yang aktif.", variant: "destructive" });
        return;
      }

      const res = await fetch("/api/media/mass-regrab-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: cookieAccount.id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      toast({ title: "Mass Grab Started", description: data.message });
      pollRetryBgStatus();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to start.", variant: "destructive" });
    }
  };

  const handleCancelRetryBg = async () => {
    await fetch("/api/media/mass-regrab-background/cancel", { method: "POST" });
    setRetryBgStatus(null);
    toast({ title: "Cancelled", description: "Mass grab stopped." });
  };

  const pollRetryBgStatus = () => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/media/mass-regrab-background/status");
        const data = await res.json();
        setRetryBgStatus(data);
        if (!data.running) {
          clearInterval(interval);
          queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this media item?")) {
      deleteMedia.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
            toast({ title: "Media deleted" });
          },
          onError: () => toast({ title: "Error", description: "Failed to delete media.", variant: "destructive" }),
        }
      );
    }
  };

  const getDoodStatusColor = (status: string | null | undefined) => {
    switch (status) {
      case "done": return "text-green-500 border-green-500/20 bg-green-500/10";
      case "uploading": return "text-primary border-primary/20 bg-primary/10 animate-pulse";
      case "failed": return "text-destructive border-destructive/20 bg-destructive/10";
      case "pending": return "text-yellow-500 border-yellow-500/20 bg-yellow-500/10";
      default: return "text-muted-foreground border-border bg-muted";
    }
  };

  const resetForm = () => {
    setImageUrl("");
    setVideoUrl("");
    setTargetUsername("manual");
    setStatusUrl("");
    setDoodUrl("");
    setDoodApiKey("");
    setAutoEmbed(false);
    setResult(null);
    setExtractResult(null);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleBatchExtract = async () => {
    if (!batchUrls.trim()) return;
    setIsBatchExtracting(true);
    setBatchResults([]);
    try {
      const response = await fetch(`/api/media/extract-batch?t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify({ urls: batchUrls }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Batch extract failed.");
      setBatchResults(data.results ?? []);
      toast({ title: "Batch extract complete", description: `${data.results?.length ?? 0} link(s) scanned.` });
    } catch (err) {
      toast({ title: "Batch extract failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsBatchExtracting(false);
    }
  };

  const handleExtract = async () => {
    if (!videoUrl.trim()) return;
    setIsExtracting(true);
    setExtractResult(null);
    try {
      // Add timestamp to bypass aggressive browser cache
      const cacheBuster = `?t=${Date.now()}`;
      const response = await fetch(`/api/media/extract${cacheBuster}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
        body: JSON.stringify({ url: videoUrl.trim() }),
      });
      const data = await response.json() as ExtractResult;
      if (!response.ok) throw new Error(data?.error || "Gagal mengekstrak URL.");
      setExtractResult(data);
      if (data.directUrl && data.method !== "original") {
        setVideoUrl(data.directUrl);
        toast({ title: "URL berhasil diekstrak", description: `Ditemukan via ${METHOD_LABEL[data.method] || data.method}` });
      } else {
        toast({ title: "Tidak ada URL langsung ditemukan", description: "URL asli dipertahankan.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Extract gagal", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async () => {
    if (!imageUrl.trim() && !videoUrl.trim()) {
      toast({ title: "Input required", description: "Isi minimal Image URL atau Video URL.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/media/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl.trim() || undefined,
          videoUrl: videoUrl.trim() || undefined,
          statusUrl: statusUrl.trim() || undefined,
          targetUsername: targetUsername.trim() || "manual",
          doodUrl: doodUrl.trim() || undefined,
          doodApiKey: doodApiKey.trim() || undefined,
          autoEmbed,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Gagal menambah media.");
      setResult(data as ManualResult);
      queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      toast({
        title: "Media ditambahkan",
        description: videoUrl.trim() && (doodApiKey.trim() || doodUrl.trim()) ? "Video tersimpan dengan DoodStream link." : "Media disimpan ke library.",
      });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Gagal menambah media.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Media Library</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setMassDialogOpen(true)} className="gap-1.5">
              <Zap className="h-4 w-4" />
              Mass Grab
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Media
            </Button>
          </div>
        </div>

        {/* Filter + Tools row */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "image" | "video")} className="w-auto">
            <TabsList className="grid grid-cols-3 bg-muted/50 border border-border w-[240px]">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs">ALL</TabsTrigger>
              <TabsTrigger value="video" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs">VIDEOS</TabsTrigger>
              <TabsTrigger value="image" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs">IMAGES</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="h-4 w-px bg-border hidden sm:block" />

          <Button
            size="sm"
            variant="outline"
            onClick={handleCleanDuplicates}
            disabled={isCleaningDuplicates || isLoading || (mediaItems?.length ?? 0) === 0}
            className="gap-1 text-xs h-8"
          >
            {isCleaningDuplicates ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Clean</span> Duplicates
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCleanupNoVideo}
            disabled={isCleaningNoVideo || isLoading}
            className="gap-1 text-xs h-8 text-orange-400 border-orange-400/30 hover:bg-orange-400/10"
          >
            {isCleaningNoVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Hapus</span> No URL
          </Button>
          {retryBgStatus?.running ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">
                <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                {retryBgStatus.processed}/{retryBgStatus.total} ({retryBgStatus.success}✓ {retryBgStatus.failed}✗)
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 px-2" onClick={handleCancelRetryBg}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryStreamtapeBg}
              disabled={isLoading}
              className="gap-1 text-xs h-8 text-blue-400 border-blue-400/30 hover:bg-blue-400/10"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mass</span> Grab Video
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setExtractBatchDialogOpen(true)} className="gap-1 text-xs h-8">
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Smart</span> Extract
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDeleteAll}
            disabled={isDeletingAll || isLoading || (mediaItems?.length ?? 0) === 0}
            className="gap-1 text-xs h-8"
          >
            {isDeletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Delete</span> All
          </Button>
        </div>
      </div>

      {retryBgStatus && (retryBgStatus.running || retryBgStatus.total > 0) && (
        <Card className="relative overflow-hidden border-cyan-500/30 bg-gradient-to-br from-slate-950 via-cyan-950/20 to-fuchsia-950/20 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.35),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(217,70,239,.25),transparent_30%)]" />
          {retryBgStatus.running && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent animate-pulse" />}
          <CardContent className="relative p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center">
                  <div className="absolute inset-1 rounded-lg border border-cyan-300/20 animate-ping" />
                  {retryBgStatus.running ? <Loader2 className="h-5 w-5 text-cyan-300 animate-spin" /> : <Check className="h-5 w-5 text-emerald-300" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-cyan-100 tracking-wide">Mass Regrab Engine</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {retryBgStatus.running ? "Scanning replies → extracting video → uploading Streamtape" : "Process completed / idle"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={retryBgStatus.running ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" : "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"}>
                  {retryBgStatus.running ? "LIVE PROCESS" : "FINISHED"}
                </Badge>
                {retryBgStatus.running && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-red-300 hover:text-red-200 hover:bg-red-500/10" onClick={handleCancelRetryBg}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono text-cyan-100">
                <span>{regrabProcessed}/{regrabTotal} processed</span>
                <span>{regrabPercent}%</span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-slate-900 border border-cyan-500/20">
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(34,211,238,.18),transparent)] animate-pulse" />
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 transition-all duration-700 shadow-[0_0_18px_rgba(34,211,238,.55)]"
                  style={{ width: `${regrabPercent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-cyan-500/20 bg-black/20 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Success</div>
                <div className="text-xl font-bold text-emerald-300">{retryBgStatus.success}</div>
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-black/20 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</div>
                <div className="text-xl font-bold text-red-300">{retryBgStatus.failed}</div>
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-black/20 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Remaining</div>
                <div className="text-xl font-bold text-cyan-200">{regrabRemaining}</div>
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-black/20 p-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Mode</div>
                <div className="text-sm font-bold text-fuchsia-200">Streamtape</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-primary font-mono animate-pulse">Loading media index...</div>
      ) : mediaItems?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground font-mono">No media items found in storage.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {mediaItems?.map((item) => (
            <Card key={item.id} className="overflow-hidden border-border bg-card hover:border-primary/50 transition-colors group">
              <div className="aspect-video relative bg-muted/30 flex items-center justify-center border-b border-border/50 overflow-hidden">
                {item.type === "image" && (
                  <>
                    <img
                      src={(item as any).mirrorUrl || item.originalUrl}
                      alt={`Media ${item.id}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        const fallback = (e.target as HTMLImageElement).parentElement?.querySelector(".img-fallback");
                        fallback?.classList.remove("hidden");
                      }}
                    />
                    <ImageIcon className="img-fallback h-10 w-10 text-muted-foreground/30 absolute hidden" />
                  </>
                )}
                {item.type === "video" && (
                  <>
                    {item.thumbnailUrl ? (
                      <>
                        <img
                          src={item.thumbnailUrl}
                          alt={`Thumbnail ${item.id}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                            const fallback = (e.target as HTMLImageElement).parentElement?.querySelector(".vid-fallback");
                            fallback?.classList.remove("hidden");
                          }}
                        />
                        <Video className="vid-fallback h-10 w-10 text-muted-foreground/30 absolute hidden" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black/50 rounded-full p-2">
                            <Video className="h-6 w-6 text-white" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <Video className="h-10 w-10 text-muted-foreground/30" />
                    )}
                  </>
                )}
                <div className="absolute top-2 left-2 flex gap-1">
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur font-mono text-[10px] uppercase">
                    @{item.targetUsername}
                  </Badge>
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/20"
                    onClick={() => openEditDialog(item)}
                    title="Edit media"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 rounded-full bg-background/80 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/20"
                    onClick={() => handleDelete(item.id)}
                    title="Delete media"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">ID: {item.id}</span>
                  <span className="text-muted-foreground">{item.fileSize ? (item.fileSize / 1024 / 1024).toFixed(2) : 0} MB</span>
                </div>
                {item.type === "video" && item.doodStatus && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">DoodStream</span>
                    <Badge variant="outline" className={`text-[10px] uppercase ${getDoodStatusColor(item.doodStatus)}`}>
                      {item.doodStatus}
                    </Badge>
                  </div>
                )}
                {item.type === "video" && typeof item.sourceText === "string" && item.sourceText.includes("[ocr]") && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">OCR Text</p>
                    <p className="text-xs text-foreground/80 line-clamp-3">
                      {(item.sourceText.match(/\[ocr\]\s*(.+)$/ims)?.[1] || "").trim()}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
                  <a href={getSourceStatusUrl(item)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                    {item.sourceTweetId ? "Source Tweet" : "Original"} <ExternalLink className="h-3 w-3" />
                  </a>
                  {item.type === "image" && (item as any).mirrorUrl && (
                    <a href={(item as any).mirrorUrl} target="_blank" rel="noreferrer" className="text-xs text-pink-400 hover:underline flex items-center gap-1">
                      Image Mirror <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {item.type === "video" && item.originalUrl && (
                    <a href={item.originalUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                      Video URL <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {item.streamtapeUrl && (
                    <a href={item.streamtapeUrl} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:underline flex items-center gap-1">
                      Streamtape <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {item.doodUrl && (
                    <a href={item.doodUrl} target="_blank" rel="noreferrer" className="text-xs text-purple-400 hover:underline flex items-center gap-1">
                      Dood <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRescrapeVideo(item)}
                    disabled={rescrapingIds.has(item.id)}
                    className="text-xs text-amber-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                    title="Re-scrape video from Source Tweet and upload to Streamtape"
                  >
                    {rescrapingIds.has(item.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    Re-scrape Video
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-primary text-sm">Add Manual Media</DialogTitle>
            <DialogDescription>
              Tambah gambar atau video ke library. Video dapat diekstrak linknya, diupload ke DoodStream, dan dibuat embed otomatis.
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <div className="space-y-5 mt-2">
              <div className="space-y-2">
                <Label>Label / Username</Label>
                <Input
                  value={targetUsername}
                  onChange={(e) => setTargetUsername(e.target.value)}
                  placeholder="manual"
                  disabled={isSubmitting || isExtracting}
                />
                <p className="text-xs text-muted-foreground">Jika Status URL diisi, username akan otomatis diambil dari link status.</p>
              </div>

              <div className="space-y-2">
                <Label>Status URL <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                <Input
                  value={statusUrl}
                  onChange={(e) => setStatusUrl(e.target.value)}
                  placeholder="https://x.com/username/status/123456789"
                  disabled={isSubmitting || isExtracting}
                />
                <p className="text-xs text-muted-foreground">Dipakai agar tombol Source Tweet di library membuka status asli.</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Image URL <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  disabled={isSubmitting || isExtracting}
                />
                {imageUrl.trim() && (
                  <div className="rounded-md overflow-hidden border border-border bg-muted/30 aspect-video flex items-center justify-center">
                    <img
                      src={imageUrl.trim()}
                      alt="Preview"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                      }}
                    />
                    <span className="hidden text-xs text-muted-foreground p-4 text-center">Gambar tidak dapat dimuat</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Video URL <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={videoUrl}
                    onChange={(e) => { setVideoUrl(e.target.value); setExtractResult(null); }}
                    placeholder="https://t.co/... atau URL video langsung"
                    disabled={isSubmitting || isExtracting}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 border-primary/50 text-primary hover:bg-primary/10"
                    disabled={!videoUrl.trim() || isExtracting || isSubmitting}
                    onClick={handleExtract}
                  >
                    {isExtracting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    {isExtracting ? "Extracting..." : "Smart Extract"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Gunakan <strong>Smart Extract</strong> untuk mencari URL video langsung dari link tweet, halaman video, atau redirect chain menggunakan yt-dlp.
                </p>

                {extractResult && (
                  <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-muted-foreground uppercase tracking-widest">Extract Result</span>
                      <Badge variant="outline" className={`text-[10px] ${METHOD_COLOR[extractResult.method] ?? ""}`}>
                        via {METHOD_LABEL[extractResult.method] ?? extractResult.method}
                      </Badge>
                    </div>

                    {extractResult.title && (
                      <p className="text-foreground font-medium line-clamp-1">{extractResult.title}</p>
                    )}

                    {extractResult.thumbnail && (
                      <div className="rounded overflow-hidden border border-border aspect-video bg-muted/30 flex items-center justify-center">
                        <img src={extractResult.thumbnail} alt="Thumbnail" className="max-w-full max-h-full object-contain" />
                      </div>
                    )}

                    {extractResult.chain.length > 1 && (
                      <div className="space-y-1">
                        <span className="text-muted-foreground uppercase tracking-widest text-[10px]">Redirect Chain ({extractResult.chain.length} hop)</span>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {extractResult.chain.map((hop, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
                              {i === 0 && <span className="text-muted-foreground shrink-0 mt-0.5 text-[10px] font-mono">SRC</span>}
                              <span className="font-mono text-[10px] text-muted-foreground truncate">{hop}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <span className="text-muted-foreground uppercase tracking-widest text-[10px]">Direct URL</span>
                      <div className="flex items-center gap-2 p-2 rounded bg-background border border-border">
                        <span className="font-mono text-[10px] truncate flex-1 text-foreground">{extractResult.directUrl}</span>
                        <button onClick={() => copyToClipboard(extractResult.directUrl)} className="shrink-0">
                          {copiedUrl === extractResult.directUrl
                            ? <Check className="h-3 w-3 text-green-500" />
                            : <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />}
                        </button>
                      </div>
                    </div>

                    {extractResult.method === "original" && (
                      <div className="flex items-center gap-1.5 text-yellow-400">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>URL langsung tidak ditemukan. URL asli digunakan sebagai fallback.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {videoUrl.trim() && (
                <>
                  <div className="space-y-2">
                    <Label>DoodStream URL <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                    <Input
                      value={doodUrl}
                      onChange={(e) => setDoodUrl(e.target.value)}
                      placeholder="https://doodstream.com/d/... atau https://dood.to/e/..."
                      disabled={isSubmitting || isExtracting}
                    />
                    <p className="text-xs text-muted-foreground">Isi jika video sudah ada di DoodStream. Kalau diisi, sistem tidak upload ulang.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>DoodStream API Key <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                    <Input
                      type="password"
                      value={doodApiKey}
                      onChange={(e) => setDoodApiKey(e.target.value)}
                      placeholder="Isi untuk upload ke DoodStream"
                      disabled={isSubmitting || isExtracting}
                    />
                    <p className="text-xs text-muted-foreground">Kosongkan untuk pakai API key dari Settings, atau jika DoodStream URL sudah diisi.</p>
                  </div>

                  {(doodApiKey.trim() || doodUrl.trim()) && (
                    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Auto-create Embed Link</Label>
                        <p className="text-xs text-muted-foreground">
                          Buat link unik <span className="font-mono">.mp4</span> setelah upload. Butuh Embed Domain di Settings.
                        </p>
                      </div>
                      <Switch checked={autoEmbed} onCheckedChange={setAutoEmbed} disabled={isSubmitting || isExtracting} />
                    </div>
                  )}
                </>
              )}

              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || isExtracting || (!imageUrl.trim() && !videoUrl.trim())}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {videoUrl.trim() && doodApiKey.trim() ? "Uploading ke DoodStream..." : "Menyimpan..."}
                  </>
                ) : "Tambah ke Library"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-400 font-mono">
                Media berhasil ditambahkan ke library.
              </div>

              {result.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  DoodStream error: {result.error}
                </div>
              )}

              {result.image && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-widest">Image</Label>
                  <div className="rounded-md overflow-hidden border border-border aspect-video bg-muted/30 flex items-center justify-center">
                    <img src={result.image.originalUrl} alt="Added" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border">
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{result.image.originalUrl}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(result.image!.originalUrl)}>
                      {copiedUrl === result.image.originalUrl ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  {result.image.sourceUrl && (
                    <a href={result.image.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      Source Tweet <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {result.video && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-widest">Video</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border">
                      <span className="text-xs text-muted-foreground shrink-0">Original</span>
                      <span className="text-xs font-mono truncate flex-1">{result.video.originalUrl}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(result.video!.originalUrl)}>
                        {copiedUrl === result.video.originalUrl ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>

                    {result.video.sourceUrl && (
                      <div className="flex items-center gap-2 p-2 rounded bg-primary/10 border border-primary/20">
                        <span className="text-xs text-primary shrink-0">Source</span>
                        <a href={result.video.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-primary hover:underline truncate flex-1">
                          {result.video.sourceUrl}
                        </a>
                      </div>
                    )}

                    {result.video.doodUrl && (
                      <div className="flex items-center gap-2 p-2 rounded bg-purple-500/10 border border-purple-500/20">
                        <span className="text-xs text-purple-400 shrink-0">DoodStream</span>
                        <a href={result.video.doodUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-purple-300 hover:underline truncate flex-1">
                          {result.video.doodUrl}
                        </a>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(result.video!.doodUrl!)}>
                          {copiedUrl === result.video.doodUrl ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    )}

                    {result.video.embedUrl && (
                      <div className="flex items-center gap-2 p-2 rounded bg-primary/10 border border-primary/30">
                        <Link className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-xs text-primary shrink-0">Embed</span>
                        <a href={result.video.embedUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-primary/80 hover:underline truncate flex-1">
                          {result.video.embedUrl}
                        </a>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(result.video!.embedUrl!)}>
                          {copiedUrl === result.video.embedUrl ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    )}

                    {result.video.doodUrl && !result.video.embedUrl && (
                      <p className="text-xs text-muted-foreground">
                        Embed link tidak dibuat. Pastikan Embed Domain sudah dikonfigurasi di Settings dan Auto-embed diaktifkan.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetForm} className="flex-1">Tambah Lagi</Button>
                <Button onClick={() => { setDialogOpen(false); resetForm(); }} className="flex-1">Selesai</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={massDialogOpen} onOpenChange={(open) => { setMassDialogOpen(open); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-primary text-sm">Mass Grab X Profile / Status</DialogTitle>
            <DialogDescription>
              Paste link profil X / @username / link status. Sistem grab media gambar + video ke library.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Cookie Account</Label>
              <Select value={massAccountId} onValueChange={setMassAccountId} disabled={isMassGrabbing}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih cookie account..." />
                </SelectTrigger>
                <SelectContent>
                  {cookieAccounts.map((acc: any) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>@{acc.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profile / Status URLs</Label>
              <Textarea
                value={massStatusUrls}
                onChange={(e) => setMassStatusUrls(e.target.value)}
                placeholder={`https://x.com/username\n@anotheruser\nhttps://x.com/user/status/123`}
                rows={6}
                disabled={isMassGrabbing}
              />
              <p className="text-xs text-muted-foreground">Satu baris satu input. Maksimal 100 input per run.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Max tweets/profile</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={massMaxTweets}
                  onChange={(e) => setMassMaxTweets(Math.max(1, Math.min(Number(e.target.value) || 50, 100)))}
                  disabled={isMassGrabbing}
                />
              </div>
              <div className="space-y-2">
                <Label>DoodStream API Key <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                <Input
                  type="password"
                  value={massDoodApiKey}
                  onChange={(e) => setMassDoodApiKey(e.target.value)}
                  placeholder="Kosongkan untuk pakai key di Settings"
                  disabled={isMassGrabbing}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
              <div>
                <p className="text-sm font-medium">Scan replies/comments for video links</p>
                <p className="text-xs text-muted-foreground">Cari link video di komentar tweet juga.</p>
              </div>
              <Switch checked={massScanReplies} onCheckedChange={setMassScanReplies} disabled={isMassGrabbing} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
              <div>
                <p className="text-sm font-medium">Upload videos to Streamtape</p>
                <p className="text-xs text-muted-foreground">Extract video lalu upload ke Streamtape. URL disimpan di media.</p>
              </div>
              <Switch checked={massUploadToStreamtape} onCheckedChange={setMassUploadToStreamtape} disabled={isMassGrabbing} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
              <div>
                <p className="text-sm font-medium">Upload videos to DoodStream</p>
                <p className="text-xs text-muted-foreground">Jika aktif, video hasil grab akan diupload ke DoodStream.</p>
              </div>
              <Switch checked={massUploadToDood} onCheckedChange={setMassUploadToDood} disabled={isMassGrabbing} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setMassDialogOpen(false)} className="flex-1" disabled={isMassGrabbing}>Cancel</Button>
              <Button onClick={handleMassGrab} className="flex-1" disabled={isMassGrabbing || !massAccountId || !massStatusUrls.trim()}>
                {isMassGrabbing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                Start Mass Grab
              </Button>
            </div>

            {massGrabLogs.length > 0 && (
              <div className="mt-4 border border-border rounded-lg bg-muted/20 p-3 max-h-60 overflow-y-auto">
                <p className="text-xs font-mono text-muted-foreground mb-2">Live Progress:</p>
                <div className="space-y-1">
                  {massGrabLogs.map((log, i) => (
                    <p key={i} className="text-xs font-mono text-foreground/80">{log}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={extractBatchDialogOpen} onOpenChange={setExtractBatchDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-primary text-sm">Smart Extract Multi Link</DialogTitle>
            <DialogDescription>Paste banyak link untuk cek redirect chain dan direct video URL dari yt-dlp/html fallback.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <Textarea
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              placeholder="https://vyiz.de/e/0k8n1ovhkcld&#10;https://vdaq.de/e/...&#10;https://t.co/..."
              rows={8}
              disabled={isBatchExtracting}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setExtractBatchDialogOpen(false)} className="flex-1" disabled={isBatchExtracting}>Close</Button>
              <Button onClick={handleBatchExtract} className="flex-1" disabled={isBatchExtracting || !batchUrls.trim()}>
                {isBatchExtracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Scan Links
              </Button>
            </div>

            {batchResults.length > 0 && (
              <div className="space-y-3">
                {batchResults.map((result, index) => (
                  <div key={`${result.url}-${index}`} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-mono truncate text-foreground">{result.url}</p>
                      <Badge variant="outline" className={result.isValidVideo ? "text-green-400 border-green-500/30" : "text-yellow-400 border-yellow-500/30"}>
                        {result.ok ? (result.isValidVideo ? "VIDEO" : result.method) : "FAILED"}
                      </Badge>
                    </div>
                    {result.ok ? (
                      <>
                        <div className="text-xs font-mono break-all">
                          <span className="text-muted-foreground">Direct: </span>
                          <a href={result.directUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{result.directUrl}</a>
                        </div>
                        {result.validationError && <p className="text-xs text-yellow-400">Validation: {result.validationError}</p>}
                        {result.chain?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Redirect Chain</p>
                            {result.chain.map((hop, hopIndex) => (
                              <p key={`${hop}-${hopIndex}`} className="text-[10px] font-mono text-muted-foreground break-all">{hopIndex + 1}. {hop}</p>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-destructive">{(result as any).error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingMedia(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-primary text-sm">Edit Media #{editingMedia?.id}</DialogTitle>
            <DialogDescription>
              Ubah metadata media, source tweet, dan DoodStream link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Label / Username</Label>
              <Input value={editTargetUsername} onChange={(e) => setEditTargetUsername(e.target.value)} placeholder="manual" />
              <p className="text-xs text-muted-foreground">Jika Status URL diisi, username akan otomatis ikut dari status URL.</p>
            </div>

            <div className="space-y-2">
              <Label>Original URL</Label>
              <Input value={editOriginalUrl} onChange={(e) => setEditOriginalUrl(e.target.value)} placeholder="https://example.com/file.mp4" />
            </div>

            <div className="space-y-2">
              <Label>Status URL <span className="text-muted-foreground font-normal">(opsional)</span></Label>
              <Input value={editStatusUrl} onChange={(e) => setEditStatusUrl(e.target.value)} placeholder="https://x.com/username/status/123456789" />
              <p className="text-xs text-muted-foreground">Dipakai untuk tombol Source Tweet.</p>
            </div>

            {editingMedia?.type === "video" && (
              <div className="space-y-2">
                <Label>DoodStream URL <span className="text-muted-foreground font-normal">(opsional)</span></Label>
                <Input value={editDoodUrl} onChange={(e) => setEditDoodUrl(e.target.value)} placeholder="https://doodstream.com/d/..." />
                <p className="text-xs text-muted-foreground">Kosongkan untuk menghapus DoodStream link dari media ini.</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleEditSubmit} className="flex-1">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
