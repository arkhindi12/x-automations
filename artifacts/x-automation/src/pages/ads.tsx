import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ERROR_MESSAGES, getErrorMessage } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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
import { Megaphone, Plus, Pencil, Trash2, MoreHorizontal, Globe } from "lucide-react";

const AD_TYPES = [
  { value: "banner-top", label: "Banner Atas", desc: "Sticky banner di bagian atas halaman video" },
  { value: "banner-bottom", label: "Banner Bawah", desc: "Sticky banner di bagian bawah halaman video" },
  { value: "floating-btn", label: "Tombol Mengambang", desc: "Tombol CTA mengambang di pojok kanan bawah" },
  { value: "interstitial", label: "Interstitial", desc: "Iklan fullscreen yang muncul setelah delay" },
];

type Ad = {
  id: number;
  name: string;
  type: string;
  targetUrl: string;
  imageUrl: string | null;
  buttonText: string;
  bgColor: string;
  textColor: string;
  domains: string[];
  showDelaySec: number;
  closeDelaySec: number;
  isActive: boolean;
  createdAt: string;
};

const emptyForm = {
  name: "",
  type: "banner-top",
  targetUrl: "",
  imageUrl: "",
  buttonText: "Visit Now",
  bgColor: "#00e5ff",
  textColor: "#000000",
  domains: "",
  showDelaySec: 3,
  closeDelaySec: 0,
  isActive: true,
};

export default function Ads() {
  const { toast } = useToast();
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchAds = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/ads");
      const data = await res.json();
      setAds(data);
    } catch {
      toast({ title: "Gagal memuat ads", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAds(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setIsFormOpen(true);
  };

  const openEdit = (ad: Ad) => {
    setEditingId(ad.id);
    setForm({
      name: ad.name,
      type: ad.type,
      targetUrl: ad.targetUrl,
      imageUrl: ad.imageUrl ?? "",
      buttonText: ad.buttonText,
      bgColor: ad.bgColor,
      textColor: ad.textColor,
      domains: ad.domains.join(", "),
      showDelaySec: ad.showDelaySec,
      closeDelaySec: ad.closeDelaySec,
      isActive: ad.isActive,
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.targetUrl.trim()) {
      toast({ title: "Nama dan Target URL wajib diisi", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const domainsArr = form.domains.trim()
        ? form.domains.split(",").map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")).filter(Boolean)
        : [];
      const body = {
        name: form.name.trim(),
        type: form.type,
        targetUrl: form.targetUrl.trim(),
        imageUrl: form.imageUrl.trim() || null,
        buttonText: form.buttonText.trim() || "Visit Now",
        bgColor: form.bgColor,
        textColor: form.textColor,
        domains: domainsArr,
        showDelaySec: Number(form.showDelaySec),
        closeDelaySec: Number(form.closeDelaySec),
        isActive: form.isActive,
      };
      const url = editingId ? `/api/ads/${editingId}` : "/api/ads";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(ERROR_MESSAGES.SAVE_FAILED);
      toast({ title: editingId ? "Ads diupdate" : "Ads berhasil dibuat" });
      setIsFormOpen(false);
      fetchAds();
    } catch (error) {
      toast({ title: getErrorMessage(error, ERROR_MESSAGES.SAVE_FAILED), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await fetch(`/api/ads/${deleteId}`, { method: "DELETE" });
      toast({ title: "Ads dihapus" });
      setDeleteId(null);
      fetchAds();
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  };

  const handleToggle = async (ad: Ad) => {
    try {
      await fetch(`/api/ads/${ad.id}/toggle`, { method: "POST" });
      fetchAds();
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    }
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, { label: string; color: string }> = {
      "banner-top": { label: "Banner Atas", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
      "banner-bottom": { label: "Banner Bawah", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
      "floating-btn": { label: "Floating", color: "bg-green-500/20 text-green-400 border-green-500/30" },
      "interstitial": { label: "Interstitial", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    };
    const info = map[type] ?? { label: type, color: "bg-muted text-muted-foreground" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-mono border ${info.color}`}>{info.label}</span>;
  };

  return (
    <div className="flex flex-col h-full gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono text-primary flex items-center gap-2">
            <Megaphone className="w-6 h-6" />
            ADS MANAGEMENT
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola iklan yang tampil di halaman embed video. Pilih posisi dan domain target.
          </p>
        </div>
        <Button onClick={openCreate} className="font-mono">
          <Plus className="w-4 h-4 mr-2" />
          BUAT ADS
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {AD_TYPES.map((t) => (
          <Card key={t.value} className="border-border">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="font-mono text-xs text-primary font-bold">{t.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              <p className="text-xs font-bold text-primary mt-2">{ads.filter((a) => a.type === t.value && a.isActive).length} aktif</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="flex-1">
        <div className="rounded-md border border-card-border relative overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-mono text-xs">NAMA</TableHead>
                <TableHead className="font-mono text-xs">TIPE</TableHead>
                <TableHead className="font-mono text-xs max-w-[200px]">TARGET URL</TableHead>
                <TableHead className="font-mono text-xs">DOMAIN</TableHead>
                <TableHead className="font-mono text-xs">DELAY</TableHead>
                <TableHead className="font-mono text-xs">WARNA</TableHead>
                <TableHead className="font-mono text-xs">STATUS</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-center text-muted-foreground font-mono text-xs">Loading...</TableCell>
                </TableRow>
              ) : ads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground font-mono">
                    Belum ada ads. Klik "BUAT ADS" untuk memulai.
                  </TableCell>
                </TableRow>
              ) : ads.map((ad) => (
                <TableRow key={ad.id} className={!ad.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-medium max-w-[160px]">
                    <div className="truncate text-sm" title={ad.name}>{ad.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate" title={ad.buttonText}>{ad.buttonText}</div>
                  </TableCell>
                  <TableCell>{getTypeBadge(ad.type)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={ad.targetUrl}>
                    {ad.targetUrl}
                  </TableCell>
                  <TableCell>
                    {ad.domains.length === 0 ? (
                      <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Semua
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-primary">{ad.domains.length} domain</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {ad.showDelaySec}s
                    {ad.closeDelaySec > 0 && <span className="text-xs"> / tutup {ad.closeDelaySec}s</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-border" style={{ background: ad.bgColor }} title={`BG: ${ad.bgColor}`} />
                      <div className="w-5 h-5 rounded border border-border" style={{ background: ad.textColor }} title={`Text: ${ad.textColor}`} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch checked={ad.isActive} onCheckedChange={() => handleToggle(ad)} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="font-mono text-xs">
                        <DropdownMenuItem onClick={() => openEdit(ad)}>
                          <Pencil className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteId(ad.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                          <Trash2 className="h-3 w-3 mr-2" /> Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[560px] border-card-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary flex items-center gap-2">
              <Megaphone className="w-5 h-5" />
              {editingId ? "EDIT ADS" : "BUAT ADS BARU"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Iklan akan tampil di halaman embed video sesuai domain yang dipilih.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="font-mono text-xs text-primary">NAMA INTERNAL</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Promo Shopee Q4" className="font-mono text-sm" />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="font-mono text-xs text-primary">TIPE / POSISI</Label>
                <div className="grid grid-cols-2 gap-2">
                  {AD_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: t.value })}
                      className={`text-left px-3 py-2.5 rounded-md border text-xs font-mono transition-colors ${form.type === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                    >
                      <div className="font-bold">{t.label}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="font-mono text-xs text-primary">TARGET URL</Label>
                <Input value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} placeholder="https://shopee.co.id/..." className="font-mono text-sm border-primary/50" />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="font-mono text-xs">TEKS TOMBOL / CTA</Label>
                <Input value={form.buttonText} onChange={(e) => setForm({ ...form, buttonText: e.target.value })} placeholder="Visit Now" className="font-mono text-sm" />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="font-mono text-xs">URL GAMBAR (OPSIONAL)</Label>
                <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Gambar/logo yang tampil di iklan. Kosongkan jika tidak perlu.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">WARNA LATAR</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.bgColor} onChange={(e) => setForm({ ...form, bgColor: e.target.value })} className="w-10 h-9 rounded border border-border cursor-pointer bg-transparent" />
                  <Input value={form.bgColor} onChange={(e) => setForm({ ...form, bgColor: e.target.value })} className="font-mono text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">WARNA TEKS</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.textColor} onChange={(e) => setForm({ ...form, textColor: e.target.value })} className="w-10 h-9 rounded border border-border cursor-pointer bg-transparent" />
                  <Input value={form.textColor} onChange={(e) => setForm({ ...form, textColor: e.target.value })} className="font-mono text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-xs">DELAY MUNCUL (detik)</Label>
                <Input type="number" min="0" value={form.showDelaySec} onChange={(e) => setForm({ ...form, showDelaySec: Number(e.target.value) })} className="font-mono text-sm" />
                <p className="text-[10px] text-muted-foreground">0 = langsung muncul</p>
              </div>

              {form.type === "interstitial" && (
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs">DELAY TUTUP (detik)</Label>
                  <Input type="number" min="0" value={form.closeDelaySec} onChange={(e) => setForm({ ...form, closeDelaySec: Number(e.target.value) })} className="font-mono text-sm" />
                  <p className="text-[10px] text-muted-foreground">0 = bisa langsung ditutup</p>
                </div>
              )}

              <div className="col-span-2 space-y-1.5">
                <Label className="font-mono text-xs">DOMAIN TARGET (OPSIONAL)</Label>
                <Input value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} placeholder="domain1.com, domain2.com" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">
                  Pisahkan dengan koma. Kosongkan = tampil di semua domain embed.
                </p>
              </div>

              <div className="col-span-2 flex items-center justify-between rounded-lg border border-card-border p-3 bg-muted/20">
                <div>
                  <p className="font-mono text-sm font-bold">AKTIFKAN ADS</p>
                  <p className="text-xs text-muted-foreground">Ads akan langsung aktif setelah disimpan.</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} className="font-mono">BATAL</Button>
            <Button onClick={handleSave} disabled={isSaving} className="font-mono">
              {isSaving ? "MENYIMPAN..." : "SIMPAN ADS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> HAPUS ADS?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              Iklan ini akan dihapus permanen dan tidak lagi tampil di embed manapun.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">BATAL</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono">
              HAPUS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
