"use client";

// A full-text popover for a clipped line name.
//
// Real product names run past a ledger column ("BEHR Premium 1 gal. #ST-533
// Cedar Naturaltone Semi-Transparent…") and the native `title` tooltip takes a
// second to appear, renders in OS chrome and cannot be styled. This one shows
// the whole string next to the cursor as soon as the pointer rests on the
// field, follows the pointer, and disappears on leave. It renders only when
// the text actually overflows, so a short name gets no popup at all.
//
// Portalled to <body> and positioned in viewport pixels divided by the shell's
// `zoom` (see blueprint-select.tsx for why). Styled inline on purpose — it is
// shared by three pages with three different CSS modules, and the tooltip is
// the same drawn plate on all of them.

import {
  cloneElement,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

type HoverProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseMove?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
};

type Props = {
  /** The full text. */
  text: string;
  /** The single element that clips it; receives the mouse handlers. */
  children: ReactElement<HoverProps>;
  /** Show even when the text fits (default: only when it overflows). */
  always?: boolean;
};

const PLATE: CSSProperties = {
  position: "fixed",
  zIndex: 80,
  maxWidth: 420,
  padding: "7px 10px",
  border: "1.5px solid #0a0a0a",
  borderRadius: 3,
  background: "#ffffff",
  boxShadow: "3px 3px 0 rgba(10,10,10,.14)",
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.4,
  color: "#0a0a0a",
  pointerEvents: "none",
  whiteSpace: "normal",
  wordBreak: "break-word",
};

function clips(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1;
}

export function HoverTitle({ text, children, always }: Props) {
  // The shell's zoom rides with the position so render never reads a ref.
  const [pos, setPos] = useState<{ x: number; y: number; zoom: number } | null>(null);

  const place = useCallback((e: MouseEvent<HTMLElement>) => {
    const shell = e.currentTarget.closest<HTMLElement>(".jf-blueprint");
    const zoom = (shell && parseFloat(getComputedStyle(shell).zoom)) || 1;
    setPos({ x: e.clientX / zoom + 14, y: e.clientY / zoom + 16, zoom });
  }, []);

  const onEnter = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (!text.trim()) return;
      if (!always && !clips(e.currentTarget)) return;
      place(e);
    },
    [always, place, text],
  );

  // Scrolling under a resting pointer would leave the plate behind.
  useEffect(() => {
    if (!pos) return;
    const off = () => setPos(null);
    window.addEventListener("scroll", off, true);
    return () => window.removeEventListener("scroll", off, true);
  }, [pos]);

  const own = children.props;
  const field = cloneElement(children, {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      own.onMouseEnter?.(e);
      onEnter(e);
    },
    onMouseMove: (e: MouseEvent<HTMLElement>) => {
      own.onMouseMove?.(e);
      if (pos) place(e);
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      own.onMouseLeave?.(e);
      setPos(null);
    },
  });

  // Keep the plate inside the viewport: flip to the other side of the cursor
  // near an edge.
  let style: CSSProperties = PLATE;
  if (pos && typeof window !== "undefined") {
    const vw = window.innerWidth / pos.zoom;
    const vh = window.innerHeight / pos.zoom;
    const flipX = pos.x + 420 > vw;
    const flipY = pos.y + 90 > vh;
    style = {
      ...PLATE,
      left: flipX ? undefined : pos.x,
      right: flipX ? Math.max(8, vw - pos.x + 14) : undefined,
      top: flipY ? undefined : pos.y,
      bottom: flipY ? Math.max(8, vh - pos.y + 16) : undefined,
    };
  }

  return (
    <>
      {field}
      {pos &&
        text.trim() &&
        createPortal(
          <div role="tooltip" style={style}>
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
