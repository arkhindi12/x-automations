import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Video,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  MousePointerClick,
  Copy,
  Check,
  Code
} from "lucide-react";
import {
  useListEmbeds,
  useCreateEmbed,
  useUpdateEmbed,
  useDeleteEmbed,
  getListEmbedsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const embedSchema = z.object({
  title: z.string().optional(),
  doodUrl: z.string().min(1, "DoodStream URL is required"),
  customLink: z.string().min(1, "Custom Link is required"),
  popupDelay: z.coerce.number().min(0).default(0),
  popupInterval: z.coerce.number().min(0).default(180),
  popupOnClick: z.boolean().default(true),
});

type EmbedFormValues = z.infer<typeof embedSchema>;

export default function Embeds() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: embeds, isLoading } = useListEmbeds();

  const createEmbed = useCreateEmbed();
  const updateEmbed = useUpdateEmbed();
  const deleteEmbed = useDeleteEmbed();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmbedId, setEditingEmbedId] = useState<number | null>(null);
  const [deleteEmbedId, setDeleteEmbedId] = useState<number | null>(null);
  
  const [successData, setSuccessData] = useState<{ embedUrl: string; redirectUrl: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const form = useForm<EmbedFormValues>({
    resolver: zodResolver(embedSchema),
    defaultValues: {
      title: "",
      doodUrl: "",
      customLink: "",
      popupDelay: 0,
      popupInterval: 180,
      popupOnClick: true,
    },
  });

  const openCreateDialog = () => {
    setEditingEmbedId(null);
    setSuccessData(null);
    form.reset({
      title: "",
      doodUrl: "",
      customLink: "",
      popupDelay: 0,
      popupInterval: 180,
      popupOnClick: true,
    });
    setIsFormOpen(true);
  };

  const openEditDialog = (embed: any) => {
    setEditingEmbedId(embed.id);
    setSuccessData(null);
    form.reset({
      title: embed.title || "",
      doodUrl: embed.doodUrl,
      customLink: embed.customLink,
      popupDelay: embed.popupDelay,
      popupInterval: embed.popupInterval,
      popupOnClick: embed.popupOnClick === 1,
    });
    setIsFormOpen(true);
  };

  const onSubmit = (values: EmbedFormValues) => {
    const apiData = {
      ...values,
      popupOnClick: values.popupOnClick ? 1 : 0,
    };

    if (editingEmbedId) {
      updateEmbed.mutate(
        { id: editingEmbedId, data: apiData },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListEmbedsQueryKey() });
            toast({ title: "Embed updated successfully" });
            setIsFormOpen(false);
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Error updating embed",
              description: error.message || "Something went wrong",
            });
          },
        }
      );
    } else {
      createEmbed.mutate(
        { data: apiData },
        {
          onSuccess: (newEmbed) => {
            queryClient.invalidateQueries({ queryKey: getListEmbedsQueryKey() });
            toast({ title: "Embed created successfully" });
            setSuccessData({
              embedUrl: newEmbed.embedUrl,
              redirectUrl: newEmbed.redirectUrl,
            });
            setIsFormOpen(false);
          },
          onError: (error) => {
            toast({
              variant: "destructive",
              title: "Error creating embed",
              description: error.message || "Something went wrong",
            });
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteEmbedId) return;

    deleteEmbed.mutate(
      { id: deleteEmbedId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmbedsQueryKey() });
          toast({ title: "Embed deleted successfully" });
          setDeleteEmbedId(null);
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error deleting embed",
            description: error.message || "Something went wrong",
          });
          setDeleteEmbedId(null);
        },
      }
    );
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="flex flex-col h-full gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono text-primary flex items-center gap-2">
            <Video className="w-6 h-6" />
            VIDEO EMBEDS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your DoodStream video embeds and custom redirects.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="font-mono">
          <Plus className="w-4 h-4 mr-2" />
          CREATE EMBED
        </Button>
      </div>

      {successData && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-primary font-mono text-lg">EMBED CREATED</h3>
                  <p className="text-sm text-muted-foreground">Your links are ready to share.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSuccessData(null)}>
                Dismiss
              </Button>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Share this in tweets</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={successData.embedUrl} className="font-mono text-xs bg-black/50 border-primary/30 text-primary" />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => handleCopy(successData.embedUrl, 'embed')}
                    className="shrink-0 border-primary/30 hover:bg-primary/20 hover:text-primary"
                  >
                    {copiedField === 'embed' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Direct redirect to your custom link</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={successData.redirectUrl} className="font-mono text-xs bg-black/50" />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => handleCopy(successData.redirectUrl, 'redirect')}
                    className="shrink-0"
                  >
                    {copiedField === 'redirect' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="flex-1">
        <div className="rounded-md border border-card-border relative overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-mono text-xs w-[100px]">CODE</TableHead>
                <TableHead className="font-mono text-xs">TITLE</TableHead>
                <TableHead className="font-mono text-xs max-w-[200px]">DOODSTREAM</TableHead>
                <TableHead className="font-mono text-xs max-w-[200px]">CUSTOM LINK</TableHead>
                <TableHead className="font-mono text-xs text-right">STATS</TableHead>
                <TableHead className="font-mono text-xs w-[150px]">LINKS</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : embeds?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground font-mono">
                    No embeds found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                embeds?.map((embed) => (
                  <TableRow key={embed.id}>
                    <TableCell className="font-mono text-xs text-primary">{embed.code}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate" title={embed.title || "Untitled"}>
                      {embed.title || <span className="text-muted-foreground italic">Untitled</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={embed.doodUrl}>
                      {embed.doodUrl}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={embed.customLink}>
                      {embed.customLink}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-3 text-xs font-mono">
                        <div className="flex items-center gap-1 text-muted-foreground" title="Views">
                          <Eye className="w-3 h-3" /> {embed.views}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground" title="Clicks">
                          <MousePointerClick className="w-3 h-3" /> {embed.clicks}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => handleCopy(embed.embedUrl, `embed-${embed.id}`)}
                          title="Copy Embed URL"
                        >
                          {copiedField === `embed-${embed.id}` ? <Check className="w-4 h-4" /> : <Code className="w-4 h-4" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => handleCopy(embed.redirectUrl, `redirect-${embed.id}`)}
                          title="Copy Redirect URL"
                        >
                          {copiedField === `redirect-${embed.id}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="font-mono text-xs">
                          <DropdownMenuItem onClick={() => openEditDialog(embed)}>
                            <Pencil className="h-3 w-3 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeleteEmbedId(embed.id)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px] border-card-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary flex items-center gap-2">
              <Video className="w-5 h-5" />
              {editingEmbedId ? "EDIT EMBED" : "CREATE EMBED"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Configure how your DoodStream video appears and redirects.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs">TITLE (OPTIONAL)</FormLabel>
                    <FormControl>
                      <Input placeholder="Internal name for this embed" {...field} className="font-mono text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="doodUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-primary">DOODSTREAM URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://dood.stream/d/..." {...field} className="font-mono text-sm border-primary/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-primary">CUSTOM LINK</FormLabel>
                    <FormControl>
                      <Input placeholder="https://your-affiliate-link.com" {...field} className="font-mono text-sm border-primary/50" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      The URL users will be redirected to.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="popupDelay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs">POPUP DELAY (SEC)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} className="font-mono text-sm" />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        0 = show on first click
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="popupInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs">REPEAT INTERVAL (SEC)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} className="font-mono text-sm" />
                      </FormControl>
                      <FormDescription className="text-[10px]">
                        Default 180 (3 mins)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="popupOnClick"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-card-border p-4 bg-muted/20">
                    <div className="space-y-0.5">
                      <FormLabel className="font-mono text-sm">REDIRECT ON CLICK</FormLabel>
                      <FormDescription className="text-xs">
                        Clicking the video opens your custom link. If off, it acts as a popup.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsFormOpen(false)}
                  className="font-mono"
                >
                  CANCEL
                </Button>
                <Button 
                  type="submit" 
                  disabled={createEmbed.isPending || updateEmbed.isPending}
                  className="font-mono"
                >
                  {createEmbed.isPending || updateEmbed.isPending ? "SAVING..." : "SAVE EMBED"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEmbedId} onOpenChange={() => setDeleteEmbedId(null)}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              DELETE EMBED?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-sm">
              This action cannot be undone. All stats and redirect configurations will be permanently removed.
              Any existing links to this embed will break.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono">CANCEL</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={deleteEmbed.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono"
            >
              {deleteEmbed.isPending ? "DELETING..." : "DELETE"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
