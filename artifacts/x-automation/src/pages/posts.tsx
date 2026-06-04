import { useState } from "react";
import { useListPosts, useDeletePost, useUpdatePost, getListPostsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Edit2, ExternalLink, CalendarClock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const postSchema = z.object({
  content: z.string().min(1, "Content is required"),
  insertLink: z.string().optional().nullable(),
  scheduledAt: z.string(),
});

export default function Posts() {
  const { data: posts, isLoading } = useListPosts();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof postSchema>>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: "",
      insertLink: "",
      scheduledAt: "",
    },
  });

  const onSubmit = (data: z.infer<typeof postSchema>) => {
    if (editingId) {
      updatePost.mutate(
        { id: editingId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            setIsOpen(false);
            setEditingId(null);
            toast({ title: "Post updated" });
          },
          onError: () => toast({ title: "Error", description: "Failed to update post.", variant: "destructive" })
        }
      );
    }
  };

  const handleEdit = (post: any) => {
    // Only allow editing pending posts
    if (post.status !== 'pending') return;
    
    // Format date for datetime-local input
    let formattedDate = "";
    if (post.scheduledAt) {
      const date = new Date(post.scheduledAt);
      formattedDate = date.toISOString().slice(0, 16); // YYYY-MM-DDThh:mm
    }
    
    form.reset({
      content: post.content,
      insertLink: post.insertLink || "",
      scheduledAt: formattedDate,
    });
    setEditingId(post.id);
    setIsOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this scheduled post?")) {
      deletePost.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
            toast({ title: "Post deleted" });
          },
          onError: () => toast({ title: "Error", description: "Failed to delete post.", variant: "destructive" })
        }
      );
    }
  };

  const handleDeleteAll = async () => {
    const total = posts?.length ?? 0;
    if (total === 0) return;

    const confirmed = confirm(`Hapus semua ${total} scheduled post? Tindakan ini tidak bisa dibatalkan.`);
    if (!confirmed) return;

    setIsDeletingAll(true);
    try {
      const response = await fetch("/api/posts", { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to delete all posts.");
      }
      const payload = await response.json().catch(() => ({ deleted: total })) as { deleted?: number };
      queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      toast({ title: "All posts deleted", description: `${payload.deleted ?? total} post(s) removed from queue.` });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete all posts.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'posted': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'pending': return <CalendarClock className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Scheduled Posts</h2>
        <Button
          variant="destructive"
          onClick={handleDeleteAll}
          disabled={isDeletingAll || isLoading || (posts?.length ?? 0) === 0}
          className="gap-2"
        >
          {isDeletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete All Posts
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-primary border-b border-border pb-2">Edit Scheduled Post</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea className="h-32" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insertLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updatePost.isPending}>Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="w-1/2">Content</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Loading queue...</TableCell>
                </TableRow>
              ) : posts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Post queue is empty.</TableCell>
                </TableRow>
              ) : (
                posts?.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium text-primary whitespace-nowrap">
                      @{post.accountUsername}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md">
                        <p className="text-sm truncate">{post.content}</p>
                        {post.insertLink && (
                          <a href={post.insertLink} target="_blank" rel="noreferrer" className="text-xs text-primary/70 hover:underline inline-flex items-center gap-1 mt-1">
                            <ExternalLink className="h-3 w-3" /> {new URL(post.insertLink).hostname}
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(post.scheduledAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {getStatusIcon(post.status)}
                        <span className="text-xs uppercase tracking-wider">{post.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {post.status === 'pending' && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(post)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        {post.xPostId && (
                          <a href={`https://x.com/${post.accountUsername}/status/${post.xPostId}`} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" className="text-primary hover:text-primary hover:bg-primary/10">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(post.id)}>
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
