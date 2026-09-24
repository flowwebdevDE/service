import { customer } from './v8-api.js';
import { customerServicePdf, pdfBlobUrl } from './pdf/service-flowpdf.js';
const $=q=>document.querySelector(q);
const make=(tag,cls='',text='')=>{const n=document.createElement(tag);if(cls)n.className=cls;n.textContent=text;return n;};
const add=(parent,tag,cls='',text='')=>{const n=make(tag,cls,text);parent.append(n);return n;};
const token=new URLSearchParams(location.search).get('token');
if(!token&&new URLSearchParams(location.search).get('preview')) location.replace(`legacy-customer.html${location.search}`);
let item=null,step=0,pending=false,codeTimer=0,working={customer_note:'',service_choice:'none',confirm_scope:false,confirm_accessories:false};
const names={warranty:'Garantiefall',repair:'Reparaturauftrag',return:'Retourenvorgang'};
const steps={warranty:['Dein Vorgang','Deine Einsendung','Zusatzarbeiten','Dein Hinweis','Prüfen & bestätigen'],repair:['Dein Vorgang','Deine Einsendung','Arbeiten & Kosten','Dein Hinweis','Prüfen & bestätigen'],return:['Dein Vorgang','Deine Rücksendung','Dein Hinweis','Prüfen & bestätigen']};
const currentSteps=()=>steps[item.case_type||'warranty'];
const money=v=>typeof v==='number'?`${v.toFixed(2)} €`:'–';
function failure(message){$('#boot').classList.add('error');$('#boot').textContent=message;}
function start(){document.documentElement.classList.remove('ui-loading');$('#customer-app').hidden=false;$('#boot')?.remove();}
function only(id){for(const n of ['pin-panel','flow-panel','frozen-panel'])$('#'+n).hidden=n!==id;}
function dataLine(parent,name,value){const row=add(parent,'div','data-line');add(row,'span','',name);add(row,'strong','',value===null||value===undefined||value===''?'–':String(value));}
function date(d){return d?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d)):'–';}
function saveInput(target){if(target.name==='customer_note')working.customer_note=target.value;if(target.name==='service_choice')working.service_choice=target.value;if(target.name==='confirm_scope')working.confirm_scope=target.checked;if(target.name==='confirm_accessories')working.confirm_accessories=target.checked;}
function sectionTitle(root,title,sub=''){add(root,'h1','',title);if(sub)add(root,'p','intro',sub);}
function choice(root,name,value,title,details){const l=add(root,'label','choice');const input=add(l,'input');input.type='radio';input.name=name;input.value=value;input.checked=working[name]===value;input.addEventListener('change',()=>saveInput(input));add(l,'strong','',title);if(details)add(l,'small','',details);}
function checkbox(root,name,title,description){const l=add(root,'label','');const input=add(l,'input');input.type='checkbox';input.name=name;input.checked=Boolean(working[name]);input.addEventListener('change',()=>saveInput(input));const p=add(l,'span','');add(p,'strong','',title);if(description)add(p,'small','',description);}
function deliveryText(i){return [i.item_type==='battery'?'Akku':'Fahrrad',i.required_charger?'Ladegerät':null,i.required_keys?'Schlüssel':null].filter(Boolean).join(' · ');}
function repairTerms(i){const m=i.repair_price_mode;return ({fixed:`Festpreis ${money(i.repair_price_value)} · Leistungsumfang: ${i.repair_scope||'–'}`,estimate:`Kostenvoranschlag ${money(i.repair_estimate_value)} · Abweichungsregel: ${i.repair_deviation_rule||'–'}`,maximum:`Freigabe bis maximal ${money(i.repair_maximum_value)}`,actual:`Tatsächlicher Aufwand · Grundlage: ${i.repair_calculation_basis||'–'} · Rücksprachegrenze: ${i.repair_deviation_rule||'Keine gesonderte Grenze dokumentiert'}`,pending:'Einsendung und Prüfung werden bestätigt. Eine Freigabe für kostenpflichtige Reparaturen erfolgt damit nicht.'})[m]||'Noch keine Kostenregel angegeben.';}
function renderStep(){
  const panels=currentSteps(),root=$('#flow-step');root.replaceChildren();root.style.animation='none';void root.offsetWidth;root.style.animation='';
  $('#flow-kind').textContent=`SERVICE · ${(names[item.case_type]||names.warranty).toUpperCase()}`;
  $('#step-count').textContent=`${String(step+1).padStart(2,'0')} / ${String(panels.length).padStart(2,'0')}`;
  $('#progress-fill').style.width=`${(step+1)/panels.length*100}%`;
  $('#flow-error').textContent='';
  switch(panels[step]){
    case 'Dein Vorgang':{
      sectionTitle(root,`Hallo ${item.customer_name||''}.`,'Bitte prüfe, ob dieser Servicevorgang zu deiner Bestellung gehört.');
      const values=add(root,'div','data-lines');dataLine(values,'Auftrag',item.shopify_ref);dataLine(values,'Vorgangs-ID',item.public_id);dataLine(values,'Art',names[item.case_type]||'Garantiefall');dataLine(values,'Modell',item.bike_model);dataLine(values,'Anliegen',item.case_subject);break;
    }
    case 'Deine Einsendung':case 'Deine Rücksendung':{
      sectionTitle(root,'Was wird eingesendet?','Bitte gleiche den vereinbarten Lieferumfang mit deinem Paket ab.');
      const values=add(root,'div','data-lines');dataLine(values,'Gegenstand',item.item_type==='battery'?'Akku':'Fahrrad');dataLine(values,'Ladegerät',item.required_charger?'Mit einsenden':'Nicht erforderlich');dataLine(values,'Schlüssel',item.required_keys?'Mit einsenden':'Nicht erforderlich');
      add(root,'p','',item.case_type==='return'?'Die Bestätigung dokumentiert die vereinbarte Rücksendung, nicht das Ergebnis der internen Retourenprüfung.':'Dieser Lieferumfang ist mit deiner Bestätigung vereinbart.');break;
    }
    case 'Zusatzarbeiten':{
      sectionTitle(root,'Zusätzliche Arbeiten.','Diese Auswahl gilt nur für kostenpflichtige Zusatzarbeiten neben deinem Garantievorgang.');
      choice(root,'service_choice','none','Keine Zusatzarbeiten','0 €');
      choice(root,'service_choice','inspection','Inspektion','96 €');
      choice(root,'service_choice','inspection_wear','Inspektion + notwendige Verschleißteile','96 € zuzüglich tatsächlicher Materialkosten');
      add(root,'p','', 'Mit dieser Bestätigung wird kein Garantieanspruch anerkannt.');break;
    }
    case 'Arbeiten & Kosten':{
      sectionTitle(root,'Deine Kostenvereinbarung.','Die konkrete Kostenregel gilt ausschließlich für diesen Auftrag.');
      const values=add(root,'div','data-lines');dataLine(values,'Reparaturwunsch',item.repair_scope||item.case_subject);dataLine(values,'Vereinbarung',repairTerms(item));
      if(item.repair_price_mode==='pending')add(root,'p','', 'Noch nicht vereinbart bedeutet ausdrücklich: keine Freigabe unbegrenzter Kosten.');break;
    }
    case 'Dein Hinweis':{
      sectionTitle(root,'Noch ein Hinweis?','Optional kannst du uns eine ergänzende Information mitgeben.');
      const t=add(root,'textarea');t.name='customer_note';t.maxLength=4000;t.placeholder='Dein Hinweis';t.value=working.customer_note;t.addEventListener('input',()=>saveInput(t));break;
    }
    case 'Prüfen & bestätigen':{
      sectionTitle(root,'Alles richtig?','Bitte prüfe deine Angaben. Erst nach einer erfolgreichen Speicherung ist dein Auftrag bestätigt.');
      const values=add(root,'div','data-lines');dataLine(values,'Auftrag',item.shopify_ref);dataLine(values,'Gegenstand',deliveryText(item));dataLine(values,'Anliegen',item.case_subject);
      if(item.case_type==='repair')dataLine(values,'Kostenregel',repairTerms(item));
      if(item.case_type==='warranty')dataLine(values,'Zusatzarbeiten',({none:'Keine',inspection:'Inspektion · 96 €',inspection_wear:'Inspektion · 96 € + Material'})[working.service_choice]);
      dataLine(values,'Dein Hinweis',working.customer_note);
      const checks=add(root,'div','checks');
      checkbox(checks,'confirm_scope',item.case_type==='return'?'Rücksendung bestätigen':item.case_type==='repair'?'Reparaturwunsch und Kostenregel bestätigen':'Auftragsumfang bestätigen',item.case_type==='repair'&&item.repair_price_mode==='pending'?'Es wird lediglich Einsendung und Prüfung vereinbart; keine kostenpflichtige Reparatur freigegeben.':'Ich habe den beschriebenen Vorgang geprüft.');
      checkbox(checks,'confirm_accessories','Lieferumfang bestätigen','Ich bestätige den vereinbarten Einsende- bzw. Rücksendeumfang.');break;
    }
  }
  $('#prev-step').disabled=step===0||pending;$('#next-step').textContent=step===panels.length-1?'Verbindlich bestätigen ✓':'Weiter →';$('#next-step').disabled=pending;
}
async function updateView(){if(item.status==='confirmed'||item.read_only){renderFrozen(item);return;}working.customer_note=item.customer_note||'';working.service_choice=item.service_choice||'none';step=0;only('flow-panel');renderStep();start();}
async function load(){try{if(!token){failure('Dieser Kundenlink ist unvollständig. Bitte deinen Kundenlink verwenden.');return;}if(!customer.session(token)){only('pin-panel');start();$('#otp-input').focus();return;}item=await customer.get(token);await updateView();}catch(e){if(e.message.includes('Verifizierung')||e.message.includes('Anmeldung')||e.message.includes('Kundensitzung')){customer.clear(token);only('pin-panel');start();}else failure(e.message||'Vorgang kann nicht geladen werden.');}}
function renderFrozen(value){const root=$('#frozen-data');root.replaceChildren();const snapshot=value.pdf_snapshot;
  if(!snapshot){failure('Bestätigungsdaten konnten nicht geladen werden.');return;}
  dataLine(root,'Bestellung',snapshot.shopify_ref);dataLine(root,'Vorgang',snapshot.public_id);dataLine(root,'Kunde',snapshot.customer_name);dataLine(root,'Modell',snapshot.bike_model);dataLine(root,'Einsendeumfang',deliveryText(snapshot));
  if((snapshot.case_type||value.case_type)==='repair')dataLine(root,'Kostenvereinbarung',repairTerms(snapshot));
  if((snapshot.case_type||value.case_type||'warranty')==='warranty')dataLine(root,'Zusatzarbeiten',({none:'Keine',inspection:'Inspektion 96 €',inspection_wear:'Inspektion 96 € + tatsächliche Materialkosten'})[snapshot.service_choice]);
  dataLine(root,'Hinweis',snapshot.customer_note);dataLine(root,'Bestätigt',date(snapshot.confirmed_at));
  $('#flow-panel').replaceChildren(); // irrevocably remove editable interaction after confirmation
  only('frozen-panel');start();
}
$('#prev-step').addEventListener('click',()=>{if(step>0&&!pending){step--;renderStep();}});
$('#next-step').addEventListener('click',async()=>{
  if(pending)return;
  if(step<currentSteps().length-1){step++;renderStep();return;}
  if(!working.confirm_scope||!working.confirm_accessories){$('#flow-error').textContent='Bitte bestätige beide Punkte.';return;}
  pending=true;$('#next-step').disabled=true;$('#next-step').textContent='Bestätigung wird gespeichert …';
  try{const result=await customer.confirm(token,working);if(!result?.ok||result.case?.status!=='confirmed')throw new Error('Server hat die Bestätigung nicht bestätigt.');
    item=result.case;renderFrozen(item);
  }catch(e){$('#flow-error').textContent=e.message||'Bestätigung fehlgeschlagen. Bitte erneut versuchen.';pending=false;renderStep();$('#flow-error').textContent=e.message||'Bitte erneut versuchen.';}
});
$('#frozen-pdf').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;try{const url=await pdfBlobUrl(await customerServicePdf(item));window.open(url,'_blank','noopener');}catch(err){const p=add($('#frozen-panel'),'p','message',err.message);p.setAttribute('role','alert');}finally{button.disabled=false;}});
// One real input: supports OS one-time-code, selection, native paste and full-code paste.
const input=$('#otp-input');const slots=[...$('#otp-slots').children];
function drawOtp(){input.value=input.value.replace(/\D/g,'').slice(0,6);const cursor=input.selectionStart??input.value.length;for(let i=0;i<6;i++){slots[i].textContent=input.value[i]||'•';slots[i].classList.toggle('active',document.activeElement===input&&i===Math.min(cursor,5));}}
input.addEventListener('input',()=>{drawOtp();clearTimeout(codeTimer);if(input.value.length===6)codeTimer=setTimeout(()=>$('#otp-form').requestSubmit(),240);});
input.addEventListener('keyup',drawOtp);input.addEventListener('focus',drawOtp);input.addEventListener('blur',drawOtp);
$('#otp-shell').addEventListener('pointerdown',event=>{const rect=$('#otp-shell').getBoundingClientRect();const at=Math.max(0,Math.min(5,Math.floor((event.clientX-rect.left)/rect.width*6)));requestAnimationFrame(()=>{input.focus();input.setSelectionRange(at,at);drawOtp();});});
$('#otp-paste').addEventListener('click',async()=>{try{const value=await navigator.clipboard.readText();const digits=value.replace(/\D/g,'').slice(0,6);if(!digits)throw new Error();input.value=digits;drawOtp();input.focus();if(digits.length===6)$('#otp-form').requestSubmit();}catch{$('#otp-error').textContent='Bitte den Code über das Eingabefeld einfügen.';input.focus();}});
$('#otp-form').addEventListener('submit',async e=>{e.preventDefault();if(pending||input.value.length!==6)return;pending=true;$('#otp-submit').disabled=true;$('#otp-error').textContent='';clearTimeout(codeTimer);try{await customer.verify(token,input.value);item=await customer.get(token);pending=false;await updateView();}
  catch(error){pending=false;$('#otp-error').textContent=error.message||'Code konnte nicht geprüft werden.';$('#otp-shell').classList.remove('shake');void $('#otp-shell').offsetWidth;$('#otp-shell').classList.add('shake');input.select();input.focus();}finally{$('#otp-submit').disabled=false;}});
load();
