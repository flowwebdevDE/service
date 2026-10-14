import { renderFlowPdfSpec } from "./flowpdf-spec.js?v=7.5";
import { EMBEDDED_MYVELO_LOGO_BYTES } from "./brand-logo-data.js?v=7.5";
import { decodePng } from "./flowpdf.js?v=7.5";

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function itemText(snapshot) {
  return snapshot.item_type === "battery"
    ? "Akku"
    : "Komplettes Fahrrad";
}

function serviceText(value) {
  if (value === "inspection") {
    return "Inspektion, 96,00 EUR";
  }

  if (value === "inspection_wear") {
    return "Inspektion einschließlich erforderlicher Verschleißteile, 96,00 EUR zuzüglich Material nach tatsächlichem Aufwand";
  }

  return "Keine zusätzlichen kostenpflichtigen Arbeiten";
}

function deliveryItems(snapshot) {
  const items = [
    { text: itemText(snapshot), checked: true }
  ];

  if (snapshot.required_charger) {
    items.push({ text: "Ladegerät", checked: true });
  }

  if (snapshot.required_keys) {
    items.push({ text: "Schlüssel", checked: true });
  }

  return items;
}

export function buildWarrantyFlowSpec(snapshot, options = {}) {
  const documentId = snapshot.public_id || "-";
  const draft = options.mode === "draft";
  const confirmedAt = draft
    ? "Noch nicht bestätigt"
    : formatDate(snapshot.confirmed_at);

  const data = {
    case: {
      documentId,
      shopifyRef: snapshot.shopify_ref || "-",
      confirmedAt,
      customer: snapshot.customer_name || "-",
      item: itemText(snapshot),
      model: snapshot.bike_model || "-",
      color: snapshot.bike_color || "-",
      subject: snapshot.case_subject || "Bereits besprochener Garantiefall",
      delivery: deliveryItems(snapshot),
      service: serviceText(snapshot.service_choice),
      note: snapshot.customer_note || "Kein zusätzlicher Hinweis",
      confirmations: [
        {
          text: "Die oben aufgeführten zusätzlichen kostenpflichtigen Arbeiten dürfen neben dem bereits besprochenen Garantiefall ausgeführt werden.",
          checked: !draft
        },
        {
          text: "Der aufgeführte Lieferumfang wird vollständig mitgesendet beziehungsweise übergeben.",
          checked: !draft
        }
      ],
      legal: draft
        ? "Dieser PDF-Export zeigt den aktuellen internen Vorgangsstand. Er ist noch nicht vom Kunden bestätigt und stellt keine Kundenbestätigung dar."
        : "Diese Bestätigung dokumentiert den vom Kunden bestätigten Stand des Garantie- und Servicevorgangs. Sie stellt keine gesonderte Anerkennung eines Garantieanspruchs dar."
    }
  };

  const schema = {
    blocks: [
      {
        type: "heading",
        level: 1,
        text: draft ? "Servicevorgang - Entwurf" : "Bestätigung zum Garantie- und Servicevorgang",
        size: 17.0,
        color: [17, 18, 17],
        gapAfter: 4
      },
      {
        type: "paragraph",
        text: draft ? "Interner Vorgangsstand - noch nicht vom Kunden bestätigt" : "Kundenseitige Bestätigung des vereinbarten Vorgangsstands",
        size: 7.7,
        color: [92, 96, 92],
        lineHeight: 9.2,
        gapAfter: 7
      },

      {
        type: "twoColumn",
        items: [
          { label: "Vorgang", field: "case.documentId", size: 8.0 },
          { label: "Shopify-Auftrag", field: "case.shopifyRef", size: 8.0 }
        ],
        gap: 18,
        labelColor: [18, 18, 18]
      },
      {
        type: "twoColumn",
        items: [
          { label: "Kunde", field: "case.customer", size: 8.0 },
          { label: "Bestätigt am", field: "case.confirmedAt", size: 8.0 }
        ],
        gap: 18,
        labelColor: [18, 18, 18]
      },
      { type: "divider", gap: 4 },

      {
        type: "heading",
        level: 2,
        text: "1. Gegenstand des Vorgangs",
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 2,
        gapAfter: 4
      },
      {
        type: "twoColumn",
        items: [
          { label: "Gegenstand", field: "case.item", size: 8.0 },
          { label: snapshot.item_type === "battery" ? "Akku von Modell" : "Modell", field: "case.model", size: 8.0 }
        ],
        gap: 18,
        labelColor: [18, 18, 18]
      },
      {
        type: "field",
        label: "Farbe",
        field: "case.color",
        size: 8.0,
        gapAfter: 2
      },

      {
        type: "heading",
        level: 2,
        text: "2. Besprochener Garantiefall",
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 2,
        gapAfter: 4
      },
      {
        type: "paragraph",
        field: "case.subject",
        size: 8.15,
        lineHeight: 10.0,
        gapAfter: 6
      },

      {
        type: "heading",
        level: 2,
        text: "3. Vereinbarter Lieferumfang",
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 1,
        gapAfter: 4
      },
      {
        type: "checklist",
        field: "case.delivery",
        size: 8.0,
        lineHeight: 9.4,
        markerSize: 9.5,
        gapAfter: 5,
        bold: false,
        checkedFill: [255, 255, 255],
        markerStroke: [142, 142, 136],
        checkColor: [18, 18, 18]
      },

      {
        type: "heading",
        level: 2,
        text: "4. Zusätzliche kostenpflichtige Arbeiten",
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 1,
        gapAfter: 4
      },
      {
        type: "field",
        label: "Beauftragt",
        field: "case.service",
        size: 8.15,
        labelWidth: 105,
        labelColor: [18, 18, 18],
        gapAfter: 5
      },

      {
        type: "heading",
        level: 2,
        text: "5. Hinweis des Kunden",
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 1,
        gapAfter: 4
      },
      {
        type: "paragraph",
        field: "case.note",
        size: 8.15,
        lineHeight: 10.0,
        gapAfter: 5
      },

      {
        type: "anchor",
        mm: 91,
        firstPageOnly: true
      },
      {
        type: "divider",
        gap: 3,
        color: [18, 18, 18],
        width: 0.9
      },
      {
        type: "heading",
        level: 2,
        text: draft ? "Kundenbestätigung ausstehend" : "Bestätigung des Kunden",
        size: 10.2,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 2,
        gapAfter: 4
      },
      {
        type: "paragraph",
        text: draft ? "Die folgenden Punkte sind noch nicht vom Kunden bestätigt:" : "Mit der Bestätigung wurde der nachstehende Vorgangsstand verbindlich festgehalten:",
        size: 7.4,
        color: [82, 82, 79],
        lineHeight: 8.8,
        gapAfter: 4
      },
      {
        type: "checklist",
        field: "case.confirmations",
        size: 7.2,
        lineHeight: 8.5,
        gapAfter: 5,
        bold: false,
        checkedFill: [255, 255, 255],
        markerStroke: [142, 142, 136],
        checkColor: [18, 18, 18]
      },
      {
        type: "twoColumn",
        items: [
          { label: "Kunde", field: "case.customer", size: 7.5 },
          { label: "Bestätigt am", field: "case.confirmedAt", size: 7.5 }
        ],
        gap: 18,
        labelColor: [18, 18, 18]
      },
      {
        type: "field",
        label: "Dokument-ID",
        field: "case.documentId",
        size: 7.5,
        labelWidth: 105,
        labelColor: [18, 18, 18],
        gapAfter: 3
      },
      {
        type: "paragraph",
        field: "case.legal",
        size: 6.25,
        color: [104, 104, 100],
        lineHeight: 7.6,
        gapAfter: 0
      }
    ]
  };

  return {
    options: {
      marginTop: 22,
      marginRight: 14,
      marginBottom: 14,
      marginLeft: 14,
      textColor: [17, 18, 17],
      mutedColor: [104, 104, 100],
      lineColor: [218, 218, 214],
      surfaceColor: [247, 247, 245],
      accentColor: [18, 18, 18]
    },
    meta: {
      title: draft
        ? `Servicevorgang Entwurf ${documentId}`
        : `Bestätigung Garantie- und Servicevorgang ${documentId}`,
      author: "MYVELO Service",
      subject: draft
        ? "Interner Entwurf zum Garantie- und Servicevorgang"
        : "Kundenbestätigung zum Garantie- und Servicevorgang"
    },
    header: {
      brand: "",
      label: draft ? "SERVICE · ENTWURF" : "SERVICE · BESTÄTIGUNG",
      logoImage: "brandLogo",
      documentId,
      brandSize: 15.2,
      labelSize: 6.6,
      rightSize: 7.0,
      offsetTop: 7.0,
      lineOffsetTop: 18.2,
      logoWidth: 34.0,
      logoHeight: 6.35,
      bandHeight: 2.2,
      bandColor: [17, 18, 17],
      lineColor: [18, 18, 18],
      labelColor: [17, 18, 17],
      rightColor: [18, 18, 18]
    },
    footer: {
      left: "MYVELO · SERVICE",
      center: documentId,
      leftColor: [17, 18, 17]
    },
    schema,
    data
  };
}

export async function renderWarrantyFlowPdf(snapshot, options = {}) {
  const spec = buildWarrantyFlowSpec(snapshot, options);
  const logoBytes = options.logoBytes || EMBEDDED_MYVELO_LOGO_BYTES;

  spec.resources = {
    images: {
      brandLogo: await decodePng(logoBytes)
    }
  };

  return renderFlowPdfSpec(spec);
}
