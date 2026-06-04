import { useRef, useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, RefreshCw, CheckCircle2, XCircle, Loader2,
  FileArchive, RotateCcw, Terminal, Power, History, Trash2, Tag, Download,
} from "lucide-react";

interface UpdateStatus {
  state: "idle" | "extracting" | "building" | "done" | "error";
  message: string;
  log: string[];
  updatedAt: string | null;
  extractedFiles: number;
  currentVersion: string | null;
}

interface VersionEntry {
  id: string;
  version: string;
  notes: string;
  filename: string;
  extractedFiles: number;
  appliedAt: string;
  status: "success" | "failed";
}

async function fetchStatus(): Promise<UpdateStatus> {
  const res = await fetch("/api/update/status");
  if (!res.ok) throw new Error("Gagal mengambil status");
  return res.json();
}

async function fetchHistory(): Promise<{ history: VersionEntry[] }> {
  const res = await fetch("/api/update/history");
  if (!res.ok) throw new Error("Gagal mengambil history");
  return res.json();
}

function StateBadge({ state }: { state: UpdateStatus["state"] }) {
  if (state === "idle") return <Badge variant="outline" className="font-mono uppercase tracking-widest">Idle</Badge>;
  if (state === "extracting") return <Badge variant="secondary" className="font-mono uppercase tracking-widest animate-pulse">Extracting...</Badge>;
  if (state === "building") return <Badge variant="secondary" className="font-mono uppercase tracking-widest animate-pulse">Building...</Badge>;
  if (state === "done") return <Badge className="font-mono uppercase tracking-widest bg-green-600">Done</Badge>;
  if (state === "error") return <Badge variant="destructive" className="font-mono uppercase tracking-widest">Error</Badge>;
  return null;
}

type RestartState = "idle" | "restarting" | "waiting" | "online" | "failed";

export default function UpdatePage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [versionInput, setVersionInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const [restartState, setRestartState] = useState<RestartState>("idle");
  const [restartMsg, setRestartMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (state: UpdateStatus["state"]) => state === "extracting" || state === "building";

  const { data: status } = useQuery<UpdateStatus>({
    queryKey: ["update-status"],
    queryFn: fetchStatus,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === "extracting" || state === "building") return 1000;
      return 5000;
    },
    enabled: restartState === "idle" || restartState === "online" || restartState === "failed",
  });

  const { data: historyData } = useQuery<{ history: VersionEntry[] }>({
    queryKey: ["update-history"],
    queryFn: fetchHistory,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [status?.log]);

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/update/reset", { method: "POST" });
      if (!res.ok) throw new Error("Gagal reset status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["update-status"] });
      setSelectedFile(null);
      setUploadError(null);
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/update/history/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal hapus");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["update-history"] });
    },
  });

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".zip")) {
      setUploadError("Hanya file .zip yang diperbolehkan");
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (versionInput.trim()) formData.append("version", versionInput.trim());
      if (notesInput.trim()) formData.append("notes", notesInput.trim());
      const res = await fetch("/api/update/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Upload gagal");
      } else {
        setSelectedFile(null);
        setVersionInput("");
        setNotesInput("");
        queryClient.invalidateQueries({ queryKey: ["update-status"] });
      }
    } catch {
      setUploadError("Koneksi gagal saat upload");
    } finally {
      setUploading(false);
    }
  };

  const pollUntilOnline = (attempt = 0) => {
    if (attempt > 30) {
      setRestartState("failed");
      setRestartMsg("Server tidak merespon setelah 60 detik. Coba restart manual.");
      return;
    }
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/healthz", { cache: "no-store" });
        if (res.ok) {
          setRestartState("online");
          setRestartMsg("Server kembali online!");
          queryClient.invalidateQueries({ queryKey: ["update-status"] });
          queryClient.invalidateQueries({ queryKey: ["update-history"] });
        } else {
          pollUntilOnline(attempt + 1);
        }
      } catch {
        pollUntilOnline(attempt + 1);
      }
    }, 2000);
  };

  const handleRestart = async () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setRestartState("restarting");
    setRestartMsg("Mengirim sinyal restart ke server...");
    try {
      await fetch("/api/update/restart", { method: "POST" });
    } catch {}
    setRestartState("waiting");
    setRestartMsg("Server sedang restart, menunggu kembali online...");
    pollUntilOnline();
  };

  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/update/download");
      if (!res.ok) throw new Error("Download gagal");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || "x-automation-latest.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Gagal mendownload. Coba lagi.");
    } finally {
      setDownloading(false);
    }
  };

  const active = isActive(status?.state ?? "idle");
  const history = historyData?.history ?? [];
  const currentVersion = status?.currentVersion;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">App Update</h2>
        <div className="flex items-center gap-2">
          {currentVersion && (
            <Badge variant="outline" className="font-mono gap-1">
              <Tag className="h-3 w-3" />
              {currentVersion}
            </Badge>
          )}
          {status && <StateBadge state={status.state} />}
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
            <Power className="h-4 w-4" />
            Restart Server
          </CardTitle>
          <CardDescription>Restart server backend untuk menerapkan perubahan setelah update selesai.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              variant={restartState === "online" ? "default" : "outline"}
              onClick={handleRestart}
              disabled={restartState === "restarting" || restartState === "waiting" || active}
              className={`font-mono uppercase tracking-widest ${restartState === "online" ? "bg-green-600 hover:bg-green-700" : ""}`}
            >
              {restartState === "restarting" || restartState === "waiting" ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restarting...</>
              ) : restartState === "online" ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Online!</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" />Restart Server</>
              )}
            </Button>
            {(restartState === "online" || restartState === "failed") && (
              <Button variant="ghost" size="sm" onClick={() => { setRestartState("idle"); setRestartMsg(""); }} className="text-xs font-mono">
                Reset
              </Button>
            )}
          </div>
          {restartMsg && (
            <div className={`flex items-center gap-2 text-sm rounded p-3 border ${
              restartState === "online" ? "text-green-600 bg-green-600/10 border-green-600/30"
              : restartState === "failed" ? "text-destructive bg-destructive/10 border-destructive/20"
              : "text-muted-foreground bg-muted/30 border-border"
            }`}>
              {restartState === "waiting" && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
              {restartState === "online" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {restartState === "failed" && <XCircle className="h-4 w-4 shrink-0" />}
              <span className="font-mono text-xs">{restartMsg}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download Source Code Terbaru
          </CardTitle>
          <CardDescription>
            Download zip dari source code aplikasi yang sedang berjalan sekarang. Berguna sebagai backup atau untuk didistribusikan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
            className="font-mono uppercase tracking-widest"
          >
            {downloading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Menyiapkan ZIP...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Download ZIP</>
            )}
          </Button>
          {currentVersion && (
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              Versi aktif: <span className="text-foreground">{currentVersion}</span> — file akan bernama <span className="text-foreground">x-automation-{currentVersion}-{new Date().toISOString().slice(0, 10)}.zip</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload File Update (.zip)
          </CardTitle>
          <CardDescription>Upload file .zip berisi source code terbaru. File diekstrak otomatis lalu di-rebuild.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Nomor Versi</Label>
              <Input
                placeholder="contoh: v1.2.0"
                value={versionInput}
                onChange={(e) => setVersionInput(e.target.value)}
                disabled={active}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Catatan Perubahan (opsional)</Label>
              <Textarea
                placeholder="Tuliskan apa yang berubah di versi ini..."
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                disabled={active}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
            } ${active ? "opacity-50 pointer-events-none" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !active && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              disabled={active}
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileArchive className="h-10 w-10 text-primary" />
                <p className="font-mono text-sm font-bold text-foreground">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-10 w-10" />
                <p className="text-sm">Drag &amp; drop file .zip di sini, atau klik untuk pilih</p>
                <p className="text-xs font-mono">Maks. 200 MB</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-3">
              <XCircle className="h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleUpload} disabled={!selectedFile || uploading || active} className="font-mono uppercase tracking-widest">
              {uploading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Mengupload...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" />Mulai Update</>
              )}
            </Button>
            {selectedFile && !active && (
              <Button variant="outline" onClick={() => { setSelectedFile(null); setUploadError(null); }}>Batal</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status && status.state !== "idle" && (
        <Card className={`border-border ${status.state === "done" ? "border-green-600/30" : status.state === "error" ? "border-destructive/30" : ""}`}>
          <CardHeader>
            <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Log Proses
              {active && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              {status.state === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              {status.state === "error" && <XCircle className="h-4 w-4 text-destructive" />}
              {status.state === "building" && <RefreshCw className="h-4 w-4 animate-spin" />}
              {status.message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.extractedFiles > 0 && (
              <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
                <span>File diekstrak: <span className="text-foreground font-bold">{status.extractedFiles}</span></span>
                {status.updatedAt && <span>Mulai: {new Date(status.updatedAt).toLocaleTimeString("id-ID")}</span>}
              </div>
            )}
            <div className="bg-black/80 rounded-md p-4 max-h-72 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5">
              {status.log.length === 0 ? (
                <p className="text-muted-foreground italic">Menunggu log...</p>
              ) : (
                status.log.map((line, i) => <div key={i} className="leading-relaxed">{line}</div>)
              )}
              <div ref={logEndRef} />
            </div>
            {status.state === "done" && (
              <div className="bg-green-600/10 border border-green-600/30 rounded-md p-3">
                <p className="text-sm font-bold text-green-600 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Build Selesai! Klik Restart Server di atas untuk menerapkan perubahan.
                </p>
              </div>
            )}
            {(status.state === "done" || status.state === "error") && (
              <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending} className="font-mono uppercase tracking-widest text-xs">
                <RotateCcw className="h-3 w-3 mr-2" />
                Reset Status
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Riwayat Update
            {history.length > 0 && (
              <Badge variant="secondary" className="ml-auto font-mono text-xs">{history.length} update</Badge>
            )}
          </CardTitle>
          <CardDescription>Semua update yang pernah dijalankan tercatat di sini.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 font-mono">Belum ada riwayat update.</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className={`border rounded-md p-4 space-y-2 ${
                    entry.status === "success" ? "border-green-600/20 bg-green-600/5" : "border-destructive/20 bg-destructive/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.status === "success"
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        : <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      }
                      <span className="font-mono font-bold text-sm text-foreground">{entry.version}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(entry.appliedAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteHistoryMutation.mutate(entry.id)}
                      disabled={deleteHistoryMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-muted-foreground pl-6">{entry.notes}</p>
                  )}
                  <div className="flex gap-4 pl-6 text-xs font-mono text-muted-foreground">
                    <span>📦 {entry.filename}</span>
                    <span>📄 {entry.extractedFiles} file</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
