/* Widget de chat IA — bulle flottante présente sur tout le portail client.
   Autonome : s'injecte lui-même, parle à /api/chat. */
(() => {
'use strict';
if (window.__m3mChat) return; window.__m3mChat = true;
const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ouvert = false, msgs = [], envoiEnCours = false;

const style = document.createElement('style');
style.textContent = `
.m3m-chat-btn{position:fixed;bottom:22px;right:22px;z-index:9000;width:60px;height:60px;border-radius:50%;background:#0d0b09;border:1px solid #c89b3c;color:#c89b3c;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;transition:transform .15s}
.m3m-chat-btn:hover{transform:scale(1.06)}
.m3m-chat-panel{position:fixed;bottom:94px;right:22px;z-index:9000;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 130px));background:#fffdf8;border:1px solid #e5dcc7;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;animation:m3mPop .3s ease both}
.m3m-chat-head{background:#0d0b09;color:#f3ecda;padding:16px 18px;display:flex;align-items:center;gap:11px}
.m3m-chat-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#f4efe3}
.m3m-chat-foot{padding:12px;border-top:1px solid #e5dcc7;display:flex;gap:8px;background:#fffdf8}
.m3m-chat-foot input{flex:1;background:#f6f2e9;border:1px solid #d8cdb4;border-radius:20px;padding:11px 15px;font-size:14px;font-family:'Jost',sans-serif;color:#1b1510}
.m3m-chat-send{background:#c89b3c;border:none;border-radius:50%;width:40px;height:40px;flex:none;cursor:pointer;color:#14100b;display:flex;align-items:center;justify-content:center}
.m3m-b-agent{align-self:flex-start;background:#fffdf8;border:1px solid #e5dcc7;border-radius:12px 12px 12px 2px;padding:11px 14px;max-width:85%;font-size:14px;line-height:1.5;color:#1b1510}
.m3m-b-client{align-self:flex-end;background:#1b1510;color:#f6f0e0;border-radius:12px 12px 2px 12px;padding:11px 14px;max-width:85%;font-size:14px;line-height:1.5}
.m3m-typing{align-self:flex-start;color:#8d8069;font-size:13px;font-style:italic}
`;
document.head.appendChild(style);

const wrap = document.createElement('div');
document.body.appendChild(wrap);

function paint() {
  const bubbles = msgs.map(m => `<div class="${m.role==='client'?'m3m-b-client':'m3m-b-agent'}">${esc(m.contenu).replace(/\n/g,'<br>')}</div>`).join('')
    + (envoiEnCours ? '<div class="m3m-typing">L\'assistant écrit…</div>' : '');
  wrap.innerHTML = `
    <button class="m3m-chat-btn" aria-label="Ouvrir le chat" data-chat-toggle>
      ${ouvert
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>'}
    </button>
    ${ouvert ? `<div class="m3m-chat-panel">
      <div class="m3m-chat-head">
        <span style="width:34px;height:34px;border-radius:50%;background:#c89b3c;color:#14100b;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600">M3M</span>
        <div><div style="font-family:'Cormorant Garamond',serif;font-weight:600;font-size:17px">Trois Mousquetaires</div><div style="font-size:11px;color:#a89e8a">On vous répond ici</div></div>
      </div>
      <div class="m3m-chat-body" id="m3m-chat-body">${bubbles}</div>
      <form class="m3m-chat-foot" data-chat-form>
        <input id="m3m-chat-input" placeholder="Écrivez votre message…" autocomplete="off">
        <button class="m3m-chat-send" type="submit" aria-label="Envoyer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
      </form>
    </div>` : ''}`;
  const body = document.getElementById('m3m-chat-body');
  if (body) body.scrollTop = body.scrollHeight;
  const inp = document.getElementById('m3m-chat-input'); if (inp && ouvert) inp.focus();
}

async function ouvrir() {
  ouvert = true;
  if (!msgs.length) {
    try { const h = await fetch('/api/chat').then(r=>r.json()); msgs = h; } catch {}
    if (!msgs.length) msgs = [{ role:'agent', contenu:'Bonjour ! 👋 Je suis l\'assistant de Meubles Trois Mousquetaires. Une question sur nos meubles, matelas, la livraison ou le financement ? Je suis là.' }];
  }
  paint();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-chat-toggle]')) { ouvert ? (ouvert=false, paint()) : ouvrir(); }
});
document.addEventListener('submit', async (e) => {
  if (!e.target.closest('[data-chat-form]')) return;
  e.preventDefault();
  const inp = document.getElementById('m3m-chat-input');
  const txt = inp.value.trim(); if (!txt || envoiEnCours) return;
  msgs.push({ role:'client', contenu:txt }); inp.value=''; envoiEnCours = true; paint();
  try {
    const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message:txt }) }).then(r=>r.json());
    envoiEnCours = false;
    msgs.push({ role:'agent', contenu: r.reponse || 'Désolé, réessayez.' });
  } catch { envoiEnCours = false; msgs.push({ role:'agent', contenu:'Oups — une erreur. Appelez-nous au (514) 251-1055.' }); }
  paint();
});

paint();
})();
