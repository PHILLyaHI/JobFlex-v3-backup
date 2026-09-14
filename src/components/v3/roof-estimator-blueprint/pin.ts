// The one map pin of the roof estimator, in the house colours: blueprint
// fill, ink frame, a white eye. Used three ways — as inline SVG over the
// static satellite photo (rf-pin-center), and as the Marker icon on the two
// live Google maps (the report viewer, the intake's pin preview). One path,
// so the three read as the same drawn object.

/** 24×24 viewBox; the tip is at (12, 22). */
export const PIN_PATH = "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z";

/** google.maps.Point — read off the global namespace, like Marker. */
export type PointCtor = new (x: number, y: number) => unknown;

/** A google.maps Symbol for the classic Marker. The anchor needs a real
 *  Point; without the constructor the tip would sit off the coordinate, so
 *  the caller falls back to Google's own marker (icon undefined). */
export function blueprintPinIcon(Point: PointCtor | null | undefined): Record<string, unknown> | undefined {
  if (!Point) return undefined;
  const scale = 1.55;
  return {
    path: PIN_PATH,
    fillColor: "#1854a0",
    fillOpacity: 1,
    strokeColor: "#0a0a0a",
    strokeWeight: 1.5,
    scale,
    anchor: new Point(12, 22),
  };
}
