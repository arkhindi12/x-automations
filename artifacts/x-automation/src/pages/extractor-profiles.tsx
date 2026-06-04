import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ERROR_MESSAGES, getErrorMessage } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Cpu, Plus, Pencil, Trash2, MoreHorizontal, CheckCircle2, XCircle } from "lucide-react";

const METHODS = [
  { value: "html", label: "HTML Scraper", desc: "Parsing halaman HTML untuk menemukan URL video" },
  { value: "boodstream", label: "Boodstream API", desc: "Ekstraksi via API Boodstream terenkripsi" },
  { value: "api", label: "Custom API", desc: "Panggil endpoint API khusus untuk mendapat URL video" },
  { value: "direct", label: "Direct URL", desc: "URL itu sendiri sudah berupa file video langsung" },
  { value: "ytdlp", label: "yt-dlp (paksa)", desc: "Paksa gunakan yt-dlp untuk situs ini" },
];

const METHOD_CONFIG_HINTS: Record<string, string> = {
  html: `{}`,
  boodstream: `{}`,
  direct: `{}`,
  ytdlp: `{}`,
  api: `{
  "endpoint": "https://api.example.com/v1/video/{videoId}",
  "requestMethod": "GET",
  "videoIdExtractor": "/e/([^/?#]+)",
  "videoUrlPath": "data.url",
  "headers": { "X-API-Key": "secret123" },
  "params": {}
}`,
};

type ExtractorProfile = {
  id: number;
  name: string;
  domainPattern: string;
  urlPattern: string | null;
  method: string;
  config: string;
  customUa: string | null;
  priority: number;
  isActive: boolean;
  successCount: number;
  failCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  name: "",
  domainPattern: "",
  urlPattern: "",
  method: "html",
  config: "{}",
  customUa: "",
  priority: 0,
  isActive: true,
  notes: "",
};

export default function ExtractorProfiles() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ExtractorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState("");

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/extractor-profiles");
      const data = await res.json();
      setProfiles(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Gagal memuat profil", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfiles(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setConfigError("");
    setDialogOpen(true);
  };

  const openEdit = (p: ExtractorProfile) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      domainPattern: p.domainPattern,
      urlPattern: p.urlPattern || "",
      method: p.method,
      config: p.config,
      customUa: p.customUa || "",
      priority: p.priority,
      isActive: p.isActive,
      notes: p.notes || "",
    });
    setConfigError("");
    setDialogOpen(true);
  };

  const validateConfig = (val: string) => {
    try { JSON.parse(val); setConfigError(""); return true; }
    catch (e: unknown) { setConfigError("JSON tidak valid: " + (e instanceof Error ? e.message : String(e))); return false; }
  };

  const handleMethodChange = (method: string) => {
    setForm((prev) => ({
      ...prev,
      method,
      config: METHOD_CONFIG_HINTS[method] || "{}",
    }));
    setConfigError("");
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.domainPattern.trim()) {
      toast({ title: "Nama dan domain wajib diisi", variant: "destructive" });
      return;
    }
    if (!validateConfig(form.config)) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        config: form.config,
        customUa: form.customUa || null,
        urlPattern: form.urlPattern || null,
        notes: form.notes || null,
        priority: Number(form.priority),
      };
      const url = editId ? `/api/extractor-profiles/${editId}` : "/api/extractor-profiles";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ERROR_MESSAGES.SAVE_FAILED);
      toast({ title: editId ? "Profil diperbarui" : "Profil ditambahkan" });
      setDialogOpen(false);
      fetchProfiles();
    } catch (e: unknown) {
      toast({ title: getErrorMessage(e, ERROR_MESSAGES.SAVE_FAILED), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (profile: ExtractorProfile) => {
    try {
      const res = await fetch(`/api/extractor-profiles/${profile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, isActive: !profile.isActive }),
      });
      if (!res.ok) throw new Error(ERROR_MESSAGES.UPDATE_FAILED);
      fetchProfiles();
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/extractor-profiles/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(ERROR_MESSAGES.DELETE_FAILED);
      toast({ title: "Profil dihapus" });
      setDeleteId(null);
      fetchProfiles();
    } catch {
      toast({ title: "Gagal menghapus profil", variant: "destructive" });
    }
  };

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      html: "bg-blue-500/20 text-blue-400",
      boodstream: "bg-purple-500/20 text-purple-400",
      api: "bg-orange-500/20 text-orange-400",
      direct: "bg-green-500/20 text-green-400",
      ytdlp: "bg-yellow-500/20 text-yellow-400",
    };
    return colors[method] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono">Extractor Profiles</h1>
            <p className="text-sm text-muted-foreground">Aturan ekstraksi video per situs, disimpan di database</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Tambah Profil
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">Memuat profil...</div>
          ) : profiles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">
              Belum ada profil. Tambah profil untuk mengatur cara ekstraksi video per situs.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono">Nama</TableHead>
                  <TableHead className="font-mono">Domain</TableHead>
                  <TableHead className="font-mono">Metode</TableHead>
                  <TableHead className="font-mono text-center">Prioritas</TableHead>
                  <TableHead className="font-mono text-center">Sukses / Gagal</TableHead>
                  <TableHead className="font-mono text-center">Aktif</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-mono font-medium">{p.name}</div>
                      {p.notes && <div className="text-xs text-muted-foreground mt-0.5">{p.notes}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <div>{p.domainPattern}</div>
                      {p.urlPattern && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]" title={p.urlPattern}>
                          /{p.urlPattern}/
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${getMethodBadge(p.method)}`}>
                        {p.method}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono">{p.priority}</TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      <span className="text-green-400">{p.successCount}</span>
                      {" / "}
                      <span className="text-red-400">{p.failCount}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={p.isActive} onCheckedChange={() => handleToggleActive(p)} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(p.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{editId ? "Edit Profil" : "Tambah Profil Baru"}</DialogTitle>
            <DialogDescription>
              Profil menentukan cara Smart Extract mengambil URL video dari situs tertentu.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nama Profil *</Label>
                <Input
                  placeholder="cth: Vidjuices Mobile UA"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioritas</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                  placeholder="0 = default, lebih tinggi = didahulukan"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Domain Pattern *</Label>
                <Input
                  placeholder="cth: vidjuices.com atau *.boodstream.cc"
                  value={form.domainPattern}
                  onChange={(e) => setForm((p) => ({ ...p, domainPattern: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Gunakan <code>*.</code> untuk wildcard subdomain</p>
              </div>
              <div className="space-y-1.5">
                <Label>URL Pattern (opsional)</Label>
                <Input
                  placeholder="cth: /e/[^/?#]+"
                  value={form.urlPattern}
                  onChange={(e) => setForm((p) => ({ ...p, urlPattern: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Regex tambahan untuk mencocokkan URL tertentu</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Metode Ekstraksi *</Label>
              <Select value={form.method} onValueChange={handleMethodChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="font-mono font-medium">{m.value}</span>
                      <span className="ml-2 text-muted-foreground text-xs">— {m.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Konfigurasi (JSON)</Label>
              <Textarea
                className="font-mono text-xs min-h-[120px]"
                value={form.config}
                onChange={(e) => {
                  setForm((p) => ({ ...p, config: e.target.value }));
                  validateConfig(e.target.value);
                }}
              />
              {configError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> {configError}
                </p>
              )}
              {!configError && form.config.trim() !== "{}" && form.config.trim() !== "" && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> JSON valid
                </p>
              )}
              {form.method === "api" && (
                <div className="rounded border border-border bg-muted/30 p-3 text-xs font-mono space-y-1">
                  <p className="font-semibold text-muted-foreground mb-1">Field API yang didukung:</p>
                  <p><code>endpoint</code> — URL API (gunakan <code>{"{videoId}"}</code> sebagai placeholder)</p>
                  <p><code>requestMethod</code> — <code>"GET"</code> atau <code>"POST"</code></p>
                  <p><code>videoIdExtractor</code> — regex untuk ekstrak ID dari URL sumber</p>
                  <p><code>videoUrlPath</code> — path dot-notation ke URL video di respons JSON (cth: <code>"data.url"</code>)</p>
                  <p><code>headers</code> — object header tambahan</p>
                  <p><code>params</code> — query params tambahan (untuk GET)</p>
                  <p><code>bodyTemplate</code> — template body JSON (untuk POST, gunakan <code>{"{videoId}"}</code>)</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Custom User-Agent (opsional)</Label>
              <Input
                placeholder="cth: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 ...)"
                value={form.customUa}
                onChange={(e) => setForm((p) => ({ ...p, customUa: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Kosongkan untuk pakai UA default. Berguna untuk situs yang block UA desktop.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Input
                placeholder="cth: Perlu mobile UA karena block bot"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
              <Label>Aktif</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : editId ? "Simpan Perubahan" : "Tambah Profil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Profil?</AlertDialogTitle>
            <AlertDialogDescription>
              Profil ini akan dihapus permanen. Smart Extract tidak akan lagi menggunakan aturan ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
