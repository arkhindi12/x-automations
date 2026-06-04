import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download, Link2, FileVideo, FileImage, File,
  Loader2, CheckCircle2, XCircle, Trash2,
  Search, Copy, Zap, Clock, User,
} from "lucide-react";

interface FileInfo {
  filename: string;
  contentType: string;
  contentLength: number | null;
  accessible: boolean;
}

interface ExtractResult {
  videoUrls: string[];
  message: string;
  isDirectFile: boolean;
}

interface SmartFormat {
  label: string;
  url: string;
  ext: string;
  height?: number;
  filesize?: number;
}

interface SmartResult {
  success: boolean;
  title: string | null;
  ext: string;
  duration: number | null;
  thumbnail: string | null;
  uploader: string | null;
  directUrl: string | null;
  urls: SmartFormat[];
}

interface RedirectStep {
  url: string;
  contentType: string | null;
  status: number | null;
}

interface RedirectChainResult {
  success?: boolean;
  redirectChain: RedirectStep[];
  finalUrl: string;
}

interface HistoryItem {
  id: number;
  url: string;
  filename: string;
  contentType: string;
  size: string;
  status: "success" | "error";
  message?: string;
  timestamp: Date;
}

let _historyId = 0;

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "Ukuran tidak diketahui";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith("video/")) return <FileVideo className="h-4 w-4 text-cyan-400" />;
  if (contentType.startsWith("image/")) return <FileImage className="h-4 w-4 text-emerald-400" />;
  return <File className="h-4 w-4 text-zinc-400" />;
}

function getTypeBadge(contentType: string) {
  if (contentType.startsWith("video/")) return <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">Video</Badge>;
  if (contentType.startsWith("image/")) return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Gambar</Badge>;
  if (contentType.includes("html")) return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Halaman Web</Badge>;
  return <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/30">File</Badge>;
}

function guessLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "HLS Stream";
  if (lower.includes(".mp4")) return "MP4 Video";
  if (lower.includes(".webm")) return "WebM Video";
  if (lower.includes("hls") || lower.includes("manifest")) return "Stream";
  return "Video";
}

export default function Downloader() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [isHtmlPage, setIsHtmlPage] = useState(false);

  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [smartResult, setSmartResult] = useState<SmartResult | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartCanUseBasicExtract, setSmartCanUseBasicExtract] = useState(true);

  const [redirectChainResult, setRedirectChainResult] = useState<RedirectChainResult | null>(null);
  const [redirectChainLoading, setRedirectChainLoading] = useState(false);
  const [redirectChainError, setRedirectChainError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const addHistory = (item: Omit<HistoryItem, "id">) => {
    setHistory((prev) => [{ ...item, id: ++_historyId }, ...prev]);
  };

  const resetState = () => {
    setInfo(null);
    setInfoError(null);
    setIsHtmlPage(false);
    setExtractResult(null);
    setExtractError(null);
    setSmartResult(null);
    setSmartError(null);
    setSmartCanUseBasicExtract(true);
    setRedirectChainResult(null);
    setRedirectChainError(null);
  };

  const handleCheckInfo = async () => {
    if (!url.trim()) return;
    setInfoLoading(true);
    resetState();
    try {
      const res = await fetch("/api/downloader/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInfoError(data.error || "Gagal mengambil info");
      } else {
        setInfo(data);
        if (data.contentType?.includes("html")) setIsHtmlPage(true);
      }
    } catch {
      setInfoError("Tidak bisa terhubung ke server");
    } finally {
      setInfoLoading(false);
    }
  };

  const handleSmartExtract = async () => {
    if (!url.trim()) return;
    setSmartLoading(true);
    setSmartResult(null);
    setSmartError(null);
    setExtractResult(null);
    setExtractError(null);
    try {
      const res = await fetch("/api/downloader/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSmartError(data.error + (data.detail ? `\n${data.detail}` : ""));
        setSmartCanUseBasicExtract(data.canUseBasicExtract !== false);
        if (Array.isArray(data.redirectChain)) {
          setRedirectChainResult({
            redirectChain: data.redirectChain,
            finalUrl: data.redirectChain[data.redirectChain.length - 1]?.url || url.trim(),
          });
        }
      } else {
        setSmartResult(data);
      }
    } catch {
      setSmartError("Tidak bisa terhubung ke server");
    } finally {
      setSmartLoading(false);
    }
  };

  const handleRedirectChain = async () => {
    if (!url.trim()) return;
    setRedirectChainLoading(true);
    setRedirectChainResult(null);
    setRedirectChainError(null);
    try {
      const res = await fetch("/api/downloader/redirect-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRedirectChainError(data.error || "Gagal mengecek redirect chain");
      } else {
        setRedirectChainResult(data);
      }
    } catch {
      setRedirectChainError("Tidak bisa terhubung ke server");
    } finally {
      setRedirectChainLoading(false);
    }
  };

  const handleExtract = async () => {
    if (!url.trim()) return;
    setExtractLoading(true);
    setExtractResult(null);
    setExtractError(null);
    try {
      const res = await fetch("/api/downloader/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data.error || "Gagal mengekstrak");
      } else {
        setExtractResult(data);
      }
    } catch {
      setExtractError("Tidak bisa terhubung ke server");
    } finally {
      setExtractLoading(false);
    }
  };

  const handleDownload = async (targetUrl?: string, filenameHint?: string) => {
    const dlUrl = (targetUrl || url).trim();
    if (!dlUrl) return;
    setDownloading(true);
    setDownloadingUrl(dlUrl);
    try {
      const res = await fetch("/api/downloader/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: dlUrl }),
      });
      if (!res.ok) {
        const data = await res.json();
        addHistory({ url: dlUrl, filename: filenameHint || dlUrl.split("/").pop() || "download", contentType: "", size: "", status: "error", message: data.error || "Gagal mendownload", timestamp: new Date() });
        return;
      }
      const disposition = res.headers.get("Content-Disposition") || "";
      const fnMatch = disposition.match(/filename="(.+?)"/);
      const filename = fnMatch?.[1] || filenameHint || dlUrl.split("/").pop() || "download";
      const contentType = res.headers.get("Content-Type") || "application/octet-stream";
      const contentLength = res.headers.get("Content-Length");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
      addHistory({ url: dlUrl, filename, contentType, size: formatBytes(contentLength ? parseInt(contentLength) : blob.size), status: "success", timestamp: new Date() });
    } catch {
      addHistory({ url: dlUrl, filename: filenameHint || dlUrl.split("/").pop() || "download", contentType: "", size: "", status: "error", message: "Tidak bisa terhubung ke server", timestamp: new Date() });
    } finally {
      setDownloading(false);
      setDownloadingUrl(null);
    }
  };

  const handleSmartDownload = async (fmt: SmartFormat) => {
    const dlUrl = url.trim();
    const filename = `${smartResult?.title || "video"}.${fmt.ext}`;
    setDownloading(true);
    setDownloadingUrl(fmt.url);
    try {
      const res = await fetch("/api/downloader/smart/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: dlUrl, filename }),
      });
      if (!res.ok) {
        const data = await res.json();
        addHistory({ url: dlUrl, filename, contentType: "", size: "", status: "error", message: data.error || "Gagal mendownload", timestamp: new Date() });
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
      addHistory({ url: dlUrl, filename, contentType: `video/${fmt.ext}`, size: formatBytes(blob.size), status: "success", timestamp: new Date() });
    } catch {
      addHistory({ url: dlUrl, filename, contentType: "", size: "", status: "error", message: "Tidak bisa terhubung ke server", timestamp: new Date() });
    } finally {
      setDownloading(false);
      setDownloadingUrl(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const isDirectVideo = info && !info.contentType.includes("html") && (info.contentType.startsWith("video/") || info.contentType.includes("octet-stream"));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-white p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Video Downloader</h1>
          <p className="mt-1 text-sm text-zinc-400">Download video dari link langsung maupun halaman hosting</p>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
              <Link2 className="h-4 w-4" />
              Input Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); resetState(); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSmartExtract(); }}
                placeholder="https://example.com/video atau halaman video"
                className="flex-1 border-zinc-700 bg-zinc-800 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-primary"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckInfo}
                disabled={!url.trim() || infoLoading}
                className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white shrink-0"
              >
                {infoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cek Info"}
              </Button>
            </div>

            {infoError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <XCircle className="h-4 w-4 shrink-0" /> {infoError}
              </div>
            )}

            {info && (
              <div className="rounded-md border border-zinc-700 bg-zinc-800/60 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {getFileIcon(info.contentType)}
                  <span className="font-mono text-sm text-zinc-100 truncate flex-1">{info.filename}</span>
                  {getTypeBadge(info.contentType)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <span>Tipe: <span className="text-zinc-300">{info.contentType}</span></span>
                  <span>Ukuran: <span className="text-zinc-300">{formatBytes(info.contentLength)}</span></span>
                </div>
                {isHtmlPage && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                    Ini halaman web. Gunakan <strong>Smart Extract</strong> untuk menemukan video otomatis.
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleSmartExtract}
              disabled={!url.trim() || smartLoading}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold"
            >
              {smartLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menganalisa video...</>
              ) : (
                <><Zap className="mr-2 h-4 w-4" />Smart Extract (yt-dlp)</>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleRedirectChain}
              disabled={!url.trim() || redirectChainLoading}
              className="w-full border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200"
            >
              {redirectChainLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengecek redirect chain...</>
              ) : (
                <><Link2 className="mr-2 h-4 w-4" />Redirect Chain</>
              )}
            </Button>

            {smartError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <div className="flex items-center gap-2 mb-1"><XCircle className="h-4 w-4 shrink-0" /><span className="font-semibold">Smart Extract gagal</span></div>
                <p className="text-xs font-mono whitespace-pre-wrap text-red-300/80">{smartError}</p>
                {smartCanUseBasicExtract ? (
                  <p className="mt-2 text-xs text-zinc-500">Coba gunakan Ekstrak Biasa di bawah untuk halaman HTML.</p>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">Ekstrak Biasa kemungkinan tidak membantu untuk kasus ini karena redirect sudah mati, 404, diblokir, atau server tujuan sedang error.</p>
                )}
              </div>
            )}

            {redirectChainError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <XCircle className="h-4 w-4 shrink-0" /> {redirectChainError}
              </div>
            )}

            {redirectChainResult && (
              <div className="space-y-2 rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Redirect Chain</p>
                  <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">{redirectChainResult.redirectChain.length} step</Badge>
                </div>
                <div className="space-y-2">
                  {redirectChainResult.redirectChain.map((step, i) => (
                    <div key={`${step.url}-${i}`} className="rounded-md border border-zinc-700 bg-zinc-900/70 p-2">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge className="border-zinc-600 bg-zinc-800 text-zinc-300">#{i + 1}</Badge>
                        {step.status && <span className="text-[11px] text-zinc-500">HTTP {step.status}</span>}
                        {step.contentType && <span className="truncate text-[11px] text-amber-300">{step.contentType}</span>}
                      </div>
                      <p className="truncate font-mono text-[11px] text-zinc-300">{step.url}</p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleCopy(step.url)} className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-100">
                          {copied === step.url ? <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-400" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                          Copy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setUrl(step.url)} className="h-7 px-2 text-xs text-cyan-300 hover:text-cyan-100">
                          Pakai URL ini
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {smartResult && (
              <div className="space-y-3">
                {smartResult.title && (
                  <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3 space-y-2">
                    <p className="text-sm font-bold text-violet-200">{smartResult.title}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                      {smartResult.uploader && <span className="flex items-center gap-1"><User className="h-3 w-3" />{smartResult.uploader}</span>}
                      {smartResult.duration && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(smartResult.duration)}</span>}
                    </div>
                  </div>
                )}

                {smartResult.urls.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Kualitas Tersedia</p>
                    {smartResult.urls.map((fmt, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border border-violet-700/40 bg-violet-900/20 p-2">
                        <FileVideo className="h-4 w-4 shrink-0 text-violet-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-violet-300">{fmt.label} <span className="text-zinc-500 font-normal uppercase">.{fmt.ext}</span></p>
                          {fmt.filesize && <p className="text-[11px] text-zinc-500">{formatBytes(fmt.filesize)}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => handleCopy(fmt.url)} className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-200">
                            {copied === fmt.url ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSmartDownload(fmt)}
                            disabled={downloading && downloadingUrl === fmt.url}
                            className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-500 text-white"
                          >
                            {downloading && downloadingUrl === fmt.url ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400 text-center py-2">Tidak ada format video yang ditemukan</div>
                )}
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
              <div className="relative flex justify-center"><span className="bg-zinc-900 px-2 text-xs text-zinc-600">atau gunakan ekstrak biasa (HTML)</span></div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleExtract}
                disabled={extractLoading || !url.trim()}
                className="flex-1 border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
              >
                {extractLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mencari...</> : <><Search className="mr-2 h-4 w-4" />Ekstrak dari HTML</>}
              </Button>
              {isDirectVideo && (
                <Button onClick={() => handleDownload()} disabled={downloading} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                  {downloading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mendownload...</> : <><Download className="mr-2 h-4 w-4" />Download Langsung</>}
                </Button>
              )}
            </div>

            {extractError && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                <XCircle className="h-4 w-4 shrink-0" /> {extractError}
              </div>
            )}

            {extractResult && (
              <div className="space-y-2">
                <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${extractResult.videoUrls.length > 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 bg-zinc-800/60 text-zinc-400"}`}>
                  {extractResult.videoUrls.length > 0 ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                  {extractResult.message}
                </div>
                {extractResult.videoUrls.map((vUrl, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/60 p-2">
                    <FileVideo className="h-4 w-4 shrink-0 text-cyan-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-cyan-300">{guessLabel(vUrl)}</p>
                      <p className="font-mono text-[11px] text-zinc-400 truncate">{vUrl}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => handleCopy(vUrl)} className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-200">
                        {copied === vUrl ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" onClick={() => handleDownload(vUrl)} disabled={downloading && downloadingUrl === vUrl} className="h-7 px-2 text-xs bg-cyan-600 hover:bg-cyan-500 text-white">
                        {downloading && downloadingUrl === vUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-zinc-600 text-center">
              Smart Extract mendukung 1000+ situs • HTML Extract untuk halaman biasa • Download Langsung untuk file .mp4
            </p>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
                  <Download className="h-4 w-4" /> Riwayat Download
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setHistory([])} className="h-7 px-2 text-xs text-zinc-500 hover:text-red-400">
                  <Trash2 className="h-3 w-3 mr-1" /> Hapus
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((item) => (
                  <div key={item.id} className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${item.status === "success" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                    {item.status === "success" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-zinc-300 truncate">{item.filename}</p>
                      <p className="text-xs text-zinc-600 truncate">{item.url}</p>
                      {item.status === "success" && item.size && <p className="text-xs text-zinc-500 mt-0.5">{item.size}</p>}
                      {item.status === "error" && item.message && <p className="text-xs text-red-400 mt-0.5">{item.message}</p>}
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0">{item.timestamp.toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
