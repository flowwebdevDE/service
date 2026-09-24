import { renderWarrantyFlowPdf } from './warranty-flowpdf.js';
import { renderFlowPdfSpec } from './flowpdf-spec.js';
import { decodePng } from './flowpdf.js';
import { EMBEDDED_MYVELO_LOGO_BYTES } from './brand-logo-data.js';
const kind = { warranty:'Garantie',repair:'Reparatur',return:'Retoure' };
const value = input => input === undefined || input === null || input === '' ? '–' : String(input);
const date = input => input ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(input)) : '–';
const euro = input => typeof input==='number' ? `${input.toFixed(2)} €` : '–';
const modeText = data => ({fixed:`Festpreis ${euro(data.repair_price_value)}`,estimate:`Kostenvoranschlag ${euro(data.repair_estimate_value)} · Abweichungsregel: ${value(data.repair_deviation_rule)}`,maximum:`Maximalbetrag ${euro(data.repair_maximum_value)}`,actual:`Tatsächlicher Aufwand · Grundlage: ${value(data.repair_calculation_basis)} · Rücksprache: ${value(data.repair_deviation_rule)}`,pending:'Noch keine Kostenfreigabe vereinbart; nur Einsendung und Prüfung bestätigt.'})[data.repair_price_mode] || '–';
// Retain the pre-V8 warranty document layout as the visual template for every
// new document type: compact two-column identification, numbered sections,
// structured fields, and an explicit confirmation / internal decision section.
const heading = (text,number) => ({type:'heading',level:2,text:`${number}. ${text}`,size:9.8,color:[17,18,17],accentBar:true,accentBarColor:[18,18,18],gapBefore:3,gapAfter:5});
const field = (label,text) => ({type:'field',label,value:value(text),size:8.15,labelWidth:105,labelColor:[18,18,18],gapAfter:5});
const paragraph = (text) => ({type:'paragraph',text:value(text),size:8.15,lineHeight:10,gapAfter:6});
const cols = (...items) => ({type:'twoColumn',items:items.map(([label,text])=>({label,value:value(text),size:8})),gap:18,labelColor:[18,18,18]});
const line = () => ({type:'divider',gap:4,color:[18,18,18],width:.75});
async function specPdf(snapshot,{internal=false,events=[]}={}) {
  const type=snapshot.case_type||'warranty';
  const isReturn=type==='return';const isRepair=type==='repair';
  const title=isReturn?'Retourenvorgang':isRepair?'Reparaturauftrag':'Garantievorgang';
  const documentTitle=internal?'Internes Serviceblatt':'Kundenbestätigung';
  const item=snapshot.item_type==='battery'?'Akku':'Fahrrad';
  const delivery=[item,snapshot.required_charger?'Ladegerät':null,snapshot.required_keys?'Schlüssel':null].filter(Boolean);
  const blocks=[
    {type:'heading',level:1,text:`${title} · ${documentTitle}`,size:15.2,gapAfter:5},
    {type:'paragraph',text:internal?'Interner Vorgangsstand · kein Dokument einer neuen Kundenfreigabe.':'Dokumentation des vom Kunden bestätigten Vorgangsstands.',size:7.5,color:[92,96,92],gapAfter:7},
    cols(['Vorgang',snapshot.public_id],['Shopify-Auftrag',snapshot.shopify_ref]),
    cols(['Kunde',snapshot.customer_name],[internal?'Erstellt am':'Bestätigt am',internal?date(snapshot.created_at):date(snapshot.confirmed_at)]),
    line(),
    heading('Gegenstand des Vorgangs',1),
    cols(['Gegenstand',item],['Modell',snapshot.bike_model]),
    heading(isReturn?'Vereinbarte Rücksendung':isRepair?'Reparaturwunsch':'Besprochener Garantiefall',2),
    paragraph(snapshot.case_subject),
    ...(isRepair?[field('Reparaturumfang',snapshot.repair_scope)]:[]),
    heading('Vereinbarter Lieferumfang',3),
    {type:'checklist',items:delivery.map(text=>({text,checked:true})),size:8,lineHeight:9.4,markerSize:9.5,gapAfter:6,bold:false,checkedFill:[255,255,255],markerStroke:[142,142,136],checkColor:[18,18,18]},
  ];
  let section=4;
  if(isRepair){blocks.push(heading('Kosten- und Freigaberegel',section++),field('Vereinbarung',modeText(snapshot)));
    if(internal)blocks.push(field('Interner Freigabestand',snapshot.repair_approval_state),field('Aktueller Kostenstand',snapshot.repair_actual_price));}
  if(type==='warranty'){blocks.push(heading('Kostenpflichtige Zusatzarbeiten',section++),field('Beauftragt',({none:'Keine',inspection:'Inspektion 96 €',inspection_wear:'Inspektion 96 € + tatsächliche Materialkosten'})[snapshot.service_choice]||'Keine'));}
  if(isReturn&&internal){blocks.push(heading('Interne Prüfung',section++),field('Zustand',snapshot.return_condition),field('Mängel',snapshot.return_defects),field('Notwendige Arbeiten',snapshot.return_required_work),field('Prüfergebnis',snapshot.return_result),line(),heading('Verkaufsentscheidung',section++),field('Entscheidung',({approved:'Für Verkauf freigegeben',rejected:'Nicht für Verkauf freigegeben',pending:'Weitere Arbeiten / Prüfung erforderlich'})[snapshot.return_sales_decision]||'Noch nicht entschieden'));}
  blocks.push(heading('Hinweis des Kunden',section++),paragraph(snapshot.customer_note||'Kein zusätzlicher Hinweis'));
  if(!internal){blocks.push(line(),heading('Bestätigung des Kunden',section++),paragraph('Mit dieser Bestätigung wurde der oben beschriebene Vorgangsstand festgehalten.'),cols(['Kunde',snapshot.customer_name],['Bestätigt am',date(snapshot.confirmed_at)]));
    if(type==='warranty')blocks.push(paragraph('Diese Bestätigung stellt keine Anerkennung eines Garantieanspruchs dar.'));
    if(isRepair&&snapshot.repair_price_mode==='pending')blocks.push(paragraph('Die Bestätigung ist keine Freigabe unbegrenzter Reparaturkosten. Eine gesonderte Kostenvereinbarung ist erforderlich.'));
  }else{blocks.push(line(),heading('Interner Bearbeitungsstand',section++),field('Bearbeitungsstatus',snapshot.service_status),field('Archiviert',snapshot.archived_at?'Ja':'Nein'));
    if(events.length){blocks.push(heading('Wesentliche Ereignisse',section++),...events.map(e=>paragraph(`${date(e.created_at)} · ${e.message||e.event_type}`)));}
  }
  return renderFlowPdfSpec({
    options:{marginTop:23,marginBottom:15,marginLeft:14,marginRight:14,textColor:[17,17,17],mutedColor:[92,96,92],lineColor:[221,221,218],surfaceColor:[247,247,244],accentColor:[17,17,17]},
    meta:{title:`MYVELO Service ${snapshot.public_id}`,author:'MYVELO Service'},
    header:{logoImage:'brandLogo',documentId:snapshot.public_id,label:internal?'INTERN · SERVICE':'SERVICE · BESTÄTIGUNG',brand:'',bandColor:[17,17,17]},
    footer:{left:'MYVELO SERVICE',center:value(snapshot.public_id)},
    resources:{images:{brandLogo:await decodePng(EMBEDDED_MYVELO_LOGO_BYTES)}},
    schema:{blocks},data:{}
  });
}

export async function customerServicePdf(item) {
  if(item.status!=='confirmed'||!item.pdf_snapshot) throw new Error('Kunden-PDF erst nach Bestätigung verfügbar.');
  const snapshot=item.pdf_snapshot;
  return snapshot.case_type==='repair'||snapshot.case_type==='return'
    ? specPdf(snapshot) : renderWarrantyFlowPdf(snapshot);
}
export async function internalServicePdf(item,events=[]) {
  return specPdf(item,{internal:true,events});
}
export async function pdfBlobUrl(bytes) { return URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})); }
