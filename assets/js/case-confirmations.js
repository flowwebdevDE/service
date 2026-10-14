const PAID_SERVICE_CHOICES = new Set(["inspection", "inspection_wear"]);

export function normalizeCaseType(value) {
  return ["warranty", "repair", "return", "exchange"].includes(value)
    ? value
    : "warranty";
}

export function hasPaidServiceConfirmation(caseType, serviceChoice) {
  const type = normalizeCaseType(caseType);
  return (type === "warranty" || type === "repair") && PAID_SERVICE_CHOICES.has(serviceChoice);
}

function paidServiceText(caseType, serviceChoice) {
  const context = normalizeCaseType(caseType) === "repair"
    ? "zur Reparatur"
    : "zum Garantiefall";

  if (serviceChoice === "inspection") {
    return {
      title: "Kostenpflichtige Inspektion bestätigen",
      copy: `Zusätzlich ${context} beauftrage ich die Inspektion für 96 €.`
    };
  }

  return {
    title: "Kostenpflichtige Zusatzarbeit bestätigen",
    copy: `Zusätzlich ${context} beauftrage ich die Inspektion inklusive erforderlicher Verschleißteile für 96 € zuzüglich tatsächlich benötigtem Material.`
  };
}

export function confirmationRequirements(input = {}) {
  const type = normalizeCaseType(input.case_type);
  const serviceChoice = input.service_choice || "none";

  const primary = {
    warranty: {
      key: "primary",
      title: "Garantievorgang bestätigen",
      copy: "Ich bestätige die Angaben zu diesem Garantievorgang sowie den oben aufgeführten Lieferumfang. Dies stellt keine Anerkennung eines Garantieanspruchs dar.",
      pdfText: "Die Angaben zum Garantievorgang und der aufgeführte Lieferumfang wurden vom Kunden bestätigt. Dies stellt keine Anerkennung eines Garantieanspruchs dar."
    },
    repair: {
      key: "primary",
      title: "Reparaturauftrag bestätigen",
      copy: "Ich bestätige den beschriebenen Reparaturauftrag sowie den oben aufgeführten Lieferumfang.",
      pdfText: "Der beschriebene Reparaturauftrag und der aufgeführte Lieferumfang wurden vom Kunden bestätigt."
    },
    return: {
      key: "primary",
      title: "Rückgabe bestätigen",
      copy: "Ich bestätige die Rückgabe des oben beschriebenen Artikels mit dem aufgeführten Lieferumfang.",
      pdfText: "Die Rückgabe des oben beschriebenen Artikels mit dem aufgeführten Lieferumfang wurde vom Kunden bestätigt."
    },
    exchange: {
      key: "primary",
      title: "Tausch bestätigen",
      copy: "Ich bestätige den Tausch des oben beschriebenen Artikels mit dem aufgeführten Lieferumfang.",
      pdfText: "Der Tausch des oben beschriebenen Artikels mit dem aufgeführten Lieferumfang wurde vom Kunden bestätigt."
    }
  }[type];

  const rules = [primary];

  if (hasPaidServiceConfirmation(type, serviceChoice)) {
    const paid = paidServiceText(type, serviceChoice);
    rules.push({
      key: "paid_service",
      title: paid.title,
      copy: paid.copy,
      pdfText: paid.copy
    });
  }

  return rules;
}

export function confirmationActionLabel(input = {}) {
  const rules = confirmationRequirements(input);
  if (rules.length === 1) return rules[0].title;

  const type = normalizeCaseType(input.case_type);
  if (type === "repair") return "Reparatur und Zusatzarbeit bestätigen";
  if (type === "warranty") return "Garantievorgang und Zusatzarbeit bestätigen";
  return "Vorgang bestätigen";
}
