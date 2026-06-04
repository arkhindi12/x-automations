import sharp, { type OverlayOptions } from "sharp";

type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

type WatermarkOptions = {
  type: "text" | "logo";
  text?: string | null;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  opacity?: number;
  position?: string;
  logoUrl?: string | null;
};

function hexToRgba(hex: string, opacity: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function getGravity(position: string): { gravity: string; top?: number; left?: number } {
  switch (position as WatermarkPosition) {
    case "top-left": return { gravity: "northwest" };
    case "top-right": return { gravity: "northeast" };
    case "bottom-left": return { gravity: "southwest" };
    case "bottom-right": return { gravity: "southeast" };
    case "center": return { gravity: "center" };
    default: return { gravity: "southeast" };
  }
}

async function buildTextOverlay(
  imageWidth: number,
  imageHeight: number,
  text: string,
  fontSize: number,
  fontWeight: string,
  color: string,
  opacity: number,
  position: string,
): Promise<Buffer> {
  const padding = Math.round(fontSize * 0.6);
  const estimatedWidth = Math.min(text.length * fontSize * 0.62 + padding * 2, imageWidth - padding * 2);
  const svgWidth = Math.max(estimatedWidth, fontSize * 2);
  const svgHeight = fontSize + padding * 2;

  const isBold = fontWeight === "bold";
  const fill = hexToRgba(color, opacity);

  const svgText = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
      <style>
        text {
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${fontSize}px;
          font-weight: ${isBold ? "bold" : "normal"};
          fill: ${fill};
        }
      </style>
      <text x="${padding}" y="${fontSize + Math.round(padding * 0.4)}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
    </svg>`;

  return Buffer.from(svgText);
}

async function buildLogoOverlay(logoUrl: string, maxSize: number, opacity: number): Promise<Buffer> {
  const response = await fetch(logoUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Logo fetch failed: HTTP ${response.status}`);
  const logoBuffer = Buffer.from(await response.arrayBuffer());

  return sharp(logoBuffer)
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .modulate({ lightness: 0 })
    .linear(1, 0)
    .composite([{
      input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: "dest-in",
    }])
    .png()
    .toBuffer()
    .catch(() => {
      return sharp(logoBuffer)
        .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    });
}

export async function applyWatermark(
  imageBuffer: Buffer,
  contentType: string,
  options: WatermarkOptions,
): Promise<{ buffer: Buffer; contentType: string }> {
  const {
    type = "text",
    text,
    fontSize = 24,
    fontWeight = "bold",
    color = "#ffffff",
    opacity = 0.8,
    position = "bottom-right",
    logoUrl,
  } = options;

  const image = sharp(imageBuffer);
  const meta = await image.metadata();
  const imgWidth = meta.width ?? 800;
  const imgHeight = meta.height ?? 600;

  const gravity = getGravity(position);
  const overlayPadding = Math.round(fontSize * 0.8);

  let overlayBuffer: Buffer;

  if (type === "logo" && logoUrl) {
    const maxLogoSize = Math.round(Math.min(imgWidth, imgHeight) * 0.2);
    overlayBuffer = await buildLogoOverlay(logoUrl, maxLogoSize, opacity);
  } else if (type === "text" && text) {
    overlayBuffer = await buildTextOverlay(imgWidth, imgHeight, text, fontSize, fontWeight, color, opacity, position);
  } else {
    return { buffer: imageBuffer, contentType };
  }

  const outputBuffer = await sharp(imageBuffer)
    .composite([{
      input: overlayBuffer,
      gravity: gravity.gravity,
      top: gravity.top,
      left: gravity.left,
      blend: "over",
    } as OverlayOptions])
    .toBuffer();

  return { buffer: outputBuffer, contentType: "image/png" };
}
