import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function PostPreview() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-black text-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border bg-card/60">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-primary">Target Grab Example</h2>
              <Badge variant="outline">Source</Badge>
            </div>
            <div className="aspect-video rounded-lg border border-border bg-gradient-to-br from-zinc-800 to-zinc-700 flex items-center justify-center text-zinc-500 text-sm">Sample Image</div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sistem mengambil gambar dari sumber ini, lalu memasangkannya dengan link video hasil upload DoodStream dari sumber yang sama.
            </p>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-zinc-800 bg-black">
          <div className="border-b border-zinc-800 px-5 py-4">
            <div className="text-xl font-bold">Post</div>
          </div>
          <div className="flex gap-3 px-5 py-5">
            <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-amber-200 via-rose-300 to-sky-300" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[15px]">
                <span className="font-bold">Auto Repost Bot</span>
                <span className="text-zinc-500">@youraccount · now</span>
              </div>
              <div className="mt-1 whitespace-pre-line text-[15px] leading-5 text-zinc-100">
                Lagi tidur di bangunin
                {"\n"}dood.stream/d/8x7k2example
                {"\n"}Miss embrew
                {"\n"}dood.stream/d/4p9q1example
              </div>
              <div className="mt-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
                Link di teks = hasil upload DoodStream. Gambar di bawah = attachment besar yang di-upload ulang ke X.
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-700">
                <div className="relative aspect-[16/9] bg-gradient-to-br from-cyan-300 via-blue-500 to-fuchsia-500">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,.75),transparent_22%),radial-gradient(circle_at_72%_60%,rgba(255,255,255,.38),transparent_30%)]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5">
                    <div className="text-lg font-black tracking-tight">Gambar dari Media Library</div>
                    <div className="text-sm text-white/80">Dipairing dari sourceTweetId yang sama dengan link DoodStream di teks.</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 text-sm text-zinc-500">
                <span>💬 18</span>
                <span>↻ 128</span>
                <span>♡ 3K</span>
                <span>↗</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}