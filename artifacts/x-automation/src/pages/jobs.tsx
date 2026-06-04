import { useState, useEffect } from "react";
import { useListJobs, useCreateJob, useUpdateJob, useDeleteJob, useListAccounts, getListJobsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit2, Play, Settings, SwitchCamera, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const jobSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountId: z.coerce.number().min(1, "Account is required"),
  targetId: z.coerce.number().optional().nullable(),
  mediaSource: z.enum(["grab", "library", "home", "search"]),
  savedMediaId: z.coerce.number().optional().nullable(),
  scheduleType: z.enum(["interval", "cron", "once"]),
  scheduleValue: z.string().min(1, "Schedule value is required"),
  grabImages: z.boolean(),
  grabVideos: z.boolean(),
  includeReplies: z.boolean(),
  extractLinksFromReplies: z.boolean(),
  allowedVideoDomains: z.string().optional().nullable(),
  keywordFilter: z.string().optional().nullable(),
  grabExternalLinksOnly: z.boolean(),
  uploadToDood: z.boolean(),
  autoEmbed: z.boolean(),
  doodApiKey: z.string().optional().nullable(),
  postToX: z.boolean(),
  postTemplate: z.string().optional().nullable(),
  insertLink: z.string().optional().nullable(),
  proxyList: z.string().optional().nullable(),
  aiEnabled: z.boolean(),
  aiProvider: z.enum(["openai", "groq"]),
  aiApiKey: z.string().optional().nullable(),
  aiPrompt: z.string().optional().nullable(),
  repostEnabled: z.boolean(),
  primeTimeHours: z.string().optional().nullable(),
  repostTargetAccountId: z.coerce.number().optional().nullable(),
  watermarkEnabled: z.boolean(),
  watermarkType: z.enum(["text", "logo"]),
  watermarkText: z.string().optional().nullable(),
  watermarkFontSize: z.coerce.number().min(8).max(200),
  watermarkFontWeight: z.enum(["normal", "bold"]),
  watermarkColor: z.string(),
  watermarkOpacity: z.coerce.number().min(0).max(1),
  watermarkPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
  watermarkLogoUrl: z.string().optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.mediaSource === "grab" && !value.targetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Target is required when grabbing from a target profile.",
      path: ["targetId"],
    });
  }
  if (value.mediaSource === "search" && !value.keywordFilter?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Keyword is required when using Search X source mode.",
      path: ["keywordFilter"],
    });
  }
});

type JobFormValues = z.infer<typeof jobSchema>;

export default function Jobs() {
  const { data: jobs, isLoading } = useListJobs();
  const { data: accounts } = useListAccounts();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  // We use useUpdateJob since useToggleJob and useRunJobNow might not have hooks generated properly or need specific params
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editScheduleJob, setEditScheduleJob] = useState<any | null>(null);
  const [editScheduleType, setEditScheduleType] = useState<"interval" | "cron" | "once">("interval");
  const [editScheduleValue, setEditScheduleValue] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isLoading9Proxy, setIsLoading9Proxy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [proxyFilters, setProxyFilters] = useState({
    endpoint: "proxy",
    country: "",
    state: "",
    city: "",
    district: "",
    distance: "",
    limit: "10",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCountdown = (nextRun: string | null | undefined) => {
    if (!nextRun) return null;
    
    // Parse nextRun as UTC timestamp
    const nextRunTime = new Date(nextRun).getTime();
    
    // Detect if nextRun looks like it's incorrectly serialized (local time with Z)
    // If diff is more than 6 hours, it's likely a timezone issue
    let diff = nextRunTime - now;
    
    // If diff is suspiciously large (> 6 hours for a 30min schedule), adjust for timezone
    // This is a workaround for Drizzle timestamptz serialization issue
    if (diff > 6 * 60 * 60 * 1000) {
      // Assume it's WIB (UTC+7) incorrectly serialized as UTC
      // Subtract 7 hours to get the correct time
      diff = diff - 7 * 60 * 60 * 1000;
    }
    
    if (diff <= 0) return "Running soon...";
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      name: "",
      accountId: 0,
      targetId: null,
      mediaSource: "library",
      savedMediaId: null,
      scheduleType: "interval",
      scheduleValue: "60",
      grabImages: false,
      grabVideos: true,
      includeReplies: true,
      extractLinksFromReplies: true,
      allowedVideoDomains: "vve.de,cdn.vdeqsp.de",
      keywordFilter: "",
      grabExternalLinksOnly: false,
      uploadToDood: true,
      autoEmbed: false,
      doodApiKey: "",
      postToX: true,
      postTemplate: "{tweetTextNoLinks}\n{link}",
      insertLink: "",
      proxyList: "",
      aiEnabled: false,
      aiProvider: "openai",
      aiApiKey: "",
      aiPrompt: "",
      repostEnabled: false,
      primeTimeHours: "8,12,18,21",
      repostTargetAccountId: null,
      watermarkEnabled: false,
      watermarkType: "text",
      watermarkText: "",
      watermarkFontSize: 24,
      watermarkFontWeight: "bold",
      watermarkColor: "#ffffff",
      watermarkOpacity: 0.8,
      watermarkPosition: "bottom-right",
      watermarkLogoUrl: "",
    },
  });

  const onSubmit = (data: JobFormValues) => {
    const payload = {
      ...data,
      targetId: data.mediaSource === "grab" ? data.targetId : null,
      savedMediaId: data.mediaSource === "library" ? data.savedMediaId : null,
    };
    if (editingId) {
      updateJob.mutate(
        { id: editingId, data: payload as any },
        {
          onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            await queryClient.refetchQueries({ queryKey: getListJobsQueryKey() });
            setIsOpen(false);
            setEditingId(null);
            form.reset();
            toast({ title: "Job updated" });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to update job.", variant: "destructive" });
          }
        }
      );
    } else {
      createJob.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            setIsOpen(false);
            form.reset();
            toast({ title: "Job created" });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to create job.", variant: "destructive" });
          }
        }
      );
    }
  };

  const handleEdit = (job: any) => {
    form.reset({
      name: job.name,
      accountId: job.accountId,
      targetId: job.targetId ?? null,
      mediaSource: job.mediaSource ?? "grab",
      savedMediaId: job.savedMediaId ?? null,
      scheduleType: job.scheduleType,
      scheduleValue: job.scheduleValue,
      grabImages: job.grabImages,
      grabVideos: job.grabVideos,
      includeReplies: job.includeReplies ?? false,
      extractLinksFromReplies: job.extractLinksFromReplies ?? false,
      allowedVideoDomains: job.allowedVideoDomains || "",
      keywordFilter: job.keywordFilter || "",
      grabExternalLinksOnly: job.grabExternalLinksOnly ?? false,
      uploadToDood: job.uploadToDood,
      autoEmbed: job.autoEmbed ?? false,
      doodApiKey: job.doodApiKey || "",
      postToX: job.postToX,
      postTemplate: job.postTemplate || "",
      insertLink: job.insertLink || "",
      proxyList: job.proxyList || "",
      aiEnabled: job.aiEnabled ?? false,
      aiProvider: job.aiProvider ?? "openai",
      aiApiKey: job.aiApiKey || "",
      aiPrompt: job.aiPrompt || "",
      repostEnabled: job.repostEnabled ?? false,
      primeTimeHours: job.primeTimeHours || "8,12,18,21",
      repostTargetAccountId: job.repostTargetAccountId ?? null,
      watermarkEnabled: job.watermarkEnabled ?? false,
      watermarkType: job.watermarkType ?? "text",
      watermarkText: job.watermarkText || "",
      watermarkFontSize: job.watermarkFontSize ?? 24,
      watermarkFontWeight: job.watermarkFontWeight ?? "bold",
      watermarkColor: job.watermarkColor ?? "#ffffff",
      watermarkOpacity: job.watermarkOpacity ?? 0.8,
      watermarkPosition: job.watermarkPosition ?? "bottom-right",
      watermarkLogoUrl: job.watermarkLogoUrl || "",
    });
    setEditingId(job.id);
    setIsOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this job?")) {
      deleteJob.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            toast({ title: "Job deleted" });
          },
          onError: () => toast({ title: "Error", description: "Failed to delete job.", variant: "destructive" })
        }
      );
    }
  };

  const handleEditSchedule = (job: any) => {
    setEditScheduleJob(job);
    setEditScheduleType(job.scheduleType ?? "interval");
    setEditScheduleValue(job.scheduleValue ?? "60");
  };

  const handleSaveSchedule = async () => {
    if (!editScheduleJob) return;
    if (!editScheduleValue.trim()) {
      toast({ title: "Error", description: "Schedule value is required.", variant: "destructive" });
      return;
    }
    setIsSavingSchedule(true);
    try {
      const response = await fetch(`/api/jobs/${editScheduleJob.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleType: editScheduleType, scheduleValue: editScheduleValue.trim() }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to update schedule.");
      }
      await queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      await queryClient.refetchQueries({ queryKey: getListJobsQueryKey() });
      toast({ title: "Schedule updated", description: `Job "${editScheduleJob.name}" schedule saved.` });
      setEditScheduleJob(null);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update schedule.", variant: "destructive" });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleToggle = async (job: any) => {
    try {
      const response = await fetch(`/api/jobs/${job.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        throw new Error("Failed to toggle job");
      }
      
      await queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      await queryClient.refetchQueries({ queryKey: getListJobsQueryKey() });
      toast({ title: job.isActive ? "Job paused" : "Job activated" });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to toggle job", 
        variant: "destructive" 
      });
    }
  };

  const load9Proxy = async () => {
    setIsLoading9Proxy(true);
    try {
      const params = new URLSearchParams();
      params.set("endpoint", proxyFilters.endpoint);
      params.set("limit", proxyFilters.limit || "10");
      if (proxyFilters.endpoint === "proxy") params.set("today", "true");
      if (proxyFilters.country.trim()) params.set("country", proxyFilters.country.trim());
      if (proxyFilters.state.trim()) params.set("state", proxyFilters.state.trim());
      if (proxyFilters.city.trim()) params.set("city", proxyFilters.city.trim());
      if (proxyFilters.district.trim()) params.set("district", proxyFilters.district.trim());
      if (proxyFilters.distance.trim()) {
        params.set("distance", proxyFilters.distance.trim());
        params.set("radius", proxyFilters.distance.trim());
      }
      const response = await fetch(`/api/proxy/9proxy?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load proxies from 9Proxy.");
      }
      const proxies = Array.isArray(payload.proxies) ? payload.proxies : [];
      if (proxies.length === 0) {
        throw new Error("9Proxy returned no proxies for the current filter.");
      }
      const current = form.getValues("proxyList")?.trim();
      form.setValue("proxyList", [current, proxies.join("\n")].filter(Boolean).join("\n"), { shouldDirty: true });
      toast({ title: "9Proxy loaded", description: `${proxies.length} proxies added to this job.` });
    } catch (error) {
      toast({ title: "9Proxy error", description: error instanceof Error ? error.message : "Failed to load proxies.", variant: "destructive" });
    } finally {
      setIsLoading9Proxy(false);
    }
  };

  const watchUploadToDood = form.watch("uploadToDood");
  const watchPostToX = form.watch("postToX");
  const watchIncludeReplies = form.watch("includeReplies");
  const watchExtractLinksFromReplies = form.watch("extractLinksFromReplies");
  const watchMediaSource = form.watch("mediaSource");
  const watchAiEnabled = form.watch("aiEnabled");
  const watchRepostEnabled = form.watch("repostEnabled");
  const watchWatermarkEnabled = form.watch("watermarkEnabled");
  const watchWatermarkType = form.watch("watermarkType");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Automation Jobs</h2>
        <Dialog open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) { setEditingId(null); form.reset(); }
        }}>
          <DialogTrigger asChild>
            <Button className="uppercase font-mono tracking-wider text-xs">
              <Plus className="mr-2 h-4 w-4" /> Create Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-primary border-b border-border pb-2">
                {editingId ? "Edit Job" : "Create Automation Job"}
              </DialogTitle>
              <DialogDescription>
                Buat job otomatis untuk posting media dari library ke X.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Scrape Tech Videos" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actor Account</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value ? String(field.value) : undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {accounts?.map(acc => (
                              <SelectItem key={acc.id} value={String(acc.id)}>@{acc.username}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    Gunakan menu Media atau Schedule Mass Grab untuk mengambil konten. Automation Jobs hanya untuk posting.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="interval">Interval (minutes)</SelectItem>
                            <SelectItem value="cron">Cron Expression</SelectItem>
                            <SelectItem value="once">Run Once</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduleValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Schedule Value</FormLabel>
                        <FormControl>
                          <Input placeholder={form.watch('scheduleType') === 'interval' ? "60" : "0 * * * *"} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 border border-border p-4 bg-muted/20">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">Content Source</h3>
                  <FormField
                    control={form.control}
                    name="mediaSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source Mode</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          if (value !== "library") form.setValue("savedMediaId", null);
                        }} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose media source" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="library">Use saved media library</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Post dari media yang sudah tersimpan di library.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    Media akan dipilih acak otomatis dari library saat job berjalan.
                  </div>
                </div>

                <div className="space-y-4 border border-border p-4 bg-muted/20">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">Pipeline Configuration</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="grabImages"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Grab Images</FormLabel>
                            <FormDescription className="text-xs">Download image media</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="grabVideos"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Grab Videos</FormLabel>
                            <FormDescription className="text-xs">Download video media</FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {watchMediaSource !== "library" && (
                  <div className="space-y-4 border border-border/70 p-4 bg-background/40">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reply Link Grabber</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="includeReplies"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Include Replies</FormLabel>
                              <FormDescription className="text-xs">Scan replies made by the target profile</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="extractLinksFromReplies"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Grab Reply Links</FormLabel>
                              <FormDescription className="text-xs">Extract video URLs found in reply text</FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!watchIncludeReplies} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    {watchIncludeReplies && watchExtractLinksFromReplies && (
                      <FormField
                        control={form.control}
                        name="allowedVideoDomains"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Not Allowed Video Domains</FormLabel>
                            <FormDescription className="text-xs">Comma-separated domains to not accept from replies, for example: vve.de, cdn.vdeqsp.de</FormDescription>
                            <FormControl>
                              <Input placeholder="vve.de,cdn.vdeqsp.de" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                  )}

                  <FormField
                    control={form.control}
                    name="keywordFilter"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Keyword Filter</FormLabel>
                        <FormDescription className="text-xs">For Search X mode: keyword/query to search. For other modes: only grab tweets containing these keywords (comma-separated). Leave empty to grab all.</FormDescription>
                        <FormControl>
                          <Input placeholder="cat,dog,animal" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="grabExternalLinksOnly"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Grab Video Links from Status/Comments</FormLabel>
                          <FormDescription className="text-xs">Enable this for links like vidoi.de/e/xxx, vidcq.de/e/xxx, or cdn2.sjicedrive.com/xxx.mp4. The link will be resolved, downloaded, then uploaded to DoodStream.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="uploadToDood"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Upload to Dood</FormLabel>
                          <FormDescription className="text-xs">Upload grabbed videos to DoodStream</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {watchUploadToDood && (
                    <>
                      <FormField
                        control={form.control}
                        name="autoEmbed"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Auto-create Embed Link</FormLabel>
                              <FormDescription className="text-xs">
                                Buat link unik berakhiran <span className="font-mono">.mp4</span> dari domain kustom dan gunakan sebagai <span className="font-mono">{"{link}"}</span> di post. Konfigurasi domain di Settings.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="doodApiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>DoodStream API Key <span className="text-muted-foreground font-normal">(opsional)</span></FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Kosongkan untuk memakai key global dari Settings" {...field} value={field.value || ""} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Jika dikosongkan, sistem otomatis memakai DoodStream API Key dari Settings Admin.</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="postToX"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Schedule Posts</FormLabel>
                          <FormDescription className="text-xs">Create scheduled posts for grabbed media</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {watchPostToX && (
                    <>
                      <FormField
                        control={form.control}
                        name="postTemplate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Post Template</FormLabel>
                            <FormDescription className="text-xs">
                              Variables: {"{tweetText}"}, {"{tweetTextNoLinks}"}, {"{caption}"}, {"{targetUsername}"}, {"{link}"}, {"{doodUrl}"}, {"{streamtapeUrl}"}, {"{affiliate}"}, {"{aiCaption}"}
                              {watchUploadToDood && <span className="block text-primary/80 mt-1">Jika <span className="font-mono">Auto-create Embed Link</span> aktif, <span className="font-mono">{"{link}"}</span> otomatis berisi URL embed berakhiran <span className="font-mono">.mp4</span>.</span>}
                            </FormDescription>
                            <FormControl>
                              <Textarea className="h-20 font-mono text-sm" {...field} value={field.value || ""} />
                            </FormControl>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              <span><code className="text-blue-400">{"{tweetText}"}</code> — Teks tweet asli</span>
                              <span><code className="text-blue-400">{"{tweetTextNoLinks}"}</code> — Tweet tanpa URL</span>
                              <span><code className="text-blue-400">{"{caption}"}</code> — OCR text dari thumbnail</span>
                              <span><code className="text-blue-400">{"{link}"}</code> — Link embed/video</span>
                              <span><code className="text-blue-400">{"{affiliate}"}</code> — Link affiliate acak</span>
                              <span><code className="text-blue-400">{"{targetUsername}"}</code> — Username target</span>
                              <span><code className="text-blue-400">{"{doodUrl}"}</code> — URL DoodStream</span>
                              <span><code className="text-blue-400">{"{streamtapeUrl}"}</code> — URL Streamtape</span>
                              <span><code className="text-blue-400">{"{aiCaption}"}</code> — Caption dari AI</span>
                              <span><code className="text-blue-400">{"{originalUrl}"}</code> — URL media asli</span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="insertLink"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Insert Custom Link</FormLabel>
                            <FormDescription className="text-xs">Used for {"{link}"} variable if not using Dood URL</FormDescription>
                            <FormControl>
                              <Input placeholder="https://..." {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                <div className="space-y-4 border border-border p-4 bg-muted/20">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">AI Caption Generator</h3>
                  <FormField
                    control={form.control}
                    name="aiEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Enable AI Caption</FormLabel>
                          <FormDescription className="text-xs">Auto-generate post captions using AI ({"{aiCaption}"} variable)</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {watchAiEnabled && (
                    <>
                      <FormField
                        control={form.control}
                        name="aiProvider"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>AI Provider</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI (gpt-4o-mini)</SelectItem>
                                <SelectItem value="groq">Groq (llama3-8b-8192)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="aiApiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="sk-... or gsk_..." {...field} value={field.value || ""} />
                            </FormControl>
                            <FormDescription className="text-xs">Provider API key for AI caption generation.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="aiPrompt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Caption Prompt</FormLabel>
                            <FormControl>
                              <Textarea className="h-20 font-mono text-sm" placeholder="Write an engaging caption in Indonesian for this video: {tweetText}" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormDescription className="text-xs">Use {"{tweetText}"} to include original tweet text. Result replaces {"{aiCaption}"} in your post template.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                <div className="space-y-4 border border-border p-4 bg-muted/20">
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Proxy Rotation</h3>
                    <Button type="button" size="sm" variant="outline" onClick={load9Proxy} disabled={isLoading9Proxy}>
                      {isLoading9Proxy ? "Loading..." : "Load from 9Proxy"}
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Proxy Source</label>
                      <Select
                        value={proxyFilters.endpoint}
                        onValueChange={(value) => setProxyFilters((current) => ({ ...current, endpoint: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="proxy">Proxy List</SelectItem>
                          <SelectItem value="today-list">Today List</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Negara</label>
                      <Input
                        placeholder="ID, US, VN"
                        value={proxyFilters.country}
                        onChange={(event) => setProxyFilters((current) => ({ ...current, country: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Provinsi / State</label>
                      <Input
                        placeholder="Jawa Barat"
                        value={proxyFilters.state}
                        onChange={(event) => setProxyFilters((current) => ({ ...current, state: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Kota</label>
                      <Input
                        placeholder="Bandung"
                        value={proxyFilters.city}
                        onChange={(event) => setProxyFilters((current) => ({ ...current, city: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Kabupaten</label>
                      <Input
                        placeholder="Bandung Barat"
                        value={proxyFilters.district}
                        onChange={(event) => setProxyFilters((current) => ({ ...current, district: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Jarak / Radius</label>
                      <Input
                        placeholder="10"
                        value={proxyFilters.distance}
                        onChange={(event) => setProxyFilters((current) => ({ ...current, distance: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Jumlah Proxy</label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        placeholder="10"
                        value={proxyFilters.limit}
                        onChange={(event) => setProxyFilters((current) => ({ ...current, limit: event.target.value }))}
                      />
                    </div>
                  </div>
                  <FormField
                    control={form.control}
                    name="proxyList"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proxy List</FormLabel>
                        <FormControl>
                          <Textarea className="h-24 font-mono text-xs" placeholder={"http://user:pass@host1:8080\nhttp://user:pass@host2:8080\nsocks5://host3:1080"} {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription className="text-xs">One proxy per line. Supports http/https/socks4/socks5. Rotated randomly on each job run. Use 9Proxy button to fill this automatically.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 border border-border p-4 bg-muted/20">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">Auto Repost Scheduler</h3>
                  <FormField
                    control={form.control}
                    name="repostEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Enable Prime Time Repost</FormLabel>
                          <FormDescription className="text-xs">Auto-repost to a secondary account at peak engagement hours</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {watchRepostEnabled && (
                    <>
                      <FormField
                        control={form.control}
                        name="primeTimeHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prime Time Hours (WIB)</FormLabel>
                            <FormControl>
                              <Input placeholder="8,12,18,21" {...field} value={field.value || ""} />
                            </FormControl>
                            <FormDescription className="text-xs">Comma-separated hours (0-23) when reposts are scheduled. Example: 8,12,18,21</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="repostTargetAccountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Repost Target Account</FormLabel>
                            <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : undefined}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select secondary account" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {accounts?.map((acc) => (
                                  <SelectItem key={acc.id} value={String(acc.id)}>
                                    @{acc.username}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">Secondary account that receives the reposts at prime time.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                <div className="space-y-4 border border-border p-4 bg-muted/20">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">Image Watermark</h3>
                  <FormField
                    control={form.control}
                    name="watermarkEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Enable Watermark</FormLabel>
                          <FormDescription className="text-xs">Tambahkan watermark ke gambar sebelum diposting ke X</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {watchWatermarkEnabled && (
                    <>
                      <FormField
                        control={form.control}
                        name="watermarkType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipe Watermark</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="text">Teks</SelectItem>
                                <SelectItem value="logo">Logo / Gambar</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {watchWatermarkType === "text" ? (
                        <>
                          <FormField
                            control={form.control}
                            name="watermarkText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Teks Watermark</FormLabel>
                                <FormControl>
                                  <Input placeholder="@username atau nama brand" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="watermarkFontSize"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ukuran Font (px)</FormLabel>
                                  <FormControl>
                                    <Input type="number" min={8} max={200} {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="watermarkFontWeight"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ketebalan Font</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="normal">Normal</SelectItem>
                                      <SelectItem value="bold">Bold</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="watermarkColor"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Warna Teks</FormLabel>
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="color"
                                      value={field.value}
                                      onChange={(e) => field.onChange(e.target.value)}
                                      className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent p-1"
                                    />
                                    <FormControl>
                                      <Input placeholder="#ffffff" {...field} />
                                    </FormControl>
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="watermarkOpacity"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Opacity (0–1)</FormLabel>
                                  <FormControl>
                                    <Input type="number" min={0} max={1} step={0.05} {...field} />
                                  </FormControl>
                                  <FormDescription className="text-xs">0 = transparan, 1 = solid</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <FormField
                            control={form.control}
                            name="watermarkLogoUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>URL Logo</FormLabel>
                                <FormControl>
                                  <Input placeholder="https://..." {...field} value={field.value || ""} />
                                </FormControl>
                                <FormDescription className="text-xs">URL gambar logo (PNG transparan direkomendasikan)</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="watermarkOpacity"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Opacity Logo (0–1)</FormLabel>
                                <FormControl>
                                  <Input type="number" min={0} max={1} step={0.05} {...field} />
                                </FormControl>
                                <FormDescription className="text-xs">0 = transparan, 1 = solid</FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      <FormField
                        control={form.control}
                        name="watermarkPosition"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Posisi Watermark</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="top-left">Kiri Atas</SelectItem>
                                <SelectItem value="top-right">Kanan Atas</SelectItem>
                                <SelectItem value="bottom-left">Kiri Bawah</SelectItem>
                                <SelectItem value="bottom-right">Kanan Bawah</SelectItem>
                                <SelectItem value="center">Tengah</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={createJob.isPending || updateJob.isPending}>Save Job</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Target → Account</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Loading jobs...</TableCell>
                </TableRow>
              ) : jobs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No jobs configured.</TableCell>
                </TableRow>
              ) : (
                jobs?.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium text-primary">
                      {job.name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <span className="text-muted-foreground">
                          {job.mediaSource === "home" ? "Home timeline" : job.mediaSource === "search" ? `Search: ${job.keywordFilter || "(no keyword)"}` : job.mediaSource === "library" ? "Saved media" : `@${job.targetUsername}`}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span>@{job.accountUsername}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {job.scheduleType === 'interval' ? `Every ${job.scheduleValue}m` : job.scheduleValue}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={job.isActive} onCheckedChange={() => handleToggle(job)} className="scale-75 data-[state=checked]:bg-primary" />
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="outline" className={
                            job.status === 'running' && !job.isActive ? "text-amber-500 border-amber-500 bg-amber-500/10 animate-pulse" :
                            job.status === 'running' ? "text-primary border-primary bg-primary/10 animate-pulse" :
                            job.status === 'error' ? "text-destructive border-destructive bg-destructive/10" :
                            !job.isActive ? "text-muted-foreground border-border bg-muted/20" :
                            "text-muted-foreground border-border bg-muted/20"
                          }>
                            {job.status === 'running' && !job.isActive ? "PAUSING" : !job.isActive ? "PAUSED" : job.status.toUpperCase()}
                          </Badge>
                          {job.isActive && job.nextRun && job.status !== 'running' && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatCountdown(job.nextRun)}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {job.grabVideos && <Badge variant="secondary" className="text-[10px]">VID</Badge>}
                        {job.grabImages && <Badge variant="secondary" className="text-[10px]">IMG</Badge>}
                        {job.mediaSource === "home" && <Badge variant="secondary" className="text-[10px] bg-orange-500/20 text-orange-400">HOME</Badge>}
                        {job.mediaSource === "search" && <Badge variant="secondary" className="text-[10px] bg-purple-500/20 text-purple-400">SEARCH</Badge>}
                        {job.mediaSource === "library" && <Badge variant="secondary" className="text-[10px] bg-cyan-500/20 text-cyan-400">SAVED</Badge>}
                        {job.includeReplies && <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-400">REPLY</Badge>}
                        {job.extractLinksFromReplies && <Badge variant="secondary" className="text-[10px] bg-green-500/20 text-green-400">LINK</Badge>}
                        {job.uploadToDood && <Badge variant="secondary" className="text-[10px] bg-purple-500/20 text-purple-400">DOOD</Badge>}
                        {job.postToX && <Badge variant="secondary" className="text-[10px] bg-blue-500/20 text-blue-400">POST</Badge>}
                        {job.aiEnabled && <Badge variant="secondary" className="text-[10px] bg-fuchsia-500/20 text-fuchsia-400">AI</Badge>}
                        {job.repostEnabled && <Badge variant="secondary" className="text-[10px] bg-teal-500/20 text-teal-400">REPOST</Badge>}
                        {job.proxyList && <Badge variant="secondary" className="text-[10px] bg-yellow-500/20 text-yellow-400">PROXY</Badge>}
                        {job.watermarkEnabled && <Badge variant="secondary" className="text-[10px] bg-rose-500/20 text-rose-400">WM</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Edit schedule" onClick={() => handleEditSchedule(job)}>
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Edit job" onClick={() => handleEdit(job)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete job" onClick={() => handleDelete(job.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editScheduleJob} onOpenChange={(open) => { if (!open) setEditScheduleJob(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-primary border-b border-border pb-2">
              Edit Schedule
            </DialogTitle>
            <DialogDescription>
              {editScheduleJob ? `Job: ${editScheduleJob.name}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Schedule type</label>
              <Select value={editScheduleType} onValueChange={(v) => setEditScheduleType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">Interval (minutes)</SelectItem>
                  <SelectItem value="cron">Cron expression</SelectItem>
                  <SelectItem value="once">Run once (date)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {editScheduleType === "interval" ? "Interval (minutes)" : editScheduleType === "cron" ? "Cron expression" : "Run at"}
              </label>
              <Input
                placeholder={editScheduleType === "interval" ? "60" : editScheduleType === "cron" ? "0 * * * *" : "2026-06-01T10:00"}
                value={editScheduleValue}
                onChange={(e) => setEditScheduleValue(e.target.value)}
                type={editScheduleType === "once" ? "datetime-local" : "text"}
              />
              <p className="text-xs text-muted-foreground">
                {editScheduleType === "interval" && "Job runs every N minutes."}
                {editScheduleType === "cron" && "Standard cron format. Example: 0 9 * * * (every day at 9 AM)."}
                {editScheduleType === "once" && "Job runs one time at the chosen date and time (Asia/Jakarta)."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditScheduleJob(null)} disabled={isSavingSchedule}>
              Cancel
            </Button>
            <Button onClick={handleSaveSchedule} disabled={isSavingSchedule}>
              {isSavingSchedule ? "Saving..." : "Save schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
