import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/**
 * Minimal PNG reader for screenshots the harness produces (8-bit, non-interlaced,
 * grayscale/RGB/RGBA). It exists so capture can reject a blank frame instead of
 * writing it as evidence; it is not a general-purpose decoder.
 */
export interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer: Buffer): DecodedPng {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG file");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }
  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new Error(`unsupported PNG color type ${colorType}`);
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let pos = 0;
  let prev = Buffer.alloc(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[pos] ?? 0;
    pos += 1;
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? (out[i - channels] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= channels ? (prev[i - channels] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = line[i] ?? 0;
          break;
        case 1:
          value = (line[i] ?? 0) + a;
          break;
        case 2:
          value = (line[i] ?? 0) + b;
          break;
        case 3:
          value = (line[i] ?? 0) + ((a + b) >> 1);
          break;
        case 4:
          value = (line[i] ?? 0) + paeth(a, b, c);
          break;
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      out[i] = value & 0xff;
    }
    out.copy(pixels, row * stride);
    prev = out;
  }
  return { width, height, channels, pixels };
}

/**
 * True when the image is effectively one color, i.e. a blank/failed capture.
 * `pixelTolerance` absorbs compression noise; `maxDeviating` is the absolute number
 * of pixels allowed to differ before the frame stops counting as blank.
 */
export function isBlankImage(
  path: string,
  options: { pixelTolerance?: number; maxDeviating?: number } = {},
): boolean {
  const tolerance = options.pixelTolerance ?? 6;
  const maxDeviating = options.maxDeviating ?? 256;
  const { width, height, channels, pixels } = decodePng(readFileSync(path));
  if (width === 0 || height === 0) return true;
  const first = pixels.subarray(0, channels);
  let deviating = 0;
  for (let i = 0; i < width * height; i += 1) {
    const base = i * channels;
    let differs = false;
    for (let c = 0; c < channels; c += 1) {
      if (Math.abs((pixels[base + c] ?? 0) - (first[c] ?? 0)) > tolerance) {
        differs = true;
        break;
      }
    }
    if (differs) {
      deviating += 1;
      if (deviating > maxDeviating) return false;
    }
  }
  return true;
}
