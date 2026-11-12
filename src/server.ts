import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { db, migrate, nowIso, audit } from './db.ts';
import { config } from './config.ts';

migrate();
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const keyed = (s: string) => crypto.createHmac('sha256', config.ACTIVATION_HASH_SECRET).update(s).digest('hex');
const token = (n=32) => crypto.randomBytes(n).toString('base64url');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const cookieMap = (header='') => Object.fromEntries(header.split(';').map(x=>x.trim().split(/=(.*)/s).slice(0,2) as [string,string]).filter(x=>x[0]));
const cookie = (name:string, value:string, maxAge:number, httpOnly=true) => `${name}=${value}; Path=/; SameSite=Lax; Max-Age=${maxAge}${config.isProd?'; Secure':''}${httpOnly?'; HttpOnly':''}`;
function proxyCookie(value:string){let result=value.replace(/;\s*Domain=[^;]+/ig,'').replace(/;\s*Path=[^;]+/ig,'; Path=/');if(!/;\s*Path=/i.test(result))result+='; Path=/';if(config.isProd&&!/;\s*Secure(?:;|$)/i.test(result))result+='; Secure';return result;}
const page = (title:string, body:string) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — ALPHA ACCESS</title><style>body{font:16px system-ui;background:#f3f5f8;color:#172033;margin:0}.wrap{max-width:900px;margin:4vh auto;padding:24px}.card{background:white;padding:24px;border-radius:14px;box-shadow:0 3px 18px #18243a12;margin:14px 0}h1{font-size:1.8rem}label{display:block;margin:12px 0 4px}input,textarea,button{font:inherit;padding:10px;border:1px solid #ccd3dd;border-radius:7px;max-width:100%}button,.btn{background:#234fd4;color:white;border:0;padding:11px 16px;border-radius:7px;cursor:pointer;text-decoration:none;display:inline-block}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}.muted{color:#657086}code{overflow-wrap:anywhere}</style><main class="wrap">${body}</main></html>`;
function send(res:http.ServerResponse,status:number,body:string,headers:Record<string,string>={}) { const nonce=token(18);body=body.replace(/<script\b/g,`<script nonce="${nonce}"`);res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':`default-src 'self'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,...(config.isProd?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{}),...headers});res.end(body); }
function redirect(res:http.ServerResponse,url:string,headers:Record<string,string>={}) {res.writeHead(303,{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(config.isProd?{'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}:{}),...headers});res.end();}
async function body(req:http.IncomingMessage):Promise<Record<string,string>> {let s='';for await(const c of req)s+=c;if(s.length>64_000)throw new Error('Corps trop volumineux');if(req.headers['content-type']?.includes('application/json'))return JSON.parse(s||'{}');return Object.fromEntries(new URLSearchParams(s));}
function csrfValid(req:http.IncomingMessage, fields:Record<string,string>) {const c=cookieMap(req.headers.cookie).aa_csrf,source=req.headers.origin||req.headers.referer;if(config.isProd&&!source)return false;if(source){try{if(new URL(source).origin!==config.PUBLIC_ORIGIN)return false;}catch{return false;}}return !!c&&!!fields.csrf&&c.length===fields.csrf.length&&crypto.timingSafeEqual(Buffer.from(c),Buffer.from(fields.csrf))&&c.length>=32;}
function form(csrf:string, action:string, fields:string, confirmMessage='') {return `<form method="post" action="${action}"${confirmMessage?` data-confirm="${esc(confirmMessage)}"`:''}><input type="hidden" name="csrf" value="${csrf}">${fields}</form>`;}
function session(req:http.IncomingMessage) {const c=cookieMap(req.headers.cookie).aa_client;if(!c)return null;return db.prepare(`SELECT s.*,i.client_id,i.first_started_at,i.trial_expires_at,i.revoked_at AS invitation_revoked,c.display_name FROM client_sessions s JOIN invitations i ON i.id=s.invitation_id JOIN clients c ON c.id=i.client_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`).get(hash(c),nowIso()) as any || null;}
function accessState(s:any) {if(!s||s.invitation_revoked)return {ok:false,reason:'invitation'};const l=db.prepare('SELECT * FROM licenses WHERE invitation_id=? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1').get(s.invitation_id) as any;if(l&&(!l.expires_at||l.expires_at>nowIso()))return {ok:true,license:l};if(s.trial_expires_at&&s.trial_expires_at>nowIso())return {ok:true,trial:true};return {ok:false,reason:'expired'};}
function setCsrf(res:http.ServerResponse) {const value=token(24);res.setHeader('Set-Cookie',cookie('aa_csrf',value,3600,false));return value;}
function admin(req:http.IncomingMessage) {const c=cookieMap(req.headers.cookie).aa_admin;if(!c)return null;return db.prepare('SELECT a.id,a.username FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND a.disabled_at IS NULL').get(hash(c),nowIso()) as any||null;}
function limitKey(scope:string){return crypto.createHmac('sha256',config.SESSION_SECRET).update(`rate:${scope}`).digest('hex');}
function isRateLimited(scope:string){const row=db.prepare('SELECT blocked_until FROM rate_limits WHERE key_hash=?').get(limitKey(scope)) as any;return !!row?.blocked_until&&row.blocked_until>nowIso();}
function rateFailure(scope:string,maximum:number,windowSeconds:number){const key=limitKey(scope),now=Date.now(),row=db.prepare('SELECT attempts,window_started_at FROM rate_limits WHERE key_hash=?').get(key) as any;let attempts=1,started=now;if(row&&now-Date.parse(row.window_started_at)<windowSeconds*1000){attempts=Number(row.attempts)+1;started=Date.parse(row.window_started_at);}const blocked=attempts>=maximum?new Date(started+windowSeconds*1000).toISOString():null;db.prepare('INSERT INTO rate_limits(key_hash,attempts,window_started_at,blocked_until) VALUES(?,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=excluded.attempts,window_started_at=excluded.window_started_at,blocked_until=excluded.blocked_until').run(key,attempts,new Date(started).toISOString(),blocked);return !!blocked;}
function clearRateLimit(scope:string){db.prepare('DELETE FROM rate_limits WHERE key_hash=?').run(limitKey(scope));}
function adminLogin(res:http.ServerResponse,csrf:string,message='') {send(res,200,page('Connexion administrateur',`<h1>Administration</h1><div class="card">${message}${form(csrf,'/admin/login','<label>Identifiant</label><input name="username" required autocomplete="username"><label>Mot de passe</label><input type="password" name="password" required autocomplete="current-password"><p><button>Se connecter</button></p>')}</div>`));}
function adminHome(res:http.ServerResponse,csrf:string,username:string) {
 const rows=db.prepare(`SELECT i.id,i.created_at,i.first_started_at,i.trial_expires_at,i.revoked_at,c.reference,c.display_name,(SELECT expires_at FROM licenses l WHERE l.invitation_id=i.id AND l.revoked_at IS NULL ORDER BY id DESC LIMIT 1) license_until,(SELECT is_permanent FROM activation_codes ac JOIN licenses l ON l.activation_code_id=ac.id WHERE l.invitation_id=i.id AND l.revoked_at IS NULL ORDER BY l.id DESC LIMIT 1) license_permanent FROM invitations i JOIN clients c ON c.id=i.client_id ORDER BY i.id DESC LIMIT 200`).all() as any[];
 const table=rows.map(r=>{
  const state=r.revoked_at?'Révoquée':r.license_permanent||r.license_until&&r.license_until>nowIso()?'Licence active':r.license_until?'Licence expirée':r.trial_expires_at&&r.trial_expires_at>nowIso()?'Essai en cours':r.first_started_at?'Essai terminé':'Créée';
  const plan='<label>Durée du code <select name="duration"><option value="86400">1 jour</option><option value="604800">7 jours</option><option value="2592000" selected>30 jours</option><option value="-1">Permanent</option></select></label><button>Confirmer le paiement et générer le code</button>';
  return `<tr><td>${esc(r.reference)} · ${esc(r.display_name)}</td><td>${state}</td><td>${esc(r.trial_expires_at||'—')}</td><td>${esc(r.license_until||'—')}</td><td>${form(csrf,`/admin/${r.id}/paid`,plan,'Confirmer le paiement et émettre un nouveau code ?')}${form(csrf,`/admin/${r.id}/revoke`,'<button>Révoquer</button>','Révoquer immédiatement cette invitation et ses licences ?')}${form(csrf,`/admin/${r.id}/reset`,'<button>Réinitialiser appareil</button>','Révoquer les sessions et permettre une nouvelle liaison d’appareil ?')}</td></tr>`;
 }).join('');
 const scripts='<script>document.querySelectorAll("form[data-confirm]").forEach(f=>f.addEventListener("submit",e=>{if(!confirm(f.dataset.confirm))e.preventDefault()}))</script>';
 send(res,200,page('Tableau de bord',`<h1>ALPHA ACCESS · Administration</h1><p>Connecté : ${esc(username)} · ${form(csrf,'/admin/logout','<button>Déconnexion</button>')}</p><div class="card"><h2>Nouvelle invitation</h2>${form(csrf,'/admin/invitations','<label>Référence interne</label><input name="reference" required maxlength="80"><label>Nom affiché</label><input name="display_name" required maxlength="120"><label>Note interne</label><textarea name="internal_note" maxlength="1000"></textarea><p><button>Créer</button></p>')}</div><div class="card"><h2>Invitations</h2><table><thead><tr><th>Client</th><th>État</th><th>Fin essai</th><th>Fin licence</th><th>Actions</th></tr></thead><tbody>${table}</tbody></table></div><p>La passerelle ne bloque pas l’accès à une ancienne adresse publique du site d’origine.</p>${scripts}`));
}
export const server=http.createServer(async(req,res)=>{
 try {
  const requestTarget=req.url||'/';if(!requestTarget.startsWith('/')||requestTarget.startsWith('//'))return send(res,400,page('Requête invalide','Chemin de requête invalide.'));
  if(config.isProd&&String(req.headers.host||'').toLowerCase()!==new URL(config.PUBLIC_BASE_URL).host.toLowerCase())return send(res,421,page('Hôte inconnu','Nom d’hôte non autorisé.'));
  const u=new URL(requestTarget,config.PUBLIC_BASE_URL), p=u.pathname;
  if(p==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true}));}
  if(p==='/admin/login'&&req.method==='GET'){return adminLogin(res,setCsrf(res));}
  if(p==='/admin/login'&&req.method==='POST') {
   const f=await body(req);if(!csrfValid(req,f))return send(res,403,page('Erreur','Jeton de formulaire invalide.'));
   const username=(f.username||'').trim(),scope=`login:${username.toLowerCase()||'unknown'}`;
   if(isRateLimited(scope))return send(res,429,page('Attendez avant de réessayer','Trop de tentatives. Réessayez dans 15 minutes.'));
   const a=db.prepare('SELECT * FROM admins WHERE username=? AND disabled_at IS NULL').get(username) as any;let valid=false;
   if(a){const [salt,digest]=a.password_hash.split(':');const got=crypto.scryptSync(f.password||'',salt,64).toString('hex');valid=Buffer.byteLength(digest)===got.length&&crypto.timingSafeEqual(Buffer.from(got),Buffer.from(digest));}
   else crypto.scryptSync(f.password||'','alpha-access-invalid-user-salt',64);
   if(!valid){rateFailure(scope,5,900);const c=setCsrf(res);return adminLogin(res,c,'<p>Identifiants invalides.</p>');}
   clearRateLimit(scope);const t=token();db.prepare('INSERT INTO admin_sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash(t),a.id,new Date(Date.now()+8*3600e3).toISOString(),nowIso());audit('admin',String(a.id),'login','admin',String(a.id));return redirect(res,'/admin',{'Set-Cookie':cookie('aa_admin',t,28800)});
  }
  if(p.startsWith('/admin')) {const a=admin(req);if(!a&&p!=='/admin')return redirect(res,'/admin/login');if(!a)return redirect(res,'/admin/login');if(req.method==='GET'&&p==='/admin'){return adminHome(res,setCsrf(res),a.username);}if(req.method==='POST'){const f=await body(req);if(!csrfValid(req,f))return send(res,403,page('Erreur','Jeton de formulaire invalide.'));if(p==='/admin/logout'){const t=cookieMap(req.headers.cookie).aa_admin;db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE token_hash=?').run(nowIso(),hash(t||''));return redirect(res,'/admin/login',{'Set-Cookie':cookie('aa_admin','',0)});}if(p==='/admin/invitations'){const reference=(f.reference||'').trim(),display=(f.display_name||'').trim(),note=f.internal_note||'';if(!reference||!display||reference.length>80||display.length>120||note.length>1000)return send(res,400,page('Données invalides','Référence, nom ou note invalide.'));const invite=token(32);db.exec('BEGIN IMMEDIATE');let id:any;try{const client=db.prepare('INSERT INTO clients(reference,display_name,internal_note,created_at) VALUES(?,?,?,?)').run(reference,display,note,nowIso());id=db.prepare('INSERT INTO invitations(client_id,token_hash,created_at) VALUES(?,?,?)').run(client.lastInsertRowid,hash(invite),nowIso()).lastInsertRowid;audit('admin',String(a.id),'create_invitation','invitation',String(id));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}const url=`${config.PUBLIC_BASE_URL}/i/${invite}`;return send(res,201,page('Invitation créée',`<h1>Invitation créée</h1><p>Copiez ce lien maintenant ; il ne sera plus affiché.</p><div class="card"><code id="link">${esc(url)}</code><p><button id="copy-link">Copier</button></p></div><script>document.querySelector('#copy-link').addEventListener('click',()=>navigator.clipboard.writeText(document.querySelector('#link').textContent))</script><a href="/admin">Retour au tableau</a>`));}
   const m=p.match(/^\/admin\/(\d+)\/(paid|code|revoke|reset)$/);
   if(m){
    const id=Number(m[1]),action=m[2];
    if(action==='paid'){
     const plans=new Map<string,number|null>([['86400',86400],['604800',604800],['2592000',2592000],['-1',null]]),duration=f.duration||'2592000';
     if(!plans.has(duration))return send(res,400,page('Durée invalide','Choisissez une durée autorisée.'));
     db.exec('BEGIN IMMEDIATE');let code='';
     try{
      const exists=db.prepare('SELECT id FROM invitations WHERE id=? AND revoked_at IS NULL').get(id);if(!exists)throw new Error('missing');
      db.prepare("INSERT INTO payments(invitation_id,status,confirmed_at,confirmed_by) VALUES(?,'confirmed',?,?)").run(id,nowIso(),a.id);
      db.prepare('UPDATE activation_codes SET revoked_at=? WHERE invitation_id=? AND redeemed_at IS NULL AND revoked_at IS NULL').run(nowIso(),id);
      code=token(24);const permanent=duration==='-1';db.prepare('INSERT INTO activation_codes(invitation_id,code_hash,plan_duration_seconds,is_permanent,created_at) VALUES(?,?,?,?,?)').run(id,keyed(code),plans.get(duration)??null,permanent?1:0,nowIso());
      audit('admin',String(a.id),'payment_confirmed_and_code_created','invitation',String(id),{duration_seconds:plans.get(duration),permanent});db.exec('COMMIT');
     }catch{try{db.exec('ROLLBACK')}catch{}return send(res,404,page('Dossier indisponible','Dossier introuvable ou désactivé.'));}
     const planLabel=duration==='-1'?'permanent':`${Number(duration)/86400} jour(s)`;
     return send(res,200,page('Code créé',`<h1>Paiement marqué comme confirmé</h1><p>Durée : ${esc(planLabel)}. Code à communiquer une seule fois : <code>${esc(code)}</code></p><a href="/admin">Retour</a>`));
    }
    if(action==='revoke'){
     db.prepare('UPDATE invitations SET revoked_at=? WHERE id=?').run(nowIso(),id);db.prepare('UPDATE client_sessions SET revoked_at=? WHERE invitation_id=?').run(nowIso(),id);db.prepare('UPDATE licenses SET revoked_at=? WHERE invitation_id=?').run(nowIso(),id);db.prepare('UPDATE activation_codes SET revoked_at=? WHERE invitation_id=? AND redeemed_at IS NULL').run(nowIso(),id);audit('admin',String(a.id),'revoke','invitation',String(id));
    }
    if(action==='reset'){
     db.prepare('UPDATE client_sessions SET revoked_at=? WHERE invitation_id=?').run(nowIso(),id);db.prepare('UPDATE invitations SET bound_session_hash=NULL WHERE id=? AND revoked_at IS NULL').run(id);audit('admin',String(a.id),'reset_device','invitation',String(id));
    }
    return redirect(res,'/admin');
   }
   return send(res,404,page('Introuvable','Administration : route inconnue.'));
  }
  return send(res,404,page('Introuvable','Route inconnue.'));
  }
  if(p==='/paiement'&&req.method==='GET'){return send(res,200,page('Paiement',`<h1>Votre essai via ce lien est terminé</h1><p>Pour continuer avec ce lien personnalisé, contactez-nous et saisissez votre code.</p><div class="card"><p>${esc(config.PAYMENT_CONTACT_LABEL)}</p><a class="btn" href="${esc(config.PAYMENT_CONTACT_URL)}" rel="noreferrer">Contacter</a>${form(setCsrf(res),'/api/client/activate','<label>Code d’activation</label><input name="code" required autocomplete="off"><p><button>Activer</button></p>')}</div>`));}
  const inviteMatch=p.match(/^\/i\/([A-Za-z0-9_-]{32,})$/);
  if(inviteMatch&&req.method==='GET'){const csrf=setCsrf(res);const inv=db.prepare('SELECT i.*,c.display_name FROM invitations i JOIN clients c ON c.id=i.client_id WHERE i.token_hash=?').get(hash(inviteMatch[1]!)) as any;if(!inv||inv.revoked_at)return send(res,404,page('Lien invalide','Ce lien d’invitation est invalide ou désactivé.'));return send(res,200,page('Votre invitation',`<h1>Bienvenue ${esc(inv.display_name)}</h1><div class="card"><p>Vous bénéficiez de 15 minutes d’essai gratuit via votre lien personnalisé. Le compteur démarre uniquement après votre clic.</p>${form(csrf,`/i/${encodeURIComponent(inviteMatch[1]!)}/start`,'<button>Commencer mon essai</button>')}<p class="muted">L’accès concerne cette passerelle. L’adresse publique d’origine reste indépendante.</p></div>`));}
  const start=p.match(/^\/i\/([A-Za-z0-9_-]{32,})\/start$/);
  if(start&&req.method==='POST'){
   const f=await body(req);if(!csrfValid(req,f))return send(res,403,page('Erreur','Jeton de formulaire invalide.'));
   const inv=db.prepare('SELECT * FROM invitations WHERE token_hash=?').get(hash(start[1]!)) as any;
   if(!inv||inv.revoked_at)return send(res,404,page('Lien invalide','Invitation invalide ou désactivée.'));
   let t=cookieMap(req.headers.cookie).aa_client;db.exec('BEGIN IMMEDIATE');
   try{
    const latest=db.prepare('SELECT * FROM invitations WHERE id=?').get(inv.id) as any;
    if(!latest.first_started_at){t=token();const startAt=Date.now(),exp=new Date(startAt+900000).toISOString();
     db.prepare('UPDATE invitations SET first_started_at=?,trial_expires_at=?,bound_session_hash=? WHERE id=?').run(new Date(startAt).toISOString(),exp,hash(t),inv.id);
     db.prepare('INSERT INTO client_sessions(invitation_id,token_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?)').run(inv.id,hash(t),nowIso(),nowIso(),new Date(Date.now()+10*365*86400e3).toISOString());
     audit('client',String(inv.id),'trial_started','invitation',String(inv.id));
    }else if(!latest.bound_session_hash){t=token();db.prepare('UPDATE invitations SET bound_session_hash=? WHERE id=?').run(hash(t),inv.id);
     db.prepare('INSERT INTO client_sessions(invitation_id,token_hash,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?)').run(inv.id,hash(t),nowIso(),nowIso(),new Date(Date.now()+10*365*86400e3).toISOString());
     audit('client',String(inv.id),'device_rebound','invitation',String(inv.id));
    }else if(t&&hash(t)===latest.bound_session_hash){/* retry from the bound browser */}
    else {db.exec('ROLLBACK');return send(res,409,page('Essai déjà démarré','Cet essai a déjà été démarré dans un autre navigateur. Contactez l’administrateur pour réinitialiser l’appareil.'));}
    db.exec('COMMIT');return redirect(res,'/status',{'Set-Cookie':cookie('aa_client',t!,10*365*86400)});
   }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
  }
  if(p==='/status'&&req.method==='GET'){const s=session(req),state=accessState(s);if(!s)return send(res,401,page('Session absente','Ouvrez votre invitation pour continuer.'));if(state.ok)return send(res,200,page('Accès autorisé',`<h1>Accès actif</h1><div class="card"><p id="remain"></p><p>Fin prévue : ${esc(state.license?.expires_at||s.trial_expires_at||'Permanent')}</p><a class="btn" href="/">Continuer</a></div><script>fetch('/api/client/status').then(r=>r.json()).then(x=>{document.querySelector('#remain').textContent=x.remaining_seconds+' secondes restantes';setInterval(()=>{x.remaining_seconds=Math.max(0,x.remaining_seconds-1);document.querySelector('#remain').textContent=x.remaining_seconds+' secondes restantes'},1000)})</script>`));return redirect(res,'/paiement');}
  if(p==='/api/client/status'&&req.method==='GET'){const s=session(req),state=accessState(s);res.writeHead(s?200:401,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({status:!s?'NO_SESSION':state.ok?state.license?'LICENSE_ACTIVE':'TRIAL_ACTIVE':'TRIAL_EXPIRED',remaining_seconds:state.ok?(state.license?(state.license.expires_at?Math.max(0,Math.ceil((Date.parse(state.license.expires_at)-Date.now())/1000)):null):Math.max(0,Math.ceil((Date.parse(s.trial_expires_at)-Date.now())/1000))):0,expires_at:state.license?.expires_at||s?.trial_expires_at||null,offer_name:config.BUSINESS_NAME}));}
  if(p==='/activation'&&req.method==='GET')return redirect(res,'/paiement');
  if(p==='/api/client/activate'&&req.method==='POST'){
   const f=await body(req);if(!csrfValid(req,f))return send(res,403,page('Erreur','Jeton de formulaire invalide.'));
   const s=session(req);if(!s)return send(res,401,page('Session absente','Démarrez via votre invitation.'));
   const scope=`activate:${s.invitation_id}`;if(isRateLimited(scope))return send(res,429,page('Code indisponible','Trop de tentatives. Contactez le support.'));
   const codeText=(f.code||'').trim();if(codeText.length<20){rateFailure(scope,5,900);return send(res,400,page('Code invalide','Code invalide ou indisponible.'));}
   db.exec('BEGIN IMMEDIATE');
   try{
    const code=db.prepare('SELECT * FROM activation_codes WHERE invitation_id=? AND code_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL').get(s.invitation_id,keyed(codeText)) as any;
    if(!code)throw new Error('invalid');
    const exp=code.is_permanent?null:new Date(Date.now()+Number(code.plan_duration_seconds)*1000).toISOString();
    const upd=db.prepare('UPDATE activation_codes SET redeemed_at=?,redeemed_session_id=? WHERE id=? AND redeemed_at IS NULL').run(nowIso(),s.id,code.id);
    if(Number(upd.changes)!==1)throw new Error('race');
    db.prepare('INSERT INTO licenses(invitation_id,activation_code_id,activated_at,expires_at) VALUES(?,?,?,?)').run(s.invitation_id,code.id,nowIso(),exp);
    audit('client',String(s.invitation_id),'license_activated','invitation',String(s.invitation_id));db.exec('COMMIT');clearRateLimit(scope);return redirect(res,'/status');
   }catch{try{db.exec('ROLLBACK')}catch{}rateFailure(scope,5,900);return send(res,400,page('Code invalide','Code invalide ou indisponible. Contactez le support.'));}
  }
  if(p==='/activation'&&req.method==='POST')return redirect(res,'/paiement');
  // Toutes les routes restantes sont proxyfiées uniquement après contrôle serveur.
  const s=session(req), state=accessState(s);if(!s)return send(res,401,page('Accès requis','Ouvrez votre lien personnalisé et démarrez votre essai pour accéder à ce contenu.'));if(!state.ok)return redirect(res,'/paiement');
  if(req.headers.upgrade?.toLowerCase()==='websocket')return send(res,501,page('WebSocket non pris en charge','Cette passerelle V1 ne prend pas en charge les WebSockets.'));
  const target=new URL(requestTarget,config.ORIGIN_URL),fixedOrigin=new URL(config.ORIGIN_URL);if(target.origin!==fixedOrigin.origin)return send(res,400,page('Requête invalide','La requête ne correspond pas à la cible configurée.'));const transport=target.protocol==='https:'?https:http;
  const headers:{[key:string]:any}={...req.headers,host:target.host};
  const hopByHop=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','forwarded'];
  const nominated=String(req.headers.connection||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  for(const name of [...hopByHop,...nominated])delete headers[name];
  for(const name of Object.keys(headers))if(name.startsWith('x-forwarded-')||name==='x-real-ip')delete headers[name];
  const incomingCookies=cookieMap(req.headers.cookie);for(const name of ['aa_client','aa_admin','aa_csrf'])delete incomingCookies[name];
  if(Object.keys(incomingCookies).length)headers.cookie=Object.entries(incomingCookies).map(([k,v])=>`${k}=${v}`).join('; ');else delete headers.cookie;
  headers.origin=new URL(config.PUBLIC_BASE_URL).origin;headers.referer=new URL(req.url||'/',config.PUBLIC_BASE_URL).toString();
  const contentLength=Number(req.headers['content-length']||0);if(contentLength>100*1024*1024)return send(res,413,page('Requête trop volumineuse','La taille maximale de cette passerelle est de 100 Mo.'));
  let tooLarge=false;const upstream=transport.request(target,{method:req.method,headers,rejectUnauthorized:true},up=>{const outHeaders:{[key:string]:any}={...up.headers};for(const name of hopByHop)delete outHeaders[name];if(outHeaders.location){try{const loc=new URL(String(outHeaders.location),target);if(loc.origin===target.origin)outHeaders.location=loc.pathname+loc.search+loc.hash;}catch{}}
   if(outHeaders['set-cookie']){const safeCookies=(outHeaders['set-cookie'] as string[]).filter(v=>!['aa_client','aa_admin','aa_csrf'].includes(v.split('=',1)[0]!.trim().toLowerCase())).map(proxyCookie);if(safeCookies.length)outHeaders['set-cookie']=safeCookies;else delete outHeaders['set-cookie'];}
   outHeaders['cache-control']='private, no-store';outHeaders['referrer-policy']='no-referrer';
   if(config.isProd)outHeaders['strict-transport-security']='max-age=31536000; includeSubDomains';
   res.writeHead(up.statusCode||502,outHeaders);const timer=setInterval(()=>{if(!accessState(session(req)).ok){up.destroy();res.destroy();clearInterval(timer);}},1000);up.on('end',()=>clearInterval(timer));up.on('close',()=>clearInterval(timer));up.pipe(res);});
  upstream.setTimeout(30_000,()=>upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error',()=>{if(tooLarge)return;if(!res.headersSent)send(res,502,page('Origine indisponible','Le site fictif ne répond pas. La compatibilité du proxy n’est pas garantie.'));else res.destroy();});
  req.on('data',chunk=>{if(tooLarge)return;if(chunk.length+Number((req as any).__proxyBytes||0)>100*1024*1024){tooLarge=true;req.unpipe(upstream);upstream.destroy();send(res,413,page('Requête trop volumineuse','La taille maximale de cette passerelle est de 100 Mo.'));req.resume();}else (req as any).__proxyBytes=Number((req as any).__proxyBytes||0)+chunk.length;});req.pipe(upstream);
 } catch {console.error(JSON.stringify({level:'error',event:'request_failed'}));if(!res.headersSent)send(res,500,page('Erreur','Une erreur interne est survenue.'));else res.destroy();}
});
server.headersTimeout=15_000;server.requestTimeout=120_000;server.keepAliveTimeout=5_000;server.maxHeadersCount=100;
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) server.listen(config.PORT,config.HOST,()=>console.log(JSON.stringify({level:'info',event:'alpha_access_listening',host:config.HOST,port:config.PORT,mode:config.NODE_ENV})));
let shuttingDown=false;
function shutdown(){if(shuttingDown)return;shuttingDown=true;const timeout=setTimeout(()=>process.exit(1),10_000);timeout.unref();server.close(()=>{clearTimeout(timeout);db.close();process.exitCode=0;});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
