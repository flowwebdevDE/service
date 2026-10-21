import { renderFlowPdfSpec } from "./flowpdf-spec.js?v=7.5";
import { EMBEDDED_MYVELO_LOGO_BYTES } from "./brand-logo-data.js?v=7.5";
import { decodePng } from "./flowpdf.js?v=7.5";
import { confirmationRequirements } from "../case-confirmations.js?v=7.15.1";

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

function caseTypeMeta(value) {
  return {
    warranty: {
      service: true,
      label: "Garantiefall",
      title: "Bestätigung zum Garantie- und Servicevorgang",
      subjectHeading: "2. Besprochener Garantiefall",
      serviceHeading: "4. Zusätzliche kostenpflichtige Arbeiten",
      serviceLabel: "Beauftragt",
      confirmation: "Die oben aufgeführten zusätzlichen kostenpflichtigen Arbeiten dürfen neben dem bereits besprochenen Garantiefall ausgeführt werden.",
      legal: "Diese Bestätigung dokumentiert den vom Kunden bestätigten Stand des Garantie- und Servicevorgangs. Sie stellt keine gesonderte Anerkennung eines Garantieanspruchs dar."
    },
    repair: {
      service: true,
      label: "Reparatur",
      title: "Bestätigung zum Reparaturvorgang",
      subjectHeading: "2. Reparatur / Fehlerbild",
      serviceHeading: "4. Zusätzliche Arbeiten zur Reparatur",
      serviceLabel: "Zusatzleistung",
      confirmation: "Der beschriebene Reparaturauftrag wird bestätigt. Kostenpflichtige Arbeiten erfolgen nur im ausgewählten beziehungsweise gesondert vereinbarten Umfang.",
      legal: "Diese Bestätigung dokumentiert den vom Kunden bestätigten Stand des Reparaturvorgangs."
    },
    return: {
      service: false,
      label: "Rückgabe",
      title: "Bestätigung zur Rückgabe",
      subjectHeading: "2. Grund der Rückgabe",
      serviceHeading: "4. Bearbeitungsumfang",
      serviceLabel: "Vorgangsart",
      confirmation: "Die Rückgabe des oben beschriebenen Artikels mit dem aufgeführten Lieferumfang wird bestätigt.",
      legal: "Diese Bestätigung dokumentiert den vom Kunden bestätigten Stand des Rückgabevorgangs."
    },
    exchange: {
      service: false,
      label: "Tausch",
      title: "Bestätigung zum Tauschvorgang",
      subjectHeading: "2. Grund für den Tausch",
      serviceHeading: "4. Bearbeitungsumfang",
      serviceLabel: "Vorgangsart",
      confirmation: "Der Tauschvorgang für den oben beschriebenen Artikel mit dem aufgeführten Lieferumfang wird bestätigt.",
      legal: "Diese Bestätigung dokumentiert den vom Kunden bestätigten Stand des Tauschvorgangs."
    }
  }[value] || {
    service: true,
    label: "Garantiefall",
    title: "Bestätigung zum Garantie- und Servicevorgang",
    subjectHeading: "2. Besprochener Garantiefall",
    serviceHeading: "4. Zusätzliche kostenpflichtige Arbeiten",
    serviceLabel: "Beauftragt",
    confirmation: "Die oben aufgeführten zusätzlichen kostenpflichtigen Arbeiten dürfen neben dem bereits besprochenen Garantiefall ausgeführt werden.",
    legal: "Diese Bestätigung dokumentiert den vom Kunden bestätigten Stand des Garantie- und Servicevorgangs. Sie stellt keine gesonderte Anerkennung eines Garantieanspruchs dar."
  };
}

function knownPrice(snapshot) {
  if (snapshot?.service_price_mode !== "known") return "";
  const cents = Number(snapshot?.service_price_amount_cents);
  if (!Number.isFinite(cents) || cents < 0) return "";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function serviceText(value, snapshot = {}) {
  const caseType = snapshot.case_type || "warranty";
  if (caseType === "return") return "Rückgabe";
  if (caseType === "exchange") return "Tausch";

  const price = knownPrice(snapshot);
  const priceText = price ? ` · ${price}` : " · Preis nach Absprache";

  if (value === "inspection") {
    return `Inspektion${priceText}`;
  }

  if (value === "inspection_wear") {
    return `Inspektion einschließlich erforderlicher Verschleißteile${priceText} · Material nach tatsächlichem Aufwand`;
  }

  if (caseType === "repair") return "Nur Reparatur";
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
  const shopifyRef = String(snapshot.shopify_ref || "").trim();
  const documentId = shopifyRef || snapshot.public_id || "-";
  const documentLabel = shopifyRef ? "Shopify-Auftrag" : "Service-Referenz";
  const draft = options.mode === "draft";
  const confirmedAt = draft
    ? "Noch nicht bestätigt"
    : formatDate(snapshot.confirmed_at);

  const meta = caseTypeMeta(snapshot.case_type);

  const data = {
    case: {
      documentId,
      documentLabel,
      confirmedAt,
      customer: snapshot.customer_name || "-",
      item: itemText(snapshot),
      model: snapshot.bike_model || "-",
      color: snapshot.bike_color || "-",
      subject: snapshot.case_subject || meta.label,
      delivery: deliveryItems(snapshot),
      service: serviceText(snapshot.service_choice, snapshot),
      note: snapshot.customer_note || "Kein zusätzlicher Hinweis",
      confirmations: confirmationRequirements(snapshot).map(rule => ({
        text: rule.pdfText || rule.copy,
        checked: !draft
      })),
      legal: draft
        ? "Dieser PDF-Export zeigt den aktuellen internen Vorgangsstand. Er ist noch nicht vom Kunden bestätigt und stellt keine Kundenbestätigung dar."
        : meta.legal
    }
  };

  const serviceBlocks = meta.service
    ? [
        {
          type: "heading",
          level: 2,
          text: meta.serviceHeading,
          size: 9.8,
          color: [17, 18, 17],
          accentBar: true,
          accentBarColor: [18, 18, 18],
          gapBefore: 1,
          gapAfter: 4
        },
        {
          type: "field",
          label: meta.serviceLabel,
          field: "case.service",
          size: 8.15,
          labelWidth: 105,
          labelColor: [18, 18, 18],
          gapAfter: 5
        }
      ]
    : [];

  const noteNumber = meta.service ? 5 : 4;

  const schema = {
    blocks: [
      {
        type: "heading",
        level: 1,
        text: draft ? `${meta.label} - Entwurf` : meta.title,
        size: 18.2,
        color: [17, 18, 17],
        gapAfter: 3
      },
      {
        type: "paragraph",
        text: draft ? "Interner Vorgangsstand - noch nicht vom Kunden bestätigt" : "Kundenseitige Bestätigung des vereinbarten Vorgangsstands",
        size: 7.5,
        color: [92, 96, 92],
        lineHeight: 9.0,
        gapAfter: 9
      },

      {
        type: "field",
        label: documentLabel,
        field: "case.documentId",
        size: 8.0,
        labelWidth: 105,
        labelColor: [18, 18, 18],
        gapAfter: 4
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
        text: meta.subjectHeading,
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 2,
        gapAfter: 4
      },
      {
        type: "note",
        title: meta.subjectHeading.replace(/^\d+\.\s*/, ""),
        field: "case.subject",
        size: 8.15,
        titleSize: 7.4,
        fill: [249, 249, 247],
        stroke: [224, 224, 219]
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

      ...serviceBlocks,

      {
        type: "heading",
        level: 2,
        text: `${noteNumber}. Hinweis des Kunden`,
        size: 9.8,
        color: [17, 18, 17],
        accentBar: true,
        accentBarColor: [18, 18, 18],
        gapBefore: 1,
        gapAfter: 4
      },
      {
        type: "note",
        title: "Kundenhinweis",
        field: "case.note",
        size: 8.0,
        titleSize: 7.4,
        fill: [249, 249, 247],
        stroke: [224, 224, 219]
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
      marginTop: 24,
      marginRight: 14,
      marginBottom: 14,
      marginLeft: 14,
      textColor: [17, 18, 17],
      mutedColor: [104, 104, 100],
      lineColor: [218, 218, 214],
      surfaceColor: [249, 249, 247],
      accentColor: [18, 18, 18]
    },
    meta: {
      title: draft
        ? `${meta.label} Entwurf ${documentId}`
        : `${meta.title} ${documentId}`,
      author: "MYVELO Service",
      subject: draft
        ? `Interner Entwurf · ${meta.label}`
        : `Kundenbestätigung · ${meta.label}`
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
      bandHeight: 1.4,
      bandColor: [17, 18, 17],
      lineColor: [218, 218, 214],
      labelColor: [78, 80, 78],
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
