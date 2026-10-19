
/*
 * GOOGLE SHEETS INTEGRATION
 * Demo is enabled by default. For production:
 * 1. Implement a protected Apps Script dashboard endpoint that returns the documented payload shape below.
 * 2. Deploy under the same approved authentication policy as your projects.
 * 3. Set API_URL to your own endpoint, and USE_DEMO=false.
 * Never rely on a project ID query parameter alone for access control.
 */
const CONFIG={USE_DEMO:!window.IDEA_SITE_CONFIG?.API_URL,API_URL:window.IDEA_SITE_CONFIG?.API_URL||''};
const params=new URLSearchParams(location.search);let projectId=params.get('projectId')||'P001';const portalToken=sessionStorage.getItem('ideaClientAccessToken')||'';
const amount=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(v)||0);
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const demo={project:{id:'P001',name:'Green Valley Villas',client:'ABC Constructions',location:'Kochi, Kerala',pmcPercent:10,gstPercent:18,status:'Ongoing',image:'assets/project-placeholder.svg',startDate:'01 Jan 2024',completionDate:'31 Dec 2026',type:'PMC',siteManager:'Site Manager',contact:'—'},parties:[{name:'Kerala Hardware',type:'Supplier',contact:'—',balance:120000},{name:'Metro Steel Traders',type:'Supplier',contact:'—',balance:80000},{name:'KM Transport',type:'Transport',contact:'—',balance:25000},{name:'Site Workforce Group',type:'Workforce',contact:'—',balance:18000},{name:'Kumar Electricals',type:'Contractor',contact:'—',balance:12000}],months:{'2026-10':{materials:[{name:'Cement',quantity:1250,unit:'Bags',total:450000},{name:'Steel',quantity:3200,unit:'Kg',total:120000},{name:'Bricks',quantity:18000,unit:'Nos',total:50000},{name:'M Sand',quantity:50,unit:'Ton',total:35000},{name:'P Sand',quantity:40,unit:'Ton',total:25000}],workforceBillAmount:325000,otherEligibleExpenses:243500,cashIn:1500000,cashOut:1248500,reports:[{date:'08 Oct 2026',workforce:12,materialCost:65000,expenditure:85000},{date:'07 Oct 2026',workforce:10,materialCost:52000,expenditure:70000},{date:'06 Oct 2026',workforce:14,materialCost:78000,expenditure:105000},{date:'05 Oct 2026',workforce:11,materialCost:60000,expenditure:82000},{date:'04 Oct 2026',workforce:13,materialCost:72000,expenditure:90000}],remarks:[{date:'08 Oct 2026',text:'Column concreting completed in Block A. Steel received for Block B.'},{date:'07 Oct 2026',text:'Labour count reduced due to rain. Material unloading completed.'},{date:'06 Oct 2026',text:'Plumbing work underway. Electrical conduits placed.'},{date:'05 Oct 2026',text:'Site cleaning and shuttering work completed.'},{date:'04 Oct 2026',text:'Sand delivery delayed. Internal wall work continued.'}]},'2026-09':{materials:[{name:'Cement',quantity:1000,unit:'Bags',total:360000},{name:'Sand',quantity:45,unit:'Ton',total:65000}],workforceBillAmount:290000,otherEligibleExpenses:105000,cashIn:900000,cashOut:800000,reports:[{date:'29 Sep 2026',workforce:10,materialCost:40000,expenditure:72000}],remarks:[{date:'29 Sep 2026',text:'Foundation inspection completed.'}]}}};
let data=demo;let currentMonth='';
function setWarning(message){const e=document.getElementById('dataWarning');e.textContent=message;e.classList.toggle('show',Boolean(message));}
async function fetchData(){if(CONFIG.USE_DEMO){if(sessionStorage.getItem('ideaPreviewAccess')!=='yes')throw Error('Open client-access.html to enter preview mode.');return demo;}if(!CONFIG.API_URL)throw Error('Configure the Apps Script dashboard endpoint.');if(sessionStorage.getItem('ideaClientProjectId')!==projectId)throw Error('Please sign in to this project first.');const url=new URL(CONFIG.API_URL);url.searchParams.set('action','projectDashboard');url.searchParams.set('projectId',projectId);url.searchParams.set('accessToken',portalToken);if(!portalToken)throw Error('Please sign in through client-access.html first.');const r=await fetch(url.toString());if(!r.ok)throw Error('Dashboard request failed ('+r.status+')');const result=await r.json();if(result.success===false)throw Error(result.message||'Project unavailable');if(!result.project||!result.months)throw Error('Unexpected dashboard response');return result;}
function num(v){return Number(v)||0;}
function sum(xs,k){return (xs||[]).reduce((t,x)=>t+num(x[k]),0);}
function calc(m){const mat=sum(m.materials,'total'),workforce=num(m.workforceBillAmount);const expenditure=mat+workforce,serviceBase=expenditure*0.10,service=serviceBase+(serviceBase*0.18);return {mat,workforce,expenditure,service,total:expenditure,cashIn:num(m.cashIn),cashOut:num(m.cashOut)};}
function emptyMonth(){return {materials:[],reports:[],remarks:[],cashIn:0,cashOut:0,workforceBillAmount:0,otherEligibleExpenses:0};}
function monthView(){if(currentMonth!=='all')return data.months[currentMonth]||emptyMonth();const out=emptyMonth();const grouped=new Map();for(const m of Object.values(data.months||{})){out.workforceBillAmount+=num(m.workforceBillAmount);out.otherEligibleExpenses+=num(m.otherEligibleExpenses);out.cashIn+=num(m.cashIn);out.cashOut+=num(m.cashOut);out.reports.push(...(m.reports||[]));out.remarks.push(...(m.remarks||[]));for(const x of (m.materials||[])){const key=String(x.name||'').trim().toLowerCase()+'|'+String(x.unit||'').trim().toLowerCase();if(!grouped.has(key))grouped.set(key,{name:x.name,unit:x.unit,quantity:0,total:0});const t=grouped.get(key);t.quantity+=num(x.quantity);t.total+=num(x.total);}}out.materials=Array.from(grouped.values());const dateKey=x=>{const s=String(x.date||'');const dm=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(dm)return dm[3]+'-'+dm[2].padStart(2,'0')+'-'+dm[1].padStart(2,'0');const parsed=new Date(s);return Number.isNaN(parsed.valueOf())?s:parsed.toISOString().slice(0,10);};out.reports.sort((a,b)=>dateKey(b).localeCompare(dateKey(a)));out.remarks.sort((a,b)=>dateKey(b).localeCompare(dateKey(a)));return out;}
function partyView(){if(currentMonth!=='all')return data.months[currentMonth]?.parties||data.partiesByMonth?.[currentMonth]||(CONFIG.USE_DEMO?data.parties:[]);return data.parties||[];}
function fill(id,value){const el=document.getElementById(id);if(el)el.textContent=value??'—';}
function td(value){return '<td>'+safe(value)+'</td>';}
function makeRow(values){return '<tr>'+values.map(td).join('')+'</tr>';}
function table(id,rows,colspan){document.getElementById(id).innerHTML=rows.length?rows.join(''):'<tr><td class="empty" colspan="'+colspan+'">No records for this selection</td></tr>';}
function showProject(){const p=data.project;fill('projectName',p.name||'Project');fill('projectType',p.scope||p.type||'Project');fill('projectStatus',p.status||'');fill('projectClient',p.client||'Client not specified');fill('projectAddress',p.location||'Address not specified');}
const partyLedgerCache=new Map();
function partyRows(parties){return parties.map(p=>{
 const balance=num(p.balance),balanceClass=balance<-.005?'advance':Math.abs(balance)<.005?'settled':'';
 return '<tr class="party-main-row"><td>'+safe(p.name)+'</td><td>'+safe(p.type)+'</td><td class="right party-balance '+balanceClass+'">'+safe(amount(balance))+'</td></tr>';
}).join('');}
// Show Android Remarks as plain multiline text, with no auto-generated bullets.
function remarkText(value){
 const lines=String(value??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length)return '—';
 return '<div class="remark-lines">'+lines.map(line=>'<div>'+safe(line)+'</div>').join('')+'</div>';
}
function remarkRow(r){return '<tr class="remarks-row"><td>'+safe(r.date)+'</td><td class="remarks-text-cell">'+remarkText(r.text)+'</td></tr>';}
function ledgerType(source,delta){const s=String(source||'').toUpperCase();if(s==='MATERIAL')return 'Material';if(s==='WORKFORCE')return 'Workforce';if(s==='CASH_OUT')return 'Payment';if(s==='CLIENT_RECEIPT')return 'Receipt';if(s==='MANUAL_BILL')return 'Bill';if(s==='MANUAL_SETTLEMENT')return 'Settlement';return s|| (delta>=0?'Bill':'Payment');}
function ledgerHtml(result){if(!result.success)return '<p class="ledger-error">'+safe(result.message||'Unable to load party ledger')+'</p>';
 const entries=result.entries||[];if(!entries.length)return '<p class="ledger-empty">No transactions for this party.</p>';
 return '<div class="ledger-scroller"><table class="ledger-table"><thead><tr><th>Date</th><th>Debit / Credit</th><th>Material / Payment</th><th>Description</th><th>Balance</th></tr></thead><tbody>'+entries.map(e=>{
 const delta=num(e.delta),positive=delta>=0;
 return '<tr><td>'+safe(e.date||e.isoDate)+'</td><td class="'+(positive?'ledger-credit':'ledger-debit')+'">'+(positive?'Cr ':'Dr ')+safe(amount(Math.abs(delta)))+'</td><td>'+safe(e.item||ledgerType(e.source,delta))+'</td><td>'+safe(e.description||'—')+'</td><td class="right">'+safe(amount(e.runningBalance))+'</td></tr>';
 }).join('')+'</tbody></table></div><p class="ledger-foot">Closing balance: <strong>'+safe(amount(result.balance))+'</strong> · Credit increases outstanding; debit reduces it. Negative means advance paid.</p>';
}
async function fetchPartyLedger(party){
 if(CONFIG.USE_DEMO) return {success:true,entries:[{date:'02/10/2026',source:'MATERIAL',item:'Cement',description:'Material purchase',delta:num(party.balance)+10000,runningBalance:num(party.balance)+10000},{date:'04/10/2026',source:'CASH_OUT',item:'Payment',description:'Payment',delta:-10000,runningBalance:num(party.balance)}],balance:num(party.balance)};
 const id=String(party.partyId||'').trim();if(!id)return {success:false,message:'Party ID missing. Re-deploy the updated project dashboard backend.'};
 if(!portalToken||sessionStorage.getItem('ideaClientProjectId')!==projectId)return {success:false,message:'Client session expired. Please sign in again.'};
 const url=new URL(CONFIG.API_URL);url.searchParams.set('action','clientPartyHistory');url.searchParams.set('projectId',projectId);url.searchParams.set('partyId',id);url.searchParams.set('accessToken',portalToken);
 const response=await fetch(url.toString());if(!response.ok)throw Error('Ledger request failed ('+response.status+')');return response.json();
}
let partyBalanceSort = 'desc'; // First click reverses to low-to-high.
function showAllParties(){
 const parties=(data.parties||[]).map((party,index)=>({party,index})).sort((a,b)=>{
  const difference=num(a.party.balance)-num(b.party.balance);
  return (partyBalanceSort==='asc'?difference:-difference)||a.index-b.index;
 }); // Keep source indexes for View Ledger.
 fill('modalTitle','Party List');
 const head='<div class="ledger-scroller"><table class="party-modal-table party-modal-six"><colgroup><col style="width:24%"><col style="width:14%"><col style="width:16%"><col style="width:16%"><col style="width:16%"><col style="width:14%"></colgroup><thead><tr><th>Party</th><th>Type</th><th class="right">Bill Amount</th><th class="right">Amount Paid</th><th class="right"><button type="button" class="balance-sort-button" id="sortPartyBalance" aria-label="Sort by balance '+(partyBalanceSort==='asc'?'low to high':'high to low')+'" title="Sort balance '+(partyBalanceSort==='asc'?'low to high':'high to low')+'">Balance <span aria-hidden="true" class="balance-sort-arrow">'+(partyBalanceSort==='asc'?'↑':'↓')+'</span></button></th><th>Ledger</th></tr></thead><tbody>';
 const rows=parties.length?parties.map(({party:p,index:i})=>{
  const balance=num(p.balance),cls=balance<-.005?'advance':Math.abs(balance)<.005?'settled':'';
  return '<tr><td>'+safe(p.name)+'</td><td>'+safe(p.type)+'</td><td class="right">'+safe(p.billAmount==null?'—':amount(p.billAmount))+'</td><td class="right">'+safe(p.amountPaid==null?'—':amount(p.amountPaid))+'</td><td class="right party-balance '+cls+'">'+safe(amount(balance))+'</td><td><button type="button" class="view-party-ledger" data-modal-party="'+i+'">View Ledger</button></td></tr>';
 }).join(''):'<tr><td colspan="6" class="empty">No project parties found</td></tr>';
 document.getElementById('modalBody').innerHTML=head+rows+'</tbody></table></div>';
 document.getElementById('modal').classList.add('show');
}
async function showPartyLedger(index){
 const party=(data.parties||[])[index];if(!party)return;
 const id=String(party.partyId||party.id||party.name);
 fill('modalTitle',party.name+' — Party Ledger');
 const body=document.getElementById('modalBody');
 body.innerHTML='<button type="button" class="back-party-list" id="backPartyList">← All Parties</button><p class="ledger-loading">Loading full project ledger…</p>';
 try{
  let result=partyLedgerCache.get(id);
  if(!result){result=await fetchPartyLedger(party);if(result.success)partyLedgerCache.set(id,result);}
  if(document.getElementById('modal').classList.contains('show') && body.querySelector('.ledger-loading')){
   body.innerHTML='<button type="button" class="back-party-list" id="backPartyList">← All Parties</button>'+ledgerHtml(result);
  }
 }catch(e){if(body.querySelector('.ledger-loading'))body.innerHTML='<button type="button" class="back-party-list" id="backPartyList">← All Parties</button><p class="ledger-error">'+safe(e.message||'Unable to load ledger')+'</p>';}
}
function reportRows(m){return (m.reports||[]).map(r=>{const mat=num(r.materialCost),total=num(r.expenditure);return makeRow([r.date,amount(Math.max(0,total-mat)),amount(mat),amount(total)]);});}
function render(){const m=monthView(),c=calc(m),parties=partyView();fill('monthlyTotal',amount(c.total));fill('materialTotal',amount(c.mat));fill('workforceTotal',amount(c.workforce));fill('serviceTotal',amount(c.service));fill('cashIn',amount(c.cashIn));fill('cashOut',amount(c.cashOut));fill('summaryBasis',currentMonth==='all'?'Total Project — material and workforce bills only. Service charge is shown separately.':'Selected month — material and workforce bills only. Service charge is shown separately.');table('materialsBody',(m.materials||[]).slice(0,6).map(x=>makeRow([x.name,`${x.quantity} ${x.unit||''}`.trim(),amount(x.total)])),3);table('partiesBody',parties.length?[partyRows(parties.slice(0,6))]:[],3);const totalBalance=parties.reduce((total,party)=>total+num(party.balance),0);fill('partyTotalBalance',amount(totalBalance));const totalEl=document.getElementById('partyTotalBalance');if(totalEl){totalEl.classList.toggle('advance',totalBalance<-.005);totalEl.classList.toggle('settled',Math.abs(totalBalance)<.005);}table('reportsBody',reportRows(m).slice(0,6),4);table('remarksBody',(m.remarks||[]).slice(0,6).map(remarkRow),2);}
function selectMonth(v){currentMonth=v;document.getElementById('monthSelect').value=v;render();}
function buildMonths(){const select=document.getElementById('monthSelect');const months=Object.keys(data.months||{}).sort().reverse();select.innerHTML='<option value="all">Total Project</option>'+months.map(m=>'<option value="'+safe(m)+'">'+new Date(m+'-01T12:00:00').toLocaleString('en-IN',{month:'short',year:'numeric'})+'</option>').join('');const asked=params.get('month');selectMonth(months.includes(asked)?asked:'all');}
function modal(title,headers,records,renderRow=makeRow){fill('modalTitle',title);document.getElementById('modalBody').innerHTML='<table><thead><tr>'+headers.map(x=>'<th>'+safe(x)+'</th>').join('')+'</tr></thead><tbody>'+((records.length)?records.map(renderRow).join(''):'<tr><td class="empty" colspan="'+headers.length+'">No records</td></tr>')+'</tbody></table>';document.getElementById('modal').classList.add('show');}
function showDetail(type){
 if(type==='parties'){showAllParties();return;}
 const m=monthView();
 const options={materials:['Material List',['Material','Quantity / Unit','Amount'],(m.materials||[]).map(x=>[x.name,`${x.quantity} ${x.unit||''}`,amount(x.total)])],reports:['Recent Daily Expenses',['Date','Workforce Cost','Materials Cost','Total'],(m.reports||[]).map(x=>[x.date,amount(Math.max(0,num(x.expenditure)-num(x.materialCost))),amount(x.materialCost),amount(x.expenditure)])],remarks:['Remarks',['Date','Remark'],(m.remarks||[])]};
 if(options[type]){if(type==='remarks'){modal(...options[type],remarkRow);}else{modal(...options[type]);}}
}
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showDetail(el.dataset.view);}));
document.getElementById('modalBody').addEventListener('click',e=>{const btn=e.target.closest('[data-modal-party]');if(btn){showPartyLedger(Number(btn.dataset.modalParty));return;}if(e.target.closest('#backPartyList')){showAllParties();return;}if(e.target.closest('#sortPartyBalance')){partyBalanceSort=partyBalanceSort==='asc'?'desc':'asc';showAllParties();return;}});
document.getElementById('closeModal').onclick=()=>document.getElementById('modal').classList.remove('show');document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')e.currentTarget.classList.remove('show');});document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('modal').classList.remove('show');});document.getElementById('monthSelect').onchange=e=>selectMonth(e.target.value);
(async()=>{try{data=await fetchData();projectId=data.project.id||projectId;showProject();buildMonths();if(!CONFIG.USE_DEMO)fill('disclaimer','Figures loaded from your configured dashboard service.');}catch(e){setWarning('Could not load live project data: '+e.message);fill('disclaimer','No live data loaded.');fill('projectName','Project unavailable');}})();

// Project session actions live in the dashboard Settings dropdown.
(function initProjectSettingsMenu(){
  const control=document.getElementById('projectSettingsControl');
  const toggle=document.getElementById('projectSettingsToggle');
  const menu=document.getElementById('projectSettingsMenu');
  const logout=document.getElementById('clientLogout');
  if(!control||!toggle||!menu)return;
  const close=()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false');};
  toggle.addEventListener('click',()=>{
    menu.hidden=!menu.hidden;
    toggle.setAttribute('aria-expanded',String(!menu.hidden));
  });
  document.addEventListener('click',event=>{if(!control.contains(event.target))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  logout?.addEventListener('click',()=>{
    sessionStorage.removeItem('ideaClientAccessToken');
    sessionStorage.removeItem('ideaClientProjectId');
    sessionStorage.removeItem('ideaPreviewAccess');
    close();
    location.replace('client-access.html');
  });
})();

// Client self-service: change the project access code without exposing it in the URL.
(function initAccessCodeChange(){
  const open=document.getElementById('openChangeAccessCode');
  const dialog=document.getElementById('changeAccessDialog');
  const form=document.getElementById('changeAccessForm');
  const close=document.getElementById('closeChangeAccessCode');
  const status=document.getElementById('changeAccessStatus');
  const save=document.getElementById('saveChangeAccessCode');
  if(!open||!dialog||!form||!close||!status||!save)return;
  if(CONFIG.USE_DEMO){open.hidden=true;return;}
  const hide=()=>{if(!save.disabled){dialog.hidden=true;form.reset();status.textContent='';}};
  open.addEventListener('click',()=>{
    const menu=document.getElementById('projectSettingsMenu');
    const toggle=document.getElementById('projectSettingsToggle');
    if(menu)menu.hidden=true;
    toggle?.setAttribute('aria-expanded','false');
    dialog.hidden=false;status.textContent='';document.getElementById('currentClientCode').focus();
  });
  close.addEventListener('click',hide);
  dialog.addEventListener('click',e=>{if(e.target===dialog)hide();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.hidden)hide();});
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const currentAccessCode=document.getElementById('currentClientCode').value;
    const newAccessCode=document.getElementById('newClientCode').value;
    const confirmAccessCode=document.getElementById('confirmClientCode').value;
    if(newAccessCode.length<8){status.textContent='Use at least 8 characters.';return;}
    if(newAccessCode!==confirmAccessCode){status.textContent='New access codes do not match.';return;}
    const token=sessionStorage.getItem('ideaClientAccessToken')||'';
    if(!token||sessionStorage.getItem('ideaClientProjectId')!==projectId){
      status.textContent='Session expired. Please sign in again.';return;
    }
    save.disabled=true;status.textContent='Changing access code…';
    try{
      const response=await fetch(CONFIG.API_URL,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:JSON.stringify({action:'clientChangeAccessCode',projectId,accessToken:token,currentAccessCode,newAccessCode,confirmAccessCode})
      });
      if(!response.ok)throw Error('Request failed ('+response.status+')');
      const result=await response.json();
      if(!result.success)throw Error(result.message||'Unable to change access code');
      sessionStorage.removeItem('ideaClientAccessToken');
      sessionStorage.removeItem('ideaClientProjectId');
      sessionStorage.removeItem('ideaPreviewAccess');
      form.reset();
      status.textContent='Access code changed. Redirecting to sign in…';
      location.replace('client-access.html');
    }catch(err){status.textContent=err.message||'Unable to change access code';save.disabled=false;}
  });
})();
