import { useState } from "react";
import { Captions, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SmartCaptionMatch {
  videoId: string | number;
  videoTitle: string;
  fileName: string;
  format?: string;
  filePath?: string;
  lang?: string;
}

export function SmartCaptionsModal({
  open,
  onOpenChange,
  language,
  languageName,
  matches,
  onBatchImported,
  onLocalBatchApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
  languageName?: string | undefined;
  matches: SmartCaptionMatch[];
  onBatchImported?: (count: number) => void;
  onLocalBatchApply?: (matches: SmartCaptionMatch[]) => Promise<void> | void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (matches.length === 0) return null;

  const displayLang = languageName || language.toUpperCase() || "Captions";

  const handleApplyAll = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const hasServerPaths = matches.some((m) => Boolean(m.filePath));
      if (hasServerPaths) {
        const res = await fetch(apiUrl("/api/transcripts/batch-apply"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matches }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          count?: number;
          updatedVideoIds?: Array<string | number>;
        };
        if (!res.ok || !data.success) {
          throw new Error("Failed to batch import captions");
        }
        window.dispatchEvent(
          new CustomEvent("tutin:transcript-updated", {
            detail: {
              lang: language,
              updatedVideoIds: data.updatedVideoIds ?? matches.map((m) => m.videoId),
            },
          }),
        );
        const appliedCount = data.count ?? matches.length;
        onBatchImported?.(appliedCount);
        toast.success(`Imported ${appliedCount} ${displayLang} caption files`);
        onOpenChange(false);
        return;
      }

      if (onLocalBatchApply) {
        await onLocalBatchApply(matches);
      }
      window.dispatchEvent(
        new CustomEvent("tutin:transcript-updated", {
          detail: {
            lang: language,
            updatedVideoIds: matches.map((m) => m.videoId),
          },
        }),
      );
      onBatchImported?.(matches.length);
      toast.success(`Imported ${matches.length} ${displayLang} caption files`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to import matching captions");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col gap-0 overflow-hidden rounded-xl border-0 bg-background p-0 shadow-workspace sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-4 pr-12 text-left">
          <div className="flex items-center gap-2">
            <Captions className="size-4 shrink-0 text-muted-foreground" />
            <DialogTitle className="text-base font-semibold">Smart caption import</DialogTitle>
            <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {displayLang}
            </span>
          </div>
          <DialogDescription className="pt-0.5 text-xs text-muted-foreground">
            {matches.length} matching {displayLang} file{matches.length === 1 ? "" : "s"} found in
            course
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-medium text-muted-foreground">
            <span>Matched lessons ({matches.length})</span>
            <span className="font-mono uppercase text-[11px]">{language}</span>
          </div>

          <div className="divide-y divide-border/50 rounded-lg border border-border/50 bg-secondary/20">
            {matches.map((match, idx) => (
              <div
                key={`${String(match.videoId)}-${idx}`}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{match.videoTitle}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {match.fileName}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {match.format || "SRT"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 bg-shell/40 px-6 py-3.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground"
          >
            Skip
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isSubmitting}
            onClick={() => void handleApplyAll()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                Import all ({matches.length})
              </>
            )}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

