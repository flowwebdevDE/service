import { renderFlowPdfSpec } from "./flowpdf-spec.js?v=7.15.47";
import { EMBEDDED_MYVELO_LOGO_BYTES } from "./brand-logo-data.js?v=7.5";
import { decodePng, mm } from "./flowpdf.js?v=7.15.47";
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

const PDF_TEXT_LIMITS = Object.freeze({
  caseSubject: 180,
  customerNote: 180,
  workPerformed: 420,
  workResult: 260,
  batteryNote: 140
});

function assertPdfTextLimits(snapshot) {
  const checks = [
    ["Betreff", snapshot.case_subject, PDF_TEXT_LIMITS.caseSubject],
    ["Kundenhinweis", snapshot.customer_note, PDF_TEXT_LIMITS.customerNote],
    ["Durchgeführte Arbeiten", snapshot.work_performed, PDF_TEXT_LIMITS.workPerformed],
    ["Ergebnis / Abschluss", snapshot.work_result, PDF_TEXT_LIMITS.workResult],
    ["Akkutest-Hinweis", snapshot.battery_test_note, PDF_TEXT_LIMITS.batteryNote]
  ];
  for (const [label, value, limit] of checks) {
    if (String(value || "").trim().length > limit) {
      throw new Error(`${label} ist zu lang für den einseitigen Servicebericht (max. ${limit} Zeichen).`);
    }
  }
}

function batteryMetricFields(snapshot) {
  if (!snapshot?.battery_test_enabled) return [];
  const fields = [];
  const push = (label, value, unit = "") => {
    if (value === null || value === undefined || value === "") return;
    const formatted = typeof value === "number" || Number.isFinite(Number(value))
      ? formatMetric(value, unit === "V" ? 2 : 1)
      : String(value);
    if (!formatted) return;
    fields.push({ label, value: `${formatted}${unit ? ` ${unit}` : ""}`, bold: true });
  };
  push("Nennkapazität", snapshot.battery_test_nominal_wh, "Wh");
  push("Gemessen", snapshot.battery_test_measured_wh, "Wh");
  push("SOH", snapshot.battery_test_soh_percent, "%");
  push("Spannung", snapshot.battery_test_voltage_v, "V");
  push("Ladezyklen", snapshot.battery_test_cycles, "");
  const status = batteryStatusLabel(snapshot.battery_test_status);
  if (status) fields.push({ label: "Bewertung", value: status, bold: true });
  return fields;
}

export function buildWarrantyFlowSpec(snapshot, options = {}) {
  assertPdfTextLimits(snapshot);
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
      hasWorkReport: Boolean(String(snapshot.work_performed || "").trim() || String(snapshot.work_result || "").trim()),
      hasWorkshopDocumentation: Boolean(
        String(snapshot.work_performed || "").trim() ||
        String(snapshot.work_result || "").trim() ||
        (snapshot.battery_test_enabled && (batteryMetricFields(snapshot).length || String(snapshot.battery_test_note || "").trim()))
      ),
      batteryFields: batteryMetricFields(snapshot),
      batteryNote: String(snapshot.battery_test_note || "").trim(),
      hasBatteryTest: Boolean(snapshot.battery_test_enabled && (batteryMetricFields(snapshot).length || String(snapshot.battery_test_note || "").trim())),
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
        height: mm(15.8),
        radius: mm(3.6),
        padX: mm(4.4),
        padY: mm(2.7),
        eyebrowSize: 5.8,
        titleSize: 14.6,
        subtitleSize: 6.2,
        statusSize: 5.3,
        gapAfter: mm(1.8)
      },
      {
        type: "metaPanel",
        items: [
          { label: documentLabel, field: "case.documentId" },
          { label: "Kunde", field: "case.customer" },
          { label: draft ? "Status" : "Bestätigt am", field: "case.confirmedAt" }
        ],
        height: mm(12.2),
        radius: mm(3.5),
        padX: mm(4.4),
        padY: mm(2.4),
        labelSize: 5.5,
        valueSize: 7.2,
        gapAfter: mm(1.8)
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
        padX: mm(4.2), padY: mm(2.4), headerHeight: mm(6.6), badgeSize: mm(5.8), titleSize: 8.8, labelSize: 5.1, fieldSize: 6.8,
        gapAfter: mm(1.8)
      },
      {
        type: "longTextCard",
        number: "2",
        title: subjectTitle,
        bodyLabel: subjectTitle,
        bodyField: "case.subject",
        padX: mm(4.2), padY: mm(2.4), headerHeight: mm(6.6), badgeSize: mm(5.8), titleSize: 8.8, labelSize: 5.1, bodySize: 6.3,
        gapAfter: mm(1.8)
      },
      {
        type: "contentCard",
        number: "3",
        title: "Vereinbarter Lieferumfang",
        tagsField: "case.deliveryTags",
        padX: mm(4.2), padY: mm(2.4), headerHeight: mm(6.6), badgeSize: mm(5.8), titleSize: 8.8, tagSize: 5.9,
        gapAfter: mm(1.8)
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
            padX: mm(4.2), padY: mm(2.4), headerHeight: mm(6.6), badgeSize: mm(5.8), titleSize: 8.8, labelSize: 5.1, bodySize: 6.2, leadSize: 6.4,
            gapAfter: mm(1.8)
          }]
        : [{
            type: "longTextCard",
            number: "4",
            title: "Hinweis des Kunden",
            bodyLabel: "Kundenhinweis",
            bodyField: "case.note",
            padX: mm(4.2), padY: mm(2.4), headerHeight: mm(6.6), badgeSize: mm(5.8), titleSize: 8.8, labelSize: 5.1, bodySize: 6.2, leadSize: 6.4,
            gapAfter: mm(1.8)
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
        compact: true, showPill: false,
        padX: mm(4.2), padY: mm(2.4), titleSize: 8.8, subtitleSize: 5.8, itemSize: 5.9, legalSize: 4.9,
        gapAfter: (!draft && (
          String(snapshot.work_performed || "").trim() ||
          String(snapshot.work_result || "").trim() ||
          snapshot.battery_test_enabled
        )) ? mm(4.0) : 0
      },
      ...(!draft ? [
        {
          type: "workshopReportCard",
          when: "case.hasWorkshopDocumentation",
          number: "5",
          title: "Werkstattbericht",
          workPerformedField: "case.workPerformed",
          workResultField: "case.workResult",
          batteryFieldsField: "case.batteryFields",
          batteryNoteField: "case.batteryNote",
          padX: mm(4.2), padY: mm(2.2), titleSize: 8.7, labelSize: 4.9, bodySize: 5.6,
          gapAfter: 0
        }
      ] : [])
    ]
  };

  return {
    options: {
      marginTop: 18.5,
      marginRight: 13.5,
      marginBottom: 9.5,
      marginLeft: 13.5,
      maxPages: 1,
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
      offsetTop: 5.2,
      lineOffsetTop: 15.6,
      logoWidth: 30.5,
      logoHeight: 5.7,
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
