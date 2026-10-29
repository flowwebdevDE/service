/**
 * FlowPDF Engine
 * Full custom, dependency-free PDF writer for browser + modern Node.js.
 * PDF 1.7, A4 layout, WinAnsi text, wrapping, pagination, boxes, tables.
 *
 * No canvas. No HTML printing. No third-party PDF library.
 */

const PT_PER_MM = 72 / 25.4;

const CP1252 = new Map([
  [0x20AC, 0x80],[0x201A,0x82],[0x0192,0x83],[0x201E,0x84],[0x2026,0x85],
  [0x2020,0x86],[0x2021,0x87],[0x02C6,0x88],[0x2030,0x89],[0x0160,0x8A],
  [0x2039,0x8B],[0x0152,0x8C],[0x017D,0x8E],[0x2018,0x91],[0x2019,0x92],
  [0x201C,0x93],[0x201D,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],
  [0x02DC,0x98],[0x2122,0x99],[0x0161,0x9A],[0x203A,0x9B],[0x0153,0x9C],
  [0x017E,0x9E],[0x0178,0x9F]
]);

function mm(v) { return v * PT_PER_MM; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Helvetica/Arial-like visual metrics. PDF text positions use the baseline,
// while layout code usually thinks in visual top/center coordinates.
// Keeping these conversions centralized prevents text from drifting toward
// the bottom edge of cards when font sizes change.
function visualCapHeight(size) { return size * 0.72; }
function visualDescent(size) { return size * 0.20; }
function baselineFromTop(topY, inset, size) {
  return topY - inset - visualCapHeight(size);
}
function centeredBaseline(bottomY, height, size) {
  return bottomY + height / 2 - size * 0.26;
}
function centeredTextBlockFirstBaseline(bottomY, height, size, lineHeight, lineCount) {
  const count = Math.max(1, lineCount || 1);
  const centerY = bottomY + height / 2;
  return centerY + ((count - 1) * lineHeight) / 2 - size * 0.26;
}

function encodeWinAnsi(str) {
  const out = [];
  for (const ch of String(str ?? "")) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7F || (cp >= 0xA0 && cp <= 0xFF)) out.push(cp);
    else if (CP1252.has(cp)) out.push(CP1252.get(cp));
    else out.push(0x3F); // ?
  }
  return Uint8Array.from(out);
}

function pdfLiteral(str) {
  const bytes = encodeWinAnsi(str);
  let s = "(";
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5C) s += "\\" + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7E) s += "\\" + b.toString(8).padStart(3, "0");
    else s += String.fromCharCode(b);
  }
  return s + ")";
}

function concatBytes(parts) {
  const arrays = parts.map(p => typeof p === "string" ? new TextEncoder().encode(p) : p);
  const size = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(size);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function readU32BE(bytes, offset) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

async function inflateZlib(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("PNG-Dekomprimierung wird in dieser Laufzeit nicht unterstützt.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("deflate")
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodePng(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];

  if (
    data.length < 24 ||
    signature.some((value, index) => data[index] !== value)
  ) {
    throw new Error("Logo ist keine gültige PNG-Datei.");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat = [];
  let offset = 8;

  while (offset + 12 <= data.length) {
    const length = readU32BE(data, offset);
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7]
    );
    const start = offset + 8;
    const end = start + length;

    if (end + 4 > data.length) {
      throw new Error("PNG-Datei ist beschädigt.");
    }

    if (type === "IHDR") {
      width = readU32BE(data, start);
      height = readU32BE(data, start + 4);
      bitDepth = data[start + 8];
      colorType = data[start + 9];
      interlace = data[start + 12];
    } else if (type === "IDAT") {
      idat.push(data.slice(start, end));
    } else if (type === "IEND") {
      break;
    }

    offset = end + 4;
  }

  if (!width || !height || !idat.length) {
    throw new Error("PNG enthält keine Bilddaten.");
  }

  if (bitDepth !== 8 || interlace !== 0) {
    throw new Error("Logo-PNG muss 8 Bit und nicht-interlaced sein.");
  }

  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[colorType];
  if (!channels) {
    throw new Error("Logo-PNG nutzt einen nicht unterstützten Farbmodus. Bitte RGB/RGBA verwenden.");
  }

  if (width * height > 8_000_000) {
    throw new Error("Logo-PNG ist zu groß. Bitte unter 8 Megapixel verwenden.");
  }

  const compressed = concatBytes(idat);
  const inflated = await inflateZlib(compressed);
  const stride = width * channels;
  const expected = (stride + 1) * height;

  if (inflated.length < expected) {
    throw new Error("PNG-Bilddaten sind unvollständig.");
  }

  const rows = new Uint8Array(stride * height);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset++];
    const rowOffset = row * stride;
    const prevOffset = (row - 1) * stride;

    for (let i = 0; i < stride; i += 1) {
      const raw = inflated[sourceOffset++];
      const left = i >= channels ? rows[rowOffset + i - channels] : 0;
      const up = row > 0 ? rows[prevOffset + i] : 0;
      const upLeft = row > 0 && i >= channels
        ? rows[prevOffset + i - channels]
        : 0;

      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upLeft);
      else throw new Error(`Unbekannter PNG-Filter ${filter}.`);

      rows[rowOffset + i] = value & 0xff;
    }
  }

  const rgb = new Uint8Array(width * height * 3);
  let alpha = (colorType === 4 || colorType === 6)
    ? new Uint8Array(width * height)
    : null;

  let source = 0;
  let rgbOffset = 0;
  let alphaOffset = 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (colorType === 0) {
      const g = rows[source++];
      rgb[rgbOffset++] = g;
      rgb[rgbOffset++] = g;
      rgb[rgbOffset++] = g;
    } else if (colorType === 2) {
      rgb[rgbOffset++] = rows[source++];
      rgb[rgbOffset++] = rows[source++];
      rgb[rgbOffset++] = rows[source++];
    } else if (colorType === 4) {
      const g = rows[source++];
      rgb[rgbOffset++] = g;
      rgb[rgbOffset++] = g;
      rgb[rgbOffset++] = g;
      alpha[alphaOffset++] = rows[source++];
    } else if (colorType === 6) {
      rgb[rgbOffset++] = rows[source++];
      rgb[rgbOffset++] = rows[source++];
      rgb[rgbOffset++] = rows[source++];
      alpha[alphaOffset++] = rows[source++];
    }
  }

  return { width, height, rgb, alpha };
}

class PDFWriter {
  constructor() {
    this.objects = [null];
    this.catalogRef = 0;
  }

  addObject(body) {
    const id = this.objects.length;
    this.objects.push(body);
    return id;
  }

  setObject(id, body) {
    this.objects[id] = body;
  }

  stream(content, dictionary = "") {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const dict = dictionary ? `${dictionary.trim()} ` : "";
    return concatBytes([
      `<< ${dict}/Length ${bytes.length} >>\nstream\n`,
      bytes,
      `\nendstream`
    ]);
  }

  build(rootRef) {
    const chunks = [];
    const offsets = [0];
    let pos = 0;

    const push = (part) => {
      const bytes = typeof part === "string" ? new TextEncoder().encode(part) : part;
      chunks.push(bytes);
      pos += bytes.length;
    };

    push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");

    for (let i = 1; i < this.objects.length; i++) {
      offsets[i] = pos;
      push(`${i} 0 obj\n`);
      push(this.objects[i]);
      push("\nendobj\n");
    }

    const xrefPos = pos;
    push(`xref\n0 ${this.objects.length}\n`);
    push("0000000000 65535 f \n");
    for (let i = 1; i < this.objects.length; i++) {
      push(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
    }
    push(`trailer\n<< /Size ${this.objects.length} /Root ${rootRef} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

    return concatBytes(chunks);
  }
}

// Helvetica AFM-ish width approximation in 1000-em.
// Accurate enough for document layout, deterministic, no browser metrics.
const WIDTHS = {
  narrow: "fijlrtI.,:;!'|()[]{}",
  wide: "MW@%&QO",
};

function glyphWidth(ch, bold = false) {
  if (ch === " ") return 278;
  if (WIDTHS.narrow.includes(ch)) return 278;
  if (WIDTHS.wide.includes(ch)) return bold ? 833 : 778;
  if (/[A-ZÄÖÜ]/.test(ch)) return bold ? 667 : 667;
  if (/[0-9]/.test(ch)) return 556;
  if (/[mw]/.test(ch)) return 778;
  return bold ? 556 : 500;
}

function measureText(text, size, bold = false) {
  let sum = 0;
  for (const ch of String(text ?? "")) sum += glyphWidth(ch, bold);
  return sum * size / 1000;
}

function wrapText(text, maxWidth, size, bold = false) {
  const paras = String(text ?? "").replace(/\r/g, "").split("\n");
  const lines = [];

  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi];
    if (!para) { lines.push(""); continue; }

    const words = para.split(/\s+/);
    let line = "";

    for (let word of words) {
      if (measureText(word, size, bold) > maxWidth) {
        // Hard-break long tokens.
        let part = "";
        for (const ch of word) {
          const next = part + ch;
          if (part && measureText(next, size, bold) > maxWidth) {
            if (line) { lines.push(line); line = ""; }
            lines.push(part);
            part = ch;
          } else part = next;
        }
        word = part;
      }

      const test = line ? line + " " + word : word;
      if (line && measureText(test, size, bold) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

const PAGE = {
  A4: { width: 595.28, height: 841.89 },
};

export class FlowPDF {
  constructor(options = {}) {
    this.pageSize = PAGE.A4;
    this.margin = {
      top: mm(options.marginTop ?? 14),
      right: mm(options.marginRight ?? 14),
      bottom: mm(options.marginBottom ?? 14),
      left: mm(options.marginLeft ?? 14),
    };
    this.theme = {
      text: options.textColor ?? [28, 35, 42],
      muted: options.mutedColor ?? [103, 113, 123],
      line: options.lineColor ?? [220, 225, 230],
      surface: options.surfaceColor ?? [247, 248, 249],
      accent: options.accentColor ?? [52, 93, 125],
    };
    this.pages = [];
    this.current = null;
    this.y = 0;
    this.header = null;
    this.footer = null;
    this.meta = {};
    this.images = new Map();
    this.addPage();
  }

  setMeta(meta = {}) {
    this.meta = { ...this.meta, ...meta };
    return this;
  }

  setHeader(fn) {
    this.header = fn;

    if (
      this.pages.length === 1 &&
      this.current &&
      this.current.ops.length === 0
    ) {
      fn(this, 1);
    }

    return this;
  }
  setFooter(fn) { this.footer = fn; return this; }

  registerImage(name, image) {
    if (!name || !image?.width || !image?.height || !image?.rgb) {
      throw new Error("Ungültige Bildressource.");
    }

    const resourceName = `Im${this.images.size + 1}`;
    this.images.set(name, { ...image, resourceName });
    return this;
  }

  hasImage(name) {
    return this.images.has(name);
  }

  image(name, x, y, width, height, options = {}) {
    const image = this.images.get(name);
    if (!image) return this;

    const fit = options.fit ?? "contain";
    let drawWidth = width;
    let drawHeight = height;
    let drawX = x;
    let drawY = y;

    if (fit === "contain") {
      const scale = Math.min(width / image.width, height / image.height);
      drawWidth = image.width * scale;
      drawHeight = image.height * scale;

      if (options.align === "center") {
        drawX += (width - drawWidth) / 2;
      } else if (options.align === "right") {
        drawX += width - drawWidth;
      }

      if (options.valign === "middle") {
        drawY += (height - drawHeight) / 2;
      } else if (options.valign === "top") {
        drawY += height - drawHeight;
      }
    }

    this.op(
      `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ` +
      `${drawX.toFixed(2)} ${drawY.toFixed(2)} cm /${image.resourceName} Do Q`
    );
    return this;
  }

  addPage() {
    const page = { ops: [] };
    this.pages.push(page);
    this.current = page;
    this.y = this.pageSize.height - this.margin.top;
    if (this.header) this.header(this, this.pages.length);
    return this;
  }

  availableWidth() {
    return this.pageSize.width - this.margin.left - this.margin.right;
  }

  bottomY() {
    return this.margin.bottom + mm(9);
  }

  ensureSpace(height, { keepTogether = false } = {}) {
    if (this.y - height < this.bottomY()) this.addPage();
    return this;
  }

  rgb(c) {
    return c.map(v => clamp(v / 255, 0, 1).toFixed(3)).join(" ");
  }

  op(s) { this.current.ops.push(s); return this; }

  text(text, x, y, options = {}) {
    const size = options.size ?? 10;
    const bold = !!options.bold;
    const color = options.color ?? this.theme.text;
    const font = bold ? "/F2" : "/F1";
    this.op(`BT ${this.rgb(color)} rg ${font} ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfLiteral(text)} Tj ET`);
    return this;
  }

  line(x1, y1, x2, y2, options = {}) {
    const width = options.width ?? 0.6;
    const color = options.color ?? this.theme.line;
    this.op(`${this.rgb(color)} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }

  rect(x, y, w, h, options = {}) {
    const radius = Math.max(0, Math.min(options.radius ?? 0, w / 2, h / 2));
    const fill = options.fill;
    const stroke = options.stroke;
    const sw = options.strokeWidth ?? 0.6;
    let cmd = "";
    if (fill) cmd += `${this.rgb(fill)} rg `;
    if (stroke) cmd += `${this.rgb(stroke)} RG ${sw.toFixed(2)} w `;

    if (radius > 0.01) {
      // Cubic Bézier approximation for a quarter circle.
      const k = 0.552284749831;
      const r = radius;
      const x0 = x;
      const y0 = y;
      const x1 = x + w;
      const y1 = y + h;
      cmd += `${(x0 + r).toFixed(2)} ${y0.toFixed(2)} m `;
      cmd += `${(x1 - r).toFixed(2)} ${y0.toFixed(2)} l `;
      cmd += `${(x1 - r + k*r).toFixed(2)} ${y0.toFixed(2)} ${(x1).toFixed(2)} ${(y0 + r - k*r).toFixed(2)} ${x1.toFixed(2)} ${(y0 + r).toFixed(2)} c `;
      cmd += `${x1.toFixed(2)} ${(y1 - r).toFixed(2)} l `;
      cmd += `${x1.toFixed(2)} ${(y1 - r + k*r).toFixed(2)} ${(x1 - r + k*r).toFixed(2)} ${y1.toFixed(2)} ${(x1 - r).toFixed(2)} ${y1.toFixed(2)} c `;
      cmd += `${(x0 + r).toFixed(2)} ${y1.toFixed(2)} l `;
      cmd += `${(x0 + r - k*r).toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - r + k*r).toFixed(2)} ${x0.toFixed(2)} ${(y1 - r).toFixed(2)} c `;
      cmd += `${x0.toFixed(2)} ${(y0 + r).toFixed(2)} l `;
      cmd += `${x0.toFixed(2)} ${(y0 + r - k*r).toFixed(2)} ${(x0 + r - k*r).toFixed(2)} ${y0.toFixed(2)} ${(x0 + r).toFixed(2)} ${y0.toFixed(2)} c h `;
    } else {
      cmd += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
    }

    cmd += fill && stroke ? "B" : fill ? "f" : "S";
    this.op(cmd);
    return this;
  }

  paragraph(text, options = {}) {
    const size = options.size ?? 9.5;
    const bold = !!options.bold;
    const lineHeight = options.lineHeight ?? size * 1.35;
    const x = options.x ?? this.margin.left;
    const width = options.width ?? this.availableWidth();
    const gapAfter = options.gapAfter ?? mm(2);
    const color = options.color ?? this.theme.text;
    const lines = wrapText(text, width, size, bold);
    let index = 0;

    while (index < lines.length) {
      const available = Math.max(
        0,
        Math.floor((this.y - this.bottomY()) / lineHeight)
      );

      if (available < 1) {
        this.addPage();
        continue;
      }

      const chunk = lines.slice(index, index + available);

      for (const line of chunk) {
        this.text(line, x, this.y - size, { size, bold, color });
        this.y -= lineHeight;
      }

      index += chunk.length;

      if (index < lines.length) {
        this.addPage();
      }
    }

    this.y -= gapAfter;
    return this;
  }

  heading(text, options = {}) {
    const level = options.level ?? 2;
    const size = options.size ?? (level === 1 ? 18 : level === 2 ? 12.5 : 10.5);
    const before = options.gapBefore ?? (level === 1 ? 0 : mm(3));
    const after = options.gapAfter ?? mm(2.4);
    this.y -= before;
    this.ensureSpace(size * 1.6 + after);
    let headingX = this.margin.left;
    if (options.accentBar) {
      const barHeight = size * 1.15;
      const barY = this.y - size - 1;
      this.rect(
        this.margin.left,
        barY,
        options.accentBarWidth ?? 2.4,
        barHeight,
        { fill: options.accentBarColor ?? this.theme.accent }
      );
      headingX += options.accentBarGap ?? 7;
    }

    this.text(text, headingX, this.y - size, {
      size, bold: true, color: options.color ?? this.theme.text
    });
    this.y -= size * 1.45 + after;
    return this;
  }

  spacer(mmValue = 3) {
    this.y -= mm(mmValue);
    return this;
  }

  anchorFromBottom(mmValue) {
    const target = mm(mmValue);

    if (this.y > target) {
      this.y = target;
    }

    return this;
  }

  divider(options = {}) {
    const gap = options.gap ?? mm(2);
    this.y -= gap;
    this.line(this.margin.left, this.y, this.pageSize.width - this.margin.right, this.y, options);
    this.y -= gap;
    return this;
  }

  labelValue(label, value, options = {}) {
    const totalWidth = options.width ?? this.availableWidth();
    const labelWidth = options.labelWidth ?? totalWidth * 0.34;
    const size = options.size ?? 9;
    const lineHeight = size * 1.35;
    const valueLines = wrapText(value ?? "–", totalWidth - labelWidth - mm(3), size, false);
    const height = Math.max(lineHeight, valueLines.length * lineHeight) + mm(2.6);

    this.ensureSpace(height);
    this.text(label, this.margin.left, this.y - size, { size: size - 0.3, bold: true, color: options.labelColor ?? this.theme.muted });
    let ty = this.y - size;
    for (const line of valueLines) {
      this.text(line, this.margin.left + labelWidth, ty, { size });
      ty -= lineHeight;
    }
    this.y -= height;
    return this;
  }

  booleanRow(label, value, options = {}) {
    const size = options.size ?? 9;
    const box = mm(4.2);
    const h = Math.max(box, size * 1.3) + mm(2.8);
    this.ensureSpace(h);

    this.text(label, this.margin.left, this.y - size, { size, bold: true, color: this.theme.muted });

    const x = this.pageSize.width - this.margin.right - mm(24);
    const y = this.y - box - mm(0.2);
    this.rect(x, y, mm(24), box + mm(1), { fill: value ? [230, 242, 234] : [244, 237, 237] });
    this.text(value ? "JA" : "NEIN", x + mm(8.1), y + mm(1.3), {
      size: 8.2, bold: true, color: value ? [40, 105, 62] : [128, 66, 66]
    });
    this.y -= h;
    return this;
  }

  noteBox(title, text, options = {}) {
    const pad = mm(3.5);
    const width = options.width ?? this.availableWidth();
    const size = options.size ?? 9;
    const titleSize = options.titleSize ?? 9.3;
    const lineHeight = size * 1.35;
    const lines = wrapText(text ?? "–", width - pad * 2, size);
    let index = 0;
    let continuation = false;

    while (index < lines.length) {
      const titleGap = titleSize * 1.1 + mm(1.2);
      const fixedHeight = pad + titleSize * 1.3 + titleGap + pad;
      const availableHeight = this.y - this.bottomY();

      if (availableHeight < fixedHeight + lineHeight) {
        this.addPage();
        continuation = true;
        continue;
      }

      const maxLines = Math.max(
        1,
        Math.floor((availableHeight - fixedHeight) / lineHeight)
      );
      const chunk = lines.slice(index, index + maxLines);
      const height = fixedHeight + chunk.length * lineHeight;
      const yBottom = this.y - height;

      this.rect(this.margin.left, yBottom, width, height, {
        fill: options.fill ?? this.theme.surface,
        stroke: options.stroke ?? this.theme.line,
        strokeWidth: 0.6,
      });

      let ty = this.y - pad - titleSize;
      const boxTitle = continuation ? `${title} · Fortsetzung` : title;
      this.text(boxTitle, this.margin.left + pad, ty, {
        size: titleSize,
        bold: true,
        color: this.theme.muted
      });
      ty -= titleGap;

      for (const line of chunk) {
        this.text(line, this.margin.left + pad, ty, { size });
        ty -= lineHeight;
      }

      this.y = yBottom - mm(2.8);
      index += chunk.length;

      if (index < lines.length) {
        this.addPage();
        continuation = true;
      }
    }

    return this;
  }

  twoColumn(items, options = {}) {
    const gap = options.gap ?? mm(5);
    const width = (this.availableWidth() - gap) / 2;
    const startY = this.y;
    const heights = [];

    // Measure first.
    for (const item of items.slice(0, 2)) {
      const size = item.size ?? 9;
      const labelH = size * 1.2;
      const lines = wrapText(item.value ?? "–", width, size);
      heights.push(labelH + lines.length * size * 1.35 + mm(2));
    }
    const h = Math.max(...heights, 0);
    this.ensureSpace(h);

    items.slice(0,2).forEach((item, i) => {
      const x = this.margin.left + i * (width + gap);
      const size = item.size ?? 9;
      this.text(item.label, x, this.y - size, { size: size - .3, bold: true, color: item.labelColor ?? options.labelColor ?? this.theme.muted });
      let ty = this.y - size * 2.35;
      for (const line of wrapText(item.value ?? "–", width, size)) {
        this.text(line, x, ty, { size });
        ty -= size * 1.35;
      }
    });

    this.y -= h;
    return this;
  }

  summaryBand(items, options = {}) {
    const normalized = (items || []).slice(0, 3);
    if (!normalized.length) return this;

    const width = options.width ?? this.availableWidth();
    const x = options.x ?? this.margin.left;
    const gap = options.gap ?? mm(3.2);
    const padX = options.padX ?? mm(4);
    const padY = options.padY ?? mm(3.6);
    const labelSize = options.labelSize ?? 6.4;
    const valueSize = options.valueSize ?? 9.0;
    const cellWidth = (width - gap * (normalized.length - 1)) / normalized.length;
    const lineHeight = valueSize * 1.25;

    const cells = normalized.map(item => ({
      ...item,
      lines: wrapText(item.value ?? "–", cellWidth - padX * 2, valueSize, true)
    }));
    const maxLines = Math.max(...cells.map(cell => cell.lines.length), 1);
    const height = padY * 2 + labelSize * 1.2 + mm(1.8) + maxLines * lineHeight;

    this.ensureSpace(height + mm(4));

    cells.forEach((cell, index) => {
      const cellX = x + index * (cellWidth + gap);
      this.rect(cellX, this.y - height, cellWidth, height, {
        fill: options.fill ?? [247, 247, 244],
        stroke: options.stroke ?? [224, 224, 219],
        strokeWidth: 0.55
      });
      this.text(String(cell.label || "").toUpperCase(), cellX + padX, this.y - padY - labelSize, {
        size: labelSize,
        bold: true,
        color: options.labelColor ?? this.theme.muted
      });
      let ty = this.y - padY - labelSize * 1.2 - mm(2) - valueSize;
      for (const line of cell.lines) {
        this.text(line, cellX + padX, ty, {
          size: valueSize,
          bold: true,
          color: options.valueColor ?? this.theme.text
        });
        ty -= lineHeight;
      }
    });

    this.y -= height + (options.gapAfter ?? mm(5));
    return this;
  }

  premiumHero(options = {}) {
    const x = options.x ?? this.margin.left;
    const width = options.width ?? this.availableWidth();
    const height = options.height ?? mm(34);
    const padX = options.padX ?? mm(6);
    const padY = options.padY ?? mm(5.5);
    const radius = options.radius ?? mm(4.6);
    const eyebrow = String(options.eyebrow || "");
    const title = String(options.title || "");
    const subtitle = String(options.subtitle || "");
    const status = String(options.status || "");

    this.ensureSpace(height + mm(4));
    const bottom = this.y - height;

    this.rect(x, bottom, width, height, {
      fill: options.fill ?? [250, 250, 248],
      stroke: options.stroke ?? [218, 218, 213],
      strokeWidth: 0.55,
      radius
    });

    if (status) {
      const statusSize = options.statusSize ?? 6.4;
      const pillPadX = mm(3.4);
      const pillH = mm(7.4);
      const pillW = Math.max(mm(23), measureText(status.toUpperCase(), statusSize, true) + pillPadX * 2);
      const pillX = x + width - padX - pillW;
      const pillY = this.y - padY - pillH;
      this.rect(pillX, pillY, pillW, pillH, {
        fill: options.statusFill ?? [242, 242, 239],
        stroke: options.statusStroke ?? [205, 205, 199],
        strokeWidth: 0.5,
        radius: pillH / 2
      });
      this.text(status.toUpperCase(), pillX + pillPadX, centeredBaseline(pillY, pillH, statusSize), {
        size: statusSize,
        bold: true,
        color: options.statusColor ?? [38, 38, 36]
      });
    }

    const eyebrowSize = options.eyebrowSize ?? 6.4;
    const titleSize = options.titleSize ?? 20.5;
    let titleBaseline;

    if (eyebrow) {
      const eyebrowBaseline = baselineFromTop(this.y, padY, eyebrowSize);
      this.text(eyebrow.toUpperCase(), x + padX, eyebrowBaseline, {
        size: eyebrowSize,
        bold: true,
        color: options.eyebrowColor ?? [111, 111, 105]
      });
      const titleTopInset = padY + visualCapHeight(eyebrowSize) + visualDescent(eyebrowSize) + mm(2.4);
      titleBaseline = baselineFromTop(this.y, titleTopInset, titleSize);
    } else {
      titleBaseline = baselineFromTop(this.y, padY, titleSize);
    }

    this.text(title, x + padX, titleBaseline, {
      size: titleSize,
      bold: true,
      color: options.titleColor ?? this.theme.text
    });

    if (subtitle) {
      const subSize = options.subtitleSize ?? 7.7;
      const subWidth = Math.max(mm(70), width * 0.68);
      const lines = wrapText(subtitle, subWidth, subSize, false).slice(0, 2);
      let sy = titleBaseline - visualDescent(titleSize) - mm(2.4) - visualCapHeight(subSize);
      for (const line of lines) {
        this.text(line, x + padX, sy, {
          size: subSize,
          color: options.subtitleColor ?? [91, 91, 86]
        });
        sy -= subSize * 1.35;
      }
    }

    this.y = bottom - (options.gapAfter ?? mm(5));
    return this;
  }

  metaPanel(items, options = {}) {
    const normalized = (items || []).slice(0, 4);
    if (!normalized.length) return this;

    const x = options.x ?? this.margin.left;
    const width = options.width ?? this.availableWidth();
    const height = options.height ?? mm(21.5);
    const padX = options.padX ?? mm(5);
    const padY = options.padY ?? mm(4.3);
    const radius = options.radius ?? mm(4.2);
    const cellWidth = width / normalized.length;

    this.ensureSpace(height + mm(4));
    const bottom = this.y - height;
    this.rect(x, bottom, width, height, {
      fill: options.fill ?? [255, 255, 255],
      stroke: options.stroke ?? [218, 218, 213],
      strokeWidth: 0.55,
      radius
    });

    normalized.forEach((item, index) => {
      const cellX = x + index * cellWidth;
      if (index > 0) {
        this.line(cellX, bottom + mm(4.2), cellX, bottom + height - mm(4.2), {
          color: options.dividerColor ?? [232, 232, 227],
          width: 0.5
        });
      }
      const labelSize = options.labelSize ?? 6.1;
      const labelBaseline = baselineFromTop(this.y, padY, labelSize);
      this.text(String(item.label || "").toUpperCase(), cellX + padX, labelBaseline, {
        size: labelSize,
        bold: true,
        color: options.labelColor ?? [120, 120, 114]
      });
      const valueSize = options.valueSize ?? 9.0;
      const lines = wrapText(item.value ?? "-", cellWidth - padX * 2, valueSize, true).slice(0, 2);
      const valueTopInset = padY + visualCapHeight(labelSize) + visualDescent(labelSize) + mm(2.15);
      let vy = baselineFromTop(this.y, valueTopInset, valueSize);
      for (const line of lines) {
        this.text(line, cellX + padX, vy, {
          size: valueSize,
          bold: true,
          color: options.valueColor ?? this.theme.text
        });
        vy -= valueSize * 1.22;
      }
    });

    this.y = bottom - (options.gapAfter ?? mm(5));
    return this;
  }

  contentCard(options = {}) {
    const x = options.x ?? this.margin.left;
    const width = options.width ?? this.availableWidth();
    const radius = options.radius ?? mm(4.4);
    const padX = options.padX ?? mm(5.2);
    const padY = options.padY ?? mm(3.9);
    const number = String(options.number ?? "");
    const title = String(options.title || "");
    const fields = Array.isArray(options.fields) ? options.fields : [];
    const tags = Array.isArray(options.tags) ? options.tags.filter(Boolean) : [];
    const body = options.body == null ? "" : String(options.body);
    const bodyLabel = options.bodyLabel ? String(options.bodyLabel) : "";
    const columns = Math.max(1, Math.min(3, options.columns ?? 2));
    const headerH = mm(7.6);
    const fieldGapX = mm(6);
    const fieldWidth = (width - padX * 2 - fieldGapX * (columns - 1)) / columns;
    const fieldSize = options.fieldSize ?? 7.9;
    const labelSize = options.labelSize ?? 6.0;
    const valueLH = fieldSize * 1.3;
    const fieldRows = [];

    for (let i = 0; i < fields.length; i += columns) {
      const row = fields.slice(i, i + columns).map(field => ({
        ...field,
        lines: wrapText(field.value ?? "-", fieldWidth, fieldSize, !!field.bold).slice(0, 3)
      }));
      const maxLines = Math.max(...row.map(field => field.lines.length), 1);
      fieldRows.push({ row, height: labelSize * 1.15 + mm(1.9) + maxLines * valueLH + mm(1.8) });
    }

    let tagsHeight = 0;
    let tagRows = [];
    if (tags.length) {
      const maxW = width - padX * 2;
      const tagSize = options.tagSize ?? 7.0;
      const tagPadX = mm(3.0);
      const tagH = mm(7.2);
      let row = [];
      let used = 0;
      for (const tag of tags) {
        const tw = Math.min(maxW, measureText(tag, tagSize, true) + tagPadX * 2);
        const needed = (row.length ? mm(2) : 0) + tw;
        if (row.length && used + needed > maxW) {
          tagRows.push(row);
          row = [];
          used = 0;
        }
        row.push({ text: tag, width: tw });
        used += (row.length > 1 ? mm(2) : 0) + tw;
      }
      if (row.length) tagRows.push(row);
      tagsHeight = tagRows.length * tagH + Math.max(0, tagRows.length - 1) * mm(1.8);
    }

    let bodyLines = [];
    let bodyHeight = 0;
    if (body) {
      const bodySize = options.bodySize ?? 7.7;
      bodyLines = wrapText(body, width - padX * 2 - mm(6), bodySize, false);
      bodyHeight = mm(7.0) + Math.max(1, bodyLines.length) * bodySize * 1.30 + mm(3.2);
    }

    const fieldsHeight = fieldRows.reduce((sum, r) => sum + r.height, 0);
    const contentGap = (fieldsHeight && (tagsHeight || bodyHeight)) ? mm(2) : 0;
    const betweenExtra = tagsHeight && bodyHeight ? mm(2.3) : 0;
    const height = padY * 2 + headerH + fieldsHeight + tagsHeight + bodyHeight + contentGap + betweenExtra;

    this.ensureSpace(height + mm(4));
    const top = this.y;
    const bottom = top - height;

    this.rect(x, bottom, width, height, {
      fill: options.fill ?? [255, 255, 255],
      stroke: options.stroke ?? [218, 218, 213],
      strokeWidth: 0.55,
      radius
    });

    const badgeSize = mm(7.2);
    const badgeX = x + padX;
    const badgeY = top - padY - badgeSize;
    if (number) {
      this.rect(badgeX, badgeY, badgeSize, badgeSize, {
        fill: options.badgeFill ?? [245, 245, 242],
        stroke: options.badgeStroke ?? [196, 196, 190],
        strokeWidth: 0.5,
        radius: badgeSize / 2
      });
      const numSize = options.numberSize ?? 7.0;
      const numW = measureText(number, numSize, true);
      this.text(number, badgeX + (badgeSize - numW) / 2, centeredBaseline(badgeY, badgeSize, numSize), {
        size: numSize,
        bold: true,
        color: [35, 35, 33]
      });
    }

    const cardTitleSize = options.titleSize ?? 10.4;
    this.text(title, badgeX + (number ? badgeSize + mm(3.2) : 0), baselineFromTop(top, padY + mm(.15), cardTitleSize), {
      size: cardTitleSize,
      bold: true,
      color: options.titleColor ?? this.theme.text
    });

    let cy = top - padY - headerH;
    for (const fr of fieldRows) {
      fr.row.forEach((field, colIndex) => {
        const fx = x + padX + colIndex * (fieldWidth + fieldGapX);
        const fieldLabelBaseline = baselineFromTop(cy, mm(.25), labelSize);
        this.text(String(field.label || "").toUpperCase(), fx, fieldLabelBaseline, {
          size: labelSize,
          bold: true,
          color: options.labelColor ?? [121, 121, 115]
        });
        const fieldValueTopInset = mm(.25) + visualCapHeight(labelSize) + visualDescent(labelSize) + mm(1.75);
        let vy = baselineFromTop(cy, fieldValueTopInset, fieldSize);
        for (const line of field.lines) {
          this.text(line, fx, vy, {
            size: fieldSize,
            bold: !!field.bold,
            color: options.valueColor ?? this.theme.text
          });
          vy -= valueLH;
        }
      });
      cy -= fr.height;
    }

    if (tagsHeight) {
      const tagSize = options.tagSize ?? 7.0;
      const tagH = mm(7.2);
      let rowY = cy - (fieldsHeight ? mm(1.8) : 0) - tagH;
      for (const row of tagRows) {
        let tx = x + padX;
        for (const tag of row) {
          this.rect(tx, rowY, tag.width, tagH, {
            fill: options.tagFill ?? [248, 248, 246],
            stroke: options.tagStroke ?? [216, 216, 211],
            strokeWidth: 0.45,
            radius: tagH / 2
          });
          this.text(tag.text, tx + mm(3.0), centeredBaseline(rowY, tagH, tagSize), {
            size: tagSize,
            bold: true,
            color: options.tagColor ?? [54, 54, 51]
          });
          tx += tag.width + mm(2);
        }
        rowY -= tagH + mm(1.8);
      }
      cy -= tagsHeight + (fieldsHeight ? mm(1.8) : 0);
    }

    if (bodyHeight) {
      const innerX = x + padX;
      const innerW = width - padX * 2;
      const innerTop = cy - (tagsHeight ? mm(2.0) : (fieldsHeight ? mm(1.8) : 0));
      const innerBottom = innerTop - bodyHeight;
      this.rect(innerX, innerBottom, innerW, bodyHeight, {
        fill: options.bodyFill ?? [249, 249, 247],
        stroke: options.bodyStroke ?? [222, 222, 217],
        strokeWidth: 0.45,
        radius: options.bodyRadius ?? mm(3.4)
      });
      const innerPadTop = mm(3.2);
      const bodySize = options.bodySize ?? 7.7;
      let by;
      if (bodyLabel) {
        const bodyLabelBaseline = baselineFromTop(innerTop, innerPadTop, labelSize);
        this.text(bodyLabel.toUpperCase(), innerX + mm(3.2), bodyLabelBaseline, {
          size: labelSize,
          bold: true,
          color: options.labelColor ?? [121, 121, 115]
        });
        const bodyValueTopInset = innerPadTop + visualCapHeight(labelSize) + visualDescent(labelSize) + mm(2.0);
        by = baselineFromTop(innerTop, bodyValueTopInset, bodySize);
      } else {
        by = baselineFromTop(innerTop, mm(3.6), bodySize);
      }
      for (const line of bodyLines) {
        this.text(line, innerX + mm(3.2), by, {
          size: bodySize,
          color: options.valueColor ?? this.theme.text
        });
        by -= bodySize * 1.35;
      }
    }

    this.y = bottom - (options.gapAfter ?? mm(4.2));
    return this;
  }

  confirmationCard(options = {}) {
    const x = options.x ?? this.margin.left;
    const width = options.width ?? this.availableWidth();
    const padX = options.padX ?? mm(5.2);
    const padY = options.padY ?? mm(4.2);
    const radius = options.radius ?? mm(4.2);
    const items = Array.isArray(options.items) ? options.items : [];
    const title = String(options.title || "");
    const subtitle = String(options.subtitle || "");
    const customer = String(options.customer || "-");
    const confirmedAt = String(options.confirmedAt || "-");
    const legal = String(options.legal || "");
    const draft = !!options.draft;
    const titleSize = options.titleSize ?? 10.4;
    const subSize = options.subtitleSize ?? 6.9;
    const itemSize = options.itemSize ?? 7.0;
    const legalSize = options.legalSize ?? 5.8;
    const innerW = width - padX * 2;
    const itemTextW = innerW - mm(11.5);
    const itemLines = items.map(item => wrapText(item.text ?? "-", itemTextW, itemSize, false));
    const rowGap = mm(1.8);
    const itemsHeight = itemLines.reduce((sum, lines) => sum + Math.max(mm(8.4), lines.length * itemSize * 1.35 + mm(3.4)), 0) + Math.max(0, items.length - 1) * rowGap;
    const legalLines = legal ? wrapText(legal, innerW, legalSize, false) : [];
    const height = padY * 2 + mm(12.2) + itemsHeight + mm(3.8) + mm(13.0) + (legalLines.length ? legalLines.length * legalSize * 1.30 + mm(7.5) : 0);

    this.ensureSpace(height + mm(4));
    const top = this.y;
    const bottom = top - height;

    this.rect(x, bottom, width, height, {
      fill: options.fill ?? [250, 250, 248],
      stroke: options.stroke ?? [210, 210, 204],
      strokeWidth: 0.6,
      radius
    });

    const pillText = draft ? "BESTÄTIGUNG AUSSTEHEND" : "BESTÄTIGT";
    const pillSize = 6.0;
    const pillH = mm(6.4);
    const pillW = measureText(pillText, pillSize, true) + mm(6.0);
    this.rect(x + padX, top - padY - pillH, pillW, pillH, {
      fill: [255, 255, 255],
      stroke: [199, 199, 193],
      strokeWidth: 0.5,
      radius: pillH / 2
    });
    this.text(pillText, x + padX + mm(3.0), centeredBaseline(top - padY - pillH, pillH, pillSize), {
      size: pillSize,
      bold: true,
      color: [47, 47, 44]
    });

    const confirmationTitleTop = padY + pillH + mm(3.0);
    const confirmationTitleBaseline = baselineFromTop(top, confirmationTitleTop, titleSize);
    this.text(title, x + padX, confirmationTitleBaseline, {
      size: titleSize,
      bold: true,
      color: this.theme.text
    });
    const confirmationSubtitleTop = confirmationTitleTop + visualCapHeight(titleSize) + visualDescent(titleSize) + mm(1.9);
    this.text(subtitle, x + padX, baselineFromTop(top, confirmationSubtitleTop, subSize), {
      size: subSize,
      color: [101, 101, 96]
    });

    let cy = top - padY - mm(19.5);
    items.forEach((item, index) => {
      const lines = itemLines[index];
      const rowH = Math.max(mm(8.4), lines.length * itemSize * 1.35 + mm(3.4));
      const rowBottom = cy - rowH;
      this.rect(x + padX, rowBottom, innerW, rowH, {
        fill: [255, 255, 255],
        stroke: [221, 221, 216],
        strokeWidth: 0.45,
        radius: mm(2.8)
      });

      const marker = mm(4.0);
      const mx = x + padX + mm(3.1);
      const my = rowBottom + (rowH - marker) / 2;
      this.rect(mx, my, marker, marker, {
        fill: item.checked ? [238, 238, 234] : [255, 255, 255],
        stroke: [161, 161, 155],
        strokeWidth: 0.55,
        radius: mm(.9)
      });
      if (item.checked) {
        this.line(mx + mm(.8), my + mm(1.9), mx + mm(1.55), my + mm(1.15), { width: 1.0, color: [40,40,37] });
        this.line(mx + mm(1.55), my + mm(1.15), mx + mm(3.2), my + mm(3.0), { width: 1.0, color: [40,40,37] });
      }

      const itemLineHeight = itemSize * 1.35;
      let ty = centeredTextBlockFirstBaseline(rowBottom, rowH, itemSize, itemLineHeight, lines.length);
      for (const line of lines) {
        this.text(line, mx + marker + mm(3.0), ty, {
          size: itemSize,
          color: [42, 42, 39]
        });
        ty -= itemLineHeight;
      }
      cy = rowBottom - rowGap;
    });

    cy -= mm(2.7);
    const splitGap = mm(4.0);
    const splitW = (innerW - splitGap) / 2;
    const infoH = mm(11.0);
    const infoY = cy - infoH;
    [["KUNDE", customer], ["BESTÄTIGT AM", confirmedAt]].forEach(([label, value], index) => {
      const ix = x + padX + index * (splitW + splitGap);
      this.rect(ix, infoY, splitW, infoH, {
        fill: [255, 255, 255],
        stroke: [221, 221, 216],
        strokeWidth: 0.45,
        radius: mm(2.8)
      });
      const infoLabelSize = 5.9;
      const infoValueSize = 7.4;
      const infoPadTop = mm(2.7);
      this.text(label, ix + mm(3.0), baselineFromTop(cy, infoPadTop, infoLabelSize), {
        size: infoLabelSize,
        bold: true,
        color: [124, 124, 118]
      });
      const infoValueTopInset = infoPadTop + visualCapHeight(infoLabelSize) + visualDescent(infoLabelSize) + mm(1.65);
      this.text(value, ix + mm(3.0), baselineFromTop(cy, infoValueTopInset, infoValueSize), {
        size: infoValueSize,
        bold: true,
        color: this.theme.text
      });
    });
    cy = infoY - mm(3.0);

    for (const line of legalLines) {
      this.text(line, x + padX, cy - legalSize, {
        size: legalSize,
        color: [113, 113, 107]
      });
      cy -= legalSize * 1.35;
    }

    this.y = bottom - (options.gapAfter ?? mm(2));
    return this;
  }

  checklist(items, options = {}) {
    const size = options.size ?? 8.8;
    const lineHeight = options.lineHeight ?? size * 1.3;
    const gapAfter = options.gapAfter ?? mm(2.3);
    const x = options.x ?? this.margin.left;
    const width = options.width ?? this.availableWidth();
    const markerSize = options.markerSize ?? mm(3.6);

    for (const raw of items ?? []) {
      const item = typeof raw === "string"
        ? { text: raw, checked: true }
        : raw;

      const lines = wrapText(
        item.text ?? "–",
        width - markerSize - mm(3),
        size,
        !!options.bold
      );

      const h = Math.max(
        markerSize + mm(1.6),
        lines.length * lineHeight + mm(1.6)
      );

      this.ensureSpace(h);

      const markerX = x;
      const markerY = this.y - markerSize - mm(0.2);

      this.rect(markerX, markerY, markerSize, markerSize, {
        fill: item.checked === false
          ? this.theme.surface
          : (options.checkedFill ?? [223, 237, 230]),
        stroke: options.markerStroke ?? this.theme.line,
        strokeWidth: 0.5
      });

      if (item.checked !== false) {
        const tickColor = options.checkColor ?? [54, 104, 75];
        this.line(
          markerX + mm(0.8),
          markerY + mm(1.8),
          markerX + mm(1.55),
          markerY + mm(1.05),
          { width: 1.15, color: tickColor }
        );
        this.line(
          markerX + mm(1.55),
          markerY + mm(1.05),
          markerX + mm(2.85),
          markerY + mm(2.65),
          { width: 1.15, color: tickColor }
        );
      }

      let ty = this.y - size;

      for (const line of lines) {
        this.text(
          line,
          x + markerSize + mm(3),
          ty,
          {
            size,
            bold: options.bold ?? true,
            color: options.color ?? this.theme.text
          }
        );
        ty -= lineHeight;
      }

      this.y -= h;
    }

    this.y -= gapAfter;
    return this;
  }

  table(columns, rows, options = {}) {
    const width = options.width ?? this.availableWidth();
    const x = options.x ?? this.margin.left;
    const headerSize = options.headerSize ?? 8.3;
    const bodySize = options.bodySize ?? 8.5;
    const padX = mm(2);
    const padY = mm(1.8);
    const colWidths = columns.map(c => width * c.width);
    const headerH = headerSize * 1.4 + padY * 2;

    const drawHeader = () => {
      this.ensureSpace(headerH);
      let cx = x;
      this.rect(x, this.y - headerH, width, headerH, { fill: this.theme.surface });
      columns.forEach((c, i) => {
        this.text(c.label, cx + padX, this.y - padY - headerSize, { size: headerSize, bold: true, color: this.theme.muted });
        cx += colWidths[i];
      });
      this.y -= headerH;
    };

    drawHeader();

    rows.forEach(row => {
      const cells = columns.map((c, i) => wrapText(row[c.key] ?? "–", colWidths[i] - padX * 2, bodySize));
      const maxLines = Math.max(...cells.map(v => v.length), 1);
      const rowH = maxLines * bodySize * 1.35 + padY * 2;

      if (this.y - rowH < this.bottomY()) {
        this.addPage();
        drawHeader();
      }

      let cx = x;
      columns.forEach((c, i) => {
        let ty = this.y - padY - bodySize;
        for (const line of cells[i]) {
          this.text(line, cx + padX, ty, { size: bodySize });
          ty -= bodySize * 1.35;
        }
        cx += colWidths[i];
      });
      this.line(x, this.y - rowH, x + width, this.y - rowH, { color: this.theme.line, width: .45 });
      this.y -= rowH;
    });

    this.y -= mm(2.5);
    return this;
  }

  // JSON-driven renderer. Keeps business data separate from PDF layout.
  renderSchema(schema, data = {}) {
    const resolve = (path) => {
      if (typeof path !== "string") return path;
      return path.split(".").reduce((o, k) => o?.[k], data);
    };

    for (const block of schema.blocks ?? []) {
      if (block.when && !resolve(block.when)) continue;

      switch (block.type) {
        case "heading":
          this.heading(block.text ?? resolve(block.field) ?? "", block);
          break;
        case "paragraph":
          this.paragraph(block.text ?? resolve(block.field) ?? "", block);
          break;
        case "divider":
          this.divider(block);
          break;
        case "spacer":
          this.spacer(block.mm ?? 3);
          break;
        case "anchor":
          if (!block.firstPageOnly || this.pages.length === 1) {
            this.anchorFromBottom(block.mm ?? 90);
          }
          break;
        case "field":
          this.labelValue(block.label, block.value ?? resolve(block.field), block);
          break;
        case "boolean":
          this.booleanRow(block.label, block.value ?? !!resolve(block.field), block);
          break;
        case "note":
          this.noteBox(block.title, block.text ?? block.value ?? resolve(block.field), block);
          break;
        case "twoColumn":
          this.twoColumn(block.items.map(i => ({ ...i, value: i.value ?? resolve(i.field) })), block);
          break;
        case "summaryBand":
          this.summaryBand(
            block.items.map(i => ({ ...i, value: i.value ?? resolve(i.field) })),
            block
          );
          break;
        case "premiumHero":
          this.premiumHero({
            ...block,
            eyebrow: block.eyebrow ?? resolve(block.eyebrowField),
            title: block.title ?? resolve(block.titleField),
            subtitle: block.subtitle ?? resolve(block.subtitleField),
            status: block.status ?? resolve(block.statusField)
          });
          break;
        case "metaPanel":
          this.metaPanel(
            block.items.map(i => ({ ...i, value: i.value ?? resolve(i.field) })),
            block
          );
          break;
        case "contentCard":
          this.contentCard({
            ...block,
            fields: (block.fields || []).map(i => ({ ...i, value: i.value ?? resolve(i.field) })),
            tags: block.tags ?? resolve(block.tagsField) ?? [],
            body: block.body ?? resolve(block.bodyField) ?? ""
          });
          break;
        case "confirmationCard":
          this.confirmationCard({
            ...block,
            items: block.items ?? resolve(block.itemsField) ?? [],
            customer: block.customer ?? resolve(block.customerField),
            confirmedAt: block.confirmedAt ?? resolve(block.confirmedAtField),
            legal: block.legal ?? resolve(block.legalField)
          });
          break;
        case "checklist":
          this.checklist(
            block.items ?? resolve(block.field) ?? [],
            block
          );
          break;
        case "table":
          this.table(block.columns, block.rows ?? resolve(block.field) ?? [], block);
          break;
        default:
          throw new Error(`Unknown schema block type: ${block.type}`);
      }
    }
    return this;
  }

  finalize() {
    // Footer is intentionally called at finalization so total page count is known.
    if (this.footer) {
      const oldCurrent = this.current;
      const oldY = this.y;
      this.pages.forEach((page, i) => {
        this.current = page;
        this.footer(this, i + 1, this.pages.length);
      });
      this.current = oldCurrent;
      this.y = oldY;
    }

    const writer = new PDFWriter();

    const font1 = writer.addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    const font2 = writer.addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

    const imageRefs = new Map();

    for (const [name, image] of this.images.entries()) {
      let maskRef = null;

      if (image.alpha) {
        maskRef = writer.addObject(
          writer.stream(
            image.alpha,
            `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
            `/ColorSpace /DeviceGray /BitsPerComponent 8`
          )
        );
      }

      const imageRef = writer.addObject(
        writer.stream(
          image.rgb,
          `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8` +
          (maskRef ? ` /SMask ${maskRef} 0 R` : "")
        )
      );

      imageRefs.set(name, { ref: imageRef, resourceName: image.resourceName });
    }

    const xObjectResources = [...imageRefs.values()]
      .map(image => `/${image.resourceName} ${image.ref} 0 R`)
      .join(" ");

    const pagesRef = writer.addObject("PAGES_PLACEHOLDER");
    const pageRefs = [];

    for (const page of this.pages) {
      const content = page.ops.join("\n");
      const contentRef = writer.addObject(writer.stream(content));
      const xObjects = xObjectResources
        ? `/XObject << ${xObjectResources} >> `
        : "";
      const pageRef = writer.addObject(
        `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${this.pageSize.width} ${this.pageSize.height}] ` +
        `/Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> ${xObjects}>> /Contents ${contentRef} 0 R >>`
      );
      pageRefs.push(pageRef);
    }

    writer.setObject(pagesRef, `<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);

    const catalogRef = writer.addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
    return writer.build(catalogRef);
  }

  toBlob() {
    return new Blob([this.finalize()], { type: "application/pdf" });
  }

  download(filename = "document.pdf") {
    const url = URL.createObjectURL(this.toBlob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  open() {
    const url = URL.createObjectURL(this.toBlob());
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export { mm, measureText, wrapText };
