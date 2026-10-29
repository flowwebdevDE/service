import { renderFlowPdfSpec } from "./flowpdf-spec.js?v=7.15.32";
import { EMBEDDED_MYVELO_LOGO_BYTES } from "./brand-logo-data.js?v=7.5";
import { decodePng, mm } from "./flowpdf.js?v=7.15.32";
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

function formatMetric(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(number);
}

function batteryStatusLabel(value) {
  return {
    ok: "In Ordnung",
    limited: "Eingeschränkt",
    attention: "Auffällig / prüfen"
  }[value] || "";
}

function batteryTestText(snapshot) {
  if (!snapshot?.battery_test_enabled) return "";

  const lines = [];
  const add = (label, value, unit = "") => {
    if (value === null || value === undefined || value === "") return;
    const formatted = typeof value === "number" || Number.isFinite(Number(value))
      ? formatMetric(value, unit === "V" ? 2 : 1)
      : String(value);
    if (!formatted) return;
    lines.push(`${label}: ${formatted}${unit ? ` ${unit}` : ""}`);
  };

  add("Nennkapazität", snapshot.battery_test_nominal_wh, "Wh");
  add("Gemessene Kapazität", snapshot.battery_test_measured_wh, "Wh");
  add("SOH / Restkapazität", snapshot.battery_test_soh_percent, "%");
  add("Spannung", snapshot.battery_test_voltage_v, "V");
  add("Ladezyklen", snapshot.battery_test_cycles, "");

  const status = batteryStatusLabel(snapshot.battery_test_status);
  if (status) lines.push(`Bewertung: ${status}`);

  const note = String(snapshot.battery_test_note || "").trim();
  if (note) {
    if (lines.length) lines.push("");
    lines.push("Messhinweis:");
    lines.push(note);
  }

  return lines.join("\n");
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
  const delivery = deliveryItems(snapshot);
  const subjectTitle = meta.subjectHeading.replace(/^\d+\.\s*/, "");

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
      delivery,
      deliveryTags: delivery.map(item => item.text),
      service: serviceText(snapshot.service_choice, snapshot),
      note: snapshot.customer_note || "Kein zusätzlicher Hinweis",
      workPerformed: String(snapshot.work_performed || "").trim(),
      workResult: String(snapshot.work_result || "").trim(),
      batteryTest: batteryTestText(snapshot),
      hasWorkPerformed: Boolean(String(snapshot.work_performed || "").trim()),
      hasWorkResult: Boolean(String(snapshot.work_result || "").trim()),
      hasBatteryTest: Boolean(snapshot.battery_test_enabled && batteryTestText(snapshot)),
      confirmations: confirmationRequirements(snapshot).map(rule => ({
        text: rule.pdfText || rule.copy,
        checked: !draft
      })),
      legal: draft
        ? "Dieser PDF-Export zeigt den aktuellen internen Vorgangsstand. Er ist noch nicht vom Kunden bestätigt und stellt keine Kundenbestätigung dar."
        : meta.legal
    }
  };

  const schema = {
    blocks: [
      {
        type: "premiumHero",
        eyebrow: draft ? "Interner Vorgangsstand" : "Kundenbestätigung",
        title: meta.label,
        subtitle: draft
          ? "Aktueller interner Stand - noch nicht vom Kunden bestätigt."
          : "Verbindlich dokumentierter, vom Kunden bestätigter Vorgangsstand.",
        status: draft ? "Nicht bestätigt" : "Bestätigt",
        height: mm(25.5),
        radius: mm(4.0),
        padX: mm(5.2),
        padY: mm(4.6),
        gapAfter: mm(4.0)
      },
      {
        type: "metaPanel",
        items: [
          { label: documentLabel, field: "case.documentId" },
          { label: "Kunde", field: "case.customer" },
          { label: draft ? "Status" : "Bestätigt am", field: "case.confirmedAt" }
        ],
        height: mm(18.5),
        radius: mm(4.0),
        padX: mm(5.2),
        padY: mm(4.0),
        gapAfter: mm(4.0)
      },
      {
        type: "contentCard",
        number: "1",
        title: "Gegenstand",
        columns: 3,
        fields: [
          { label: "Gegenstand", field: "case.item", bold: true },
          { label: snapshot.item_type === "battery" ? "Akku von Modell" : "Modell", field: "case.model", bold: true },
          { label: "Farbe", field: "case.color" }
        ],
        gapAfter: mm(4.0)
      },
      {
        type: "longTextCard",
        number: "2",
        title: subjectTitle,
        bodyLabel: subjectTitle,
        bodyField: "case.subject",
        gapAfter: mm(4.0)
      },
      {
        type: "contentCard",
        number: "3",
        title: "Vereinbarter Lieferumfang",
        tagsField: "case.deliveryTags",
        gapAfter: mm(4.0)
      },
      ...(meta.service
        ? [{
            type: "longTextCard",
            number: "4",
            title: "Service & Kundenhinweis",
            leadLabel: meta.serviceLabel,
            leadField: "case.service",
            bodyLabel: "Kundenhinweis",
            bodyField: "case.note",
            gapAfter: mm(4.0)
          }]
        : [{
            type: "longTextCard",
            number: "4",
            title: "Hinweis des Kunden",
            bodyLabel: "Kundenhinweis",
            bodyField: "case.note",
            gapAfter: mm(4.0)
          }]),
      {
        type: "confirmationCard",
        draft,
        title: draft ? "Kundenbestätigung ausstehend" : "Bestätigung des Kunden",
        subtitle: draft
          ? "Die aufgeführten Punkte wurden noch nicht vom Kunden bestätigt."
          : "Der nachstehende Vorgangsstand wurde verbindlich bestätigt.",
        itemsField: "case.confirmations",
        customerField: "case.customer",
        confirmedAtField: "case.confirmedAt",
        legalField: "case.legal",
        gapAfter: (!draft && (
          String(snapshot.work_performed || "").trim() ||
          String(snapshot.work_result || "").trim() ||
          snapshot.battery_test_enabled
        )) ? mm(4.0) : 0
      },
      ...(!draft ? [
        {
          type: "longTextCard",
          when: "case.hasWorkPerformed",
          number: "5",
          title: "Durchgeführte Arbeiten",
          bodyLabel: "Arbeitsdokumentation",
          bodyField: "case.workPerformed",
          gapAfter: mm(4.0)
        },
        {
          type: "longTextCard",
          when: "case.hasWorkResult",
          number: "6",
          title: "Ergebnis / Abschluss",
          bodyLabel: "Ergebnis",
          bodyField: "case.workResult",
          gapAfter: mm(4.0)
        },
        {
          type: "longTextCard",
          when: "case.hasBatteryTest",
          number: "7",
          title: "Akkutest",
          bodyLabel: "Messwerte & Ergebnis",
          bodyField: "case.batteryTest",
          gapAfter: 0
        }
      ] : [])
    ]
  };

  return {
    options: {
      marginTop: 24,
      marginRight: 16,
      marginBottom: 14,
      marginLeft: 16,
      textColor: [17, 18, 17],
      mutedColor: [98, 98, 94],
      lineColor: [218, 218, 213],
      surfaceColor: [250, 250, 248],
      accentColor: [36, 36, 34]
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
      label: "SERVICE",
      logoImage: "brandLogo",
      rightText: "",
      continuationText: "",
      brandSize: 15.2,
      labelSize: 6.6,
      rightSize: 6.4,
      offsetTop: 7.2,
      lineOffsetTop: 18.4,
      logoWidth: 34.0,
      logoHeight: 6.35,
      bandHeight: 0,
      pageBackground: [255, 255, 255],
      showLine: false,
      rightPill: false,
      rightPillHeight: 7.0,
      rightPillFill: [244, 244, 241],
      rightPillStroke: [202, 202, 196],
      rightPillText: [42, 42, 39],
      labelColor: [78, 80, 78]
    },
    footer: {
      left: "MYVELO · SERVICE",
      center: meta.label,
      leftColor: [17, 18, 17],
      showLine: false
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
