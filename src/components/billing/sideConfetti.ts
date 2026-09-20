// THE ACTIVATION CONFETTI — two cannons, one from each side edge, the way
// canvas-confetti's "School Pride" demo and Magic UI's "Side Cannons" do it:
// the left cannon fires at 60° (up and inward), the right at 120°, both from
// the lower third of the side edges, and the pieces cross the page, stall, and
// settle. Squares and narrow slips only — the drawing-office's paper cuttings,
// no circles, no stars, no emoji — in the page's own colours, read from its
// tokens at the moment of firing (--blueprint, --sky, --ink, --paper-deep).
//
// The library (canvas-confetti, ISC) is loaded with a dynamic import in the
// one function that fires, so its ~25 KB reaches the browser only on the three
// screens where a plan actually turns on, and only at that moment. Its canvas
// is `position: fixed; top/left 0; pointer-events: none`, sized to the
// document's client box (no horizontal overflow), and removed when the last
// piece lands — the page stays clickable throughout. Under
// prefers-reduced-motion nothing is imported and nothing is drawn.

export type ConfettiPreset = "light" | "medium" | "heavy";

/** Structural twin of the library's path shape (what shapeFromPath returns),
 *  written out so the size is fixed here and the browser never has to scan a
 *  1000×1000 grid to find the path's box. Matrix: [a, b, c, d, e, f]. */
type PathShape = { type: "path"; path: string; matrix: number[] };

/** A 10×10 square and a 12×4 slip, centred on the particle. */
const SQUARE: PathShape = { type: "path", path: "M0 0h10v10H0z", matrix: [1, 0, 0, 1, -5, -5] };
const SLIP: PathShape = { type: "path", path: "M0 0h12v4H0z", matrix: [1, 0, 0, 1, -6, -2] };

/** Token fallbacks — the values in globals.css and the dashboard scope. */
const FALLBACK: Record<string, string> = {
  "--blueprint": "#1854a0",
  "--sky": "#4a9eff",
  "--ink": "#0a0a0a",
  "--paper-deep": "#ffffff",
};

/** The palette, read off `from` (an element inside the page's token scope);
 *  blueprint twice so the page's own blue leads. */
function palette(from: Element | null): string[] {
  const cs = from ? getComputedStyle(from) : null;
  const read = (name: string) => cs?.getPropertyValue(name).trim() || FALLBACK[name];
  const blueprint = read("--blueprint");
  return [blueprint, blueprint, read("--sky"), read("--ink"), read("--paper-deep")];
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One volley from each side. `count` is per side; `lift` is the launch speed;
 *  `y` is where on the side edge it leaves (0 top … 1 bottom). */
type Volley = { count: number; lift: number; spread: number; ticks: number; y: number };

/** The three presets, per side, desktop numbers (a handheld gets ~55%). */
const PRESETS: Record<ConfettiPreset, { volleys: Volley[]; gapMs: number }> = {
  // One volley each side, ~1.5 s.
  light: {
    volleys: [{ count: 70, lift: 52, spread: 55, ticks: 90, y: 0.74 }],
    gapMs: 0,
  },
  // Two volleys with a 250 ms pause, ~2.5 s.
  medium: {
    volleys: [
      { count: 60, lift: 56, spread: 55, ticks: 130, y: 0.76 },
      { count: 60, lift: 60, spread: 58, ticks: 130, y: 0.72 },
    ],
    gapMs: 250,
  },
  // A series over ~1.1 s, denser and higher, ~3 s in all.
  heavy: {
    volleys: Array.from({ length: 12 }, (_, i) => ({
      count: 24,
      lift: 66 + (i % 3) * 4,
      spread: 60,
      ticks: 120,
      y: 0.78 - (i % 4) * 0.02,
    })),
    gapMs: 95,
  },
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fire the side cannons. Resolves when the last piece has landed. Does nothing
 * (and loads nothing) under prefers-reduced-motion or on the server.
 * `from` is any element inside the page's token scope, for the colours.
 */
export async function fireSideConfetti(preset: ConfettiPreset, from: Element | null): Promise<void> {
  if (typeof window === "undefined" || reducedMotion()) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = palette(from);
  // A phone gets fewer, slightly slower pieces: less to draw per frame, and
  // 60° across 390 px would otherwise cross the whole screen at once.
  const handheld = window.innerWidth <= 768;
  const density = handheld ? 0.55 : 1;
  const speed = handheld ? 0.85 : 1;
  const shapes = [SQUARE, SQUARE, SLIP] as unknown as import("canvas-confetti").Shape[];
  const { volleys, gapMs } = PRESETS[preset];
  const flights: Promise<unknown>[] = [];
  for (let i = 0; i < volleys.length; i++) {
    const v = volleys[i];
    const common = {
      particleCount: Math.round(v.count * density),
      spread: v.spread,
      startVelocity: v.lift * speed,
      decay: 0.91,
      gravity: 1.05,
      ticks: v.ticks,
      scalar: handheld ? 0.85 : 1,
      colors,
      shapes,
      zIndex: 150,
      disableForReducedMotion: true,
    };
    flights.push(
      confetti({ ...common, angle: 60, drift: 0.3, origin: { x: 0, y: v.y } }) ?? Promise.resolve(),
      confetti({ ...common, angle: 120, drift: -0.3, origin: { x: 1, y: v.y } }) ?? Promise.resolve(),
    );
    if (i < volleys.length - 1 && gapMs) await wait(gapMs);
  }
  await Promise.all(flights);
}
