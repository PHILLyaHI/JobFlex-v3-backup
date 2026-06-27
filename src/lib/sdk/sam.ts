// SAM 2 image segmentation via fal.ai (model `fal-ai/sam2/image`). Reuses the
// existing fal client + FAL_KEY gate. Given an image and point prompt(s), returns
// the URL of the mask-applied PNG (the segmented region opaque, the rest cleared)
// which the client vectorises into a boundary polyline.
import { getFal, isFalEnabled } from "./falAi";

export const isSamEnabled = isFalEnabled;

export interface SamPoint {
  x: number; // pixel X in the source image
  y: number; // pixel Y in the source image
  label?: 0 | 1; // 1 = foreground (keep), 0 = background. Default 1.
}

export async function segmentImage(imageUrl: string, points: SamPoint[]): Promise<string | null> {
  const fal = await getFal();
  const result = await fal.subscribe("fal-ai/sam2/image", {
    input: {
      image_url: imageUrl,
      prompts: points.map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        // fal's TS types declare label as "0"|"1" (string), but the deployed model
        // validates a NUMBER 0|1 (string is rejected 422). Send the number and cast
        // past the incorrect type.
        label: (p.label ?? 1) as unknown as "0" | "1",
      })),
      apply_mask: true,
      output_format: "png",
    },
  });
  const data = result?.data as { image?: { url?: string } } | undefined;
  return data?.image?.url ?? null;
}
