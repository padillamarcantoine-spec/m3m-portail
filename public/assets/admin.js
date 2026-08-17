/* Console d'administration / approvisionnement — SPA vanilla JS câblée à l'API.
   Vues : verrou, tableau de bord, nouvelle commande, commandes + modale, inventaire, fournisseurs. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erreur');
  return data;
}
const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const frDate = (iso) => { if (!iso) return ''; const p = iso.split('-'); if (!p[2]) return iso; return +p[2] + ' ' + mois[+p[1]-1] + ' ' + p[0]; };

// icônes SVG au trait
const ICON = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2l10 6-10 6L2 8l10-6z"/><path d="M2 16l10 6 10-6"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="1" y="6" width="13" height="10"/><path d="M14 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5 9-11"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14.7 6.3a4 4 0 0 1-5 5L5 16v3h3l4.7-4.7a4 4 0 0 1 5-5l-2.3-2.3 2.3-2.3-3-1z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M9 3v16"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M4 12l2-7h12l2 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c.7-3.4 3.4-5.4 6.5-5.4s5.8 2 6.5 5.4"/><circle cx="17.5" cy="9.5" r="2.6"/><path d="M15.6 14.9c2.8.2 5 1.9 5.7 4.6"/></svg>',
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.6-1-1.7-1.5-3-1.5-1.8 0-3 1-3 2.4 0 3.4 6 1.6 6 5 0 1.5-1.3 2.6-3 2.6-1.4 0-2.6-.6-3.2-1.7"/><path d="M12 5.5v13"/></svg>'
};

const AUJOURDHUI = new Date().toISOString().slice(0, 10);
const S = {
  ouvert: false, code: '', codeErr: false,
  route: 'dashboard', activeStore: 0, selRef: null,
  stores: [], suppliers: [], orders: [], stock: [],
  q: '', fStatut: 'Tous', fMagasin: 'Tous', fStock: 'Tous',
  form: { modele:'', fournisseur:'', qte:'1', date:AUJOURDHUI, auteur:'', note:'', err:false, done:false, prefill:false, ref:'' },
  demandes: { prix: [], financement: [], plans: [], nonTraite: 0 },
  services: [], savoir: [],
  srvForm: { client:'', item:'', probleme:'', piece:'', fournisseur:'', err:false, done:false, ref:'' },
  savoirForm: { sujet:'', contenu:'', err:false, done:false },
  clients: [], qClients: '', ficheId: null, fiche: null,
  clientForm: { nom:'', courriel:'', tel:'', err:'', done:false },
  factForm: { descr:'', montant:'', err:'', done:'' },
  rec: { dossiers: [], totaux: {}, modes: {}, fraisDefaut: '' },
  fAging: 'Tous', reglerFor: null, showReglements: false, reglements: [],
  recForm: { nom:'', tel:'', courriel:'', montant:'', cheque:'', date: AUJOURDHUI, raison:'Chèque sans provision (NSF)', err:'', done:'' }
};

const STATUT = {
  nouvelle:{ label:'À commander', idx:0, chip:'attention' },
  commandee:{ label:'Commandée', idx:1, chip:'gold' },
  transit:{ label:'En transit', idx:2, chip:'blue' },
  recue:{ label:'Reçue', idx:3, chip:'green' },
  annulee:{ label:'Annulée', idx:-1, chip:'grey' }
};
const magByNom = (nom) => S.stores.find(m => m.nom === nom) || S.stores[0] || { court: nom, point: '#c89b3c', contact: '' };

// ============ VERROU ============
function viewLock() {
  return `<div class="lock"><div class="card">
    <img src="/assets/logo.png" alt="M3M" style="height:52px;margin:0 auto 6px;display:block">
    <div class="eyebrow" style="margin-top:10px">Console interne</div>
    <h1 class="serif" style="font-weight:600;font-size:30px;margin:8px 0 4px">Trois Mousquetaires</h1>
    <p style="font-size:13.5px;color:var(--gris-brun);margin:0 0 22px">Accès réservé aux magasins partenaires.</p>
    <input id="code" type="password" value="${esc(S.code)}" placeholder="Code d'accès" autofocus
      style="width:100%;background:var(--creme);border:1px solid var(--bord3);border-radius:2px;padding:14px;font-size:15px;letter-spacing:.24em;text-align:center;color:var(--encre)">
    ${S.codeErr ? '<div class="err" style="margin-top:10px">Code incorrect.</div>' : ''}
    <button class="btn" style="width:100%;margin-top:16px" data-act="deverrouiller">Déverrouiller la console</button>
    <a href="/" style="display:inline-block;margin-top:18px;font-size:12.5px;color:var(--gris-brun2)">← Portail client</a>
  </div></div>`;
}

// ============ COQUILLE ============
function sidebar() {
  const active = S.stores[S.activeStore] || {};
  const kpiACommander = S.orders.filter(o => o.statut === 'nouvelle').length;
  const alertes = S.stock.filter(st => st.qte === 0 || st.qte <= st.seuil).length;
  const stores = S.stores.map((m, i) => `<button class="storebtn" data-store="${i}" style="background:${i===S.activeStore?'rgba(200,155,60,.14)':'transparent'};border:1px solid ${i===S.activeStore?'rgba(200,155,60,.4)':'transparent'};color:${i===S.activeStore?'#f3ecda':'#a89e8a'}">
    <span class="dot" style="background:${m.point}"></span><span style="flex:1;text-align:left">${esc(m.court)}</span>${i===S.activeStore?'<span style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--laiton)">Actif</span>':''}</button>`).join('');
  const nav = (route, icon, label, badge, badgeColor) => `<button class="navitem${S.route===route?' actif':''}" data-route="${route}">${icon}<span>${label}</span>${badge>0?`<span class="navbadge" style="background:${badgeColor};color:${badgeColor==='#a4562f'?'#fff':'#14100b'}">${badge}</span>`:''}</button>`;
  return `<aside class="side">
    <div class="brand"><img src="/assets/logo.png" alt="M3M"><span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:8.5px;letter-spacing:.28em;text-transform:uppercase;color:var(--laiton);font-weight:600">Console interne</span><span style="font-family:var(--serif);font-weight:600;font-size:18px;color:#f3ecda">Trois Mousquetaires</span></span></div>
    <div class="storeswitch"><div style="font-size:9.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--gris-brun2);margin-bottom:9px">Connecté en tant que</div>${stores}</div>
    <nav style="display:flex;flex-direction:column;gap:3px">
      ${nav('dashboard', ICON.dash, 'Tableau de bord', 0)}
      ${nav('demandes', ICON.inbox, 'Demandes', S.demandes.nonTraite, '#a4562f')}
      ${nav('clients', ICON.users, 'Clients', 0)}
      ${nav('recouvrement', ICON.dollar, 'Recouvrement', (S.rec.totaux || {}).nOuverts || 0, '#a4562f')}
      ${nav('nouvelle', ICON.plus, 'Nouvelle commande', 0)}
      ${nav('commandes', ICON.box, 'Commandes', kpiACommander, '#a4562f')}
      ${nav('inventaire', ICON.layers, 'Inventaire', alertes, '#c89b3c')}
      ${nav('fournisseurs', ICON.truck, 'Fournisseurs', 0)}
      ${nav('service', ICON.wrench, 'Service / pièces', S.services.filter(x=>x.statut!=='termine').length, '#c89b3c')}
      ${nav('savoir', ICON.book, 'Agent — savoir', 0)}
    </nav>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:12px;padding-top:16px;border-top:1px solid rgba(243,236,218,.1)">
      <a href="/" style="font-size:13px;color:var(--beige-sec2)">Voir le portail client ↗</a>
      <button data-act="verrouiller" style="background:transparent;border:1px solid rgba(243,236,218,.2);border-radius:2px;padding:9px;cursor:pointer;font-size:12.5px;color:var(--beige-sec)">Verrouiller la console</button>
    </div>
  </aside>`;
}

function header() {
  const active = S.stores[S.activeStore] || {};
  const titres = { dashboard:'Tableau de bord', demandes:'Demandes entrantes', nouvelle:'Nouvelle commande', commandes:'Commandes fournisseurs', inventaire:'Inventaire', fournisseurs:'Fournisseurs', service:'Service / pièces', savoir:"Base de connaissances de l'agent", clients:'Fiches clients', recouvrement:'Recouvrement — chèques refusés' };
  const now = new Date();
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const dateStr = jours[now.getDay()] + ' ' + now.getDate() + ' ' + mois[now.getMonth()] + ' ' + now.getFullYear();
  return `<div class="ahead">
    <div><h1 class="serif" style="font-weight:600;font-size:24px;margin:0">${titres[S.route]}</h1><div style="font-size:12.5px;color:var(--gris-brun2);text-transform:capitalize">${dateStr}</div></div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span class="magchip"><span class="dot" style="width:8px;height:8px;background:${active.point}"></span>${esc(active.court || '')}</span>
      <button class="btn" style="padding:11px 20px;font-size:13px" data-route="nouvelle">+ Commande</button>
    </div>
  </div>`;
}

// ============ TABLEAU DE BORD ============
function viewDashboard() {
  const actives = S.orders.filter(o => o.statut === 'commandee' || o.statut === 'transit').length;
  const aCommander = S.orders.filter(o => o.statut === 'nouvelle').length;
  const recues = S.orders.filter(o => o.statut === 'recue').length;
  const reappro = S.stock.filter(st => st.qte === 0 || st.qte <= st.seuil);
  const journal = S.orders.flatMap(o => o.hist.map(h => ({ ...h, modele: o.modele })))
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 6);

  const reapproHtml = reappro.length
    ? reappro.map(st => { const active = S.stores[S.activeStore] || {}; const sugg = Math.max(1, st.seuil * 2 - st.qte);
        return `<div class="row"><span class="dot" style="background:${st.qte===0?'#a4562f':'#c89b3c'}"></span>
          <div style="flex:1"><div style="font-size:14px;font-weight:600">${esc(st.modele)}</div><div style="font-size:12.5px;color:var(--gris-brun2)">${esc(st.fournisseur)} · ${st.qte} en stock (seuil ${st.seuil})</div></div>
          <button class="btn" style="padding:8px 16px;font-size:12.5px" data-cmdstock="${st.id}" data-sugg="${sugg}">Commander</button></div>`; }).join('')
    : `<div class="row" style="color:var(--gris-brun);font-size:14px">Tout est au-dessus du seuil — rien à réapprovisionner.</div>`;

  const journalHtml = journal.map(h => `<div class="row"><span class="dot" style="background:${magByNom(h.magasin).point}"></span>
    <div style="flex:1"><div style="font-size:14px"><strong style="font-weight:600">${esc(h.label)}</strong> — ${esc(h.modele)}</div>
    <div style="font-size:12px;color:var(--gris-brun2)">${esc(h.par)} · ${esc(h.magasin)} · ${esc(h.quand)}</div></div></div>`).join('');

  return `<div class="acontent">
    <div class="kpigrid">
      <div class="kpi"><div class="lab">Commandes actives</div><div class="val">${actives}</div></div>
      <div class="kpi"><div class="lab" style="color:#a4562f">À commander</div><div class="val" style="color:#a4562f">${aCommander}</div></div>
      <div class="kpi"><div class="lab" style="color:#5c6b3c">Reçues</div><div class="val" style="color:#5c6b3c">${recues}</div></div>
      <div class="kpi dark"><div class="lab">Alertes stock</div><div class="val">${reappro.length}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-top:22px">
      <div class="panel"><div class="ph">À commander maintenant</div>${reapproHtml}</div>
      <div class="panel"><div class="ph">Journal d'activité — tous magasins</div>${journalHtml}</div>
    </div>
  </div>`;
}

// ============ NOUVELLE COMMANDE ============
function viewNouvelle() {
  const f = S.form;
  if (f.done) {
    return `<div class="acontent"><div class="panel" style="max-width:560px;padding:36px;text-align:center">
      <div style="width:52px;height:52px;border-radius:50%;background:#c89b3c;color:#14100b;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">${ICON.check}</div>
      <h2 class="serif" style="font-weight:600;font-size:28px;margin:0">Commande ${esc(f.ref)} enregistrée</h2>
      <p style="font-size:14px;color:var(--gris-brun);margin:10px 0 24px">Elle démarre au statut « À commander ». Vous pouvez la suivre dans la liste des commandes.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn" data-act="voir-derniere">Voir la commande</button>
        <button class="btn btn-ghost" data-act="autre-commande">En saisir une autre</button>
      </div></div></div>`;
  }
  const active = S.stores[S.activeStore] || {};
  const supOptions = S.suppliers.map(s => `<option value="${esc(s.nom)}"${f.fournisseur===s.nom?' selected':''}>${esc(s.nom)}</option>`).join('');
  return `<div class="acontent"><div class="panel" style="max-width:620px;padding:30px">
    ${f.prefill ? `<div style="background:#faf5e7;border:1px solid #d8c89b;border-radius:3px;padding:10px 14px;font-size:12.5px;color:var(--or-fonce2);margin-bottom:18px">Pré-rempli depuis l'inventaire — ajustez au besoin.</div>` : ''}
    <div class="form-field"><label class="label">Modèle / description</label><input id="fModele" value="${esc(f.modele)}" placeholder="Ex. : Base de lit Bombay — Queen" class="field"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-field"><label class="label">Fournisseur</label><select id="fFournisseur" class="field"><option value="">Choisir…</option>${supOptions}</select></div>
      <div class="form-field"><label class="label">Quantité</label><input id="fQte" type="number" min="1" value="${esc(f.qte)}" class="field"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-field"><label class="label">Date de la commande</label><input id="fDate" type="date" value="${esc(f.date)}" class="field"></div>
      <div class="form-field"><label class="label">Demandé par</label><input id="fAuteur" value="${esc(f.auteur || active.contact || '')}" placeholder="${esc(active.contact||'')}" class="field"></div>
    </div>
    <div class="form-field"><label class="label">Note (facultatif)</label><textarea id="fNote" rows="2" class="field" style="resize:vertical">${esc(f.note)}</textarea></div>
    <div style="background:var(--creme);border:1px solid var(--bord);border-radius:3px;padding:12px 14px;font-size:12.5px;color:var(--gris-brun);margin-bottom:16px">La commande démarre au statut <strong>À commander</strong>, attribuée à <strong>${esc(active.court||'')}</strong>.</div>
    ${f.err ? '<div class="err" style="margin-bottom:12px">Modèle, fournisseur et quantité (≥ 1) sont requis.</div>' : ''}
    <button class="btn" data-act="enregistrer-commande">Enregistrer la commande</button>
  </div></div>`;
}

// ============ COMMANDES ============
function viewCommandes() {
  const q = S.q.trim().toLowerCase();
  const list = S.orders
    .filter(o => S.fStatut === 'Tous' || STATUT[o.statut].label === S.fStatut)
    .filter(o => S.fMagasin === 'Tous' || o.magasin === S.fMagasin)
    .filter(o => !q || (o.modele + ' ' + o.fournisseur + ' ' + o.ref + ' ' + o.auteur).toLowerCase().includes(q));
  const chip = (active) => `chip${active ? ' actif' : ''}`;
  const fStatut = ['Tous','À commander','Commandée','En transit','Reçue'].map(l => `<button class="${chip(S.fStatut===l)}" data-fstatut="${esc(l)}">${esc(l)}</button>`).join('');
  const fMag = [{l:'Tous magasins',v:'Tous'}].concat(S.stores.map(m => ({l:m.court,v:m.nom}))).map(o => `<button class="${chip(S.fMagasin===o.v)}" data-fmag="${esc(o.v)}">${esc(o.l)}</button>`).join('');
  const rows = list.length ? list.map(o => { const m = STATUT[o.statut]; const mag = magByNom(o.magasin);
    return `<button class="orow" data-sel="${esc(o.ref)}">
      <span><span style="font-family:var(--mono);font-size:11px;color:var(--gris-brun3)">${esc(o.ref)}</span><br><span style="font-size:11px;color:var(--gris-brun2)">${esc(frDate(o.date))}</span></span>
      <span><span style="font-size:14px;font-weight:600">${esc(o.modele)}</span><br><span style="font-size:11.5px;color:var(--gris-brun2)">Qté ${o.qte} · par ${esc(o.auteur)}</span></span>
      <span style="font-size:13px">${esc(o.fournisseur)}</span>
      <span class="magchip"><span class="dot" style="width:7px;height:7px;background:${mag.point}"></span>${esc(mag.court)}</span>
      <span class="badge ${m.chip}">${esc(m.label)}</span>
      <span style="color:var(--gris-brun2);text-align:right">→</span>
    </button>`; }).join('')
    : `<div style="padding:48px 22px;text-align:center;color:var(--gris-brun)"><div class="serif" style="font-size:22px">Aucune commande.</div><button class="btn btn-ghost" style="margin-top:16px" data-act="reset-cmd">Réinitialiser les filtres</button></div>`;
  return `<div class="acontent">
    <input id="q" value="${esc(S.q)}" placeholder="Chercher un modèle, un fournisseur, un numéro…" class="field" style="max-width:440px;margin-bottom:16px">
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${fStatut}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">${fMag}</div>
    <div class="panel"><div class="otable">
      <div class="ohead"><span>Nº / date</span><span>Modèle</span><span>Fournisseur</span><span>Magasin</span><span>Statut</span><span></span></div>
      ${rows}
    </div></div>
  </div>`;
}

// ============ MODALE DÉTAIL ============
function modal() {
  const o = S.orders.find(x => x.ref === S.selRef);
  if (!o) return '';
  const m = STATUT[o.statut];
  const mag = magByNom(o.magasin);
  const etapes = ['À commander','Commandée','En transit','Reçue'];
  const pipeline = o.statut === 'annulee'
    ? `<div style="margin:20px 26px;background:#f1ede5;border:1px solid #d2cabd;border-radius:4px;padding:14px 18px;font-size:13px;color:#777066">Cette commande a été annulée.</div>`
    : `<div class="pipeline">${etapes.map((nom, i) => { const fait = i < m.idx, actif = i === m.idx;
        const dot = fait ? 'background:#c89b3c;border:1px solid #c89b3c' : actif ? 'background:#fffdf8;border:2px solid #c89b3c' : 'background:#fffdf8;border:1.5px solid #e2d8c1';
        const lG = i === 0 ? 'transparent' : (i <= m.idx ? '#c89b3c' : '#e2d8c1');
        const lD = i === etapes.length-1 ? 'transparent' : (i < m.idx ? '#c89b3c' : '#e2d8c1');
        return `<div class="pstep">
          <span class="pline" style="left:0;background:${lG}"></span><span class="pline" style="right:0;background:${lD}"></span>
          <span class="pdot" style="${dot}">${fait ? '<span style="color:#14100b;width:13px;height:13px">'+ICON.check+'</span>' : ''}</span>
          <span style="font-size:11px;font-weight:${actif||fait?'600':'500'};text-align:center;color:${fait?'#8f6b1e':actif?'#1b1510':'#a99f8c'}">${nom}</span>
        </div>`; }).join('')}</div>`;
  const hist = o.hist.map((h, i) => `<div style="display:flex;gap:12px;padding:9px 0"><span style="width:9px;height:9px;border-radius:50%;flex:none;margin-top:4px;background:${i===o.hist.length-1?'#c89b3c':'#d8ccae'}"></span><div><div style="font-size:13.5px;font-weight:600">${esc(h.label)}</div><div style="font-size:12px;color:var(--gris-brun2)">${esc(h.par)} · ${esc(h.magasin)} · ${esc(h.quand)}</div></div></div>`).join('');
  const nextLabel = { nouvelle:'Marquer comme commandée', commandee:'Marquer en transit', transit:'Marquer comme reçue' }[o.statut];
  const actions = o.statut === 'recue'
    ? `<div style="font-size:13px;color:#5c6b3c;font-weight:600">✓ Commande reçue et clôturée.</div>`
    : o.statut === 'annulee' ? ''
    : `<div style="display:flex;gap:12px;flex-wrap:wrap">
        ${nextLabel ? `<button class="btn" data-avancer="${esc(o.ref)}">${nextLabel}</button>` : ''}
        <button class="btn btn-ghost" data-annuler="${esc(o.ref)}">Annuler la commande</button>
      </div>`;
  return `<div class="overlay" data-act="fermer-modal"><div class="modal" data-stop>
    <div class="mh">
      <div><div style="font-family:var(--mono);font-size:12px;color:var(--beige-sec2)">${esc(o.ref)}</div><h2 class="serif" style="font-weight:600;font-size:26px;margin:4px 0 0">${esc(o.modele)}</h2><div style="font-size:13px;color:var(--beige-sec);margin-top:4px">${esc(o.fournisseur)} · ${o.qte} ${o.qte>1?'unités':'unité'}</div></div>
      <button data-act="fermer-modal" style="background:none;border:none;color:var(--beige-sec2);font-size:24px;cursor:pointer;line-height:1">×</button>
    </div>
    ${pipeline}
    <div class="metagrid">
      <div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--gris-brun2)">Magasin</div><div style="font-size:13.5px;margin-top:4px">${esc(mag.court)}</div></div>
      <div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--gris-brun2)">Demandé par</div><div style="font-size:13.5px;margin-top:4px">${esc(o.auteur)}</div></div>
      <div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--gris-brun2)">Date</div><div style="font-size:13.5px;margin-top:4px">${esc(frDate(o.date))}</div></div>
      <div><div style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--gris-brun2)">Statut</div><div style="margin-top:4px"><span class="badge ${m.chip}">${esc(m.label)}</span></div></div>
    </div>
    ${o.note ? `<div style="padding:0 26px 8px"><div style="background:var(--creme);border:1px solid var(--bord);border-radius:3px;padding:12px 14px;font-size:13px;color:var(--gris-brun3)">${esc(o.note)}</div></div>` : ''}
    <div style="padding:14px 26px"><div style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--gris-brun2);margin-bottom:8px">Historique du processus</div>${hist}</div>
    <div style="padding:18px 26px;border-top:1px solid var(--bord4)">${actions}</div>
  </div></div>`;
}

// ============ INVENTAIRE ============
function viewInventaire() {
  const deco = (st) => {
    const etat = st.qte === 0 ? 'rupture' : st.qte <= st.seuil ? 'bas' : 'ok';
    return { ...st, etat, barre: etat==='rupture'?'#a4562f':etat==='bas'?'#c89b3c':'#7c8a4f',
      pct: Math.max(4, Math.min(100, Math.round(st.qte / (st.seuil*2) * 100))),
      badge: etat==='rupture'?'attention':etat==='bas'?'gold':'green',
      label: etat==='rupture'?'Rupture':etat==='bas'?'Stock bas':'En stock' };
  };
  const all = S.stock.map(deco);
  const list = S.fStock === 'Tous' ? all : S.fStock === 'Alertes' ? all.filter(x => x.etat !== 'ok') : all.filter(x => x.etat === 'ok');
  const chips = ['Tous','Alertes','En stock'].map(l => `<button class="chip${S.fStock===l?' actif':''}" data-fstock="${esc(l)}">${esc(l==='Tous'?'Tout l\'inventaire':l)}</button>`).join('');
  const rows = list.map(st => { const sugg = Math.max(1, st.seuil*2 - st.qte);
    return `<div class="irow">
      <div><div style="font-size:14px;font-weight:600">${esc(st.modele)}</div><div style="font-size:11.5px;color:var(--gris-brun2)">${esc(st.categorie)}</div></div>
      <div style="font-size:13px">${esc(st.fournisseur)}</div>
      <div><div style="font-family:var(--serif);font-weight:600;font-size:20px">${st.qte} <span style="font-size:12px;color:var(--gris-brun2);font-family:var(--sans)">en stock · seuil ${st.seuil}</span></div><div class="bar"><span style="width:${st.pct}%;background:${st.barre}"></span></div></div>
      <div><span class="badge ${st.badge}">${esc(st.label)}</span></div>
      <div style="display:flex;align-items:center;gap:8px;justify-self:end">
        <button class="stepbtn" data-adj="${st.id}" data-delta="-1">−</button>
        <button class="stepbtn" data-adj="${st.id}" data-delta="1">+</button>
        <button class="btn ${st.etat==='ok'?'btn-ghost':''}" style="padding:7px 13px;font-size:12px" data-cmdstock="${st.id}" data-sugg="${sugg}">Commander</button>
      </div>
    </div>`; }).join('');
  return `<div class="acontent">
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">${chips}</div>
    <div class="panel"><div class="itable">
      <div class="ihead"><span>Article</span><span>Fournisseur</span><span>Niveau</span><span>État</span><span style="text-align:right">Actions</span></div>
      ${rows}
    </div></div>
  </div>`;
}

// ============ FOURNISSEURS ============
function viewFournisseurs() {
  const compte = {};
  S.orders.forEach(o => { if (o.statut !== 'recue' && o.statut !== 'annulee') compte[o.fournisseur] = (compte[o.fournisseur]||0)+1; });
  const cards = S.suppliers.map(f => { const c = compte[f.nom]||0;
    return `<div class="fcard">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <span class="mono2">${esc(f.init)}</span>
        ${c>0?`<span class="badge gold">${c} en cours</span>`:''}
      </div>
      <div><h3 class="serif" style="font-weight:600;font-size:22px;margin:0">${esc(f.nom)}</h3><div style="font-size:12.5px;color:var(--gris-brun2);margin-top:3px">${esc(f.categorie)}</div></div>
      <div style="font-size:12.5px;color:var(--gris-brun)">Délai indicatif : ${esc(f.delai)}</div>
      <button style="align-self:flex-start;background:none;border:none;padding:0;cursor:pointer;font-size:12.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--or-fonce)" data-cmdfour="${esc(f.nom)}">Commander →</button>
    </div>`; }).join('');
  return `<div class="acontent"><div class="fgrid">${cards}</div></div>`;
}

// ============ DEMANDES ENTRANTES (leads) ============
function viewDemandes() {
  const D = S.demandes;
  const clean = t => String(t || '').replace(/[^0-9+]/g, '');
  const telLink = t => t ? `<a href="tel:${clean(t)}" style="color:var(--or-fonce);font-weight:600">${esc(t)}</a>` : '—';
  const smsBtn = t => t ? `<a href="sms:${clean(t)}" class="btn btn-ghost" style="padding:6px 12px;font-size:12px;text-decoration:none">Texter</a>` : '';
  const carte = (r) => `<div class="panel" style="padding:15px 17px;margin-bottom:10px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap${r.traite ? ';opacity:.6' : ''}">
    <div style="flex:1;min-width:190px">
      <div style="font-size:14px;font-weight:600">${esc(r.produit || r.item || 'Demande')}</div>
      ${r.option ? `<div style="font-size:12px;color:var(--gris-brun2)">Option : ${esc(r.option)}</div>` : ''}
      ${r.deja_client ? `<div style="font-size:12px;color:var(--gris-brun2)">${esc(r.deja_client)}</div>` : ''}
      <div style="font-size:12.5px;color:var(--gris-brun);margin-top:4px">${esc(r.nom)} · ${telLink(r.tel)}</div>
      <div style="font-size:11px;color:var(--gris-brun2);margin-top:2px">${esc(String(r.cree_le || '').replace('T', ' ').slice(0, 16))}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
      ${smsBtn(r.tel)}
      ${r.traite ? '<span class="badge green">Traité</span>' : `<button class="btn" style="padding:6px 12px;font-size:12px" data-traiter="${r.id}">Marquer traité</button>`}
    </div>
  </div>`;
  const section = (titre, arr, empty) => `<div style="margin-bottom:24px"><div style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--or-fonce);margin-bottom:12px">${titre} (${arr.length})</div>${arr.length ? arr.map(carte).join('') : `<div class="row" style="color:var(--gris-brun);font-size:13.5px">${empty}</div>`}</div>`;
  const plans = D.plans.length ? D.plans.map(p => `<div class="panel" style="padding:15px 17px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div><span style="font-family:var(--mono);font-size:11px;color:var(--gris-brun3)">${esc(p.ref)}</span><div style="font-size:14px;font-weight:600;margin-top:2px">${esc(p.item)}</div><div style="font-size:12.5px;color:var(--gris-brun)">${esc(p.nom)} · ${esc(p.tel || p.courriel || '')}</div></div>
    <div style="text-align:right"><div style="font-size:14px;font-weight:600">${esc(p.mensualite)}/mois</div><div style="font-size:12px;color:var(--gris-brun2)">${esc(p.montant)} · ${esc(String(p.nMois))} mois</div><span class="badge gold" style="margin-top:5px;display:inline-block">${esc(p.statut)}</span></div>
  </div>`).join('') : `<div class="row" style="color:var(--gris-brun);font-size:13.5px">Aucun plan de financement en cours.</div>`;
  return `<div class="acontent"><div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start">
    <div class="panel" style="padding:22px"><div class="ph" style="padding:0 0 4px">Boîte de réception</div>
      ${section('Demandes de prix', D.prix, 'Aucune demande de prix pour l\'instant.')}
      ${section('Demandes de financement', D.financement, 'Aucune demande de financement.')}
    </div>
    <div class="panel" style="padding:22px"><div class="ph" style="padding:0 0 12px">Plans de financement maison</div>${plans}</div>
  </div></div>`;
}

// ============ SERVICE / PIÈCES ============
function viewServices() {
  const SRVN = { a_faire:{label:'À faire', chip:'attention', next:'Marquer pièce commandée'},
    piece_commandee:{label:'Pièce commandée', chip:'gold', next:'Marquer réparation en cours'},
    en_cours:{label:'En cours', chip:'blue', next:'Marquer terminé'},
    termine:{label:'Terminé', chip:'green', next:null} };
  const f = S.srvForm;
  const supOptions = S.suppliers.map(su => `<option value="${esc(su.nom)}"${f.fournisseur===su.nom?' selected':''}>${esc(su.nom)}</option>`).join('');
  const rows = S.services.length ? S.services.map(s => { const st = SRVN[s.statut] || SRVN.a_faire;
    return `<div class="panel" style="padding:18px 20px;margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <span style="font-family:var(--mono);font-size:11px;color:var(--gris-brun3)">${esc(s.ref)}</span>
          <div style="font-size:15px;font-weight:600;margin-top:3px">${esc(s.item)}</div>
          <div style="font-size:12.5px;color:var(--gris-brun);margin-top:2px">${esc(s.probleme)}</div>
          ${s.client?`<div style="font-size:12px;color:var(--gris-brun2);margin-top:4px">Client : ${esc(s.client)}</div>`:''}
          ${s.piece?`<div style="font-size:12px;color:var(--gris-brun2)">Pièce : ${esc(s.piece)}${s.fournisseur?' — '+esc(s.fournisseur):''}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:9px">
          <span class="badge ${st.chip}">${esc(st.label)}</span>
          ${st.next?`<button class="btn" style="padding:8px 14px;font-size:12.5px" data-avancersrv="${esc(s.ref)}">${st.next}</button>`:'<span style="font-size:12px;color:#5c6b3c;font-weight:600">✓ Clôturé</span>'}
        </div>
      </div>
    </div>`; }).join('') : `<div class="row" style="color:var(--gris-brun);font-size:14px">Aucun service pour l'instant.</div>`;
  return `<div class="acontent"><div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start">
    <div class="panel"><div class="ph">Services / réparations</div><div style="padding:14px 18px">${rows}</div></div>
    <div class="panel" style="padding:24px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--or-fonce);margin-bottom:14px">Nouveau service</div>
      ${f.done?`<div style="background:#faf5e7;border:1px solid var(--laiton);border-radius:3px;padding:16px;font-size:14px"><strong>Service ${esc(f.ref)} créé.</strong><div style="margin-top:10px"><button class="btn btn-ghost" style="padding:8px 14px;font-size:12.5px" data-act="autre-service">Créer un autre</button></div></div>`:`
      <div class="form-field"><label class="label">Client (facultatif)</label><input id="srvClient" value="${esc(f.client)}" class="field"></div>
      <div class="form-field"><label class="label">Item concerné</label><input id="srvItemA" value="${esc(f.item)}" placeholder="Ex. : Fauteuil Madrid" class="field"></div>
      <div class="form-field"><label class="label">Problème</label><textarea id="srvProbleme" rows="2" class="field" style="resize:vertical">${esc(f.probleme)}</textarea></div>
      <div class="form-field"><label class="label">Pièce nécessaire (facultatif)</label><input id="srvPiece" value="${esc(f.piece)}" class="field"></div>
      <div class="form-field"><label class="label">Fournisseur de la pièce</label><select id="srvFournisseur" class="field"><option value="">—</option>${supOptions}</select></div>
      ${f.err?'<div class="err" style="margin-bottom:10px">Item et problème sont requis.</div>':''}
      <button class="btn" data-act="enregistrer-service">Créer le service</button>`}
    </div>
  </div></div>`;
}

// ============ BASE DE CONNAISSANCES DE L'AGENT ============
function viewSavoir() {
  const f = S.savoirForm;
  const items = S.savoir.length ? S.savoir.map(k => `<div style="border:1px solid var(--bord);border-radius:4px;padding:14px 16px;margin-bottom:10px;background:var(--surface)">
      <div style="font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--or-fonce)">${esc(k.sujet)}</div>
      <div style="font-size:13.5px;color:var(--gris-brun3);margin-top:5px;line-height:1.55">${esc(k.contenu)}</div>
    </div>`).join('') : `<div class="row" style="color:var(--gris-brun);font-size:14px">Rien encore — ajoutez des réponses pour que l'agent apprenne.</div>`;
  return `<div class="acontent"><div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;align-items:start">
    <div class="panel"><div class="ph">Ce que l'agent sait (${S.savoir.length})</div><div style="padding:16px 18px">${items}</div></div>
    <div class="panel" style="padding:24px">
      <div style="font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--or-fonce);margin-bottom:8px">Apprendre à l'agent</div>
      <p style="font-size:12.5px;color:var(--gris-brun);margin:0 0 16px;line-height:1.5">Ajoutez un sujet et la bonne réponse. L'assistant du portail client s'en sert pour répondre « comme vous ».</p>
      ${f.done?`<div style="background:#faf5e7;border:1px solid var(--laiton);border-radius:3px;padding:12px 14px;font-size:13.5px;margin-bottom:14px">Ajouté ✓ — l'agent le sait maintenant.</div>`:''}
      <div class="form-field"><label class="label">Sujet</label><input id="savSujet" value="${esc(f.sujet)}" placeholder="Ex. : garantie matelas" class="field"></div>
      <div class="form-field"><label class="label">Réponse</label><textarea id="savContenu" rows="4" class="field" style="resize:vertical">${esc(f.contenu)}</textarea></div>
      ${f.err?'<div class="err" style="margin-bottom:10px">Sujet et réponse sont requis.</div>':''}
      <button class="btn" data-act="ajouter-savoir">Ajouter à la base</button>
    </div>
  </div></div>`;
}

// ============ RENDU ============

// ============ CLIENTS (CRM) ============
function viewClients() {
  if (S.ficheId) return viewFiche();
  const q = S.qClients.trim().toLowerCase();
  const rows = q ? S.clients.filter(c => (c.nom + ' ' + c.courriel + ' ' + (c.tel || '')).toLowerCase().includes(q)) : S.clients;
  const liste = rows.length ? rows.map(c => `<div class="row" style="cursor:pointer" data-fiche="${c.id}">
      <span class="dot" style="background:${c.dossiersOuverts > 0 ? '#a4562f' : (c.soldeCents > 0 ? '#c89b3c' : '#5c6b3c')}"></span>
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">${esc(c.nom)}</div>
        <div style="font-size:12.5px;color:var(--gris-brun2)">${esc(c.courriel)}${c.tel ? ' · ' + esc(c.tel) : ''}</div></div>
      <div style="text-align:right"><div style="font-size:13px;font-weight:600">${c.soldeCents > 0 ? esc(c.solde) + ' dû' : '—'}</div>
        <div style="font-size:11.5px;color:var(--gris-brun2)">${c.nFactures} facture${c.nFactures > 1 ? 's' : ''} · ${c.nFinancements} fin.${c.dossiersOuverts > 0 ? ` · <span style="color:#a4562f;font-weight:600">${c.dossiersOuverts} recouvr.</span>` : ''}</div></div>
    </div>`).join('') : `<div class="row" style="color:var(--gris-brun)">Aucune fiche${q ? ' pour cette recherche' : ''}.</div>`;
  const f = S.clientForm;
  return `<div class="acontent">
    <div style="display:grid;grid-template-columns:1fr minmax(280px,340px);gap:20px;align-items:start">
      <div class="panel"><div class="ph">Fiches clients (${rows.length})</div>
        <div style="padding:12px 16px;border-bottom:1px solid var(--bord4)"><input id="qClients" value="${esc(S.qClients)}" placeholder="Chercher nom, courriel, téléphone…" class="field" style="width:100%"></div>
        ${liste}</div>
      <div class="panel"><div class="ph">Nouvelle fiche (vente en magasin)</div><div style="padding:16px">
        ${f.done ? `<div style="background:#eef3e4;border:1px solid #b5c48f;border-radius:3px;padding:10px 12px;font-size:13px;color:#3f4d22;margin-bottom:12px">Fiche créée.</div>` : ''}
        <div class="form-field"><label class="label">Nom</label><input id="cfNom" value="${esc(f.nom)}" class="field"></div>
        <div class="form-field"><label class="label">Courriel</label><input id="cfCourriel" value="${esc(f.courriel)}" class="field"></div>
        <div class="form-field"><label class="label">Téléphone</label><input id="cfTel" value="${esc(f.tel)}" class="field"></div>
        ${f.err ? `<div class="err" style="margin-bottom:10px">${esc(f.err)}</div>` : ''}
        <button class="btn" style="width:100%" data-act="nouvelle-fiche">Créer la fiche</button>
      </div></div>
    </div></div>`;
}

function viewFiche() {
  const c = S.fiche;
  if (!c) return `<div class="acontent"><div class="panel" style="padding:40px;text-align:center;color:var(--gris-brun)">Chargement de la fiche…</div></div>`;
  const ff = S.factForm;
  const stChip = { a_payer: ['À payer', '#a4562f'], payee: ['Payée', '#5c6b3c'], financement: ['Financement', '#c89b3c'] };
  return `<div class="acontent">
    <button class="btn btn-ghost" style="margin-bottom:14px;padding:8px 14px;font-size:12.5px" data-act="fermer-fiche">← Toutes les fiches</button>
    <div style="display:grid;grid-template-columns:minmax(260px,320px) 1fr;gap:20px;align-items:start">
      <div class="panel"><div class="ph">${esc(c.nom)}</div><div style="padding:16px;display:flex;flex-direction:column;gap:10px">
        <div><div class="label">Courriel</div><div style="font-size:13.5px">${esc(c.courriel)}</div></div>
        <div class="form-field" style="margin:0"><label class="label">Téléphone</label><input id="fiTel" value="${esc(c.tel || '')}" class="field"></div>
        <div class="form-field" style="margin:0"><label class="label">Adresse</label><input id="fiAdresse" value="${esc(c.adresse || '')}" class="field"></div>
        <div class="form-field" style="margin:0"><label class="label">Note interne</label><textarea id="fiNote" rows="3" class="field" style="resize:vertical">${esc(c.note || '')}</textarea></div>
        <button class="btn btn-ghost" data-act="maj-fiche">Enregistrer la fiche</button>
        <div style="border-top:1px solid var(--bord4);padding-top:10px"><div class="label">Solde dû</div><div class="serif" style="font-size:24px;font-weight:600">${esc(c.solde)}</div></div>
      </div></div>
      <div style="display:flex;flex-direction:column;gap:20px;min-width:0">
        <div class="panel"><div class="ph">Factures</div>
          ${c.factures.map(fa => { const sc = stChip[fa.statut] || [fa.statut, '#777']; return `<div class="row">
            <span class="dot" style="background:${sc[1]}"></span>
            <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${esc(fa.ref)} — ${esc(fa.descr)}</div><div style="font-size:12px;color:var(--gris-brun2)">${esc(fa.date)}${fa.meta ? ' · ' + esc(fa.meta) : ''}</div></div>
            <div style="font-weight:600;font-size:13.5px">${esc(fa.montant)}</div>
            <span class="magchip" style="font-size:11px">${sc[0]}</span>
            ${fa.statut !== 'payee' ? `<button class="btn" style="padding:6px 12px;font-size:11.5px" data-factstatut="${fa.id}" data-newst="payee">Marquer payée</button>` : ''}
          </div>`; }).join('') || '<div class="row" style="color:var(--gris-brun)">Aucune facture.</div>'}
          <div style="padding:14px 16px;border-top:1px solid var(--bord4);display:grid;grid-template-columns:2fr 1fr auto;gap:10px;align-items:end">
            <div class="form-field" style="margin:0"><label class="label">Nouvelle facture — description</label><input id="nfDescr" value="${esc(ff.descr)}" class="field" placeholder="Ex. : Sofa Isabella"></div>
            <div class="form-field" style="margin:0"><label class="label">Montant</label><input id="nfMontant" value="${esc(ff.montant)}" class="field" placeholder="1 095,00 $"></div>
            <button class="btn" data-act="nouvelle-facture">Ajouter</button>
          </div>
          ${ff.err ? `<div class="err" style="padding:0 16px 12px">${esc(ff.err)}</div>` : ''}${ff.done ? `<div style="padding:0 16px 12px;font-size:12.5px;color:#3f4d22">Facture ${esc(ff.done)} créée — visible aussitôt dans l'espace client.</div>` : ''}
        </div>
        <div class="panel"><div class="ph">Financements maison</div>
          ${c.financements.map(fi => `<div class="row"><span class="dot" style="background:${fi.statut === 'actif' ? '#5c6b3c' : fi.statut === 'refuse_nouveau' ? '#a4562f' : '#c89b3c'}"></span>
            <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${esc(fi.ref)} — ${esc(fi.item)}</div>
            <div style="font-size:12px;color:var(--gris-brun2)">${esc(fi.montant)} · ${esc(fi.mensualite)}/mois × ${fi.n_mois} · ${esc(fi.statut)}</div></div></div>`).join('') || '<div class="row" style="color:var(--gris-brun)">Aucun financement.</div>'}
        </div>
        <div class="panel"><div class="ph">Dossiers de recouvrement</div>
          ${c.dossiers.map(d => `<div class="row"><span class="dot" style="background:${d.statut === 'recupere' ? '#5c6b3c' : d.statut === 'radie' ? '#8d8069' : '#a4562f'}"></span>
            <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${esc(d.ref)} — ${esc(d.montant)}</div>
            <div style="font-size:12px;color:var(--gris-brun2)">${esc(d.raison)} · refusé le ${esc(frDate(d.date_refus))} · ${esc(d.statut)}</div></div></div>`).join('') || '<div class="row" style="color:var(--gris-brun)">Aucun dossier — parfait.</div>'}
        </div>
      </div>
    </div></div>`;
}

// ============ RECOUVREMENT ============
function viewRecouvrement() {
  const R = S.rec || {}; const modes = R.modes || {};
  const stLab = { ouvert: ['Ouvert', '#a4562f'], promesse: ['Promesse', '#c89b3c'], recupere: ['Récupéré', '#5c6b3c'], radie: ['Radié', '#8d8069'] };
  const dossiers = (R.dossiers || []).filter(d => S.fAging === 'Tous' || (d.tranche === S.fAging && (d.statut === 'ouvert' || d.statut === 'promesse')));
  const rf = S.recForm;
  const chips = ['Tous', '0-30', '31-60', '61-90', '90+'].map(a => `<button class="chip${S.fAging === a ? ' actif' : ''}" data-aging="${a}">${a === 'Tous' ? 'Tous les dossiers' : a + ' jours'}</button>`).join('');
  const rows = dossiers.map(d => `<div class="row" style="${d.escalade ? 'background:rgba(164,86,47,.06)' : ''}">
      <span class="dot" style="background:${(stLab[d.statut] || ['', '#777'])[1]}"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600">${esc(d.client_nom)} — ${esc(d.total)} <span style="font-weight:400;color:var(--gris-brun2)">(${esc(d.montant)}${d.frais_cents > 0 ? ' + ' + esc(d.frais) + ' frais' : ''})</span>${d.escalade ? ' <span style="color:#a4562f;font-size:11px;font-weight:700">⚠ MED</span>' : ''}</div>
        <div style="font-size:12px;color:var(--gris-brun2)">${d.type === 'cheque_nsf' ? 'Chèque' + (d.no_cheque ? ' #' + esc(d.no_cheque) : '') : 'Stripe'} · ${esc(d.raison)} · refusé le ${esc(frDate(d.date_refus))} · <strong>${d.jours} j</strong>${d.client_tel ? ' · ' + esc(d.client_tel) : ''}${d.financement_ref ? ' · plan ' + esc(d.financement_ref) : ''}${d.statut === 'promesse' && d.promesse_note ? ' · 🤝 ' + esc(d.promesse_note) : ''}${d.statut === 'recupere' ? ' · réglé (' + esc(d.modeLabel) + ') le ' + esc(d.regle_le || '') : ''}</div>
      </div>
      <span class="magchip" style="font-size:11px">${(stLab[d.statut] || [d.statut])[0]}</span>
      ${(d.statut === 'ouvert' || d.statut === 'promesse') ? `
        <button class="btn" style="padding:6px 12px;font-size:11.5px" data-regler="${d.ref}">Régler</button>
        <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px" data-promesse="${d.ref}">Promesse</button>
        <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px" data-frais="${d.ref}" title="Ajouter les frais NSF (${esc(R.fraisDefaut || '15,00 $')})">+ Frais</button>
        <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px;color:#8d8069" data-radier="${d.ref}">Radier</button>` : ''}
    </div>`).join('') || `<div class="row" style="color:var(--gris-brun)">Aucun dossier dans cette tranche.</div>`;

  const modal = S.reglerFor ? `<div style="position:fixed;inset:0;background:rgba(20,16,11,.45);display:flex;align-items:center;justify-content:center;z-index:60" data-act="fermer-regler">
      <div class="panel" style="max-width:430px;width:92%;padding:24px" data-stop>
        <div class="eyebrow">Régler le dossier ${esc(S.reglerFor)}</div>
        <p style="font-size:12.5px;color:var(--gris-brun);margin:8px 0 14px">Règle maison : un chèque refusé ne se règle <strong>jamais</strong> par un autre chèque TD. Choisis comment le client a payé :</p>
        ${Object.entries(modes).map(([k, v]) => `<button class="btn btn-ghost" style="width:100%;margin-bottom:8px" data-modereg="${k}">${esc(v)}</button>`).join('')}
        <button class="btn btn-ghost" style="width:100%;margin-top:6px;color:#8d8069" data-act="fermer-regler">Annuler</button>
      </div></div>` : '';

  const regs = S.showReglements ? `<div class="panel" style="margin-top:20px"><div class="ph">Registre des règlements (300 derniers)</div>
      ${S.reglements.map(r => `<div class="row"><span class="dot" style="background:${r.statut === 'refuse' ? '#a4562f' : '#5c6b3c'}"></span>
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${esc(r.client_nom)} — ${r.statut === 'refuse' ? `<span style="color:#a4562f">0,00 $ (chèque refusé — était ${esc(r.montantOriginal)})</span>` : esc(r.montant)}</div>
        <div style="font-size:12px;color:var(--gris-brun2)">${esc(r.modeLabel)}${r.no_cheque ? ' #' + esc(r.no_cheque) : ''} · ${esc(frDate(r.date))}${r.dossier_ref ? ' · dossier ' + esc(r.dossier_ref) : ''}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
        ${r.mode === 'cheque_td' && r.statut === 'encaisse' ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px;color:#a4562f" data-refuserreg="${r.id}">Marquer refusé</button>` : ''}
      </div>`).join('') || '<div class="row" style="color:var(--gris-brun)">Aucun règlement.</div>'}</div>` : '';

  return `<div class="acontent">
    <div class="kpigrid">
      <div class="kpi"><div class="lab" style="color:#a4562f">À récupérer</div><div class="val" style="color:#a4562f">${esc((R.totaux || {}).aRecuperer || '0,00 $')}</div></div>
      <div class="kpi"><div class="lab" style="color:#5c6b3c">Récupéré</div><div class="val" style="color:#5c6b3c">${esc((R.totaux || {}).recupere || '0,00 $')}</div></div>
      <div class="kpi dark"><div class="lab">Dossiers ouverts</div><div class="val">${(R.totaux || {}).nOuverts ?? 0}</div></div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0">${chips}
      <button class="chip${S.showReglements ? ' actif' : ''}" data-act="toggle-reglements" style="margin-left:auto">Registre des règlements</button></div>
    <div style="display:grid;grid-template-columns:1fr minmax(280px,340px);gap:20px;align-items:start;margin-top:16px">
      <div class="panel"><div class="ph">Dossiers — chèques refusés &amp; prélèvements échoués</div>${rows}</div>
      <div class="panel"><div class="ph">Saisir un chèque refusé (banque)</div><div style="padding:16px">
        <div class="form-field"><label class="label">Client</label><input id="rcNom" value="${esc(rf.nom)}" class="field"></div>
        <div class="form-field"><label class="label">Téléphone</label><input id="rcTel" value="${esc(rf.tel)}" class="field"></div>
        <div class="form-field"><label class="label">Courriel (lie la fiche client si trouvée)</label><input id="rcCourriel" value="${esc(rf.courriel)}" class="field"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-field"><label class="label">Montant</label><input id="rcMontant" value="${esc(rf.montant)}" class="field" placeholder="228,85 $"></div>
          <div class="form-field"><label class="label">N° de chèque</label><input id="rcCheque" value="${esc(rf.cheque)}" class="field"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-field"><label class="label">Date du refus</label><input id="rcDate" type="date" value="${esc(rf.date)}" class="field"></div>
          <div class="form-field"><label class="label">Raison</label><select id="rcRaison" class="field">
            ${['Chèque sans provision (NSF)', 'Compte fermé', 'Arrêt de paiement', 'Signature non conforme', 'Autre'].map(x => `<option${rf.raison === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
        </div>
        ${rf.err ? `<div class="err" style="margin-bottom:10px">${esc(rf.err)}</div>` : ''}${rf.done ? `<div style="font-size:12.5px;color:#3f4d22;margin-bottom:10px">Dossier ${esc(rf.done)} créé.</div>` : ''}
        <button class="btn" style="width:100%" data-act="nouveau-dossier">Créer le dossier</button>
      </div></div>
    </div>${regs}</div>${modal}`;
}

function render() {
  if (!S.ouvert) { $('#app').innerHTML = viewLock(); const c = $('#code'); if (c) c.focus(); return; }
  const views = { dashboard: viewDashboard, demandes: viewDemandes, nouvelle: viewNouvelle, commandes: viewCommandes, inventaire: viewInventaire, fournisseurs: viewFournisseurs, service: viewServices, savoir: viewSavoir, clients: viewClients, recouvrement: viewRecouvrement };
  const body = (views[S.route] || viewDashboard)();
  $('#app').innerHTML = `<div class="shell">${sidebar()}<div class="main">${header()}${body}</div></div>${S.selRef ? modal() : ''}`;
}

// Recherche clients (débounce + focus conservé au re-render).
document.addEventListener('input', (e) => {
  if (e.target.id === 'qClients') {
    S.qClients = e.target.value;
    clearTimeout(S._qT);
    S._qT = setTimeout(() => { render(); const el = $('#qClients'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (er) {} } }, 250);
  }
});

// ============ ÉVÉNEMENTS ============
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-route],[data-store],[data-sel],[data-fstatut],[data-fmag],[data-fstock],[data-adj],[data-cmdstock],[data-cmdfour],[data-avancer],[data-annuler],[data-avancersrv],[data-traiter],[data-fiche],[data-aging],[data-regler],[data-modereg],[data-promesse],[data-frais],[data-radier],[data-refuserreg],[data-factstatut],[data-stop]');
  if (!t) return;
  if (t.dataset.stop !== undefined) { e.stopPropagation(); return; }

  if (t.dataset.route) { S.route = t.dataset.route; S.selRef = null; render(); window.scrollTo(0,0); return; }
  if (t.dataset.store !== undefined) {
    S.activeStore = +t.dataset.store;
    const active = S.stores[S.activeStore];
    if (S.form.done || !S.form.auteur) S.form.auteur = active.contact;
    render(); return;
  }
  if (t.dataset.sel) { S.selRef = t.dataset.sel; render(); return; }
  if (t.dataset.fstatut) { S.fStatut = t.dataset.fstatut; render(); return; }
  if (t.dataset.fmag) { S.fMagasin = t.dataset.fmag; render(); return; }
  if (t.dataset.fstock) { S.fStock = t.dataset.fstock; render(); return; }

  if (t.dataset.adj) {
    try { await api(`/admin/inventaire/${t.dataset.adj}/ajuster`, { method: 'POST', body: { delta: +t.dataset.delta } }); await chargerInventaire(); render(); }
    catch (err) { alert(err.message); }
    return;
  }
  if (t.dataset.cmdstock) {
    const st = S.stock.find(x => x.id === +t.dataset.cmdstock); const active = S.stores[S.activeStore];
    S.form = { modele: st.modele, fournisseur: st.fournisseur, qte: String(t.dataset.sugg), date: AUJOURDHUI, auteur: active.contact, note: '', err: false, done: false, prefill: true, ref: '' };
    S.route = 'nouvelle'; S.selRef = null; render(); window.scrollTo(0,0); return;
  }
  if (t.dataset.cmdfour) {
    const active = S.stores[S.activeStore];
    S.form = { modele: '', fournisseur: t.dataset.cmdfour, qte: '1', date: AUJOURDHUI, auteur: active.contact, note: '', err: false, done: false, prefill: false, ref: '' };
    S.route = 'nouvelle'; render(); window.scrollTo(0,0); return;
  }
  if (t.dataset.traiter) {
    try { await api(`/admin/demandes/${t.dataset.traiter}/traiter`, { method: 'POST' }); await chargerDemandes(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.avancersrv) {
    try { await api(`/admin/services/${t.dataset.avancersrv}/avancer`, { method: 'POST' }); await chargerServices(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.avancer) {
    const active = S.stores[S.activeStore];
    try { await api(`/admin/commandes/${t.dataset.avancer}/avancer`, { method: 'POST', body: { par: active.contact, magasin: active.nom } }); await chargerCommandes(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.annuler) {
    const active = S.stores[S.activeStore];
    try { await api(`/admin/commandes/${t.dataset.annuler}/annuler`, { method: 'POST', body: { par: active.contact, magasin: active.nom } }); await chargerCommandes(); render(); }
    catch (err) { alert(err.message); } return;
  }


  if (t.dataset.fiche) {
    S.ficheId = +t.dataset.fiche; S.fiche = null; S.factForm = { descr:'', montant:'', err:'', done:'' }; render();
    try { S.fiche = await api('/admin/clients/' + S.ficheId); } catch (err) { S.ficheId = null; alert(err.message); }
    render(); return;
  }
  if (t.dataset.aging) { S.fAging = t.dataset.aging; render(); return; }
  if (t.dataset.regler) { S.reglerFor = t.dataset.regler; render(); return; }
  if (t.dataset.modereg) {
    try { await api('/admin/recouvrement/' + S.reglerFor + '/regler', { method: 'POST', body: { mode: t.dataset.modereg } });
      S.reglerFor = null; await chargerRec(); await chargerReglements(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.promesse) {
    const note = prompt('Note de promesse (ex. : passe vendredi avec le cash) :') || '';
    try { await api('/admin/recouvrement/' + t.dataset.promesse + '/promesse', { method: 'POST', body: { note } }); await chargerRec(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.frais) {
    try { await api('/admin/recouvrement/' + t.dataset.frais + '/frais', { method: 'POST', body: {} }); await chargerRec(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.radier) {
    if (!confirm('Radier ce dossier (abandon de la créance) ?')) return;
    try { await api('/admin/recouvrement/' + t.dataset.radier + '/radier', { method: 'POST' }); await chargerRec(); render(); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.refuserreg) {
    if (!confirm('Marquer ce chèque TD comme refusé (NSF) ? Le règlement tombera à 0 $ et le dossier de recouvrement sera créé avec toutes les infos.')) return;
    try { const r = await api('/admin/reglements/' + t.dataset.refuserreg + '/refuser', { method: 'POST', body: {} });
      await chargerRec(); await chargerReglements(); render(); alert('Dossier ' + r.dossier + ' créé dans Recouvrement.'); }
    catch (err) { alert(err.message); } return;
  }
  if (t.dataset.factstatut) {
    try { await api('/admin/factures/' + t.dataset.factstatut + '/statut', { method: 'POST', body: { statut: t.dataset.newst } });
      S.fiche = await api('/admin/clients/' + S.ficheId); await chargerClients(); render(); }
    catch (err) { alert(err.message); } return;
  }

  const act = t.dataset.act;
  switch (act) {
    case 'deverrouiller': {
      const el = $('#code'); if (el) S.code = el.value;
      try { await api('/admin/deverrouiller', { method: 'POST', body: { code: S.code } }); S.ouvert = true; S.codeErr = false; S.code = ''; await chargerTout(); render(); }
      catch (err) { S.codeErr = true; render(); }
      break;
    }
    case 'verrouiller': await api('/admin/verrouiller', { method: 'POST' }); S.ouvert = false; render(); break;
    case 'reset-cmd': S.q = ''; S.fStatut = 'Tous'; S.fMagasin = 'Tous'; render(); break;
    case 'fermer-modal': S.selRef = null; render(); break;
    case 'voir-derniere': S.route = 'commandes'; S.selRef = S.form.ref; render(); break;
    case 'autre-commande': { const active = S.stores[S.activeStore]; S.form = { modele:'', fournisseur:'', qte:'1', date:AUJOURDHUI, auteur:active.contact, note:'', err:false, done:false, prefill:false, ref:'' }; render(); break; }
    case 'enregistrer-service': {
      const g = id => (document.getElementById(id) || {}).value || '';
      S.srvForm = { client:g('srvClient'), item:g('srvItemA'), probleme:g('srvProbleme'), piece:g('srvPiece'), fournisseur:g('srvFournisseur'), err:false, done:false, ref:'' };
      const active = S.stores[S.activeStore] || {};
      if (!S.srvForm.item.trim() || !S.srvForm.probleme.trim()) { S.srvForm.err = true; render(); break; }
      try { const r = await api('/admin/services', { method:'POST', body: { ...S.srvForm, magasin: active.nom } }); S.srvForm.done = true; S.srvForm.ref = r.ref; await chargerServices(); render(); }
      catch (err) { S.srvForm.err = true; render(); }
      break;
    }
    case 'fermer-fiche': S.ficheId = null; S.fiche = null; render(); break;
    case 'maj-fiche': {
      const body = { tel: $('#fiTel')?.value ?? null, adresse: $('#fiAdresse')?.value ?? null, note: $('#fiNote')?.value ?? null };
      try { await api('/admin/clients/' + S.ficheId + '/maj', { method: 'POST', body }); S.fiche = await api('/admin/clients/' + S.ficheId); await chargerClients(); render(); }
      catch (err) { alert(err.message); } break;
    }
    case 'nouvelle-fiche': {
      const f = { nom: $('#cfNom')?.value || '', courriel: $('#cfCourriel')?.value || '', tel: $('#cfTel')?.value || '' };
      try { await api('/admin/clients', { method: 'POST', body: f }); S.clientForm = { nom: '', courriel: '', tel: '', err: '', done: true }; await chargerClients(); render(); }
      catch (err) { S.clientForm = { ...f, err: err.message, done: false }; render(); } break;
    }
    case 'nouvelle-facture': {
      const f = { descr: $('#nfDescr')?.value || '', montant: $('#nfMontant')?.value || '' };
      try { const r = await api('/admin/clients/' + S.ficheId + '/facture', { method: 'POST', body: f });
        S.factForm = { descr: '', montant: '', err: '', done: r.ref }; S.fiche = await api('/admin/clients/' + S.ficheId); await chargerClients(); render(); }
      catch (err) { S.factForm = { ...f, err: err.message, done: '' }; render(); } break;
    }
    case 'nouveau-dossier': {
      const f = { client_nom: $('#rcNom')?.value || '', client_tel: $('#rcTel')?.value || '', client_courriel: $('#rcCourriel')?.value || '',
                  montant: $('#rcMontant')?.value || '', no_cheque: $('#rcCheque')?.value || '', date_refus: $('#rcDate')?.value || '', raison: $('#rcRaison')?.value || '' };
      try { const r = await api('/admin/recouvrement', { method: 'POST', body: f });
        S.recForm = { nom: '', tel: '', courriel: '', montant: '', cheque: '', date: AUJOURDHUI, raison: 'Chèque sans provision (NSF)', err: '', done: r.ref }; await chargerRec(); render(); }
      catch (err) { S.recForm = { nom: f.client_nom, tel: f.client_tel, courriel: f.client_courriel, montant: f.montant, cheque: f.no_cheque, date: f.date_refus || AUJOURDHUI, raison: f.raison, err: err.message, done: '' }; render(); } break;
    }
    case 'fermer-regler': S.reglerFor = null; render(); break;
    case 'toggle-reglements': S.showReglements = !S.showReglements; if (S.showReglements) { try { S.reglements = await api('/admin/reglements'); } catch (e) {} } render(); break;
    case 'autre-service': S.srvForm = { client:'', item:'', probleme:'', piece:'', fournisseur:'', err:false, done:false, ref:'' }; render(); break;
    case 'ajouter-savoir': {
      const g = id => (document.getElementById(id) || {}).value || '';
      S.savoirForm = { sujet:g('savSujet'), contenu:g('savContenu'), err:false, done:false };
      if (!S.savoirForm.sujet.trim() || !S.savoirForm.contenu.trim()) { S.savoirForm.err = true; render(); break; }
      try { await api('/admin/savoir', { method:'POST', body: { sujet:S.savoirForm.sujet, contenu:S.savoirForm.contenu } }); S.savoirForm = { sujet:'', contenu:'', err:false, done:true }; await chargerSavoir(); render(); }
      catch (err) { S.savoirForm.err = true; render(); }
      break;
    }
    case 'enregistrer-commande': {
      capterForm();
      const active = S.stores[S.activeStore];
      const q = parseInt(String(S.form.qte).replace(/[^0-9]/g,''),10);
      if (!S.form.modele.trim() || !S.form.fournisseur || !q || q < 1) { S.form.err = true; render(); break; }
      try {
        const r = await api('/admin/commandes', { method: 'POST', body: { ...S.form, qte: q, magasin: active.nom } });
        S.form.done = true; S.form.err = false; S.form.ref = r.ref;
        await chargerCommandes(); render();
      } catch (err) { S.form.err = true; render(); }
      break;
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !S.ouvert) { const el = $('#code'); if (el) { S.code = el.value; document.querySelector('[data-act="deverrouiller"]').click(); } }
  if (e.key === 'Escape' && S.selRef) { S.selRef = null; render(); }
});

document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (id === 'q' && S.route === 'commandes') { S.q = e.target.value; const pos = e.target.selectionStart; render(); const ni = $('#q'); if (ni) { ni.focus(); ni.setSelectionRange(pos,pos); } }
  if (id === 'code') S.code = e.target.value;
  // Capture en direct des champs de formulaire (évite de perdre la saisie à un re-render).
  const FMAP = { fModele:['form','modele'], fFournisseur:['form','fournisseur'], fQte:['form','qte'], fDate:['form','date'], fAuteur:['form','auteur'], fNote:['form','note'],
    srvClient:['srvForm','client'], srvItemA:['srvForm','item'], srvProbleme:['srvForm','probleme'], srvPiece:['srvForm','piece'], srvFournisseur:['srvForm','fournisseur'],
    savSujet:['savoirForm','sujet'], savContenu:['savoirForm','contenu'] };
  if (FMAP[id]) S[FMAP[id][0]][FMAP[id][1]] = e.target.value;
});

function capterForm() {
  const map = { fModele:'modele', fFournisseur:'fournisseur', fQte:'qte', fDate:'date', fAuteur:'auteur', fNote:'note' };
  for (const [id, k] of Object.entries(map)) { const el = document.getElementById(id); if (el) S.form[k] = el.value; }
}

// ============ CHARGEMENT ============
async function chargerCommandes() { S.orders = await api('/admin/commandes'); }
async function chargerInventaire() { S.stock = await api('/admin/inventaire'); }
async function chargerServices() { try { S.services = await api('/admin/services'); } catch { S.services = []; } }
async function chargerSavoir() { try { S.savoir = await api('/admin/savoir'); } catch { S.savoir = []; } }
async function chargerDemandes() { try { S.demandes = await api('/admin/demandes'); } catch { S.demandes = { prix: [], financement: [], plans: [], nonTraite: 0 }; } }
async function chargerClients() { try { S.clients = await api('/admin/clients'); } catch { S.clients = []; } }
async function chargerRec() { try { S.rec = await api('/admin/recouvrement'); } catch { S.rec = { dossiers: [], totaux: {}, modes: {} }; } }
async function chargerReglements() { try { S.reglements = await api('/admin/reglements'); } catch { S.reglements = []; } }
async function chargerTout() {
  S.stores = await api('/admin/magasins');
  S.suppliers = await api('/admin/fournisseurs');
  await chargerCommandes();
  await chargerInventaire();
  await chargerServices();
  await chargerSavoir();
  await chargerDemandes();
  await chargerClients();
  await chargerRec();
  if (!S.form.auteur && S.stores[S.activeStore]) S.form.auteur = S.stores[S.activeStore].contact;
}

// ============ INIT ============
(async function init() {
  try { const etat = await api('/admin/etat'); if (etat.ouvert) { S.ouvert = true; await chargerTout(); } } catch {}
  render();
})();
})();
