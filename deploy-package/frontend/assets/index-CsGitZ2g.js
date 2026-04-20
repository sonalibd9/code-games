(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const c of r.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&a(c)}).observe(document,{childList:!0,subtree:!0});function s(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function a(n){if(n.ep)return;n.ep=!0;const r=s(n);fetch(n.href,r)}})();const w="http://localhost:4000";async function f(i,t,s,a){const n=await fetch(`${w}${i}`,{method:t,headers:{...s?{Authorization:`Bearer ${s}`}:{},...a&&!(a instanceof FormData)?{"Content-Type":"application/json"}:{},"ngrok-skip-browser-warning":"true"},body:a?a instanceof FormData?a:JSON.stringify(a):void 0});if(!n.ok){const r=await n.json().catch(()=>({message:"Request failed."}));throw new Error(r.message??"Request failed.")}return n.json()}function ee(i,t){return f("/api/auth/login","POST",void 0,{email:i,password:t})}function te(i){return f("/api/clients","GET",i)}function ie(i){return f("/api/requirements","GET",i)}function se(i){return f("/api/notifications","GET",i)}function ae(i){return f("/api/pbc-lists","GET",i)}function ne(i,t){return f(`/api/pbc-lists/${encodeURIComponent(t)}`,"DELETE",i)}function oe(i,t){const s=t?`?clientId=${encodeURIComponent(t)}`:"";return fetch(`${w}/api/pbc-lists/template${s}`,{method:"GET",headers:{Authorization:`Bearer ${i}`,"ngrok-skip-browser-warning":"true"}}).then(async a=>{if(!a.ok){const n=await a.json().catch(()=>({message:"Request failed."}));throw new Error(n.message??"Request failed.")}return a.blob()})}function re(i,t,s){const a=new FormData;return a.append("file",s),f(`/api/pbc-lists/${t}`,"POST",i,a)}function P(i,t){const s=t?`?pbcListId=${encodeURIComponent(t)}`:"";return f(`/api/pbc-items${s}`,"GET",i)}function H(i,t){return f("/api/pbc-items/bulk","PUT",i,{items:t})}function z(i,t){return fetch(`${w}/api/pbc-items/export`,{method:"POST",headers:{Authorization:`Bearer ${i}`,"Content-Type":"application/json","ngrok-skip-browser-warning":"true"},body:JSON.stringify(t)}).then(async s=>{if(!s.ok){const a=await s.json().catch(()=>({message:"Request failed."}));throw new Error(a.message??"Request failed.")}return s.blob()})}function de(i,t,s){return f(`/api/pbc-items/${encodeURIComponent(t)}/status`,"PUT",i,{status:s})}function le(i,t,s){const a=new FormData;return a.append("file",s),f(`/api/uploads/${t}`,"POST",i,a)}function E(i,t){return f(`/api/pbc-item-files?pbcItemId=${encodeURIComponent(t)}`,"GET",i)}function ce(i,t,s){const a=new FormData;return a.append("file",s),f(`/api/pbc-item-files/${encodeURIComponent(t)}`,"POST",i,a)}function ue(i,t){return f(`/api/pbc-item-files/${encodeURIComponent(t)}`,"DELETE",i)}const l=document.getElementById("root"),e={theme:"light",session:null,currentPage:"login",clients:[],requirements:[],pbcLists:[],pbcAllItems:[],auditorNotifications:[],activeAuditorClientId:"",auditFinalisationDate:"",selectedPbcListId:"",pbcEditorRows:[],updatedPbcItemIds:[],activePbcListForClient:null,clientItemRows:[],activePbcItem:null,pbcItemFiles:[],selectedRequirementId:"",successMessage:"",errorMessage:"",eventSource:null,sseConnected:!1,auditorLogin:{email:"auditor@firm.com",password:"Auditor@123"},clientLogin:{email:"client.alpha@entity.com",password:"Client@123"}};function pe(){const i=window.localStorage.getItem("portal-theme");i==="dark"||i==="light"?e.theme=i:e.theme=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light",G()}function G(){document.body.classList.toggle("theme-dark",e.theme==="dark")}function V(){e.theme=e.theme==="dark"?"light":"dark",window.localStorage.setItem("portal-theme",e.theme),G(),d()}function o(i=""){return String(i).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function S(i){if(!i)return"—";const t=new Date(i);return Number.isNaN(t.getTime())?o(i):t.toLocaleDateString()}function q(i){if(!i)return"—";const t=new Date(i);return Number.isNaN(t.getTime())?o(i):t.toLocaleString()}function g(i){const t=String(i??"").trim();if(!t)return"";const s=t.match(/^(\d{4})-(\d{2})-(\d{2})/);if(s)return`${s[1]}-${s[2]}-${s[3]}`;const a=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(a)return`${a[3]}-${a[1].padStart(2,"0")}-${a[2].padStart(2,"0")}`;const n=new Date(t);return Number.isNaN(n.getTime())?"":`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`}function A(i){const t=String(i??"").trim().toLowerCase();if(!t)return"";const s=["fraud","material","going concern","impairment","significant risk","revenue recognition","litigation","related party","override"],a=["valuation","estimate","cut-off","cutoff","accuracy","completeness","classification","presentation","disclosure","provision","tax"];return s.some(n=>t.includes(n))?"High":a.some(n=>t.includes(n))?"Medium":"Low"}function D(i,t){if(!i)return"";const s=new Date(`${i}T00:00:00`);if(Number.isNaN(s.getTime()))return"";let a=0;return String(t??"").toLowerCase()==="high"?a=2:String(t??"").toLowerCase()==="medium"&&(a=1),s.setMonth(s.getMonth()-a),`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`}function me(i,t){if(!i)return null;const s=new Date(i);if(Number.isNaN(s.getTime()))return null;const a=t?new Date(t):new Date;return Number.isNaN(a.getTime())?null:(s.setHours(0,0,0,0),a.setHours(0,0,0,0),Math.round((s.getTime()-a.getTime())/(1e3*60*60*24)))}function fe(i){const t=e.pbcAllItems.filter(s=>s.pbcListId===i);return{completed:t.filter(s=>s.status==="Completed").length,inProgress:t.filter(s=>s.status==="In progress").length,pending:t.filter(s=>s.status!=="Completed"&&s.status!=="In progress").length,total:t.length}}function be(){return e.session?e.session.user.role==="auditor"?e.requirements:e.requirements.filter(i=>i.clientId===e.session.user.clientId):[]}function k(){return e.session?e.session.user.role==="auditor"?e.activeAuditorClientId?e.pbcLists.filter(i=>i.clientId===e.activeAuditorClientId):e.pbcLists:e.pbcLists.filter(i=>i.clientId===e.session.user.clientId):[]}function _(){return e.clients.find(i=>i.id===e.activeAuditorClientId)??null}function u(i,t){e.successMessage=i==="success"?t:"",e.errorMessage=i==="error"?t:""}function b(){e.successMessage="",e.errorMessage=""}function v(){return`
    ${e.successMessage?`<p class="success">${o(e.successMessage)}</p>`:""}
    ${e.errorMessage?`<p class="error">${o(e.errorMessage)}</p>`:""}
  `}function J(){e.eventSource&&(e.eventSource.close(),e.eventSource=null),e.sseConnected=!1}function ge(){if(J(),!e.session||e.session.user.role!=="auditor")return;const i=`${w}/api/notifications/stream?token=${encodeURIComponent(e.session.token)}`,t=new EventSource(i);e.eventSource=t,t.addEventListener("open",()=>{e.sseConnected=!0,d()}),t.addEventListener("error",()=>{e.sseConnected=!1,d()}),t.addEventListener("snapshot",s=>{try{e.auditorNotifications=JSON.parse(s.data),d()}catch{}}),t.addEventListener("notification",s=>{try{const a=JSON.parse(s.data);e.auditorNotifications=[a,...e.auditorNotifications.filter(n=>n.id!==a.id)],d()}catch{}})}function R(i,t){const s=URL.createObjectURL(i),a=document.createElement("a");a.href=s,a.download=t,document.body.appendChild(a),a.click(),a.remove(),URL.revokeObjectURL(s)}async function I(){var c,p;if(!e.session)return;const{token:i,user:t}=e.session,[s,a,n]=await Promise.all([ie(i),ae(i),P(i)]);if(e.requirements=s,e.pbcLists=a,e.pbcAllItems=n,t.role==="client"&&(e.selectedRequirementId=e.selectedRequirementId||((c=s[0])==null?void 0:c.id)||"",e.auditorNotifications=[]),t.role==="auditor"){const[m,N]=await Promise.all([te(i),se(i)]);e.clients=m,e.auditorNotifications=N,m.length>0&&!e.activeAuditorClientId&&(e.activeAuditorClientId=m[0].id)}const r=k();r.some(m=>m.id===e.selectedPbcListId)||(e.selectedPbcListId=((p=r[r.length-1])==null?void 0:p.id)||"")}async function x(i){if(!e.session||!i){e.pbcEditorRows=[];return}const t=await P(e.session.token,i);e.pbcEditorRows=t.map(s=>{const n=A(s.riskAssertion)||s.priority,r=g(s.dueDate),c=e.auditFinalisationDate?D(e.auditFinalisationDate,n):r;return{...s,priority:n,dueDate:c}}),e.updatedPbcItemIds=[]}async function O(i,t){b();const s=t.querySelector('[name="email"]').value.trim(),a=t.querySelector('[name="password"]').value;try{const n=await ee(s,a);if(n.user.role!==i){u("error",`This form is for ${i} login only.`),d();return}e.session=n,e.currentPage=n.user.role==="auditor"?"auditor-client-select":"portal",await I(),n.user.role==="auditor"&&ge(),d()}catch(n){u("error",n instanceof Error?n.message:"Login failed."),d()}}async function he(){if(!(!e.session||!e.activeAuditorClientId)){b();try{if(e.auditFinalisationDate){const i=e.pbcLists.filter(s=>s.clientId===e.activeAuditorClientId).map(s=>s.id),t=e.pbcAllItems.filter(s=>i.includes(s.pbcListId)&&g(s.dueDate)!==D(e.auditFinalisationDate,s.priority));t.length>0&&(await H(e.session.token,t.map(s=>({id:s.id,requestId:s.requestId,description:s.description,priority:s.priority,riskAssertion:s.riskAssertion,owner:s.owner,requestedDate:s.requestedDate,dueDate:D(e.auditFinalisationDate,s.priority),status:s.status,remarks:s.remarks}))),await I())}e.currentPage="auditor-pbc",d()}catch(i){u("error",i instanceof Error?i.message:"Could not apply audit finalisation date."),d()}}}async function ve(i){var s,a;if(!e.session||!e.activeAuditorClientId)return;b();const t=(a=(s=i.querySelector("#pbc-file"))==null?void 0:s.files)==null?void 0:a[0];if(!t){u("error","Please choose an Excel or CSV PBC file."),d();return}try{const n=await re(e.session.token,e.activeAuditorClientId,t);await I(),e.selectedPbcListId=n.id,u("success",`Detailed PBC list uploaded successfully. Parsed ${n.parsedItemCount??0} rows.`),d()}catch(n){u("error",n instanceof Error?n.message:"Could not upload the detailed PBC list."),d()}}async function ye(){if(e.session)try{const i=await oe(e.session.token,e.activeAuditorClientId||void 0),t=_(),s=((t==null?void 0:t.name)||"client").replace(/[^a-zA-Z0-9_-]/g,"_");R(i,`pbc-template-${s}.xlsx`)}catch(i){u("error",i instanceof Error?i.message:"Could not download PBC template."),d()}}async function $e(i){if(!(!e.session||!window.confirm("Delete this uploaded PBC list? This will remove its parsed items as well."))){b();try{await ne(e.session.token,i),await I(),e.selectedPbcListId===i&&(e.selectedPbcListId=""),u("success","Detailed PBC list deleted successfully."),d()}catch(s){u("error",s instanceof Error?s.message:"Could not delete PBC list."),d()}}}async function we(){if(!(!e.session||!e.selectedPbcListId)){b();try{await x(e.selectedPbcListId),e.currentPage="pbc-editor",d()}catch(i){u("error",i instanceof Error?i.message:"Could not load PBC editor data."),d()}}}async function Pe(i){if(e.selectedPbcListId=i,b(),!i){e.pbcEditorRows=[],d();return}try{await x(i),d()}catch(t){u("error",t instanceof Error?t.message:"Could not load PBC list items."),d()}}function j(i,t,s){const a=e.pbcEditorRows[i];a&&(t==="riskAssertion"?(a.riskAssertion=s,a.priority=A(s)||a.priority):a[t]=s,e.updatedPbcItemIds.includes(a.id)||e.updatedPbcItemIds.push(a.id))}async function Ie(){if(!(!e.session||e.pbcEditorRows.length===0)){b();try{const i=await H(e.session.token,e.pbcEditorRows.map(t=>({id:t.id,requestId:t.requestId,description:t.description,priority:A(t.riskAssertion)||t.priority,riskAssertion:t.riskAssertion,owner:t.owner,requestedDate:t.requestedDate,dueDate:t.dueDate,status:t.status,remarks:t.remarks})));e.selectedPbcListId&&await x(e.selectedPbcListId),e.pbcAllItems=await P(e.session.token),u("success",`Saved ${i.updatedCount} PBC item updates.`),d()}catch(i){u("error",i instanceof Error?i.message:"Could not save PBC edits."),d()}}}async function Ce(){if(!e.session||!e.selectedPbcListId)return;const i=e.pbcEditorRows.filter(t=>e.updatedPbcItemIds.includes(t.id));if(i.length===0){u("error","No updated PBC items available for download."),d();return}try{const t=await z(e.session.token,{pbcListId:e.selectedPbcListId,itemIds:i.map(s=>s.id)});R(t,`pbc-items-updated-${new Date().toISOString().slice(0,10)}.xlsx`),u("success",`Downloaded ${i.length} updated PBC item(s) as Excel.`),d()}catch(t){u("error",t instanceof Error?t.message:"Could not download updated PBC items."),d()}}async function Le(){if(!(!e.session||!e.selectedPbcListId||e.pbcEditorRows.length===0))try{const i=await z(e.session.token,{pbcListId:e.selectedPbcListId,itemIds:e.pbcEditorRows.map(t=>t.id)});R(i,`pbc-items-all-${new Date().toISOString().slice(0,10)}.xlsx`),u("success",`Downloaded all ${e.pbcEditorRows.length} PBC item(s) as Excel.`),d()}catch(i){u("error",i instanceof Error?i.message:"Could not download all PBC items."),d()}}async function ke(i){var s,a;if(!e.session||!e.selectedRequirementId)return;b();const t=(a=(s=i.querySelector("#requirement-file"))==null?void 0:s.files)==null?void 0:a[0];if(!t){u("error","Please select a file."),d();return}try{await le(e.session.token,e.selectedRequirementId,t),await I(),u("success","Client data uploaded successfully."),d()}catch(n){u("error",n instanceof Error?n.message:"Upload failed."),d()}}async function Se(i){if(!e.session)return;const t=e.pbcLists.find(s=>s.id===i);t&&(e.activePbcListForClient=t,e.clientItemRows=await P(e.session.token,t.id),e.currentPage="client-pbc-items",d())}async function W(i){if(!e.session)return;const t=[...e.clientItemRows,...e.pbcEditorRows,...e.pbcAllItems].find(s=>s.id===i);if(t){e.activePbcItem=t;try{e.pbcItemFiles=await E(e.session.token,t.id)}catch{e.pbcItemFiles=[]}e.currentPage="pbc-item-detail",d()}}async function De(i){var s,a,n;if(!e.session||!e.activePbcItem)return;b();const t=(a=(s=i.querySelector("#item-file-input"))==null?void 0:s.files)==null?void 0:a[0];if(!t){u("error","Please select a file."),d();return}try{await ce(e.session.token,e.activePbcItem.id,t),e.pbcItemFiles=await E(e.session.token,e.activePbcItem.id);const r=await P(e.session.token,e.activePbcItem.pbcListId);((n=e.activePbcListForClient)==null?void 0:n.id)===e.activePbcItem.pbcListId&&(e.clientItemRows=r);const c=r.find(p=>p.id===e.activePbcItem.id)??e.activePbcItem;e.activePbcItem=c,e.pbcEditorRows=e.pbcEditorRows.map(p=>p.id===c.id?c:p),e.pbcAllItems=e.pbcAllItems.map(p=>p.id===c.id?c:p),u("success","File uploaded successfully."),d()}catch(r){u("error",r instanceof Error?r.message:"Could not upload file."),d()}}async function Ee(i){if(!(!e.session||!e.activePbcItem)){b();try{await ue(e.session.token,i),e.pbcItemFiles=await E(e.session.token,e.activePbcItem.id),u("success","File deleted successfully."),d()}catch(t){u("error",t instanceof Error?t.message:"Could not delete file."),d()}}}async function qe(i){if(!(!e.session||!e.activePbcItem)){b();try{const t=await de(e.session.token,e.activePbcItem.id,i);e.activePbcItem=t,e.clientItemRows=e.clientItemRows.map(s=>s.id===t.id?t:s),e.pbcEditorRows=e.pbcEditorRows.map(s=>s.id===t.id?t:s),e.pbcAllItems=e.pbcAllItems.map(s=>s.id===t.id?t:s),u("success","Item status updated successfully."),d()}catch(t){u("error",t instanceof Error?t.message:"Could not update item status."),d()}}}function Ae(){window.confirm("Are you sure you want to logout?")&&(J(),e.session=null,e.currentPage="login",e.clients=[],e.requirements=[],e.pbcLists=[],e.pbcAllItems=[],e.auditorNotifications=[],e.activeAuditorClientId="",e.auditFinalisationDate="",e.selectedPbcListId="",e.pbcEditorRows=[],e.updatedPbcItemIds=[],e.activePbcListForClient=null,e.clientItemRows=[],e.activePbcItem=null,e.pbcItemFiles=[],e.selectedRequirementId="",b(),d())}function y(){return`
    <header class="brand-header">
      <div class="brand-logo-wrap">
        <span class="brand-dot"></span>
        <span class="brand-name">Audit Collaboration Hub</span>
      </div>
      <nav class="brand-nav" aria-label="Primary">
        <span>Solutions</span>
        <span>Insights</span>
        <span>Support</span>
      </nav>
      <button type="button" class="secondary theme-toggle" data-action="toggle-theme">${e.theme==="dark"?"☀ Light":"🌙 Dark"}</button>
      ${e.session?'<button type="button" class="secondary brand-logout" data-action="logout">Logout</button>':""}
    </header>
  `}function B(){return e.auditorNotifications.length===0?'<p class="muted">No notifications yet.</p>':`
    <ul>
      ${e.auditorNotifications.slice(0,5).map(i=>`
        <li style="margin-bottom:8px;">
          <strong>${o(q(i.createdAt))}:</strong> ${o(i.message)}
        </li>
      `).join("")}
    </ul>
  `}function F(i){return`
    <section class="feature-grid">
      ${(i==="auditor"?[{title:"Portfolio Visibility",desc:"Track all client PBC progress from one workspace."},{title:"Live Alerts",desc:"Get real-time trial balance and status notifications."},{title:"Controlled Sharing",desc:"Standardized templates reduce onboarding friction."}]:[{title:"Secure Submission",desc:"Upload trial balance and supporting files safely."},{title:"Clear Priorities",desc:"See pending, due, and completed PBC requests instantly."},{title:"Single Collaboration Hub",desc:"Coordinate with auditors in one streamlined portal."}]).map(s=>`
        <article class="feature-card">
          <h3>${o(s.title)}</h3>
          <p>${o(s.desc)}</p>
        </article>
      `).join("")}
    </section>
  `}function Y({total:i,completed:t,inProgress:s,pending:a,high:n,medium:r,low:c,unset:p,mode:m}){const C=2*Math.PI*40,Z=m==="status"?[{value:t,color:"#38bdf8"},{value:s,color:"#f59e0b"},{value:a,color:"#dc2626"}]:[{value:n,color:"#dc2626"},{value:r,color:"#f59e0b"},{value:c,color:"#38bdf8"},...p>0?[{value:p,color:"#94a3b8"}]:[]];let U=C;const Q=Z.map(M=>{const L=i>0?M.value/i*C:0,X=U;return U-=L,L<=0?"":`<circle cx="60" cy="60" r="40" fill="none" stroke="${M.color}" stroke-width="16" stroke-dasharray="${L} ${C-L}" stroke-dashoffset="${X}" />`}).join("");return`
    <div class="${m==="status"?"pie-chart-wrap":"priority-donut-wrap"}">
      <div class="${m==="status"?"pie-chart-ring":"priority-donut-ring"}">
        <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg);display:block;">
          <circle cx="60" cy="60" r="40" fill="none" stroke="#e5e7eb" stroke-width="16" />
          ${i===0?`<circle cx="60" cy="60" r="40" fill="none" stroke="#d1d5db" stroke-width="16" stroke-dasharray="${C} 0" />`:Q}
        </svg>
        <div class="${m==="status"?"pie-chart-center":"priority-donut-center"}">
          <span class="${m==="status"?"pie-chart-total":"priority-donut-total"}">${i}</span>
          <span class="${m==="status"?"pie-chart-label":"priority-donut-label"}">${m==="status"?"items":"pending"}</span>
        </div>
      </div>
    </div>
  `}function h(i,t){return!t||t<=0?"0%":`${Math.round(i/t*100)}%`}function Re(i){const t=i.filter(c=>c.status!=="Completed"),s=t.filter(c=>String(c.priority).toLowerCase()==="high").length,a=t.filter(c=>String(c.priority).toLowerCase()==="medium").length,n=t.filter(c=>String(c.priority).toLowerCase()==="low").length,r=t.length-s-a-n;return`
    <div class="priority-panel">
      <h3>Pending by Priority</h3>
      <p class="muted">${t.length} non-completed item${t.length===1?"":"s"}</p>
      ${Y({total:t.length,high:s,medium:a,low:n,unset:r,mode:"priority"})}
      <div class="priority-legend">
        <div class="priority-legend-item"><span class="priority-legend-color" style="background:#dc2626"></span><span class="priority-legend-text">High: <strong>${s}</strong> (${h(s,t.length)})</span></div>
        <div class="priority-legend-item"><span class="priority-legend-color" style="background:#f59e0b"></span><span class="priority-legend-text">Medium: <strong>${a}</strong> (${h(a,t.length)})</span></div>
        <div class="priority-legend-item"><span class="priority-legend-color" style="background:#38bdf8"></span><span class="priority-legend-text">Low: <strong>${n}</strong> (${h(n,t.length)})</span></div>
        ${r>0?`<div class="priority-legend-item"><span class="priority-legend-color" style="background:#94a3b8"></span><span class="priority-legend-text">Unset: <strong>${r}</strong> (${h(r,t.length)})</span></div>`:""}
      </div>
    </div>
  `}function K(i){return i.length===0?'<p class="muted">No PBC list uploaded yet for this client.</p>':`
    <div class="pbc-status-grid">
      ${i.map(t=>{const s=fe(t.id);return`
          <div class="pbc-status-card">
            <h3>${o(t.originalName)}</h3>
            ${Y({total:s.total,completed:s.completed,inProgress:s.inProgress,pending:s.pending,mode:"status"})}
            <p><strong>Total:</strong> ${s.total}</p>
            <div class="pbc-status-legend">
              <div class="legend-item"><span class="legend-color completed"></span><span>Completed: ${s.completed} (${h(s.completed,s.total)})</span></div>
              <div class="legend-item"><span class="legend-color in-progress"></span><span>In Progress: ${s.inProgress} (${h(s.inProgress,s.total)})</span></div>
              <div class="legend-item"><span class="legend-color pending"></span><span>Pending: ${s.pending} (${h(s.pending,s.total)})</span></div>
            </div>
            <div class="pbc-card-actions">
              <button class="danger" type="button" data-action="delete-pbc-list" data-id="${t.id}">Delete</button>
            </div>
          </div>
        `}).join("")}
    </div>
  `}function xe(){return`
    <main class="page brand-shell">
      ${y()}
      <section class="hero-banner professional">
        <div class="hero-content">
          <h1>AI-powered audit collaboration</h1>
          <p>Streamline auditor and client workflows in one secure portal.</p>
          <div class="hero-chips">
            <span>Enterprise-grade access</span>
            <span>Real-time notifications</span>
            <span>Structured PBC workflows</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"></div>
      </section>
      ${F("login")}
      <div class="inline" style="margin:24px auto 80px;max-width:980px;align-items:stretch;flex-wrap:wrap;">
        <div class="card auth-card" style="margin-bottom:0;">
          <h1>Auditor Login</h1>
          <p class="muted">Use auditor credentials to manage all client PBC workspaces.</p>
          <form id="auditor-login-form">
            <label for="auditor-email">Email</label>
            <input id="auditor-email" name="email" value="${o(e.auditorLogin.email)}" />
            <label for="auditor-password">Password</label>
            <input id="auditor-password" name="password" type="password" value="${o(e.auditorLogin.password)}" />
            <button type="submit">Sign In as Auditor</button>
          </form>
          <div>
            <p class="muted" style="margin-bottom:4px;">Demo Credentials</p>
            <p class="muted" style="margin-top:0;">Email: auditor@firm.com<br />Password: Auditor@123</p>
            <button type="button" class="secondary" id="use-auditor-demo">Use Demo Credentials</button>
          </div>
        </div>
        <div class="card auth-card" style="margin-bottom:0;">
          <h1>Client Login</h1>
          <p class="muted">Use client credentials to view and upload only your own client PBC list.</p>
          <form id="client-login-form">
            <label for="client-email">Email</label>
            <input id="client-email" name="email" value="${o(e.clientLogin.email)}" />
            <label for="client-password">Password</label>
            <input id="client-password" name="password" type="password" value="${o(e.clientLogin.password)}" />
            <button type="submit">Sign In as Client</button>
          </form>
          <div>
            <p class="muted" style="margin-bottom:4px;">Demo Credentials</p>
            <p class="muted" style="margin-top:0;">Email: client.alpha@entity.com<br />Password: Client@123</p>
            <button type="button" class="secondary" id="use-client-demo">Use Demo Credentials</button>
          </div>
        </div>
      </div>
      ${v()}
    </main>
  `}function Be(){return`
    <main class="page brand-shell">
      ${y()}
      <section class="hero-banner compact">
        <h1>Select client workspace</h1>
        <p>Choose a client to continue with PBC upload and dashboard monitoring.</p>
      </section>
      <section class="card" style="max-width:700px;margin:0 auto 24px;">
        <h2>Auditor Startup</h2>
        <label for="auditor-client-select">Client</label>
        <select id="auditor-client-select">
          <option value="">Select client</option>
          ${e.clients.map(i=>`<option value="${i.id}" ${i.id===e.activeAuditorClientId?"selected":""}>${o(i.name)} (${o(i.entityType)})</option>`).join("")}
        </select>
        <label for="audit-finalisation-date">Date of Audit Finalisation</label>
        <input id="audit-finalisation-date" type="date" value="${o(e.auditFinalisationDate)}" />
        <p class="muted" style="margin-top:4px;">This date will be used as the default due date for any PBC items that do not already have one.</p>
        <div class="actions">
          <button type="button" id="continue-auditor-workspace" ${e.activeAuditorClientId?"":"disabled"}>Continue to PBC Workspace</button>
        </div>
      </section>
      <section class="card" style="max-width:700px;margin:0 auto 24px;">
        <div class="toolbar">
          <h2>Notifications</h2>
          <span class="muted">${e.sseConnected?"Live":"Reconnecting..."}</span>
        </div>
        ${B()}
      </section>
      ${v()}
    </main>
  `}function Fe(){const i=_(),t=k(),s=e.pbcAllItems.filter(a=>t.some(n=>n.id===a.pbcListId));return`
    <main class="page brand-shell">
      ${y()}
      <section class="hero-banner compact professional">
        <div class="hero-content">
          <h1>PBC workspace</h1>
          <p>${i?`Managing PBC for ${o(i.name)}`:"Upload detailed PBC files and track completion status."}</p>
          <div class="hero-chips">
            <span>Audit control tower</span>
            <span>Client-wise status view</span>
            <span>Template-driven onboarding</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"></div>
      </section>
      ${F("auditor")}
      <section class="card">
        <div class="toolbar">
          <div>
            <h2>Detailed PBC Management</h2>
            <p class="muted">Upload PBC files and review dashboard status before opening the editor.</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
            ${e.auditFinalisationDate?`<span class="audit-date-badge">Audit Finalisation: <strong>${o(S(`${e.auditFinalisationDate}T00:00:00`))}</strong></span>`:""}
            <button class="secondary" type="button" id="change-client-button">Change Client</button>
          </div>
        </div>
        <form id="pbc-upload-form">
          <label>Client</label>
          <input value="${i?`${o(i.name)} (${o(i.entityType)})`:""}" readonly />
          <label for="pbc-file">PBC Excel File</label>
          <input id="pbc-file" type="file" accept=".xlsx,.xls,.csv" required />
          <div class="actions">
            <button type="submit" ${e.activeAuditorClientId?"":"disabled"}>Upload PBC List</button>
            <button type="button" class="secondary" id="download-pbc-template">Download Blank Template</button>
          </div>
        </form>
      </section>
      <div class="pbc-workspace-split">
        <section class="card pbc-dashboard-card">
          <div class="toolbar">
            <div>
              <h2>PBC Status Dashboard</h2>
              <p class="muted">Review status distribution for the selected client's uploaded PBC lists.</p>
            </div>
            <button class="secondary" type="button" id="open-pbc-editor" ${e.selectedPbcListId?"":"disabled"}>Open PBC Editor</button>
          </div>
          ${K(t)}
          <label for="auditor-pbc-list">Select PBC list for editor</label>
          <select id="auditor-pbc-list">
            <option value="">Select uploaded PBC list</option>
            ${t.map(a=>`<option value="${a.id}" ${a.id===e.selectedPbcListId?"selected":""}>${o(a.originalName)}</option>`).join("")}
          </select>
          <div style="margin-top:16px;">
            <div class="toolbar">
              <h2>Notifications</h2>
              <span class="muted">${e.sseConnected?"Live":"Reconnecting..."}</span>
            </div>
            ${B()}
          </div>
        </section>
        <section class="card priority-panel-card">
          ${Re(s)}
        </section>
      </div>
      ${v()}
    </main>
  `}function T(){const i=be(),t=k();return`
    <main class="page brand-shell">
      ${y()}
      <section class="hero-banner compact professional">
        <div class="hero-content">
          <h1>AI-powered solutions for audit professionals</h1>
          <p>Track requirements, manage PBC lists, and monitor submission status.</p>
          <div class="hero-chips">
            <span>Secure document submission</span>
            <span>Clear request tracking</span>
            <span>Audit-ready collaboration</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"></div>
      </section>
      ${F("client")}
      <div class="card">
        <h1>Audit Client Portal</h1>
        <p class="muted">Logged in as <strong>${o(e.session.user.email)}</strong> (${o(e.session.user.role)})</p>
      </div>
      <section class="card">
        <h2>Upload Client Data</h2>
        <form id="requirement-upload-form">
          <label for="requirement-select">Requirement</label>
          <select id="requirement-select">
            <option value="">Select requirement</option>
            ${i.map(s=>`<option value="${s.id}" ${s.id===e.selectedRequirementId?"selected":""}>${o(s.title)}</option>`).join("")}
          </select>
          <label for="requirement-file">File</label>
          <input id="requirement-file" type="file" required />
          <button type="submit">Upload</button>
        </form>
      </section>
      <section class="card">
        <h2>Detailed PBC Lists</h2>
        <p class="muted">Reference the latest PBC list from your auditor before uploading documents.</p>
        ${t.length>0?K(t).replace(/Delete/g,"View").replace(/data-action="delete-pbc-list"/g,'data-action="view-client-list"'):""}
        <table class="table">
          <thead>
            <tr><th>File</th><th>Client ID</th><th>Uploaded At</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${t.length===0?'<tr><td colspan="4">No PBC list uploaded yet.</td></tr>':t.map(s=>`
              <tr>
                <td><a class="file-link" href="${w}${s.downloadUrl}" target="_blank" rel="noreferrer">${o(s.originalName)}</a></td>
                <td>${o(s.clientId)}</td>
                <td>${o(q(s.uploadedAt))}</td>
                <td><button type="button" data-action="view-client-list" data-id="${s.id}">View Items</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="card">
        <h2>Requirement List</h2>
        <table class="table">
          <thead>
            <tr><th>Title</th><th>Description</th><th>Due Date</th><th>Status</th><th>Client ID</th></tr>
          </thead>
          <tbody>
            ${i.map(s=>`
              <tr>
                <td>${o(s.title)}</td>
                <td>${o(s.description)}</td>
                <td>${o(s.dueDate||"-")}</td>
                <td>${o(s.status)}</td>
                <td>${o(s.clientId)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      ${v()}
    </main>
  `}function Te(){const i=e.activePbcListForClient;return i?`
    <main class="page brand-shell">
      ${y()}
      <section class="hero-banner compact">
        <h1>${o(i.originalName)}</h1>
        <p>Review items and upload supporting documents for each request.</p>
      </section>
      <section class="card">
        <div class="toolbar">
          <div>
            <h2>PBC Items</h2>
            <p class="muted">Click Upload Files on any item to attach supporting documents.</p>
          </div>
          <button class="secondary" type="button" data-action="go-client-portal">Back to Portal</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th style="min-width:280px;">Description</th>
              <th>Priority</th>
              <th>Risk / Assertion</th>
              <th>Financial caption</th>
              <th>Requested Date</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            ${e.clientItemRows.length===0?'<tr><td colspan="10">No items found for this list.</td></tr>':e.clientItemRows.map(t=>`
              <tr>
                <td>${o(t.requestId)}</td>
                <td style="white-space:normal;word-break:break-word;min-width:280px;">${o(t.description)}</td>
                <td>${o(t.priority||"—")}</td>
                <td>${o(t.riskAssertion||"—")}</td>
                <td>${o(t.owner||"—")}</td>
                <td>${o(t.requestedDate||"—")}</td>
                <td>${o(t.dueDate||"—")}</td>
                <td><span class="status-badge status-${o(String(t.status).toLowerCase().replace(/\s+/g,"-"))}">${o(t.status)}</span></td>
                <td>${o(t.remarks||"—")}</td>
                <td><button type="button" data-action="open-item-detail" data-id="${t.id}">Upload Files</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      ${v()}
    </main>
  `:T()}function Ne(){const i=e.activePbcItem;if(!i||!e.session)return T();const t=e.session.user.role==="auditor"?"go-pbc-editor":"go-client-items";return`
    <main class="page brand-shell">
      ${y()}
      <section class="hero-banner compact">
        <h1>Item: ${o(i.requestId)}</h1>
        <p>${o(i.description)}</p>
      </section>
      <section class="card item-detail-meta">
        <h2>Item Details</h2>
        <div class="item-meta-grid">
          <div class="item-meta-row"><span class="item-meta-label">Owner</span><span>${o(i.owner||"—")}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Priority</span><span>${o(i.priority||"—")}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Risk / Assertion</span><span>${o(i.riskAssertion||"—")}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Requested Date</span><span>${o(i.requestedDate||"—")}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Due Date</span><span>${o(i.dueDate||"—")}</span></div>
          <div class="item-meta-row"><span class="item-meta-label">Status</span>
            <select id="item-status-select" class="status-select status-${o(String(i.status).toLowerCase().replace(/\s+/g,"-"))}">
              <option value="Pending" ${i.status==="Pending"?"selected":""}>Pending</option>
              <option value="In progress" ${i.status==="In progress"?"selected":""}>In progress</option>
              <option value="Completed" ${i.status==="Completed"?"selected":""}>Completed</option>
            </select>
          </div>
          <div class="item-meta-row"><span class="item-meta-label">Remarks</span><span>${o(i.remarks||"—")}</span></div>
        </div>
        <button class="secondary" style="margin-top:16px;" type="button" data-action="${t}">← Back</button>
      </section>
      <section class="card">
        <h2>Upload Document</h2>
        <p class="muted">Attach files related to this PBC item request.</p>
        <form id="item-file-upload-form">
          <label for="item-file-input">Select file</label>
          <input id="item-file-input" type="file" required />
          <div class="actions"><button type="submit">Upload File</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Uploaded Documents</h2>
        ${e.pbcItemFiles.length===0?'<p class="muted">No files uploaded yet for this item.</p>':`
          <table class="table">
            <thead><tr><th>File Name</th><th>Uploaded At</th><th>Actions</th></tr></thead>
            <tbody>
              ${e.pbcItemFiles.map(s=>`
                <tr>
                  <td><a class="file-link" href="${w}${s.downloadUrl}" target="_blank" rel="noreferrer">${o(s.originalName)}</a></td>
                  <td>${o(q(s.uploadedAt))}</td>
                  <td><button type="button" class="danger" data-action="delete-item-file" data-id="${s.id}">Delete</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `}
      </section>
      ${v()}
    </main>
  `}function Ue(i){const t=g(i.activityDate),s=me(g(i.dueDate),t||void 0);return s===null?'<span class="pending-days-na">—</span>':t?s<0?`<span class="pending-days-overdue">${Math.abs(s)}d late</span>`:s===0?'<span class="pending-days-done">On time</span>':`<span class="pending-days-ok">${s}d early</span>`:s<0?`<span class="pending-days-overdue">${Math.abs(s)}d overdue</span>`:s===0?'<span class="pending-days-today">Due today</span>':`<span class="${s<=7?"pending-days-urgent":"pending-days-ok"}">${s}d</span>`}function Me(){const i=k();return`
    <main class="page pbc-editor-page">
      ${y()}
      <div class="card">
        <div class="toolbar">
          <div>
            <h1>PBC Editor</h1>
            <p class="muted">Edit uploaded PBC list items and click Save Changes to preserve updates.</p>
            ${e.auditFinalisationDate?`<p class="audit-date-badge" style="display:inline-flex;margin-top:6px;">Audit Finalisation: <strong style="margin-left:4px;">${o(S(`${e.auditFinalisationDate}T00:00:00`))}</strong></p>`:""}
          </div>
          <button class="secondary" type="button" data-action="go-auditor-workspace">Back</button>
        </div>
      </div>
      <section class="card">
        <label for="editor-list">PBC List</label>
        <select id="editor-list">
          <option value="">Select uploaded PBC list</option>
          ${i.map(t=>`<option value="${t.id}" ${t.id===e.selectedPbcListId?"selected":""}>${o(t.originalName)} - ${o(t.clientId)}</option>`).join("")}
        </select>
      </section>
      <section class="card">
        <h2>PBC Items</h2>
        <table class="table" id="pbc-editor-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th style="min-width:280px;">Description</th>
              <th>Priority</th>
              <th>Risk / Assertion</th>
              <th>Financial caption</th>
              <th>Requested Date</th>
              <th>Due Date</th>
              <th style="width:90px;max-width:90px;white-space:normal;word-break:break-word;">Uploaded/ Completed Date</th>
              <th>Pending Days</th>
              <th>Status</th>
              <th>Remarks</th>
              <th>Files</th>
            </tr>
          </thead>
          <tbody>
            ${e.pbcEditorRows.length===0?'<tr><td colspan="12">No PBC items found for this list.</td></tr>':e.pbcEditorRows.map((t,s)=>`
              <tr>
                <td><input data-row-index="${s}" data-field="requestId" value="${o(t.requestId)}" /></td>
                <td><input style="min-width:260px;" data-row-index="${s}" data-field="description" value="${o(t.description)}" /></td>
                <td>
                  <select data-row-index="${s}" data-field="priority" class="priority-select">
                    <option value="" ${t.priority?"":"selected"}>—</option>
                    <option value="Low" ${t.priority==="Low"?"selected":""}>Low</option>
                    <option value="Medium" ${t.priority==="Medium"?"selected":""}>Medium</option>
                    <option value="High" ${t.priority==="High"?"selected":""}>High</option>
                  </select>
                </td>
                <td><input data-row-index="${s}" data-field="riskAssertion" value="${o(t.riskAssertion)}" /></td>
                <td><input data-row-index="${s}" data-field="owner" value="${o(t.owner)}" /></td>
                <td><input type="date" data-row-index="${s}" data-field="requestedDate" value="${o(g(t.requestedDate))}" /></td>
                <td><input type="date" data-row-index="${s}" data-field="dueDate" value="${o(g(t.dueDate))}" /></td>
                <td style="width:90px;max-width:90px;white-space:normal;word-break:break-word;font-size:11px;">${o(g(t.activityDate)?S(`${g(t.activityDate)}T00:00:00`):"—")}</td>
                <td>${Ue(t)}</td>
                <td>
                  <select data-row-index="${s}" data-field="status" class="status-select status-${o(String(t.status).toLowerCase().replace(/\s+/g,"-"))}">
                    <option value="Pending" ${t.status==="Pending"?"selected":""}>Pending</option>
                    <option value="In progress" ${t.status==="In progress"?"selected":""}>In progress</option>
                    <option value="Completed" ${t.status==="Completed"?"selected":""}>Completed</option>
                  </select>
                </td>
                <td><input data-row-index="${s}" data-field="remarks" value="${o(t.remarks)}" /></td>
                <td><button type="button" class="secondary" data-action="open-item-detail" data-id="${t.id}">Files</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="actions">
          <button type="button" id="save-pbc-edits" ${e.pbcEditorRows.length===0?"disabled":""}>Save Changes</button>
          <button type="button" class="secondary" id="download-updated-pbc" ${e.updatedPbcItemIds.length===0?"disabled":""}>Download Updated Excel</button>
          <button type="button" class="secondary" id="download-all-pbc" ${e.pbcEditorRows.length===0?"disabled":""}>Download All Items</button>
        </div>
        <div style="margin-top:16px;">
          <div class="toolbar">
            <h2>Notifications</h2>
            <span class="muted">${e.sseConnected?"Live":"Reconnecting..."}</span>
          </div>
          ${B()}
        </div>
      </section>
      ${v()}
    </main>
  `}function d(){if(!e.session){l.innerHTML=xe(),Oe();return}if(e.session.user.role==="auditor"&&e.currentPage==="auditor-client-select"){l.innerHTML=Be(),$(),je();return}if(e.session.user.role==="auditor"&&e.currentPage==="auditor-pbc"){l.innerHTML=Fe(),$(),He();return}if(e.currentPage==="client-pbc-items"){l.innerHTML=Te(),$(),Ge();return}if(e.currentPage==="pbc-item-detail"){l.innerHTML=Ne(),$(),Ve();return}if(e.currentPage==="pbc-editor"){l.innerHTML=Me(),$(),_e();return}l.innerHTML=T(),$(),ze()}function $(){var i,t,s,a,n,r;(i=l.querySelector('[data-action="toggle-theme"]'))==null||i.addEventListener("click",V),(t=l.querySelector('[data-action="logout"]'))==null||t.addEventListener("click",Ae),l.querySelectorAll('[data-action="delete-item-file"]').forEach(c=>{c.addEventListener("click",()=>void Ee(c.dataset.id))}),(s=l.querySelector('[data-action="go-client-portal"]'))==null||s.addEventListener("click",()=>{e.currentPage="portal",d()}),(a=l.querySelector('[data-action="go-auditor-workspace"]'))==null||a.addEventListener("click",()=>{e.currentPage="auditor-pbc",d()}),(n=l.querySelector('[data-action="go-pbc-editor"]'))==null||n.addEventListener("click",async()=>{e.currentPage="pbc-editor",d()}),(r=l.querySelector('[data-action="go-client-items"]'))==null||r.addEventListener("click",()=>{e.currentPage="client-pbc-items",d()})}function Oe(){var i,t,s,a,n;(i=l.querySelector('[data-action="toggle-theme"]'))==null||i.addEventListener("click",V),(t=l.querySelector("#auditor-login-form"))==null||t.addEventListener("submit",r=>{r.preventDefault(),e.auditorLogin.email=l.querySelector("#auditor-email").value,e.auditorLogin.password=l.querySelector("#auditor-password").value,O("auditor",r.currentTarget)}),(s=l.querySelector("#client-login-form"))==null||s.addEventListener("submit",r=>{r.preventDefault(),e.clientLogin.email=l.querySelector("#client-email").value,e.clientLogin.password=l.querySelector("#client-password").value,O("client",r.currentTarget)}),(a=l.querySelector("#use-auditor-demo"))==null||a.addEventListener("click",()=>{e.auditorLogin={email:"auditor@firm.com",password:"Auditor@123"},d()}),(n=l.querySelector("#use-client-demo"))==null||n.addEventListener("click",()=>{e.clientLogin={email:"client.alpha@entity.com",password:"Client@123"},d()})}function je(){var i,t,s;(i=l.querySelector("#auditor-client-select"))==null||i.addEventListener("change",a=>{e.activeAuditorClientId=a.target.value,e.selectedPbcListId="",d()}),(t=l.querySelector("#audit-finalisation-date"))==null||t.addEventListener("change",a=>{e.auditFinalisationDate=a.target.value}),(s=l.querySelector("#continue-auditor-workspace"))==null||s.addEventListener("click",()=>void he())}function He(){var i,t,s,a,n;(i=l.querySelector("#change-client-button"))==null||i.addEventListener("click",()=>{e.currentPage="auditor-client-select",d()}),(t=l.querySelector("#pbc-upload-form"))==null||t.addEventListener("submit",r=>{r.preventDefault(),ve(r.currentTarget)}),(s=l.querySelector("#download-pbc-template"))==null||s.addEventListener("click",()=>void ye()),(a=l.querySelector("#open-pbc-editor"))==null||a.addEventListener("click",()=>void we()),(n=l.querySelector("#auditor-pbc-list"))==null||n.addEventListener("change",r=>{e.selectedPbcListId=r.target.value,d()}),l.querySelectorAll('[data-action="delete-pbc-list"]').forEach(r=>{r.addEventListener("click",()=>void $e(r.dataset.id))})}function ze(){var i,t;(i=l.querySelector("#requirement-select"))==null||i.addEventListener("change",s=>{e.selectedRequirementId=s.target.value}),(t=l.querySelector("#requirement-upload-form"))==null||t.addEventListener("submit",s=>{s.preventDefault(),ke(s.currentTarget)}),l.querySelectorAll('[data-action="view-client-list"]').forEach(s=>{s.addEventListener("click",()=>void Se(s.dataset.id))})}function Ge(){l.querySelectorAll('[data-action="open-item-detail"]').forEach(i=>{i.addEventListener("click",()=>void W(i.dataset.id))})}function Ve(){var i,t;(i=l.querySelector("#item-status-select"))==null||i.addEventListener("change",s=>{qe(s.target.value)}),(t=l.querySelector("#item-file-upload-form"))==null||t.addEventListener("submit",s=>{s.preventDefault(),De(s.currentTarget)})}function _e(){var i,t,s,a,n,r;(i=l.querySelector("#editor-list"))==null||i.addEventListener("change",c=>{Pe(c.target.value)}),(t=l.querySelector("#save-pbc-edits"))==null||t.addEventListener("click",()=>void Ie()),(s=l.querySelector("#download-updated-pbc"))==null||s.addEventListener("click",()=>void Ce()),(a=l.querySelector("#download-all-pbc"))==null||a.addEventListener("click",()=>void Le()),(n=l.querySelector("#pbc-editor-table"))==null||n.addEventListener("input",c=>{var m;const p=c.target;(m=p.dataset)!=null&&m.field&&j(Number(p.dataset.rowIndex),p.dataset.field,p.value)}),(r=l.querySelector("#pbc-editor-table"))==null||r.addEventListener("change",c=>{var m;const p=c.target;(m=p.dataset)!=null&&m.field&&j(Number(p.dataset.rowIndex),p.dataset.field,p.value)}),l.querySelectorAll('[data-action="open-item-detail"]').forEach(c=>{c.addEventListener("click",()=>void W(c.dataset.id))})}pe();d();
