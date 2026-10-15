/* Step 18B — browser-only secure private files. Existing dashboard script unchanged. */
(()=>{'use strict';
const htmlEsc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modalEl=document.getElementById('modal'),body=document.getElementById('modalBody');
const title=document.getElementById('modalTitle');
const configuredApi=window.IDEA_SITE_CONFIG?.API_URL||'';
const pid=new URLSearchParams(location.search).get('projectId')||'P001';
function authorized(){return sessionStorage.getItem('ideaClientAccessToken')&&sessionStorage.getItem('ideaClientProjectId')===pid;}
async function api(action,params={}){
 if(!configuredApi)throw Error('Connect your published Google Apps Script endpoint first.');
 if(!authorized())throw Error('Please sign in to this project again.');
 const u=new URL(configuredApi);u.searchParams.set('action',action);u.searchParams.set('projectId',pid);u.searchParams.set('accessToken',sessionStorage.getItem('ideaClientAccessToken'));
 Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u.toString());if(!r.ok)throw Error('Request failed ('+r.status+')');
 const d=await r.json();if(d.success!==true)throw Error(d.message||'Unable to load files');return d;
}
let activeKind='',entries=[];
function panel(kind){activeKind=kind;title.textContent=kind;body.innerHTML='<p class="drive-file-hint">Loading '+htmlEsc(kind.toLowerCase())+' from this project’s private Google Drive folder…</p>';modalEl.classList.add('show');}
async function list(kind){panel(kind);
 try{const resp=await api('clientDriveList',{kind});if(activeKind!==kind||!modalEl.classList.contains('show'))return;
 entries=resp.files||[];
 body.innerHTML='<p class="drive-file-hint">Files are read-only. Select a PDF or image to view or download.</p>'+
 (entries.length?'<div class="drive-file-list">'+entries.map((f,i)=>'<button type="button" class="drive-file-item" data-drive-file="'+i+'" '+(f.tooLarge?'disabled title="File exceeds 7 MB preview limit"':'')+'><span><span class="drive-file-name">'+htmlEsc(f.name)+'</span><span class="drive-file-meta">'+htmlEsc(new Date(f.updated).toLocaleDateString('en-IN'))+' · '+htmlEsc(f.mimeType)+(f.tooLarge?' · Over 7 MB':'')+'</span></span><span aria-hidden="true">'+(f.tooLarge?'—':'↗')+'</span></button>').join('')+'</div>':'<p class="drive-file-hint">No PDF or image files in this folder yet.</p>');
 }catch(e){if(activeKind===kind)body.innerHTML='<p class="drive-file-error">'+htmlEsc(e.message)+'</p>';}
}
// Save user-selected file locally as a Blob, avoiding public Drive sharing URLs.
body.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-drive-file]');if(!btn)return;
 const item=entries[Number(btn.dataset.driveFile)];if(!item)return;
 btn.disabled=true;const old=btn.innerHTML;btn.querySelector('.drive-file-name').textContent='Loading: '+item.name;
 try{
  const file=await api('clientDriveFile',{kind:activeKind,fileId:item.id});
  const raw=atob(file.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType}));
  const a=document.createElement('a');a.href=url;a.download=file.name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(err){alert('File unavailable: '+err.message);}finally{btn.disabled=false;btn.innerHTML=old;}
});
document.getElementById('openDriveDrawings')?.addEventListener('click',()=>list('Drawings'));
document.getElementById('openDriveBills')?.addEventListener('click',()=>list('Bills'));
})();

/* Step 18C: Settings dropdown; existing Change Access Code listener remains in client-dashboard.js. */
(()=>{
 const toggle=document.getElementById('projectSettingsToggle');
 const menu=document.getElementById('projectSettingsMenu');
 const root=document.getElementById('projectSettingsControl');
 const change=document.getElementById('openChangeAccessCode');
 if(!toggle||!menu||!root||!change)return;
 const close=()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false');};
 toggle.addEventListener('click',()=>{const show=menu.hidden;menu.hidden=!show;toggle.setAttribute('aria-expanded',String(show));});
 change.addEventListener('click',close);
 document.addEventListener('click',e=>{if(!root.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();toggle.focus();}});
})();
