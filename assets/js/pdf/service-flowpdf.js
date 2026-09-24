import { renderWarrantyFlowPdf } from './warranty-flowpdf.js';
import { renderFlowPdfSpec } from './flowpdf-spec.js';
import { decodePng } from './flowpdf.js';
import { EMBEDDED_MYVELO_LOGO_BYTES } from './brand-logo-data.js';
const kind = { warranty:'Garantie',repair:'Reparatur',return:'Retoure' };
const value = input => input === undefined || input === null || input === '' ? '–' : String(input);
const date = input => input ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(input)) : '–';
const euro = input => typeof input==='number' ? `${input.toFixed(2)} €` : '–';
const modeText = data => ({fixed:`Festpreis ${euro(data.repair_price_value)}`,estimate:`Kostenvoranschlag ${euro(data.repair_estimate_value)} · Abweichungsregel: ${value(data.repair_deviation_rule)}`,maximum:`Maximalbetrag ${euro(data.repair_maximum_value)}`,actual:`Tatsächlicher Aufwand · Grundlage: ${value(data.repair_calculation_basis)} · Rücksprache: ${value(data.repair_deviation_rule)}`,pending:'Noch keine Kostenfreigabe vereinbart; nur Einsendung und Prüfung bestätigt.'})[data.repair_price_mode] || '–';
async function specPdf(snapshot,{internal=false,events=[]}={}) {
  // Confirmed PDF always receives the persisted snapshot; internal PDF receives live case fields.
  const fields=[
    ['Vorgang',value(snapshot.public_id)],['Shopify-Bestellung',value(snapshot.shopify_ref)],
    ['Kunde',value(snapshot.customer_name)],['Gegenstand',snapshot.item_type==='battery'?'Akku':'Fahrrad'],
    ['Modell',value(snapshot.bike_model)],['Anliegen',value(snapshot.case_subject)],
    ['Lieferumfang', [snapshot.item_type==='battery'?'Akku':'Fahrrad',snapshot.required_charger?'Ladegerät':null,snapshot.required_keys?'Schlüssel':null].filter(Boolean).join(' · ')],
  ];
  if(snapshot.case_type==='repair') fields.push(['Reparaturumfang',value(snapshot.repair_scope)],['Kostenvereinbarung',modeText(snapshot)]);
  if(snapshot.case_type==='return' && internal) fields.push(
    ['Zustand',value(snapshot.return_condition)],['Mängel',value(snapshot.return_defects)],
    ['Erforderliche Arbeiten',value(snapshot.return_required_work)],['Prüfergebnis',value(snapshot.return_result)],
    ['Verkaufsentscheidung',({approved:'Für Verkauf freigegeben',rejected:'Nicht für Verkauf freigegeben',pending:'Weitere Arbeiten / Prüfung erforderlich'})[snapshot.return_sales_decision]||'Noch nicht entschieden']);
  if(snapshot.case_type==='repair' && internal) fields.push(['Interne Freigabe',value(snapshot.repair_approval_state)]);
  if(snapshot.case_type==='warranty') fields.push(['Zusatzarbeiten',({none:'Keine',inspection:'Inspektion 96 €',inspection_wear:'Inspektion 96 € + tatsächliche Materialkosten'})[snapshot.service_choice]||'Keine']);
  fields.push(['Kundenhinweis',value(snapshot.customer_note)]);
  if(!internal) fields.push(['Bestätigungszeitpunkt',date(snapshot.confirmed_at)]);
  if(internal) fields.push(['Bearbeitungsstatus',value(snapshot.service_status)],['Archiviert',snapshot.archived_at?'Ja':'Nein']);
  const blocks=[
    {type:'heading',level:1,text:`${kind[snapshot.case_type]||'Garantie'} · ${internal?'Internes Serviceblatt':'Kundenbestätigung'}`,size:16,gapAfter:7},
    ...fields.map(([label,text])=>({type:'paragraph',text:`${label}: ${text}`,size:8,gapAfter:4})),
    ...(snapshot.case_type==='warranty'&&!internal?[{type:'paragraph',text:'Diese Bestätigung ist keine Anerkennung eines Garantieanspruchs.',size:7,gapBefore:7}]:[]),
    ...(internal ? [{type:'heading',level:2,text:'Wesentliche Ereignisse',gapBefore:8,gapAfter:5},...events.map(e=>({type:'paragraph',text:`${date(e.created_at)} · ${e.message}`,size:7,gapAfter:3}))] : [])
  ];
  const spec={
    options:{marginTop:23,marginBottom:15,marginLeft:14,marginRight:14},
    meta:{title:`MYVELO Service ${snapshot.public_id}`,author:'MYVELO Service'},
    header:{logoImage:'brandLogo',documentId:snapshot.public_id,label:internal?'INTERN · SERVICE':'SERVICE · BESTÄTIGUNG',brand:'',bandColor:[17,17,17]},
    footer:{left:'MYVELO SERVICE',center:value(snapshot.public_id)},
    resources:{images:{brandLogo:await decodePng(EMBEDDED_MYVELO_LOGO_BYTES)}},
    schema:{blocks},data:{}
  };
  return renderFlowPdfSpec(spec);
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
