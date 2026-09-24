import { staff } from './v8-api.js';
import { getPortalSession, logoutPortalSession } from './api.js';
import { internalServicePdf, customerServicePdf, pdfBlobUrl } from './pdf/service-flowpdf.js';
import { initModelPopup } from './model-picker.js?v=8.0.3';

const $=selector=>document.querySelector(selector);
const el=(tag,cls='',content='')=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!==null)n.textContent=content;return n;};
const make=(tag,cls,parent,content='')=>{const node=el(tag,cls,content);parent.append(node);return node;};
const label={warranty:'Garantie',repair:'Reparatur',return:'Retoure'};
const statusLabel={waiting_customer:'Wartet auf Kunde',customer_confirmed:'Kunde hat bestätigt',arrived:'Eingetroffen',in_progress:'In Arbeit',completed:'Abgeschlossen'};
let all=[],active=null,tab='case',archived=false,dirty=false,inflight=false,viewCounter=0,toastTimer=0,pendingChange=null,createKey='';
const detailOpen=()=>document.body.classList.contains('detail-open');
function closeMenu(){document.body.classList.remove('menu-open');$('#menu-toggle').setAttribute('aria-expanded','false');$('#sidebar-overlay').hidden=true;}
function openMenu(){document.body.classList.add('menu-open');$('#menu-toggle').setAttribute('aria-expanded','true');$('#sidebar-overlay').hidden=false;}
function showList(){document.body.classList.remove('detail-open');closeMenu();}
async function returnToList(){if(!await okayToLeave())return;dirty=false;showList();}
const localKey=id=>`myvelo_v8_staff_draft:${id}`;
function toast(message,error=false){const node=$('#toast');node.textContent=message;node.classList.toggle('error',error);node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.hidden=true,5000);}
function loading(button,on){if(button){button.disabled=on;button.dataset.label??=button.textContent;button.textContent=on?'Bitte warten …':button.dataset.label;}}
function errorMessage(e){toast(e?.message||'Aktion nicht möglich.',true);}
function dataLine(parent,name,value){const row=make('div','data-line',parent);make('span','',row,name);make('strong','',row,value===null||value===undefined||value===''?'–':String(value));return row;}
function panel(parent,title){const n=make('section','panel',parent);make('h3','',n,title);return n;}
function clear(node){node.replaceChildren();}
function date(value){return value?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'–';}
function accessButton(parent,title,callback,variant='quiet'){const b=make('button',`button ${variant}`,parent,title);b.type='button';b.addEventListener('click',async()=>{if(b.disabled)return;loading(b,true);try{await callback();}catch(e){errorMessage(e);}finally{loading(b,false);}});return b;}
function storedDraft(item){try{return JSON.parse(sessionStorage.getItem(localKey(item.public_id))||'null');}catch{return null;}}
function currentForm(){return $('#detail-edit-form');}
function draftValues(form){const data={};if(!form)return data;for(const element of form.elements){if(!element.name)continue;data[element.name]=element.type==='checkbox'?element.checked:element.value;}return data;}
function persistLocal(){if(!active||!currentForm()||active.status==='confirmed'&&active.case_type==='warranty')return;sessionStorage.setItem(localKey(active.public_id),JSON.stringify(draftValues(currentForm())));}
function forgetDraft(){if(active)sessionStorage.removeItem(localKey(active.public_id));dirty=false;}
function setDirty(){dirty=true;persistLocal();}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function decision(title,description){const dialog=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-description').textContent=description;dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));}
async function okayToLeave(){if(!dirty)return true;return decision('Ungespeicherte Änderungen','Möchtest du den Vorgang wechseln und deine nicht gespeicherten Änderungen verwerfen?');}
function selectTab(next){tab=next;renderDetail();}
function renderList(){
  const query=$('#search').value.trim().toLocaleLowerCase('de-DE');const type=$('#type-filter').value;const st=$('#status-filter').value;
  const entries=all.filter(item=>Boolean(item.archived_at)===archived&&(type==='all'||item.case_type===type)&&(st==='all'||item.service_status===st)&&[item.customer_name,item.shopify_ref,item.public_id,item.bike_model].some(t=>String(t||'').toLocaleLowerCase('de-DE').includes(query)));
  const list=$('#case-list');const scroll=list.scrollTop;clear(list);
  for(const item of entries){
    const b=make('button',`case-entry ${active?.public_id===item.public_id?'selected':''}`,list);b.type='button';
    make('span','case-letter',b,(item.customer_name||'?').slice(0,1).toLocaleUpperCase('de-DE'));
    const main=make('span','case-entry-main',b);make('strong','',main,item.customer_name||'Unbekannter Kunde');
    make('small','',main,item.public_id);make('span','classic-cell classic-shopify',b,item.shopify_ref||'–');make('span','classic-cell classic-model',b,item.bike_model||'–');make('span','case-type',b,label[item.case_type]||'Garantie');make('span','classic-cell classic-status',b,statusLabel[item.service_status]||item.service_status||'–');
    b.addEventListener('click',()=>openCase(item.public_id));
  }
  if(!entries.length)make('div','empty',list,'Keine Vorgänge für diese Filter.');
  list.scrollTop=scroll;
  $('#active-count').textContent=String(all.filter(v=>!v.archived_at).length);
  $('#archive-count').textContent=String(all.filter(v=>v.archived_at).length);
  $('#list-summary').textContent=`${entries.length} ${archived?'archivierte':'aktive'} Vorgänge`;
  $('#stat-all').textContent=String(all.filter(v=>!v.archived_at).length);
  $('#stat-waiting').textContent=String(all.filter(v=>!v.archived_at&&v.service_status==='waiting_customer').length);
  $('#stat-confirmed').textContent=String(all.filter(v=>!v.archived_at&&v.status==='confirmed').length);
  $('#stat-progress').textContent=String(all.filter(v=>!v.archived_at&&v.service_status==='in_progress').length);
  $('#active-btn').classList.toggle('selected',!archived);$('#archive-btn').classList.toggle('selected',archived);
  $('#mobile-active-btn').className=`button ${archived?'quiet':'dark'}`;$('#mobile-archive-btn').className=`button ${archived?'dark':'quiet'}`;
}
async function refresh({preserve=true}={}){
  const items=await staff.list();all=items.items||[];
  if(preserve&&active){const latest=all.find(v=>v.public_id===active.public_id);if(latest&&!dirty)active=latest;}
  renderList();if(active&&!dirty)renderDetail();
}
async function openCase(id){
  if(active?.public_id===id){document.body.classList.add('detail-open');closeMenu();return;}
  if(!await okayToLeave())return;
  const sequence=++viewCounter;dirty=false;const container=$('#detail-content');clear(container);make('div','empty',container,'Vorgang wird geladen …');
  document.body.classList.add('detail-open');closeMenu();$('#detail-pane').scrollTop=0;try{const item=await staff.get(id);if(sequence!==viewCounter)return;active=item;tab='case';renderList();renderDetail();}
  catch(e){if(sequence===viewCounter){active=null;clear(container);make('div','empty',container,'Vorgang konnte nicht geladen werden.');errorMessage(e);}}
}
function detailHead(root){
  const head=make('header','detail-head',root);const title=make('div','',head);make('span','kicker',title,(label[active.case_type]||'Garantie').toUpperCase());make('h2','',title,active.customer_name||active.public_id);
  make('p','',title,`${active.public_id} · ${active.shopify_ref} · ${statusLabel[active.service_status]||active.service_status}`);
  const buttons=make('div','detail-actions',head);
  accessButton(buttons,'Kundenlink / PIN',async()=>{
    const link=await staff.link(active.public_id);
    const access={ verification_code: link.verification_code };
    const dialog=panel($('#detail-content'),'Kundenzugang · manuell übermitteln');
    const u=make('p','access-output',dialog,link.customer_url);const actions=make('div','action-row',dialog);
    accessButton(actions,'Link kopieren',()=>navigator.clipboard.writeText(link.customer_url));
    accessButton(actions,'Link öffnen',()=>window.open(link.customer_url,'_blank','noopener'));
    dataLine(dialog,'6-stelliger PIN',access.verification_code);accessButton(actions,'PIN kopieren',()=>navigator.clipboard.writeText(access.verification_code));
    u.scrollIntoView({block:'nearest'});
  });
  accessButton(buttons,active.archived_at?'Reaktivieren':'Archivieren',async()=>{
    if(!await decision(active.archived_at?'Reaktivieren?':'Archivieren?',`Vorgang ${active.public_id} ${active.archived_at?'reaktivieren':'archivieren'}?`))return;
    active=await staff.archive(active.public_id,!active.archived_at);dirty=false;await refresh({preserve:false});renderDetail();toast('Vorgang aktualisiert.');
  });
  return head;
}
function renderDetail(){
  if(!active)return;
  const root=$('#detail-content');const scroll=$('#detail-pane').scrollTop;clear(root);detailHead(root);
  const nav=make('div','tabs',root);for(const [key,text] of [['case','Vorgang'],['approvals','Freigaben'],['history','Verlauf'],['documents','Dokumente']]){
    const button=make('button',tab===key?'selected':'',nav,text);button.type='button';button.addEventListener('click',async()=>{if(tab==='case'&&dirty){persistLocal();}tab=key;renderDetail();});
  }
  if(tab==='case')renderCase(root);if(tab==='approvals')renderApprovals(root);if(tab==='history')renderHistory(root);if(tab==='documents')renderDocuments(root);
  $('#detail-pane').scrollTop=scroll;
}
function textField(form,name,title,value='',options={}){
  const l=make('label',options.full?'full':'',form,title);
  const node=options.textarea?make('textarea','',l):make('input','',l);
  node.name=name;if(options.textarea)node.rows=options.rows||3;
  if(options.type)node.type=options.type;
  if(options.type==='number'){node.min='0';node.step='.01';}if(options.max)node.maxLength=options.max;
  node.value=value??'';node.addEventListener('input',setDirty);return node;
}
function combo(form,name,title,values,current,options={}){
  const l=make('label',options.full?'full':'',form,title),s=make('select','',l);s.name=name;
  for(const [v,t] of values){const op=make('option','',s,t);op.value=v;}
  s.value=current??values[0]?.[0];s.addEventListener('change',setDirty);return s;
}
function modelField(parent, initial='', itemType=null, onChange=()=>{}) {
  const wrapper=make('div','model-selection',parent);
  const title=make('span','model-selection-label',wrapper,'Fahrradmodell');
  const input=make('input','model-selection-input',wrapper);
  input.type='hidden'; input.name='bike_model'; input.value=initial||'';
  input.addEventListener('input',onChange);
  const trigger=make('button','flow-model-trigger',wrapper);
  trigger.type='button';
  make('span','flow-model-trigger__value',trigger,'Modell auswählen');
  make('span','flow-model-trigger__arrow',trigger,'›');
  // The original JSON model picker is reused; do not silently fall back to a free-text field.
  initModelPopup({trigger,input,label:title,itemType}).then(instance=>{
    input.addEventListener('input',()=>instance.sync());
    instance.sync();
  }).catch(error=>{
    trigger.disabled=true;
    trigger.querySelector('.flow-model-trigger__value').textContent='Modellkatalog nicht verfügbar';
    make('small','model-selection-error',wrapper,error.message||'Modellkatalog konnte nicht geladen werden.');
  });
  return input;
}
function boolean(form,name,title,checked){const l=make('label','',form,title);const i=make('input','',l);i.name=name;i.type='checkbox';i.checked=Boolean(checked);i.addEventListener('change',setDirty);return i;}
function money(form,name,title,value){return textField(form,name,title,value??'',{type:'number'});}
function originalInfo(root){const p=panel(root,'Kundenbestätigung · unveränderlicher Stand');const s=active.pdf_snapshot||{};
  dataLine(p,'Zeitpunkt',date(s.confirmed_at));dataLine(p,'Anliegen',s.case_subject);dataLine(p,'Kundenhinweis',s.customer_note);
  if(active.case_type==='repair'){dataLine(p,'Kostenart',s.repair_price_mode);dataLine(p,'Vereinbarte Kostenregel',s.price_description);}
  if(active.case_type==='warranty')dataLine(p,'Zusatzarbeiten',s.service_choice);}
function renderCase(root){
  if(active.status==='confirmed')originalInfo(root);
  const p=panel(root,active.status==='confirmed'?'Interner Bearbeitungsstand':'Vorgang bearbeiten');
  const form=make('form','edit-grid',p);form.id='detail-edit-form';
  form.addEventListener('submit',e=>e.preventDefault());
  const editable=active.status!=='confirmed';
  if(editable){
    textField(form,'customer_name','Kundenname',active.customer_name);
    const itemType=combo(form,'item_type','Gegenstand',[['bike','Fahrrad'],['battery','Akku']],active.item_type);
    modelField(form,active.bike_model,itemType,setDirty);
    textField(form,'case_subject','Anliegen',active.case_subject,{full:true,textarea:true});
    textField(form,'bike_color','Farbe',active.bike_color);
    boolean(form,'required_charger','Ladegerät erforderlich',active.required_charger);
    boolean(form,'required_keys','Schlüssel erforderlich',active.required_keys);
    if(active.case_type==='warranty'){textField(form,'customer_note','Kundenhinweis',active.customer_note,{full:true,textarea:true});combo(form,'service_choice','Zusatzarbeiten',[['none','Keine'],['inspection','Inspektion · 96 €'],['inspection_wear','Inspektion 96 € + Material']],active.service_choice);}
  }else{
    const info=make('div','data-lines full',form);dataLine(info,'Modell',active.bike_model);dataLine(info,'Bestellreferenz',active.shopify_ref);
  }
  if(active.case_type==='repair'){
    const field=make('div','price-fields full',form);make('div','field-header',field,'Reparatur · Kostenregel');
    const mode=combo(field,'repair_price_mode','Preis-/Freigabeart',[['pending','Noch nicht vereinbart'],['fixed','Festpreis'],['estimate','Kostenvoranschlag'],['maximum','Höchstbetrag'],['actual','Tatsächlicher Aufwand']],active.repair_price_mode||'pending');
    textField(field,'repair_scope','Vereinbarter Reparaturumfang',active.repair_scope,{full:true,textarea:true});
    const fixed=money(field,'repair_price_value','Festpreis (€)',active.repair_price_value);
    const estimate=money(field,'repair_estimate_value','Kostenvoranschlag (€)',active.repair_estimate_value);
    const maximum=money(field,'repair_maximum_value','Höchstbetrag (€)',active.repair_maximum_value);
    const deviation=textField(field,'repair_deviation_rule','Abweichungs-/Rücksprachegrenze',active.repair_deviation_rule,{textarea:true});
    const basis=textField(field,'repair_calculation_basis','Berechnungsgrundlage',active.repair_calculation_basis,{textarea:true});
    function visible(){const value=mode.value;for(const [input,show] of [[fixed,value==='fixed'],[estimate,value==='estimate'],[maximum,value==='maximum'],[deviation,value==='estimate'||value==='actual'],[basis,value==='actual']])input.parentElement.hidden=!show;}
    mode.addEventListener('change',visible);visible();
  }
  if(active.case_type==='return'){
    const field=make('div','review-grid full',form);make('div','field-header full',field,'Interne Retourenprüfung');
    textField(field,'return_condition','Zustand',active.return_condition,{full:true,textarea:true});
    textField(field,'return_defects','Festgestellte Mängel',active.return_defects,{full:true,textarea:true});
    textField(field,'return_required_work','Erforderliche Arbeiten',active.return_required_work,{full:true,textarea:true});
    textField(field,'return_result','Prüfergebnis',active.return_result,{full:true,textarea:true});
    combo(field,'return_sales_decision','Verkaufsentscheidung',[['','Noch nicht entschieden'],['approved','Für Verkauf freigegeben'],['rejected','Nicht für Verkauf freigegeben'],['pending','Weitere Arbeiten / Prüfung erforderlich']],active.return_sales_decision||'');
  }
  const actions=make('div','action-row full',form);
  if(editable||active.case_type!=='warranty')accessButton(actions,'Änderungen speichern',async()=>{
    const body=collectEditable(form);
    if(editable){
      active=await staff.save(active.public_id,body);
      // The operational return review is separate from the editable customer-facing fields.
      if(active.case_type==='return'){
        const review={};for(const key of ['return_condition','return_defects','return_required_work','return_result','return_sales_decision'])review[key]=body[key];
        // Sales approval is only legal after confirmation. Ignore empty undecided value.
        if(!review.return_sales_decision)delete review.return_sales_decision;
        if(Object.values(review).some(value=>String(value||'').trim()))active=await staff.service(active.public_id,review);
      }
      if(active.case_type==='repair')active=await staff.service(active.public_id,body);
    }else active=await staff.service(active.public_id,body);
    forgetDraft();await refresh({preserve:false});renderDetail();toast('Änderungen gespeichert.');
  },'dark');
  if(editable)accessButton(actions,'Entwurf speichern',async()=>{await staff.saveDraft(active.public_id,draftValues(form));forgetDraft();toast('Entwurf auf dem Server gespeichert.');});
  if(active.status==='confirmed'){
    const state=panel(root,'Operativer Status');const l=make('label','',state,'Bearbeitungsstand');const select=make('select','',l);
    for(const [v,t] of Object.entries(statusLabel)){const opt=make('option','',select,t);opt.value=v;}select.value=active.service_status;
    accessButton(state,'Status speichern',async()=>{active=await staff.status(active.public_id,select.value);renderDetail();await refresh({preserve:false});toast('Status gespeichert.');});
  }
  const draft=storedDraft(active);
  if(draft&&editable){if(dirty)applyValues(form,draft);const hint=make('p','message',p,'Ein lokaler Entwurf ist vorhanden.');
    accessButton(p,'Lokalen Entwurf wiederherstellen',async()=>{applyValues(form,draft);hint.textContent='Entwurf wiederhergestellt – bitte speichern.';setDirty();});}
  if(editable){const id=active.public_id;staff.draft(id).then(res=>{
    if(!res.draft||active?.public_id!==id||tab!=='case')return;
    const current=$('#detail-edit-form');if(!current)return;
    accessButton(p,'Serverentwurf wiederherstellen',async()=>{applyValues(current,res.draft.content);setDirty();toast('Serverentwurf wiederhergestellt. Bitte Änderungen speichern.');});
  }).catch(()=>{});}
}
function applyValues(form,values){for(const input of form.elements){if(!input.name||!(input.name in values))continue;if(input.type==='checkbox')input.checked=Boolean(values[input.name]);else input.value=values[input.name]??'';if(input.name==='bike_model')input.dispatchEvent(new Event('input',{bubbles:true}));}form.querySelector('[name=repair_price_mode]')?.dispatchEvent(new Event('change'));}
function collectEditable(form){const raw=draftValues(form);for(const name of ['repair_price_value','repair_estimate_value','repair_maximum_value'])if(name in raw)raw[name]=raw[name]===''?null:Number(raw[name]);return raw;}
async function renderApprovals(root){
  const p=panel(root,'Freigaben');if(active.case_type==='warranty'){make('p','',p,'Garantie: Auswahl kostenpflichtiger Zusatzarbeiten gemäß unveränderlicher Kundenbestätigung.');dataLine(p,'Auswahl',active.pdf_snapshot?.service_choice||'Noch nicht bestätigt');return;}
  if(active.case_type==='return'){make('p','',p,'Retoure: Kundenbestätigung der Einsendung; die Verkaufsentscheidung erfolgt ausschließlich intern.');dataLine(p,'Verkaufsfreigabe',active.return_sales_decision||'Noch nicht entschieden');return;}
  dataLine(p,'Aktueller interner Freigabestand',active.repair_approval_state);dataLine(p,'Kundenseitig bestätigt',active.pdf_snapshot?.price_description||'Noch nicht bestätigt');
  make('p','',p,'Zusätzliche Arbeiten oder Mehrkosten werden nicht automatisch durch die erste Bestätigung freigegeben. Eine externe Zustimmung muss mit Umfang und Kanal dokumentiert werden.');
  const f=make('form','approval-form',p);const channel=combo(f,'channel','Zustimmung eingeholt per',[['phone','Telefon'],['email','E-Mail'],['other','Anderer Weg']],'phone');const desc=textField(f,'description','Exakter Umfang und vereinbarte Kosten','',{textarea:true,full:true});
  f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button[type=submit]');loading(b,true);try{await staff.approval(active.public_id,{channel:channel.value,description:desc.value});active=await staff.get(active.public_id);renderDetail();toast('Externe Zustimmung dokumentiert.');}catch(err){errorMessage(err);}finally{loading(b,false);}});
  const b=make('button','button dark',f,'Zustimmung dokumentieren');b.type='submit';
}
async function renderHistory(root){const p=panel(root,'Wesentliche Ereignisse');make('p','',p,'Bei gemeinsamem Firmenzugang werden keine Mitarbeiteridentitäten behauptet.');
  const n=make('div','',p,'Verlauf wird geladen …');const id=active.public_id;
  try{const response=await staff.events(id);if(active?.public_id!==id||tab!=='history')return;clear(n);for(const event of response.items){const e=make('div','event',n);make('span','event-dot',e);const d=make('div','',e);make('strong','',d,event.message||event.event_type);make('time','',d,date(event.created_at));}if(!response.items.length)n.textContent='Noch keine Ereignisse.';}catch(err){n.textContent=err.message;}}
async function renderDocuments(root){const p=panel(root,'Dokumente');make('p','',p,'Die Kundenbestätigung wird ausschließlich aus dem gespeicherten Snapshot erstellt. Das interne Serviceblatt zeigt zusätzlich den aktuellen Bearbeitungsstand.');
  const actions=make('div','action-row',p);if(active.status==='confirmed')accessButton(actions,'Kundenbestätigung (PDF)',async()=>{const bytes=await customerServicePdf(active);window.open(await pdfBlobUrl(bytes),'_blank','noopener');});
  accessButton(actions,'Internes Serviceblatt (PDF)',async()=>{const events=(await staff.events(active.public_id)).items;const bytes=await internalServicePdf(active,events);window.open(await pdfBlobUrl(bytes),'_blank','noopener');},'dark');}
async function openCreate(){createKey=crypto.randomUUID();const dlg=$('#create-dialog');$('#create-form').reset();createModelPicker?.sync();$('#create-message').textContent='';$('#create-type').dispatchEvent(new Event('change'));dlg.showModal();}
function setCreatePriceVisibility(){const repair=$('#create-type').value==='repair';$('#create-repair-fields').hidden=!repair;const mode=$('#create-price-mode').value;for(const e of document.querySelectorAll('#create-repair-fields [data-price]'))e.hidden=!e.dataset.price.split(' ').includes(mode);}
let createModelPicker=null;
initModelPopup({
  trigger:$('#create-model-trigger'),
  input:$('#create-form').elements.bike_model,
  label:$('#create-model-label'),
  itemType:$('#create-form').elements.item_type
}).then(instance=>{createModelPicker=instance;}).catch(error=>{
  $('#create-model-trigger').disabled=true;
  $('#create-model-trigger').querySelector('.flow-model-trigger__value').textContent='Modellkatalog nicht verfügbar';
  $('#create-message').textContent=error.message||'Modellkatalog konnte nicht geladen werden.';
});
$('#create-type').addEventListener('change',setCreatePriceVisibility);$('#create-price-mode').addEventListener('change',setCreatePriceVisibility);$('#new').addEventListener('click',openCreate);$('#create-cancel').addEventListener('click',()=>$('#create-dialog').close());
$('#create-form').addEventListener('submit',async e=>{e.preventDefault();if(!e.currentTarget.elements.bike_model.value.trim()){$('#create-message').textContent='Bitte ein Modell aus dem Katalog auswählen oder über „Modell frei eingeben“ übernehmen.';return;}const button=e.currentTarget.querySelector('[type=submit]');loading(button,true);$('#create-message').textContent='';try{
  const body=draftValues(e.currentTarget);for(const key of ['repair_price_value','repair_estimate_value','repair_maximum_value'])body[key]=body[key]===''?null:Number(body[key]);
  body.request_key=createKey;const result=await staff.create(body);$('#create-dialog').close();await refresh({preserve:false});await openCase(result.public_id);toast('Vorgang erstellt – Kundenlink und PIN können jetzt manuell geteilt werden.');
}catch(err){$('#create-message').textContent=err.message;}finally{loading(button,false);}});
$('#refresh').addEventListener('click',async()=>{try{await refresh();toast('Aktualisiert.');}catch(e){errorMessage(e);}});
$('#logout').addEventListener('click',()=>{logoutPortalSession();location.replace('login.html');});
$('#back').addEventListener('click',returnToList);$('#detail-back').addEventListener('click',returnToList);
$('#menu-toggle').addEventListener('click',()=>document.body.classList.contains('menu-open')?closeMenu():openMenu());
$('#sidebar-overlay').addEventListener('click',closeMenu);
$('#sidebar-new').addEventListener('click',()=>{closeMenu();openCreate();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
$('#active-btn').addEventListener('click',async()=>{if(!await okayToLeave())return;dirty=false;archived=false;renderList();showList();});$('#archive-btn').addEventListener('click',async()=>{if(!await okayToLeave())return;dirty=false;archived=true;renderList();showList();});
$('#mobile-active-btn').addEventListener('click',()=>{archived=false;renderList();});$('#mobile-archive-btn').addEventListener('click',()=>{archived=true;renderList();});
for(const id of ['search','type-filter','status-filter'])$("#"+id).addEventListener('input',renderList);
(async()=>{if(!getPortalSession())return;try{await refresh({preserve:false});const id=new URLSearchParams(location.search).get('id');if(id)await openCase(id);$('#app').hidden=false;document.documentElement.classList.remove('ui-loading');$('#boot').remove();}catch(e){$('#boot').classList.add('error');$('#boot').textContent=`Serviceportal nicht erreichbar: ${e.message}`;}})();
