import { useState } from "react";
import { useListTargets, useCreateTarget, useDeleteTarget, getListTargetsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const targetSchema = z.object({
  xUsername: z.string().min(1, "Target username is required").transform(v => v.replace(/^@/, '')),
});

type TargetFormValues = z.infer<typeof targetSchema>;

export default function Targets() {
  const { data: targets, isLoading } = useListTargets();
  const createTarget = useCreateTarget();
  const deleteTarget = useDeleteTarget();
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<TargetFormValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: {
      xUsername: "",
    },
  });

  const onSubmit = (data: TargetFormValues) => {
    createTarget.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
          setIsOpen(false);
          form.reset();
          toast({ title: "Target added", description: "Now monitoring target profile." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add target.", variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to stop monitoring this target?")) {
      deleteTarget.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
            toast({ title: "Target deleted" });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to delete target.", variant: "destructive" });
          }
        }
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight uppercase border-l-4 border-primary pl-4">Target Profiles</h2>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="uppercase font-mono tracking-wider text-xs">
              <Plus className="mr-2 h-4 w-4" /> Add Target
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-primary border-b border-border pb-2">
                Add Target Profile
              </DialogTitle>
              <DialogDescription>
                Enter the X.com username to monitor and grab media from.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="xUsername"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <span className="flex items-center justify-center bg-muted border border-r-0 border-border h-9 px-3 rounded-l-md text-muted-foreground">@</span>
                          <Input className="rounded-l-none" placeholder="elonmusk" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createTarget.isPending}>Add Target</Button>
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
                <TableHead>Target</TableHead>
                <TableHead>Media Grabbed</TableHead>
                <TableHead>Last Checked</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Loading targets...</TableCell>
                </TableRow>
              ) : targets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No target profiles configured.</TableCell>
                </TableRow>
              ) : (
                targets?.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {target.xUsername.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-primary">@{target.xUsername}</div>
                          {target.displayName && <div className="text-xs text-muted-foreground">{target.displayName}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">{target.mediaCount}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {target.lastChecked ? new Date(target.lastChecked).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(target.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`https://x.com/${target.xUsername}`} target="_blank" rel="noreferrer">
                          <Button variant="ghost" size="icon">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(target.id)}>
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
