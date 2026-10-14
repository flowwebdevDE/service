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
    const radius = options.radius ?? 0; // PDF path remains square; retained for API compatibility.
    const fill = options.fill;
    const stroke = options.stroke;
    const sw = options.strokeWidth ?? 0.6;
    let cmd = "";
    if (fill) cmd += `${this.rgb(fill)} rg `;
    if (stroke) cmd += `${this.rgb(stroke)} RG ${sw.toFixed(2)} w `;
    cmd += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
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
