"use client";
import * as React from "react";
import { Package } from "lucide-react";

/**
 * Product thumbnail with graceful fallback. SerpAPI / placehold.co thumbnails
 * are arbitrary external URLs, so we use a plain <img> (avoids next/image
 * remotePatterns config) and fall back to a neutral icon when the URL is
 * missing OR fails to load.
 */
export function MaterialThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  const show = Boolean(src) && !failed;

  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[var(--r-md)] bg-[color:var(--paper-deep)] hairline">
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="h-5 w-5 text-[color:var(--ink-faint)]" aria-hidden />
      )}
    </div>
  );
}
