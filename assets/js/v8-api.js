import { CONFIG } from './config.js';
import { getPortalSession, getCustomerSession, buildCustomerUrl, clearCustomerSession } from './api.js';
const base = `${CONFIG.supabaseUrl.replace(/\/$/, '')}/functions/v1/${CONFIG.edgeFunctionName}`;
const url = route => `${base}?route=${encodeURIComponent(route)}&forceFunctionRegion=eu-central-1`;
async function call(route, method='GET', data=null, token=null, customerOnly=false) {
  const auth = customerOnly ? token : (token || getPortalSession()?.token);
  if (!auth) throw new Error(customerOnly ? 'Kundensitzung abgelaufen. Bitte den PIN erneut eingeben.' : 'Anmeldung erforderlich.');
  const response = await fetch(url(route), {
    method, cache:'no-store', headers: {
      'apikey': CONFIG.supabasePublishableKey,
      'authorization': `Bearer ${auth}`,
      ...(data === null ? {} : { 'content-type':'application/json' })
    }, ...(data === null ? {} : {body:JSON.stringify(data)})
  });
  let body=null;
  try { body=await response.json(); } catch { /* unavailable gateway */ }
  if (!response.ok) {
    if (response.status === 401 && !customerOnly && !token) {
      document.documentElement.classList.add('auth-pending');
      sessionStorage.removeItem(CONFIG.authSessionStorage);
      const next=encodeURIComponent(location.pathname.split('/').pop()+location.search+location.hash);
      location.replace(`login.html?next=${next}&reason=expired`);
    }
    throw new Error(response.status >= 500 ? 'Der Dienst ist derzeit nicht erreichbar. Eingaben bleiben erhalten.' : body?.error || 'Aktion fehlgeschlagen.');
  }
  return body;
}
export const staff = {
  list: () => call('admin/cases'),
  get: id => call(`admin/cases/${encodeURIComponent(id)}`),
  create: body => call('admin/cases','POST',body),
  save: (id,body) => call(`admin/cases/${encodeURIComponent(id)}`,'PUT',body),
  service: (id,body) => call(`admin/cases/${encodeURIComponent(id)}/service-data`,'PUT',body),
  status: (id,service_status) => call(`admin/cases/${encodeURIComponent(id)}/status`,'PUT',{service_status}),
  events: id => call(`admin/cases/${encodeURIComponent(id)}/events`),
  draft: id => call(`admin/cases/${encodeURIComponent(id)}/draft`),
  saveDraft: (id,body) => call(`admin/cases/${encodeURIComponent(id)}/draft`,'PUT',body),
  approval: (id,body) => call(`admin/cases/${encodeURIComponent(id)}/approval`,'POST',body),
  archive: (id,archived) => call(`admin/cases/${encodeURIComponent(id)}/archive`,'PUT',{archived}),
  link: async id => {const result=await call(`admin/cases/${encodeURIComponent(id)}/customer-link`,'POST',{}); return {...result,customer_url:buildCustomerUrl(result.customer_token)};},
  access: id => call(`admin/cases/${encodeURIComponent(id)}/customer-access`)
};
const key = token => `garantieportal_customer_session:${String(token).toUpperCase().replace(/[^A-Z0-9]/g,'')}`;
export const customer = {
  async verify(token,code) {
    // Authentication is deliberately NOT authorized by any demo/local fallback.
    const response=await fetch(url(`customer/${encodeURIComponent(token)}/verify`),{
      method:'POST',cache:'no-store',headers:{'apikey':CONFIG.supabasePublishableKey,'content-type':'application/json'},body:JSON.stringify({code})
    });
    let result=null; try { result=await response.json(); } catch {}
    if(!response.ok || !result?.session_token) throw new Error(result?.error || 'Verifizierung fehlgeschlagen.');
    sessionStorage.setItem(key(token),result.session_token);
    return result;
  },
  session: token => getCustomerSession(token),
  clear: token => clearCustomerSession(token),
  get: token => call(`customer/${encodeURIComponent(token)}`,'GET',null,getCustomerSession(token)?.token,true),
  confirm: (token,body) => call(`customer/${encodeURIComponent(token)}/confirm`,'POST',body,getCustomerSession(token)?.token,true)
};
export { buildCustomerUrl };
