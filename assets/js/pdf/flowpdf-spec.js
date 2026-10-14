import { FlowPDF, mm } from "./flowpdf.js?v=7.2.2";

const DEFAULT_OPTIONS = {
  marginTop: 15,
  marginRight: 12,
  marginBottom: 14,
  marginLeft: 12,
  textColor: [31, 40, 36],
  mutedColor: [105, 118, 111],
  lineColor: [218, 225, 221],
  surfaceColor: [247, 249, 248],
  accentColor: [18, 18, 18]
};

export function renderFlowPdfSpec(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("PDF-Spezifikation fehlt.");
  }

  if (!spec.schema || !Array.isArray(spec.schema.blocks)) {
    throw new Error("PDF-Spezifikation benötigt schema.blocks.");
  }

  const pdf = new FlowPDF({
    ...DEFAULT_OPTIONS,
    ...(spec.options || {})
  });

  pdf.setMeta(spec.meta || {});

  for (const [name, image] of Object.entries(spec.resources?.images || {})) {
    pdf.registerImage(name, image);
  }

  const header = spec.header || {};
  pdf.setHeader((doc, page) => {
    const bandHeight = mm(header.bandHeight ?? 3.8);
    const bandColor = header.bandColor ?? doc.theme.accent;
    const pageTop = doc.pageSize.height;

    doc.rect(0, pageTop - bandHeight, doc.pageSize.width, bandHeight, {
      fill: bandColor
    });

    const contentTop = pageTop - mm(header.offsetTop ?? 7.0);
    const logoBoxWidth = mm(header.logoWidth ?? 37);
    const logoBoxHeight = mm(header.logoHeight ?? 8.5);
    const logoBottom = contentTop - logoBoxHeight;
    const label = header.label || "SERVICE";

    if (header.logoImage && doc.hasImage(header.logoImage)) {
      doc.image(
        header.logoImage,
        doc.margin.left,
        logoBottom,
        logoBoxWidth,
        logoBoxHeight,
        { fit: "contain", align: "left", valign: "middle" }
      );
    } else {
      doc.text(header.brand || "MYVELO", doc.margin.left, contentTop - mm(3), {
        size: header.brandSize ?? 15.5,
        bold: true,
        color: header.brandColor ?? doc.theme.text
      });
    }

    doc.text(label, doc.margin.left + logoBoxWidth + mm(4), contentTop - mm(3.2), {
      size: header.labelSize ?? 6.8,
      bold: true,
      color: header.labelColor ?? doc.theme.accent
    });

    const rightText = page === 1
      ? (header.documentId || "")
      : `FORTSETZUNG · ${header.documentId || ""}`;

    if (rightText) {
      const approxWidth = rightText.length * (header.rightSize ?? 7.2) * 0.52;
      doc.text(
        rightText,
        doc.pageSize.width - doc.margin.right - approxWidth,
        contentTop - mm(3.2),
        {
          size: header.rightSize ?? 7.2,
          bold: true,
          color: header.rightColor ?? doc.theme.accent
        }
      );
    }

    const lineY = pageTop - mm(header.lineOffsetTop ?? 18.2);
    doc.line(
      doc.margin.left,
      lineY,
      doc.pageSize.width - doc.margin.right,
      lineY,
      { color: header.lineColor ?? doc.theme.accent, width: 0.75 }
    );
  });

  const footer = spec.footer || {};
  pdf.setFooter((doc, page, total) => {
    const y = mm(7.5);

    doc.line(
      doc.margin.left,
      y + mm(4),
      doc.pageSize.width - doc.margin.right,
      y + mm(4),
      { color: doc.theme.line, width: 0.45 }
    );

    doc.text(footer.left || "MYVELO Service", doc.margin.left, y, {
      size: 6.7,
      bold: true,
      color: footer.leftColor ?? doc.theme.accent
    });

    if (footer.center) {
      const approxWidth = footer.center.length * 6.7 * 0.5;
      doc.text(
        footer.center,
        doc.pageSize.width / 2 - approxWidth / 2,
        y,
        { size: 6.7, color: doc.theme.muted }
      );
    }

    const pageText = `Seite ${page} / ${total}`;
    const approxWidth = pageText.length * 6.7 * 0.5;
    doc.text(
      pageText,
      doc.pageSize.width - doc.margin.right - approxWidth,
      y,
      { size: 6.7, color: doc.theme.muted }
    );
  });

  pdf.renderSchema(spec.schema, spec.data || {});
  return pdf.finalize();
}
