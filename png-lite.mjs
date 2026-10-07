/** 8-bit gray/RGB/RGBA PNG decode. No palette, no 16-bit. zlib only. */

import { inflateSync } from "node:zlib";

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(filter, row, prev, bpp) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const x = row[i];
    const a = i >= bpp ? out[i - bpp] : 0;
    const b = prev[i] || 0;
    const c = i >= bpp ? prev[i - bpp] || 0 : 0;
    let v = x;
    if (filter === 1) v = (x + a) & 255;
    else if (filter === 2) v = (x + b) & 255;
    else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
    else if (filter === 4) v = (x + paeth(a, b, c)) & 255;
    else if (filter !== 0) throw new Error(`png filter ${filter}`);
    out[i] = v;
  }
  return out;
}

export function decodePng(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error("not png");
  let o = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let color = 0;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o);
    o += 4;
    const typ = buf.toString("ascii", o, o + 4);
    o += 4;
    if (o + len + 4 > buf.length) break;
    const chunk = buf.subarray(o, o + len);
    o += len + 4;
    if (typ === "IHDR") {
      w = chunk.readUInt32BE(0);
      h = chunk.readUInt32BE(4);
      depth = chunk[8];
      color = chunk[9];
    } else if (typ === "IDAT") idat.push(chunk);
    else if (typ === "IEND") break;
  }
  const bpp = color === 6 ? 4 : color === 2 ? 3 : color === 0 ? 1 : 0;
  if (!w || !h || depth !== 8 || !bpp) throw new Error(`png fmt ${w}x${h} d${depth} c${color}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rgba = Buffer.alloc(w * h * 4);
  let i = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[i];
    i += 1;
    const row = unfilter(filter, raw.subarray(i, i + stride), prev, bpp);
    i += stride;
    prev = row;
    for (let x = 0; x < w; x += 1) {
      const s = x * bpp;
      const d = (y * w + x) * 4;
      if (bpp === 1) {
        rgba[d] = rgba[d + 1] = rgba[d + 2] = row[s];
        rgba[d + 3] = 255;
      } else {
        rgba[d] = row[s];
        rgba[d + 1] = row[s + 1];
        rgba[d + 2] = row[s + 2];
        rgba[d + 3] = bpp === 4 ? row[s + 3] : 255;
      }
    }
  }
  return { w, h, rgba };
}

export function pngPixel(img, x, y) {
  const i = (y * img.w + x) * 4;
  return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
}
