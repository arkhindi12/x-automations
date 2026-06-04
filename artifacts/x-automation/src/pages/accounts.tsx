import { useState } from "react";
import { useListAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount, getListAccountsQueryKey } from "@workspace/api-client-react";
import { ERROR_MESSAGES } from "@/lib/error-messages";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit2, ShieldAlert, Loader2, CheckCircle2, HeartPulse, AlertTriangle, Clock, Cookie, KeyRound, Upload, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const credentialFields = ["bearerToken", "apiKey", "apiSecret", "accessToken", "accessTokenSecret"] as const;

const credentialLabels: Record<(typeof credentialFields)[number], string> = {
  bearerToken: "Bearer Token",
  apiKey: "API Key",
  apiSecret: "API Secret",
  accessToken: "Access Token",
  accessTokenSecret: "Access Token Secret",
};

const accountSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  authMode: z.enum(["oauth", "cookies"]).default("oauth"),
  bearerToken: z.string().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessToken: z.string().optional(),
  accessTokenSecret: z.string().optional(),
  cookieJson: z.string().optional(),
  cookieUserAgent: z.string().optional(),
  proxyUrl: z.string().optional().nullable().refine((value) => {
    const trimmed = value?.trim();
    if (!trimmed) return true;
    const lines = trimmed.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    return lines.every((line) => {
      try {
        const parsed = new URL(line);
        return ["http:", "https:", "socks4:", "socks5:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    });
  }, "Each proxy must use http, https, socks4, or socks5 protocol"),
});

type AccountFormValues = z.infer<typeof accountSchema>;
type HealthStatus = { status: "ok" | "expired" | "rate_limited" | "error"; message: string; rateLimit: { limit: string | null; remaining: string | null; reset: string | null } | null; authMode?: "oauth" | "cookies" };
type LoginDiagnostic = { ok: boolean; reason: string; message: string; suggestions?: string[]; authMode?: "oauth" | "cookies"; proxyChecked?: boolean };

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "");
}

function normalizeProxyUrl(proxyUrl: string | null | undefined) {
  const trimmed = proxyUrl?.trim();
  return trimmed ? trimmed : null;
}

function getMissingCredentials(data: AccountFormValues) {
  return credentialFields.filter((field) => !data[field]?.trim());
}

function getProvidedCredentials(data: AccountFormValues) {
  return credentialFields.filter((field) => data[field]?.trim());
}

function buildBasePayload(data: AccountFormValues) {
  return {
    username: normalizeUsername(data.username),
    authMode: data.authMode,
    proxyUrl: normalizeProxyUrl(data.proxyUrl),
  };
}

function buildOAuthCreatePayload(data: AccountFormValues) {
  return {
    ...buildBasePayload(data),
    bearerToken: data.bearerToken?.trim() ?? "",
    apiKey: data.apiKey?.trim() ?? "",
    apiSecret: data.apiSecret?.trim() ?? "",
    accessToken: data.accessToken?.trim() ?? "",
    accessTokenSecret: data.accessTokenSecret?.trim() ?? "",
  };
}

function buildCookieCreatePayload(data: AccountFormValues) {
  return {
    ...buildBasePayload(data),
    cookieJson: data.cookieJson?.trim() ?? "",
    cookieUserAgent: data.cookieUserAgent?.trim() ?? "",
  };
}

function buildOAuthUpdatePayload(data: AccountFormValues) {
  const payload: Record<string, unknown> = {
    ...buildBasePayload(data),
  };
  for (const field of credentialFields) {
    const value = data[field]?.trim();
    if (value) payload[field] = value;
  }
  return payload;
}

function buildCookieUpdatePayload(data: AccountFormValues) {
  const payload: Record<string, unknown> = {
    ...buildBasePayload(data),
  };
  if (data.cookieJson?.trim()) payload.cookieJson = data.cookieJson.trim();
  if (data.cookieUserAgent != null) payload.cookieUserAgent = data.cookieUserAgent.trim();
  return payload;
}

async function testAccountCredentials(payload: Record<string, unknown>) {
  const response = await fetch("/api/accounts/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null) as { error?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(result?.error ?? ERROR_MESSAGES.CREDENTIAL_VALIDATION_FAILED);
  }

  return result?.message ?? "Credentials validated.";
}

async function testAccountDiagnostic(payload: Record<string, unknown>): Promise<LoginDiagnostic> {
  const response = await fetch("/api/accounts/test-diagnostic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as LoginDiagnostic | null;
  if (!result) {
    throw new Error("Failed to parse diagnostic response.");
  }
  // Return diagnostic result even if not ok (contains error details)
  return result;
}

async function updateAccountCookies(accountId: number, payload: Record<string, unknown>): Promise<LoginDiagnostic> {
  const response = await fetch(`/api/accounts/${accountId}/cookies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as (LoginDiagnostic & { account?: unknown }) | null;
  if (!result) throw new Error("Failed to parse update response.");
  if (!response.ok || !result.ok) return result;
  return result;
}

function HealthBadge({ health }: { health: HealthStatus }) {
  if (health.status === "ok") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Healthy
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{health.message}</p>
            {health.rateLimit?.remaining && <p className="text-xs text-muted-foreground">Rate limit: {health.rateLimit.remaining}/{health.rateLimit.limit} remaining</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (health.status === "rate_limited") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 bg-yellow-500/10 gap-1">
              <Clock className="h-3 w-3" /> Rate Limited
            </Badge>
          </TooltipTrigger>
          <TooltipContent><p>{health.message}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (health.status === "expired") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10 gap-1">
              <AlertTriangle className="h-3 w-3" /> Expired
            </Badge>
          </TooltipTrigger>
          <TooltipContent><p>{health.message}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="text-muted-foreground border-muted/20 gap-1">
            <AlertTriangle className="h-3 w-3" /> Error
          </Badge>
        </TooltipTrigger>
        <TooltipContent><p>{health.message}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AuthModeBadge({ mode }: { mode: "oauth" | "cookies" }) {
  if (mode === "cookies") {
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500/20 bg-amber-500/10 gap-1 font-mono text-[10px]">
        <Cookie className="h-3 w-3" /> COOKIES
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-blue-500 border-blue-500/20 bg-blue-500/10 gap-1 font-mono text-[10px]">
      <KeyRound className="h-3 w-3" /> API
    </Badge>
  );
}

export default function Accounts() {
  const { data: accounts, isLoading } = useListAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [lastTestMessage, setLastTestMessage] = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState<Record<number, boolean>>({});
  const [healthResults, setHealthResults] = useState<Record<number, HealthStatus>>({});
  const [cookieUpdateAccount, setCookieUpdateAccount] = useState<any | null>(null);
  const [cookieUpdateJson, setCookieUpdateJson] = useState("");
  const [cookieUpdateUserAgent, setCookieUpdateUserAgent] = useState("");
  const [cookieUpdateProxy, setCookieUpdateProxy] = useState("");
  const [cookieUpdateDiagnostic, setCookieUpdateDiagnostic] = useState<LoginDiagnostic | null>(null);
  const [isUpdatingCookies, setIsUpdatingCookies] = useState(false);
  const [checkingProxies, setCheckingProxies] = useState(false);
  const [proxyResults, setProxyResults] = useState<any[] | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      username: "",
      authMode: "oauth",
      bearerToken: "",
      apiKey: "",
      apiSecret: "",
      accessToken: "",
      accessTokenSecret: "",
      cookieJson: "",
      cookieUserAgent: "",
      proxyUrl: "",
    },
  });

  const authMode = (form.watch("authMode") ?? "oauth") as "oauth" | "cookies";

  const testCurrentCredentials = async (data: AccountFormValues) => {
    if (data.authMode === "cookies") {
      if (!data.cookieJson?.trim()) {
        throw new Error(ERROR_MESSAGES.COOKIES_REQUIRED);
      }
      setIsTesting(true);
      setLastTestMessage(null);
      try {
        const message = await testAccountCredentials(buildCookieCreatePayload(data));
        setLastTestMessage(message);
        return message;
      } finally {
        setIsTesting(false);
      }
    }

    const missingCredentials = getMissingCredentials(data);
    if (missingCredentials.length > 0) {
      const missingLabels = missingCredentials.map((field) => credentialLabels[field]).join(", ");
      throw new Error(`${ERROR_MESSAGES.MISSING_REQUIRED_FIELDS}: ${missingLabels}.`);
    }

    setIsTesting(true);
    setLastTestMessage(null);
    try {
      const message = await testAccountCredentials(buildOAuthCreatePayload(data));
      setLastTestMessage(message);
      return message;
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestClick = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    const data = form.getValues();
    const payload = data.authMode === "cookies" ? buildCookieCreatePayload(data) : buildOAuthCreatePayload(data);
    setIsTesting(true);
    setLastTestMessage(null);
    try {
      const diagnostic = await testAccountDiagnostic(payload);
      if (diagnostic.ok) {
        setLastTestMessage(diagnostic.message);
        toast({ title: "Connection verified", description: diagnostic.message });
      } else {
        toast({
          title: `Connection failed: ${diagnostic.reason}`,
          description: `${diagnostic.message}${diagnostic.suggestions?.length ? " — " + diagnostic.suggestions[0] : ""}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({ title: "Connection failed", description: error instanceof Error ? error.message : "Failed to verify credentials.", variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleHealthCheck = async (accountId: number) => {
    setHealthChecking((prev) => ({ ...prev, [accountId]: true }));
    try {
      const response = await fetch(`/api/accounts/${accountId}/health`);
      const result = await response.json() as HealthStatus;
      setHealthResults((prev) => ({ ...prev, [accountId]: result }));
      if (result.status === "ok") {
        toast({ title: "Account healthy", description: result.message });
      } else {
        toast({ title: "Account issue detected", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Health check failed", description: "Could not reach the server.", variant: "destructive" });
    } finally {
      setHealthChecking((prev) => ({ ...prev, [accountId]: false }));
    }
  };

  const onSubmit = async (data: AccountFormValues) => {
    try {
      if (editingId) {
        if (data.authMode === "oauth") {
          const providedCredentials = getProvidedCredentials(data);
          if (providedCredentials.length > 0 && providedCredentials.length !== credentialFields.length) {
            const missingCredentials = getMissingCredentials(data).map((field) => credentialLabels[field]).join(", ");
            toast({ title: "Incomplete credentials", description: `To replace credentials, complete: ${missingCredentials}.`, variant: "destructive" });
            return;
          }
          if (providedCredentials.length === credentialFields.length) {
            await testCurrentCredentials(data);
          }
          updateAccount.mutate(
            { id: editingId, data: buildOAuthUpdatePayload(data) as any },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
                setIsAddOpen(false);
                setEditingId(null);
                setLastTestMessage(null);
                form.reset();
                toast({ title: "Account updated", description: "Account metadata was saved." });
              },
              onError: (error) => {
                toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update account.", variant: "destructive" });
              }
            }
          );
        } else {
          if (data.cookieJson?.trim()) {
            await testCurrentCredentials(data);
          }
          updateAccount.mutate(
            { id: editingId, data: buildCookieUpdatePayload(data) as any },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
                setIsAddOpen(false);
                setEditingId(null);
                setLastTestMessage(null);
                form.reset();
                toast({ title: "Account updated", description: "Cookies refreshed." });
              },
              onError: (error) => {
                toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update account.", variant: "destructive" });
              }
            }
          );
        }
      } else {
        await testCurrentCredentials(data);
        const payload = data.authMode === "cookies"
          ? buildCookieCreatePayload(data)
          : buildOAuthCreatePayload(data);
        createAccount.mutate(
          { data: payload as any },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
              setIsAddOpen(false);
              setLastTestMessage(null);
              form.reset();
              toast({ title: "Account added", description: "Login was verified before saving." });
            },
            onError: (error) => {
              toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to add account.", variant: "destructive" });
            }
          }
        );
      }
    } catch (error) {
      toast({ title: "Validation failed", description: error instanceof Error ? error.message : "Failed to validate account.", variant: "destructive" });
    }
  };

  const handleEdit = (account: any) => {
    form.reset({
      username: account.username,
      authMode: (account.authMode ?? "oauth") as "oauth" | "cookies",
      bearerToken: "",
      apiKey: "",
      apiSecret: "",
      accessToken: "",
      accessTokenSecret: "",
      cookieJson: "",
      cookieUserAgent: account.cookieUserAgent ?? "",
      proxyUrl: account.proxyUrl || "",
    });
    setLastTestMessage(null);
    setEditingId(account.id);
    setIsAddOpen(true);
  };

  const openCookieUpdate = (account: any) => {
    setCookieUpdateAccount(account);
    setCookieUpdateJson("");
    setCookieUpdateUserAgent(account.cookieUserAgent ?? "");
    setCookieUpdateProxy(account.proxyUrl || "");
    setCookieUpdateDiagnostic(null);
  };

  const handleCookieFileUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setCookieUpdateJson(text);
      setCookieUpdateDiagnostic(null);
      toast({ title: "Cookie file loaded", description: `${file.name} siap divalidasi.` });
    } catch {
      toast({ title: "Invalid cookie file", description: "File harus JSON export dari Cookie-Editor/EditThisCookie.", variant: "destructive" });
    }
  };

  const handleCookieDiagnostic = async () => {
    if (!cookieUpdateAccount) return;
    const cleanJson = cookieUpdateJson.trim().replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
    if (!cleanJson) {
      toast({ title: "Cookies required", description: "Paste atau upload cookie JSON terlebih dahulu.", variant: "destructive" });
      return;
    }
    // Pre-validate JSON
    try { JSON.parse(cleanJson); } catch {
      toast({ title: "Invalid JSON", description: "Cookie JSON format tidak valid. Pastikan copy dari Cookie Editor dengan benar.", variant: "destructive" });
      return;
    }
    setIsUpdatingCookies(true);
    try {
      const diagnostic = await testAccountDiagnostic({
        username: cookieUpdateAccount.username,
        authMode: "cookies",
        cookieJson: cleanJson,
        cookieUserAgent: cookieUpdateUserAgent.trim() || undefined,
        proxyUrl: cookieUpdateProxy.trim() || undefined,
      });
      setCookieUpdateDiagnostic(diagnostic);
      toast({
        title: diagnostic.ok ? "Cookies valid" : `Cookie problem: ${diagnostic.reason}`,
        description: diagnostic.message,
        variant: diagnostic.ok ? "default" : "destructive",
      });
    } finally {
      setIsUpdatingCookies(false);
    }
  };

  const handleCookieUpdateSave = async () => {
    if (!cookieUpdateAccount) return;
    const cleanJson = cookieUpdateJson.trim().replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
    if (!cleanJson) {
      toast({ title: "Cookies required", description: "Paste atau upload cookie JSON terlebih dahulu.", variant: "destructive" });
      return;
    }
    try { JSON.parse(cleanJson); } catch {
      toast({ title: "Invalid JSON", description: "Cookie JSON format tidak valid.", variant: "destructive" });
      return;
    }
    setIsUpdatingCookies(true);
    try {
      const result = await updateAccountCookies(cookieUpdateAccount.id, {
        username: cookieUpdateAccount.username,
        authMode: "cookies",
        cookieJson: cleanJson,
        cookieUserAgent: cookieUpdateUserAgent.trim() || undefined,
        proxyUrl: cookieUpdateProxy.trim() || undefined,
      });
      setCookieUpdateDiagnostic(result);
      if (!result.ok) {
        toast({ title: `Update failed: ${result.reason}`, description: result.message, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      setHealthResults((prev) => {
        const next = { ...prev };
        delete next[cookieUpdateAccount.id];
        return next;
      });
      toast({ title: "Cookies updated", description: result.message });
      setCookieUpdateAccount(null);
      setCookieUpdateJson("");
      setCookieUpdateDiagnostic(null);
    } catch (error) {
      toast({ title: "Update failed", description: error instanceof Error ? error.message : "Failed to update cookies.", variant: "destructive" });
    } finally {
      setIsUpdatingCookies(false);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this account?")) {
      deleteAccount.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
            toast({ title: "Account deleted" });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to delete account.", variant: "destructive" });
          }
        }
      );
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsAddOpen(open);
    if (!open) {
      setEditingId(null);
      setLastTestMessage(null);
      form.reset();
    }
  };

  const isSaving = createAccount.isPending || updateAccount.isPending || isTesting;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Account Manager</h2>
        <Dialog open={isAddOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="uppercase font-mono tracking-wider text-xs">
              <Plus className="mr-2 h-4 w-4" /> Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-primary border-b border-border pb-2">
                {editingId ? "Edit Account" : "Add Account"}
              </DialogTitle>
              <DialogDescription>
                Login pakai API resmi X (Bearer/API key) atau pakai cookies dari ekstensi EditThisCookie.
              </DialogDescription>
            </DialogHeader>
            <Alert className="border-primary/30 bg-primary/5">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Safe credential handling</AlertTitle>
              <AlertDescription>
                Stored credentials/cookies are never loaded back into this form. New accounts must pass a connection test before being saved.
              </AlertDescription>
            </Alert>
            {lastTestMessage ? (
              <Alert className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Connection verified</AlertTitle>
                <AlertDescription>{lastTestMessage}</AlertDescription>
              </Alert>
            ) : null}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. elonmusk" {...field} />
                      </FormControl>
                      <FormDescription>Use the X username without the @ symbol.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Tabs
                  value={authMode}
                  onValueChange={(v) => {
                    form.setValue("authMode", v as "oauth" | "cookies", { shouldDirty: true });
                    setLastTestMessage(null);
                  }}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="oauth" className="gap-2">
                      <KeyRound className="h-3.5 w-3.5" /> API Login
                    </TabsTrigger>
                    <TabsTrigger value="cookies" className="gap-2">
                      <Cookie className="h-3.5 w-3.5" /> Cookies Login
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="oauth" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="apiKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key</FormLabel>
                            <FormControl>
                              <Input type="password" autoComplete="off" placeholder={editingId ? "Leave blank to keep current" : "Required"} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="apiSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Secret</FormLabel>
                            <FormControl>
                              <Input type="password" autoComplete="off" placeholder={editingId ? "Leave blank to keep current" : "Required"} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="accessToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Token</FormLabel>
                            <FormControl>
                              <Input type="password" autoComplete="off" placeholder={editingId ? "Leave blank to keep current" : "Required"} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="accessTokenSecret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Token Secret</FormLabel>
                            <FormControl>
                              <Input type="password" autoComplete="off" placeholder={editingId ? "Leave blank to keep current" : "Required"} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="bearerToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bearer Token</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="off" placeholder={editingId ? "Leave blank to keep current" : "Required for validation"} {...field} />
                          </FormControl>
                          <FormDescription>This token is tested against the X API before saving.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="cookies" className="space-y-4 mt-4">
                    <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
                      <Cookie className="h-4 w-4" />
                      <AlertTitle>Cara dapat cookies dari EditThisCookie</AlertTitle>
                      <AlertDescription className="text-xs space-y-1 mt-1">
                        <div>1. Login ke <code className="bg-muted px-1 rounded">x.com</code> di Chrome.</div>
                        <div>2. Klik ikon <strong>EditThisCookie</strong>, lalu klik tombol <strong>Export</strong> (ikon panah ke atas).</div>
                        <div>3. Cookies tersalin sebagai JSON. Paste di kolom di bawah ini.</div>
                        <div className="text-muted-foreground">Wajib ada cookie <code>auth_token</code> dan <code>ct0</code>.</div>
                      </AlertDescription>
                    </Alert>
                    <FormField
                      control={form.control}
                      name="cookieJson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cookies (JSON dari EditThisCookie)</FormLabel>
                          <FormControl>
                            <Textarea
                              autoComplete="off"
                              spellCheck={false}
                              rows={8}
                              className="font-mono text-xs"
                              placeholder={editingId
                                ? '[{"name":"auth_token", ...}]\n\nKosongkan untuk tetap pakai cookies tersimpan.'
                                : '[{"name":"auth_token","value":"...","domain":".x.com"}, ...]'}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Tempel hasil JSON export. Atau bisa juga paste raw cookie header (<code>auth_token=...; ct0=...</code>).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cookieUserAgent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>User-Agent</FormLabel>
                          <div className="space-y-2">
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) field.onChange(e.target.value);
                              }}
                            >
                              <option value="">-- Pilih preset atau ketik manual --</option>
                              <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36">Chrome 131 - Windows</option>
                              <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36">Chrome 130 - Windows</option>
                              <option value="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36">Chrome 131 - macOS</option>
                              <option value="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15">Safari 18 - macOS</option>
                              <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0">Firefox 133 - Windows</option>
                              <option value="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36">Chrome 131 - Linux</option>
                              <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0">Edge 131 - Windows</option>
                              <option value="Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1">Safari - iPhone iOS 18</option>
                              <option value="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36">Chrome - Android Samsung</option>
                              <option value="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36">Chrome - Android Pixel</option>
                            </select>
                            <FormControl>
                              <Input
                                autoComplete="off"
                                placeholder="Mozilla/5.0 ... (kosongkan untuk default)"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                          </div>
                          <FormDescription>Pilih dari preset atau paste User-Agent dari browser kamu. Harus sama dengan saat login agar tidak terdeteksi.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                </Tabs>

                <FormField
                  control={form.control}
                  name="proxyUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proxy Rotator (Optional)</FormLabel>
                      <FormControl>
                        <textarea
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                          placeholder={"http://user:pass@host:port\nsocks5://user:pass@host:port\nhttp://host2:port"}
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>Satu proxy per baris. Sistem akan rotasi otomatis setiap request. Kosongkan field untuk hapus proxy.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button type="button" variant="outline" onClick={handleTestClick} disabled={isSaving}>
                    {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                    Test Connection
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {editingId ? "Update Safely" : "Verify & Save"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(cookieUpdateAccount)} onOpenChange={(open) => !open && setCookieUpdateAccount(null)}>
          <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-primary border-b border-border pb-2">
                Update Cookies {cookieUpdateAccount ? `@${cookieUpdateAccount.username}` : ""}
              </DialogTitle>
              <DialogDescription>
                Paste atau upload cookie JSON baru tanpa menghapus akun/job yang sudah ada.
              </DialogDescription>
            </DialogHeader>
            <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
              <Cookie className="h-4 w-4" />
              <AlertTitle>Tips agar cookie diterima X</AlertTitle>
              <AlertDescription className="text-xs space-y-1 mt-1">
                <div>Gunakan browser yang sudah login normal di x.com, lalu export semua cookies domain x.com/twitter.com.</div>
                <div>Jika memakai proxy, gunakan negara/IP yang konsisten dengan lokasi login akun.</div>
                <div>Wajib ada <code>auth_token</code> dan <code>ct0</code>.</div>
              </AlertDescription>
            </Alert>
            {cookieUpdateDiagnostic ? (
              <Alert className={cookieUpdateDiagnostic.ok ? "border-green-500/30 bg-green-500/10" : "border-destructive/30 bg-destructive/10"}>
                {cookieUpdateDiagnostic.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                <AlertTitle>{cookieUpdateDiagnostic.ok ? "Cookies valid" : `Problem: ${cookieUpdateDiagnostic.reason}`}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{cookieUpdateDiagnostic.message}</p>
                  {cookieUpdateDiagnostic.suggestions?.length ? (
                    <ul className="list-disc pl-5 text-xs">
                      {cookieUpdateDiagnostic.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void handleCookieFileUpload(event.target.files?.[0])}
                  disabled={isUpdatingCookies}
                />
                <Button type="button" variant="outline" className="shrink-0" disabled={isUpdatingCookies}>
                  <Upload className="mr-2 h-4 w-4" /> JSON
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Cookies JSON / raw header</Label>
                <Textarea
                  autoComplete="off"
                  spellCheck={false}
                  rows={9}
                  className="font-mono text-xs"
                  value={cookieUpdateJson}
                  onChange={(event) => { setCookieUpdateJson(event.target.value); setCookieUpdateDiagnostic(null); }}
                  onPaste={(event) => {
                    event.preventDefault();
                    const pasted = event.clipboardData.getData("text/plain");
                    // Sanitize: remove BOM, zero-width chars, normalize line endings
                    const clean = pasted.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[\u200B-\u200D\uFEFF]/g, "");
                    setCookieUpdateJson(clean);
                    setCookieUpdateDiagnostic(null);
                  }}
                  placeholder='[{"name":"auth_token","value":"...","domain":".x.com"}, ...]'
                />
              </div>
              <div className="space-y-2">
                <Label>User-Agent browser saat login (optional tapi disarankan)</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setCookieUpdateUserAgent(e.target.value);
                  }}
                >
                  <option value="">-- Pilih preset atau ketik manual --</option>
                  <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36">Chrome 131 - Windows</option>
                  <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36">Chrome 130 - Windows</option>
                  <option value="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36">Chrome 131 - macOS</option>
                  <option value="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15">Safari 18 - macOS</option>
                  <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0">Firefox 133 - Windows</option>
                  <option value="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36">Chrome 131 - Linux</option>
                  <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0">Edge 131 - Windows</option>
                  <option value="Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1">Safari - iPhone iOS 18</option>
                  <option value="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36">Chrome - Android Samsung</option>
                  <option value="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36">Chrome - Android Pixel</option>
                </select>
                <Input
                  value={cookieUpdateUserAgent}
                  onChange={(event) => setCookieUpdateUserAgent(event.target.value)}
                  placeholder="Mozilla/5.0 ..."
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Proxy Rotator (optional)</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  value={cookieUpdateProxy}
                  onChange={(event) => setCookieUpdateProxy(event.target.value)}
                  placeholder={"http://user:pass@host:port\nsocks5://user:pass@host:port"}
                />
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground flex-1">Satu proxy per baris. Rotasi otomatis setiap request.</p>
                  {cookieUpdateProxy.trim() && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      disabled={checkingProxies}
                      onClick={async () => {
                        setCheckingProxies(true);
                        setProxyResults(null);
                        try {
                          const res = await fetch("/api/accounts/check-proxies", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ proxies: cookieUpdateProxy }),
                          });
                          const data = await res.json();
                          setProxyResults(data.results || []);
                        } catch {
                          setProxyResults([]);
                        }
                        setCheckingProxies(false);
                      }}
                    >
                      {checkingProxies ? "Checking..." : "Check Proxy"}
                    </Button>
                  )}
                </div>
                {proxyResults && proxyResults.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs font-mono">
                    {proxyResults.map((r: any, i: number) => (
                      <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded ${r.status === "alive" ? "bg-green-500/10 text-green-400" : r.status === "timeout" ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                        <span className={`w-2 h-2 rounded-full ${r.status === "alive" ? "bg-green-400" : r.status === "timeout" ? "bg-yellow-400" : "bg-red-400"}`} />
                        <span className="truncate flex-1">{r.proxy.replace(/\/\/.*@/, "//***@")}</span>
                        {r.status === "alive" && <span className="text-green-300">{r.latency}ms</span>}
                        {r.status === "alive" && r.ip && <span className="text-muted-foreground">({r.ip})</span>}
                        {r.status === "timeout" && <span>Timeout</span>}
                        {r.status === "dead" && <span>Dead</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleCookieDiagnostic} disabled={isUpdatingCookies}>
                {isUpdatingCookies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                Diagnose
              </Button>
              <Button type="button" onClick={handleCookieUpdateSave} disabled={isUpdatingCookies}>
                {isUpdatingCookies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Validate & Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {/* Alert for expired cookies */}
          {accounts && accounts.some((acc: any) => 
            healthResults[acc.id]?.status === "expired" && (acc.authMode ?? "oauth") === "cookies"
          ) && (
            <Alert className="m-4 border-amber-600/20 bg-amber-600/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-600">Cookie Authentication Expired</AlertTitle>
              <AlertDescription className="text-amber-600/90">
                Some accounts have expired cookies. Click the <RefreshCw className="inline h-3 w-3 mx-1" /> button to update cookies and restore access.
              </AlertDescription>
            </Alert>
          )}

          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[180px]">Account</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Posts</TableHead>
                <TableHead>Proxy</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">Loading accounts...</TableCell>
                </TableRow>
              ) : accounts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">No accounts configured.</TableCell>
                </TableRow>
              ) : (
                accounts?.map((account: any) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium text-primary">
                      @{account.username}
                    </TableCell>
                    <TableCell>
                      <AuthModeBadge mode={(account.authMode ?? "oauth") as "oauth" | "cookies"} />
                    </TableCell>
                    <TableCell>
                      {account.isActive ? (
                        <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {healthResults[account.id] ? (
                        <div className="flex items-center gap-2">
                          <HealthBadge health={healthResults[account.id]} />
                          {healthResults[account.id].status === "expired" && (account.authMode ?? "oauth") === "cookies" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs text-amber-600 border-amber-600/20 hover:bg-amber-600/10"
                              onClick={() => openCookieUpdate(account)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Refresh
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleHealthCheck(account.id)}
                          disabled={healthChecking[account.id]}
                        >
                          {healthChecking[account.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <HeartPulse className="h-3 w-3 mr-1" />}
                          Check
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{account.postsCount}</TableCell>
                    <TableCell>
                      {account.proxyUrl ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {account.proxyUrl.split("\n").filter(Boolean).length} proxy
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Direct</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => handleHealthCheck(account.id)}
                          disabled={healthChecking[account.id]}
                          title="Run health check"
                        >
                          {healthChecking[account.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartPulse className="h-4 w-4" />}
                        </Button>
                        {(account.authMode ?? "oauth") === "cookies" ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-600/10"
                                  onClick={() => openCookieUpdate(account)}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Refresh Cookies</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(account)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(account.id)}>
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
    </div>
  );
}
