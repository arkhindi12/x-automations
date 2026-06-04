import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Globe, Shuffle, Search, BarChart2, Code2 } from "lucide-react";

type SeoState = {
  siteName: string;
  siteTitle: string;
  siteDescription: string;
  siteKeywords: string;
  ogImage: string;
  faviconUrl: string;
  twitterCard: string;
  twitterSite: string;
  googleAnalyticsId: string;
  googleTagManagerId: string;
  metaPixelId: string;
  customHeadHtml: string;
  robotsIndex: string;
};

const defaultSeo: SeoState = {
  siteName: "",
  siteTitle: "",
  siteDescription: "",
  siteKeywords: "",
  ogImage: "",
  faviconUrl: "",
  twitterCard: "summary_large_image",
  twitterSite: "",
  googleAnalyticsId: "",
  googleTagManagerId: "",
  metaPixelId: "",
  customHeadHtml: "",
  robotsIndex: "index, follow",
};

export default function Settings() {
  const [nineproxyApiKey, setNineproxyApiKey] = useState("");
  const [nineproxyGateway, setNineproxyGateway] = useState("");
  const [nineproxyConfigured, setNineproxyConfigured] = useState(false);
  const [nineproxyMasked, setNineproxyMasked] = useState<string | null>(null);
  const [doodstreamApiKey, setDoodstreamApiKey] = useState("");
  const [doodstreamConfigured, setDoodstreamConfigured] = useState(false);
  const [doodstreamMasked, setDoodstreamMasked] = useState<string | null>(null);
  const [streamtapeLogin, setStreamtapeLogin] = useState("");
  const [streamtapeKey, setStreamtapeKey] = useState("");
  const [streamtapeConfigured, setStreamtapeConfigured] = useState(false);
  const [streamtapeLoginMasked, setStreamtapeLoginMasked] = useState<string | null>(null);
  const [followRepostSource, setFollowRepostSource] = useState(true);
  const [blockedDomains, setBlockedDomains] = useState("");
  const [currentGateway, setCurrentGateway] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [embedDomains, setEmbedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [seo, setSeo] = useState<SeoState>({ ...defaultSeo });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSeo, setIsSavingSeo] = useState(false);
  const { toast } = useToast();

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to load settings.");
      setNineproxyConfigured(Boolean(payload.nineproxyConfigured));
      setNineproxyMasked(payload.nineproxyApiKeyMasked ?? null);
      setCurrentGateway(payload.nineproxyGateway ?? null);
      setDoodstreamConfigured(Boolean(payload.doodstreamConfigured));
      setDoodstreamMasked(payload.doodstreamApiKeyMasked ?? null);
      setStreamtapeConfigured(Boolean(payload.streamtapeConfigured));
      setStreamtapeLoginMasked(payload.streamtapeLoginMasked ?? null);
      setFollowRepostSource(payload.followRepostSource !== false);
      setBlockedDomains(payload.blockedDomains ?? "");
      setTimezone(payload.timezone ?? "Asia/Jakarta");
      setEmbedDomains(Array.isArray(payload.embedDomains) ? payload.embedDomains : []);
      setSeo({
        siteName: payload.siteName ?? "",
        siteTitle: payload.siteTitle ?? "",
        siteDescription: payload.siteDescription ?? "",
        siteKeywords: payload.siteKeywords ?? "",
        ogImage: payload.ogImage ?? "",
        faviconUrl: payload.faviconUrl ?? "",
        twitterCard: payload.twitterCard ?? "summary_large_image",
        twitterSite: payload.twitterSite ?? "",
        googleAnalyticsId: payload.googleAnalyticsId ?? "",
        googleTagManagerId: payload.googleTagManagerId ?? "",
        metaPixelId: payload.metaPixelId ?? "",
        customHeadHtml: payload.customHeadHtml ?? "",
        robotsIndex: payload.robotsIndex ?? "index, follow",
      });
    } catch (error) {
      toast({ title: "Settings error", description: error instanceof Error ? error.message : "Failed to load settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const saveProxySettings = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (nineproxyApiKey.trim()) body.nineproxyApiKey = nineproxyApiKey.trim();
      body.nineproxyGateway = nineproxyGateway.trim();
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to save settings.");
      setNineproxyApiKey("");
      setNineproxyGateway("");
      setNineproxyConfigured(Boolean(payload.nineproxyConfigured));
      setNineproxyMasked(payload.nineproxyApiKeyMasked ?? null);
      setCurrentGateway(payload.nineproxyGateway ?? null);
      toast({ title: "Tersimpan", description: "Konfigurasi 9Proxy berhasil disimpan." });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const saveDoodstreamSettings = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (doodstreamApiKey.trim()) body.doodstreamApiKey = doodstreamApiKey.trim();
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to save DoodStream settings.");
      setDoodstreamApiKey("");
      setDoodstreamConfigured(Boolean(payload.doodstreamConfigured));
      setDoodstreamMasked(payload.doodstreamApiKeyMasked ?? null);
      toast({ title: "Tersimpan", description: "DoodStream API key berhasil disimpan." });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const clearDoodstreamKey = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearDoodstreamApiKey: true }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setDoodstreamApiKey("");
      setDoodstreamConfigured(Boolean(payload.doodstreamConfigured));
      setDoodstreamMasked(payload.doodstreamApiKeyMasked ?? null);
      toast({ title: "DoodStream key dihapus" });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const saveStreamtapeSettings = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (streamtapeLogin.trim()) body.streamtapeLogin = streamtapeLogin.trim();
      if (streamtapeKey.trim()) body.streamtapeKey = streamtapeKey.trim();
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to save Streamtape settings.");
      setStreamtapeLogin("");
      setStreamtapeKey("");
      setStreamtapeConfigured(Boolean(payload.streamtapeConfigured));
      setStreamtapeLoginMasked(payload.streamtapeLoginMasked ?? null);
      toast({ title: "Tersimpan", description: "Streamtape credentials berhasil disimpan." });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const clearStreamtapeSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearStreamtape: true }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setStreamtapeLogin("");
      setStreamtapeKey("");
      setStreamtapeConfigured(Boolean(payload.streamtapeConfigured));
      setStreamtapeLoginMasked(payload.streamtapeLoginMasked ?? null);
      toast({ title: "Streamtape credentials dihapus" });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const saveTimezone = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setTimezone(payload.timezone ?? "Asia/Jakarta");
      toast({ title: "Timezone tersimpan", description: `Timezone diset ke ${timezone}` });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const saveSeoSettings = async () => {
    setIsSavingSeo(true);
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seo) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to save SEO.");
      setSeo({
        siteName: payload.siteName ?? "",
        siteTitle: payload.siteTitle ?? "",
        siteDescription: payload.siteDescription ?? "",
        siteKeywords: payload.siteKeywords ?? "",
        ogImage: payload.ogImage ?? "",
        faviconUrl: payload.faviconUrl ?? "",
        twitterCard: payload.twitterCard ?? "summary_large_image",
        twitterSite: payload.twitterSite ?? "",
        googleAnalyticsId: payload.googleAnalyticsId ?? "",
        googleTagManagerId: payload.googleTagManagerId ?? "",
        metaPixelId: payload.metaPixelId ?? "",
        customHeadHtml: payload.customHeadHtml ?? "",
        robotsIndex: payload.robotsIndex ?? "index, follow",
      });
      toast({ title: "SEO Tersimpan", description: "Konfigurasi SEO berhasil disimpan dan akan aktif di semua halaman embed." });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSavingSeo(false);
    }
  };

  const addDomain = async () => {
    const domain = newDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!domain) return;
    if (embedDomains.includes(domain)) {
      toast({ title: "Domain sudah ada", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addDomain: domain }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setEmbedDomains(Array.isArray(payload.embedDomains) ? payload.embedDomains : []);
      setNewDomain("");
      toast({ title: "Domain ditambahkan", description: `${domain} berhasil ditambahkan.` });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const removeDomain = async (domain: string) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ removeDomain: domain }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setEmbedDomains(Array.isArray(payload.embedDomains) ? payload.embedDomains : []);
      toast({ title: "Domain dihapus" });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const clear9ProxyKey = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearNineproxyApiKey: true }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setNineproxyApiKey("");
      setNineproxyConfigured(Boolean(payload.nineproxyConfigured));
      setNineproxyMasked(payload.nineproxyApiKeyMasked ?? null);
      toast({ title: "9Proxy key dihapus" });
    } catch (error) {
      toast({ title: "Gagal", description: error instanceof Error ? error.message : "Failed.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const seoField = (key: keyof SeoState) => ({
    value: seo[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setSeo((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">System Settings</h2>
      </div>

      {/* ===== SEO SETTINGS ===== */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
            <Search className="w-4 h-4" />
            SEO & Website Identity
          </CardTitle>
          <CardDescription>
            Konfigurasi judul, deskripsi, meta tags, dan tracking yang akan diinjeksi ke semua halaman embed video.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Identity */}
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2">Identitas Website</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">NAMA WEBSITE / BRAND</Label>
                <Input {...seoField("siteName")} placeholder="Contoh: VideoHub ID" disabled={isLoading} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Tampil di og:site_name dan sebagai suffix judul.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">TEMPLATE JUDUL HALAMAN</Label>
                <Input {...seoField("siteTitle")} placeholder="{title} | {siteName}" disabled={isLoading} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Gunakan <span className="font-mono">{"{title}"}</span> dan <span className="font-mono">{"{siteName}"}</span> sebagai variabel.</p>
              </div>
              <div className="col-span-full space-y-1.5">
                <Label className="font-mono text-xs">DESKRIPSI DEFAULT</Label>
                <Textarea {...seoField("siteDescription")} placeholder="Deskripsi singkat website kamu..." disabled={isLoading} className="font-mono text-sm resize-none h-20" />
              </div>
              <div className="col-span-full space-y-1.5">
                <Label className="font-mono text-xs">KEYWORDS</Label>
                <Input {...seoField("siteKeywords")} placeholder="video, streaming, konten, hiburan" disabled={isLoading} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Pisahkan dengan koma.</p>
              </div>
            </div>
          </div>

          {/* Open Graph & Social */}
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2">Open Graph & Social Media</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-full space-y-1.5">
                <Label className="font-mono text-xs">OG IMAGE URL</Label>
                <Input {...seoField("ogImage")} placeholder="https://domain.com/og-image.jpg" disabled={isLoading} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Gambar yang muncul saat link dibagikan di sosmed. Ukuran ideal: 1200×630px.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">TWITTER CARD TYPE</Label>
                <select
                  value={seo.twitterCard}
                  onChange={(e) => setSeo((prev) => ({ ...prev, twitterCard: e.target.value }))}
                  disabled={isLoading}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono"
                >
                  <option value="summary_large_image">summary_large_image (Gambar besar)</option>
                  <option value="summary">summary (Gambar kecil)</option>
                  <option value="player">player (Video embed)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">TWITTER / X USERNAME</Label>
                <Input {...seoField("twitterSite")} placeholder="@namaakun" disabled={isLoading} className="font-mono text-sm" />
              </div>
            </div>
          </div>

          {/* Technical */}
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2">Technical SEO</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">FAVICON URL</Label>
                <Input {...seoField("faviconUrl")} placeholder="https://domain.com/favicon.ico" disabled={isLoading} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">ROBOTS META</Label>
                <select
                  value={seo.robotsIndex}
                  onChange={(e) => setSeo((prev) => ({ ...prev, robotsIndex: e.target.value }))}
                  disabled={isLoading}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono"
                >
                  <option value="index, follow">index, follow (Bisa diindeks)</option>
                  <option value="noindex, follow">noindex, follow (Tidak diindeks)</option>
                  <option value="noindex, nofollow">noindex, nofollow (Blokir semua)</option>
                  <option value="index, nofollow">index, nofollow (Indeks tapi tidak follow link)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tracking */}
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2 flex items-center gap-1.5">
              <BarChart2 className="w-3 h-3" /> Analytics & Tracking
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">GOOGLE ANALYTICS ID</Label>
                <Input {...seoField("googleAnalyticsId")} placeholder="G-XXXXXXXXXX atau UA-XXXXX-X" disabled={isLoading} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">GOOGLE TAG MANAGER ID</Label>
                <Input {...seoField("googleTagManagerId")} placeholder="GTM-XXXXXXX" disabled={isLoading} className="font-mono text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs">META PIXEL ID</Label>
                <Input {...seoField("metaPixelId")} placeholder="1234567890123456" disabled={isLoading} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Facebook / Instagram Ads Pixel ID.</p>
              </div>
            </div>
          </div>

          {/* Custom Head */}
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 border-b border-border pb-2 flex items-center gap-1.5">
              <Code2 className="w-3 h-3" /> Custom Head HTML
            </p>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">KODE KUSTOM DI &lt;HEAD&gt;</Label>
              <Textarea
                {...seoField("customHeadHtml")}
                placeholder={'<meta name="theme-color" content="#000000" />\n<script src="..."></script>'}
                disabled={isLoading}
                className="font-mono text-xs resize-none h-28"
              />
              <p className="text-xs text-muted-foreground">HTML/script apapun yang ingin dimasukkan ke dalam tag <span className="font-mono">&lt;head&gt;</span> setiap halaman embed. Diinjeksi tepat sebelum tag head ditutup.</p>
            </div>
          </div>

          <Button type="button" onClick={saveSeoSettings} disabled={isLoading || isSavingSeo} className="font-mono w-full sm:w-auto">
            {isSavingSeo ? "Menyimpan..." : "Simpan Pengaturan SEO"}
          </Button>
        </CardContent>
      </Card>

      {/* ===== EMBED DOMAINS ===== */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Embed Domains
          </CardTitle>
          <CardDescription>
            Daftar domain untuk link embed otomatis. Setiap video yang diupload ke DoodStream akan mendapatkan link berakhiran{" "}
            <span className="font-mono">.mp4</span> dari salah satu domain ini.{" "}
            {embedDomains.length > 1 && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Shuffle className="w-3 h-3" />
                Domain dipilih secara acak setiap kali embed dibuat.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground font-mono">Loading...</div>
          ) : embedDomains.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 text-center font-mono">
              Belum ada domain. Tambahkan domain pertama kamu di bawah.
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-widest">Domain Aktif ({embedDomains.length})</Label>
              <div className="space-y-2">
                {embedDomains.map((domain) => (
                  <div key={domain} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-muted/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-3 h-3 text-primary shrink-0" />
                      <span className="font-mono text-sm truncate text-primary">{domain}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono hidden sm:block">/v/abc123.mp4</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeDomain(domain)} disabled={isSaving}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs text-muted-foreground uppercase tracking-widest">Tambah Domain Baru</Label>
            <div className="flex gap-2">
              <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="contoh: domainkita.com" disabled={isLoading || isSaving} onKeyDown={(e) => e.key === "Enter" && addDomain()} className="font-mono text-sm" />
              <Button type="button" onClick={addDomain} disabled={isLoading || isSaving || !newDomain.trim()} className="shrink-0">
                <Plus className="w-4 h-4 mr-1" /> Tambah
              </Button>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30 space-y-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-widest">Cara Setup Custom Domain</Label>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Daftarkan domain kamu di <span className="font-mono text-primary">Cloudflare</span> (gratis)</li>
              <li>Buat <span className="font-mono">CNAME</span> record:
                <div className="mt-1 ml-4 p-2 rounded bg-background border border-border font-mono text-[11px]">
                  <span className="text-primary">video.domainmu.com</span> → CNAME → <span className="text-primary">x-auto.web.id</span>
                </div>
              </li>
              <li>Pastikan <span className="font-mono text-orange-400">Proxy (orange cloud)</span> dalam keadaan ON</li>
              <li>Di Cloudflare SSL/TLS, set mode ke <span className="font-mono text-primary">Full</span></li>
              <li>Tambahkan domain di form di atas, lalu gunakan di template embed</li>
            </ol>
            <p className="text-[11px] text-muted-foreground/70 italic">
              SSL otomatis dari Cloudflare. Tidak perlu setup apapun di server.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== TIMEZONE ===== */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm">Timezone Setting</CardTitle>
          <CardDescription>
            Set timezone untuk countdown timer dan schedule job. Default: Asia/Jakarta (UTC+07:00).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Timezone</Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={isLoading || isSaving}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="Asia/Jakarta">Asia/Jakarta (UTC+07:00) - WIB</option>
              <option value="Asia/Makassar">Asia/Makassar (UTC+08:00) - WITA</option>
              <option value="Asia/Jayapura">Asia/Jayapura (UTC+09:00) - WIT</option>
              <option value="Asia/Singapore">Asia/Singapore (UTC+08:00)</option>
              <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (UTC+08:00)</option>
              <option value="Asia/Bangkok">Asia/Bangkok (UTC+07:00)</option>
              <option value="Asia/Manila">Asia/Manila (UTC+08:00)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (UTC+09:00)</option>
              <option value="Asia/Seoul">Asia/Seoul (UTC+09:00)</option>
              <option value="Asia/Hong_Kong">Asia/Hong_Kong (UTC+08:00)</option>
              <option value="UTC">UTC (UTC+00:00)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Timezone ini digunakan untuk menampilkan countdown timer di halaman Jobs.
            </p>
          </div>
          <Button type="button" onClick={saveTimezone} disabled={isLoading || isSaving}>
            {isSaving ? "Saving..." : "Simpan Timezone"}
          </Button>
        </CardContent>
      </Card>

      {/* ===== DOODSTREAM ===== */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm">DoodStream Integration</CardTitle>
          <CardDescription>
            Simpan API key DoodStream global agar setiap job tidak perlu mengisi API key lagi. Job tetap bisa override kalau field DoodStream API Key di job diisi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>DoodStream API Key</Label>
              <Badge variant={doodstreamConfigured ? "default" : "secondary"}>
                {doodstreamConfigured ? `Configured${doodstreamMasked ? `: ${doodstreamMasked}` : ""}` : "Not configured"}
              </Badge>
            </div>
            <Input
              type="password"
              value={doodstreamApiKey}
              onChange={(e) => setDoodstreamApiKey(e.target.value)}
              placeholder={doodstreamConfigured ? "Enter new key to replace current" : "Enter DoodStream API key"}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Dipakai otomatis untuk upload video ke DoodStream jika DoodStream API Key di form job dikosongkan.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={saveDoodstreamSettings} disabled={isLoading || isSaving || !doodstreamApiKey.trim()}>
              {isSaving ? "Saving..." : "Simpan DoodStream Key"}
            </Button>
            {doodstreamConfigured && (
              <Button type="button" variant="outline" onClick={clearDoodstreamKey} disabled={isLoading || isSaving}>Clear Key</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ===== STREAMTAPE ===== */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm">Streamtape Integration</CardTitle>
          <CardDescription>
            Simpan credentials Streamtape untuk upload video otomatis. Digunakan di Mass Grab Media Library.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Status</Label>
              <Badge variant={streamtapeConfigured ? "default" : "secondary"}>
                {streamtapeConfigured ? `Configured${streamtapeLoginMasked ? `: ${streamtapeLoginMasked}` : ""}` : "Not configured"}
              </Badge>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Streamtape API Login</Label>
            <Input
              type="text"
              value={streamtapeLogin}
              onChange={(e) => setStreamtapeLogin(e.target.value)}
              placeholder={streamtapeConfigured ? "Enter new login to replace" : "Enter Streamtape API login"}
              disabled={isLoading || isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Dapatkan di: <span className="font-mono">streamtape.com → Account → API</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label>Streamtape API Key/Password</Label>
            <Input
              type="password"
              value={streamtapeKey}
              onChange={(e) => setStreamtapeKey(e.target.value)}
              placeholder={streamtapeConfigured ? "Enter new key to replace" : "Enter Streamtape API key"}
              disabled={isLoading || isSaving}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={saveStreamtapeSettings} disabled={isLoading || isSaving || !streamtapeLogin.trim() || !streamtapeKey.trim()}>
              {isSaving ? "Saving..." : "Simpan Streamtape Credentials"}
            </Button>
            {streamtapeConfigured && (
              <Button type="button" variant="outline" onClick={clearStreamtapeSettings} disabled={isLoading || isSaving}>Clear Credentials</Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20 mt-4">
            <div>
              <p className="text-sm font-medium">Follow Repost Source</p>
              <p className="text-xs text-muted-foreground">Saat mass grab profile, ikuti sumber repost/RT untuk scan tweet original dan replies-nya.</p>
            </div>
            <Switch checked={followRepostSource} onCheckedChange={async (checked) => {
              setFollowRepostSource(checked);
              try {
                await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followRepostSource: checked }) });
                toast({ title: "Tersimpan", description: `Follow Repost Source ${checked ? "aktif" : "nonaktif"}.` });
              } catch { toast({ title: "Gagal", variant: "destructive" }); }
            }} disabled={isLoading} />
          </div>

          <div className="my-4 h-px w-full bg-border" />

          <div className="space-y-3">
            <Label>Blocked Domains</Label>
            <Textarea
              value={blockedDomains}
              onChange={(e) => setBlockedDomains(e.target.value)}
              placeholder="shopee.com&#10;tokopedia.com&#10;vdap.fun"
              rows={6}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Domain yang diblokir saat mass grab (satu per baris). Default: shopee, tokopedia, vdap.fun, vdfq.de, vqab.de.
            </p>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blockedDomains }) });
                  toast({ title: "Tersimpan", description: "Blocked domains updated." });
                } catch { toast({ title: "Error", variant: "destructive" }); }
              }}
              disabled={isLoading}
            >
              Save Blocked Domains
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== 9PROXY ===== */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-primary text-sm">9Proxy Integration</CardTitle>
          <CardDescription>Konfigurasi API key dan gateway 9Proxy untuk fitur Load Proxy di halaman Jobs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>9Proxy API Key</Label>
              <Badge variant={nineproxyConfigured ? "default" : "secondary"}>
                {nineproxyConfigured ? `Configured${nineproxyMasked ? `: ${nineproxyMasked}` : ""}` : "Not configured"}
              </Badge>
            </div>
            <Input type="password" value={nineproxyApiKey} onChange={(e) => setNineproxyApiKey(e.target.value)} placeholder={nineproxyConfigured ? "Enter new key to replace current" : "Enter API key dari dashboard 9Proxy"} disabled={isLoading || isSaving} />
            <p className="text-xs text-muted-foreground">Dapatkan API key di: <span className="font-mono">9proxy.com/dashboard/my-account?tab=api-key</span></p>
            {nineproxyConfigured && (
              <Button type="button" variant="outline" size="sm" onClick={clear9ProxyKey} disabled={isLoading || isSaving}>Clear Key</Button>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>9Proxy Gateway Host:Port</Label>
              {currentGateway && <Badge variant="outline" className="font-mono text-xs">{currentGateway}</Badge>}
            </div>
            <Input value={nineproxyGateway} onChange={(e) => setNineproxyGateway(e.target.value)} placeholder={currentGateway ?? "contoh: pr.9proxy.com:8000"} disabled={isLoading || isSaving} />
            <p className="text-xs text-muted-foreground">Format: <span className="font-mono">host:port</span></p>
          </div>
          <Button type="button" onClick={saveProxySettings} disabled={isLoading || isSaving}>
            {isSaving ? "Saving..." : "Simpan Konfigurasi 9Proxy"}
          </Button>
        </CardContent>
      </Card>

      {/* ===== DANGER ZONE ===== */}
      <Card className="border-border border-destructive/20">
        <CardHeader>
          <CardTitle className="uppercase tracking-widest text-destructive text-sm">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-md bg-destructive/5">
            <div>
              <h4 className="font-bold text-destructive">Emergency Stop</h4>
              <p className="text-sm text-muted-foreground">Halt all running jobs and clear queues.</p>
            </div>
            <Button variant="destructive">KILL ALL</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
