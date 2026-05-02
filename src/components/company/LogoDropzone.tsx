"use client";
import * as React from "react";
import { UploadCloud, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/Toast";

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  aspect?: "square" | "wide";
}

export function LogoDropzone({
  value,
  onChange,
  label = "Logo",
  hint = "PNG, JPG, or SVG up to 2 MB",
  aspect = "square",
}: Props) {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    if (!f.type.startsWith("image/")) {
      toast.error("Image files only");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Too large", "Keep it under 2 MB.");
      return;
    }
    const dataUrl = await fileToDataUrl(f);
    onChange(dataUrl);
  }

  return (
    <div>
      <div className="quiet-caps mb-1.5">{label}</div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "rounded-[var(--r-md)] hairline border-dashed cursor-pointer transition-colors overflow-hidden",
          aspect === "square" ? "h-[120px] w-[120px]" : "h-[140px] w-full",
          dragOver
            ? "bg-[color:var(--accent-soft)]/40 border-[color:var(--accent)]/40"
            : "bg-white/40 hover:bg-white/60 border-[color:var(--ink-line)]",
          "relative grid place-items-center group",
        )}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              className="h-full w-full object-contain"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              aria-label="Remove image"
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-white/90 grid place-items-center text-[color:var(--ink-muted)] hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity hairline"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <div className="text-center px-3">
            <UploadCloud className="h-4 w-4 text-[color:var(--ink-muted)] mx-auto mb-1.5" />
            <div className="text-[11px] font-medium text-[color:var(--ink)]">
              Drop or click
            </div>
            <div className="text-[10px] text-[color:var(--ink-muted)] mt-0.5">{hint}</div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
