window.__GVG_SCRIPT_VERSION='37.0';
/*
  7TH UNIVERSE GVG — FINAL FRONTEND
  Uses two isolated Supabase Auth clients so the Admin browser session
  does not replace the Leader browser session.
*/

const SUPABASE_URL = 'https://ypnpeiglbiycbexpeibb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5ei0IhM1tQ15u5pAIIavhQ_alE9O3bl';
const TIME_ZONE = 'Asia/Karachi';
const IMAGE_BUCKET = 'result-images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_WEAPONS = ['Desert', 'M1887', 'M1887X', 'M1014', 'Woodpecker'];
const ALLOWED_SKILLS = ['DJ Alok', 'Tatsuya', 'Koda'];

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-guild-session-v2', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});
const adminDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-admin-session-v2', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});
const moderatorDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-moderator-session-v1', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

/* ---------------------------------------------------------------------------
   v26 — Cloudflare Turnstile (CAPTCHA) for register / login / password reset.
   - The widget is invisible unless Cloudflare needs the visitor to tick a box;
     then a small box appears at the bottom of the screen.
   - A token can be used only once, so every auth call asks for a fresh token.
   - If the CAPTCHA script cannot load (ad-blocker / bad network) we continue
     without a token. Supabase then decides: if CAPTCHA is enforced it rejects
     the request and the visitor sees a clear message.
--------------------------------------------------------------------------- */
/* v27 — simple guild names only: English letters, numbers and single spaces (3-30 characters).
   The database enforces the same rule, so this check only gives an instant, friendly message. */
const SIMPLE_GUILD_NAME_MESSAGE = 'Guild name must use only English letters (A-Z, a-z), numbers and single spaces, 3 to 30 characters. No symbols or stylish fonts.';
function isSimpleGuildName(name) {
  const value = String(name || '');
  return value.length >= 3 && value.length <= 30 && /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(value);
}

const TURNSTILE_SITE_KEY = '0x4AAAAAAFe8LmQSp9rTt1lB';
const captchaWidgets = {};
const captchaPending = {};

function waitForTurnstile(timeoutMs = 7000) {
  return new Promise(resolve => {
    const started = Date.now();
    (function check() {
      if (window.turnstile) return resolve(window.turnstile);
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(check, 150);
    })();
  });
}

function ensureCaptchaBox(key) {
  const id = `captcha-box-${key}`;
  let box = document.getElementById(id);
  if (!box) {
    box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147483000;max-width:96vw;';
    document.body.appendChild(box);
  }
  return box;
}

async function getCaptchaToken(key) {
  try {
    const ts = await waitForTurnstile();
    if (!ts) return undefined;
    const box = ensureCaptchaBox(key);
    return await new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete captchaPending[key];
        resolve(value);
      };
      const timer = setTimeout(() => finish(undefined), 45000);
      captchaPending[key] = finish;
      if (captchaWidgets[key] === undefined) {
        captchaWidgets[key] = ts.render(box, {
          sitekey: TURNSTILE_SITE_KEY,
          execution: 'execute',
          appearance: 'interaction-only',
          theme: 'dark',
          callback: token => captchaPending[key] && captchaPending[key](token),
          'error-callback': () => { captchaPending[key] && captchaPending[key](undefined); },
          'timeout-callback': () => { captchaPending[key] && captchaPending[key](undefined); }
        });
      } else {
        ts.reset(captchaWidgets[key]);
      }
      ts.execute(captchaWidgets[key]);
    });
  } catch (error) {
    console.warn('CAPTCHA could not run:', error);
    return undefined;
  }
}


const state = {
  user: null,
  guild: null,
  adminUser: null,
  adminOk: false,
  moderatorUser: null,
  moderatorOk: false,
  adminReturnToModerator: false,
  moderatorGuilds: [],
  moderatorResults: [],
  rankingMode: 'current-week',
  rankingCache: {},
  challenges: [],
  guildOptions: [],
  results: [],
  guilds: [],
  bans: [],
  registeredGuilds: [],
  registeredGuildsLoaded: false,
  guildProfiles: [],
  hofMode: 'weekly',
  hofYear: null,
  hofPeriod: null,
  hofAwards: [],
  hofYears: [],
  hofSettings: { season_year: new Date().getFullYear(), current_week: 11 },
  adminHofAwards: [],
  guildNameChangeStatus: null,
  guildNameChangeRequests: []
};

const $ = (id) => document.getElementById(id);

// Short in-memory cache: prevents repeated tab taps from re-fetching the same data.
// It never persists private/server data across browser sessions.
const sectionLoadCache = new Map();
const sectionLoadInflight = new Map();
const DEFAULT_SECTION_CACHE_MS = 20000;
async function loadSectionCached(key, loader, ttlMs=DEFAULT_SECTION_CACHE_MS){
  const lastLoaded = sectionLoadCache.get(key) || 0;
  if(Date.now() - lastLoaded < ttlMs) return;
  if(sectionLoadInflight.has(key)) return sectionLoadInflight.get(key);
  const task = (async()=>{
    try{ await loader(); sectionLoadCache.set(key, Date.now()); }
    finally{ sectionLoadInflight.delete(key); }
  })();
  sectionLoadInflight.set(key, task);
  return task;
}
function markSectionLoaded(key){ sectionLoadCache.set(key, Date.now()); }
function clearSectionCache(prefix=''){
  for(const key of sectionLoadCache.keys()) if(!prefix || key.startsWith(prefix)) sectionLoadCache.delete(key);
}

/* Approved/rejected results can change rankings immediately. Clear all related
   short-lived caches so returning from Admin/Moderator never shows old points. */
function invalidateResultViewCaches(){
  clearSectionCache('member:ranking');
  clearSectionCache('member:approved-results');
  clearSectionCache('member:my-results');
  clearSectionCache('member:challenges');
  state.rankingCache={};
}
async function refreshVisibleMemberResultView(){
  const dashboard=$('member-dashboard');
  if(!dashboard || dashboard.style.display==='none') return;
  const active=document.querySelector('#member-dashboard .member-view.active');
  if(!active) return;
  if(active.id==='member-section-ranking'){
    await loadRanking(state.rankingMode||'current-week');
  }else if(active.id==='member-section-results'){
    await Promise.all([loadLiveChallenges(),loadApprovedResults(),loadMyResultSubmissions()]);
  }else if(active.id==='member-section-challenges'){
    await loadLiveChallenges();
  }else if(active.id==='member-section-name-change'){
    await loadMyGuildNameChangeStatus();
  }
}
async function refreshMemberAfterPrivilegedView(){
  if(!state.user) return;
  await loadMyGuild();
  syncRegisterNav();
  setMemberAccessGate();
  invalidateResultViewCaches();
  clearSectionCache('member:name-change-status');
  await refreshVisibleMemberResultView();
}
function invalidateGuildDirectoryCaches(){
  clearSectionCache('member:guild-options');
  clearSectionCache('member:registered-guilds');
  clearSectionCache('member:guild-profiles');
  clearSectionCache('member:name-change-status');
  state.guildOptions=[];
  state.registeredGuilds=[];
  state.registeredGuildsLoaded=false;
  state.guildProfiles=[];
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function normalizeGuild(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function normalizeContact(value) { let n = String(value || '').replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); if (n.startsWith('0')) n = `92${n.slice(1)}`; return n; }
function formatContact(value) { const n = normalizeContact(value); if (!n) return ''; return n.startsWith('92') && n.length === 12 ? `+92 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}` : `+${n}`; }
function formatTime(value) { if (!value) return '--:--'; const [hRaw,mRaw='00'] = String(value).split(':'); const h = Number(hRaw); if (!Number.isFinite(h)) return '--:--'; return `${h % 12 || 12}:${String(mRaw).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function formatDateTime(value) { try { return new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:TIME_ZONE}).format(new Date(value)); } catch { return String(value || ''); } }
function formatWeekRange(startValue){
  try{
    const start=new Date(startValue);
    const end=new Date(start.getTime()+7*24*60*60*1000);
    const df=new Intl.DateTimeFormat('en-PK',{day:'numeric',month:'short',year:'numeric',timeZone:TIME_ZONE});
    return `${df.format(start)} 10:00 AM → ${df.format(end)} 10:00 AM PKT`;
  }catch{return String(startValue||'');}
}
function showStatus(id,type,message){ const el=$(id); if(!el) return; el.className=`status show ${type}`; el.textContent=message; }
function clearStatus(id){ const el=$(id); if(!el) return; el.className='status'; el.textContent=''; }
function setBusy(buttonId,busy,label){ let btn=$(buttonId); if(btn?.tagName==='FORM') btn=btn.querySelector('button[type=submit]'); if(!btn) return; btn.disabled=busy; if(busy) btn.dataset.oldText=btn.textContent; btn.textContent=busy?'PLEASE WAIT…':(label||btn.dataset.oldText||'SUBMIT'); }
function humanizeError(error){
  let msg=String(error?.message || error?.error_description || error || 'Unknown error').trim().replace(/^(Error:\s*)/i,'');
  msg=msg.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/,'');
  if(/captcha/i.test(msg)) return 'Security check failed. Wait a few seconds and try again. If it keeps failing, refresh the page and turn off any ad-blocker for this site.';
  if(/rate limit|too many requests|only request this after|over_.*rate_limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  return msg;
}

/* Branded confirmation / prompt dialogs; replaces browser-native OK/Cancel popups. */
function showAppDialog({kind='confirm',title='Please confirm',message='',confirmText='CONFIRM',cancelText='CANCEL',defaultValue='',placeholder='',required=false,danger=false}={}){
  const backdrop=$('app-dialog-backdrop');
  const panel=$('app-dialog');
  if(!backdrop||!panel){
    console.error('Branded dialog markup is missing. Update index.html and script.js together.');
    return Promise.resolve(kind==='prompt'?null:false);
  }
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden','true');
      panel.innerHTML='';
      document.removeEventListener('keydown',onKeyDown);
      backdrop.onclick=null;
      resolve(value);
    };
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();
        finish(kind==='prompt'?null:false);
      }
    };
    const promptMarkup=kind==='prompt'?`<label class="app-dialog-field"><span>YOUR RESPONSE${required?' • REQUIRED':''}</span><textarea id="app-dialog-input" rows="3" maxlength="500" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea></label><div id="app-dialog-validation" class="app-dialog-validation" aria-live="polite"></div>`:'';
    const cancelMarkup=kind==='alert'?'':`<button type="button" class="app-dialog-btn secondary" data-dialog-cancel>${escapeHtml(cancelText)}</button>`;
    panel.innerHTML=`<div class="app-dialog-top"><span class="app-dialog-mark">${kind==='prompt'?'✎':danger?'!':'7U'}</span><button type="button" class="app-dialog-close" data-dialog-cancel aria-label="Close dialog">×</button></div><div class="app-dialog-kicker">7TH UNIVERSE • GVG</div><h3 id="app-dialog-title" class="app-dialog-title">${escapeHtml(title)}</h3><p class="app-dialog-message">${escapeHtml(message)}</p>${promptMarkup}<div class="app-dialog-actions">${cancelMarkup}<button id="app-dialog-confirm" type="button" class="app-dialog-btn ${danger?'danger':'primary'}" data-dialog-confirm>${escapeHtml(confirmText)}</button></div>`;
    const doConfirm=()=>{
      if(kind==='prompt'){
        const input=$('app-dialog-input');
        const value=String(input?.value||'');
        if(required&&!value.trim()){
          const validation=$('app-dialog-validation');
          if(validation)validation.textContent='Please enter a reason before continuing.';
          input?.focus();
          return;
        }
        finish(value);
      }else finish(true);
    };
    panel.querySelector('[data-dialog-confirm]')?.addEventListener('click',doConfirm);
    panel.querySelectorAll('[data-dialog-cancel]').forEach(button=>button.addEventListener('click',()=>finish(kind==='prompt'?null:false)));
    backdrop.onclick=event=>{if(event.target===backdrop)finish(kind==='prompt'?null:false);};
    document.addEventListener('keydown',onKeyDown);
    backdrop.setAttribute('aria-hidden','false');
    backdrop.classList.add('open');
    requestAnimationFrame(()=>$(kind==='prompt'?'app-dialog-input':'app-dialog-confirm')?.focus());
  });
}
function appConfirm(message,options={}){return showAppDialog({kind:'confirm',message,...options});}
function appPrompt(message,defaultValue='',options={}){return showAppDialog({kind:'prompt',message,defaultValue,...options});}
function appAlert(message,options={}){return showAppDialog({kind:'alert',message,...options});}

function currentPakistanParts(){ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()); const o={}; for(const p of parts) o[p.type]=p.value; return {year:Number(o.year),month:Number(o.month),day:Number(o.day),hour:Number(o.hour)%24,minute:Number(o.minute)}; }


/* Storage bandwidth optimization: compress new uploads in the browser.
   Images use unique object paths, so a long browser cache lifetime is safe. */
function loadImageForCompression(file){
  return new Promise((resolve,reject)=>{
    const objectUrl=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(objectUrl);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error('This image could not be opened. Try saving it as JPG, PNG or WEBP.'));};
    img.src=objectUrl;
  });
}
function canvasToBlob(canvas,type,quality){
  return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}
async function compressImageForStorage(file,{maxDimension=1800,targetBytes=1200*1024,qualities=[0.86,0.80,0.74]}={}){
  let image;
  try{image=await loadImageForCompression(file);}catch{return file;}
  const sourceWidth=image.naturalWidth||image.width;
  const sourceHeight=image.naturalHeight||image.height;
  if(!sourceWidth||!sourceHeight)return file;
  let scale=Math.min(1,maxDimension/Math.max(sourceWidth,sourceHeight));
  let best=null;
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d');
  if(!context)return file;
  for(let pass=0;pass<4;pass++){
    canvas.width=Math.max(1,Math.round(sourceWidth*scale));
    canvas.height=Math.max(1,Math.round(sourceHeight*scale));
    context.clearRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of qualities){
      const blob=await canvasToBlob(canvas,'image/webp',quality);
      if(!blob||blob.type!=='image/webp')continue;
      if(!best||blob.size<best.size)best=blob;
      if(blob.size<=targetBytes)return blob;
    }
    scale*=0.82;
  }
  return best&&best.size<file.size?best:file;
}
function getUploadImageExtension(file){
  const type=String(file?.type||'').toLowerCase();
  if(type==='image/webp')return 'webp';
  if(type==='image/png')return 'png';
  return 'jpg';
}
function cycleStartDateKey(){ const p=currentPakistanParts(); const d=new Date(Date.UTC(p.year,p.month-1,p.day)); if(p.hour<10) d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); }
function challengePostingOpen(){ const p=currentPakistanParts(); const mins=p.hour*60+p.minute; return mins>=600 && mins<1440; }
function cycleStartForChallenge(challengeCreatedAt){ const d=new Date(new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(challengeCreatedAt))); if(Number.isNaN(d.getTime())) return null; const p=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(challengeCreatedAt)); const o={}; for(const x of p)o[x.type]=x.value; const local=new Date(Date.UTC(Number(o.year),Number(o.month)-1,Number(o.day),Number(o.hour)%24,Number(o.minute))); if(Number(o.hour)<10)local.setUTCDate(local.getUTCDate()-1); return local.toISOString().slice(0,10); }

function openView(name){
  $('public-landing').style.display = name==='public' || name==='register' ? 'grid' : 'none';
  $('public-view').classList.toggle('hidden',name!=='public');
  $('register-view').classList.toggle('hidden',name!=='register');
  $('member-dashboard').style.display = name==='member' ? 'block' : 'none';
  $('admin-page').style.display = name==='admin' ? 'block' : 'none';
  $('moderator-page').style.display = name==='moderator' ? 'block' : 'none';
  window.scrollTo({top:0,behavior:'smooth'});
}

function memberDashboardAllowed(){
  return Boolean(state.guest) || Boolean(state.user && state.guild && state.guild.approval_status==='approved');
}

function setMemberAccessGate(){
  const gate=$('member-access-gate');
  const tabs=document.querySelector('.member-tabs');
  const allowed=memberDashboardAllowed();

  if(gate){
    gate.classList.toggle('hidden',allowed);
    const status=$('member-access-gate-status');
    if(status){
      if(!state.user) status.textContent='LOGIN REQUIRED';
      else if(!state.guild) status.textContent='NO GUILD REGISTRATION FOUND';
      else if(state.guild.approval_status!=='approved') status.textContent='WAITING FOR ADMIN APPROVAL';
      else if(state.guild.is_banned || (state.guild.ban_until && new Date(state.guild.ban_until)>new Date())) status.textContent='GUILD CURRENTLY BANNED';
      else status.textContent='MEMBER ACCESS';
    }
  }

  if(tabs) tabs.classList.toggle('hidden',!allowed);
  renderBanNotices();
  document.querySelectorAll('[data-member-section]').forEach(btn=>btn.classList.toggle('hidden',Boolean(state.guest)&&!['guild-profiles','hall-of-fame'].includes(btn.dataset.memberSection)));

  document.querySelectorAll('.member-view').forEach(el=>{
    if(!allowed) el.classList.remove('active');
  });
}

function openMemberSection(name){
  const allowed=['rules','challenges','results','ranking','guild-profiles','hall-of-fame'];
  const section=state.guest?(['guild-profiles','hall-of-fame'].includes(name)?name:'guild-profiles'):(allowed.includes(name)?name:'rules');

  if(!memberDashboardAllowed()){
    setMemberAccessGate();
    return;
  }

  document.querySelectorAll('.member-view').forEach(el=>el.classList.toggle('active',el.id===`member-section-${section}`));
  document.querySelectorAll('[data-member-section]').forEach(btn=>btn.classList.toggle('active',btn.dataset.memberSection===section));
  if(section==='challenges') loadSectionCached('member:challenges',loadLiveChallenges,15000);
  if(section==='results') Promise.all([
    loadSectionCached('member:challenges',loadLiveChallenges,15000),
    loadSectionCached('member:guild-options',loadGuildOptions,30000),
    loadSectionCached('member:approved-results',loadApprovedResults,15000),
    loadSectionCached('member:my-results',loadMyResultSubmissions,15000)
  ]);
  if(section==='ranking') setRankingMode(state.rankingMode || 'current-week');
  if(section==='registered-guilds') loadSectionCached('member:registered-guilds',loadRegisteredGuilds,30000);
  if(section==='rules') loadRules();
  if((section==='challenges'||section==='results')&&state.user&&Date.now()-(state.guildFetchedAt||0)>60000) refreshBanState();
  if(section==='guild-profiles'){
    setGuildView('all');
    loadSectionCached('member:guild-profiles',loadPublicGuildProfiles,30000);
  }
  if(section==='name-change') loadSectionCached('member:name-change-status',loadMyGuildNameChangeStatus,15000);
  if(section==='hall-of-fame') loadSectionCached('member:hall-of-fame',loadHallOfFame,30000);
  window.scrollTo({top:0,behavior:'smooth'});
}


/* ===== persistent read cache (keeps repeat visits from downloading the same data again) ===== */
const GVG_CACHE_PREFIX='gvg-cache-v1:';
function cacheGet(key,maxAgeMs){try{const raw=localStorage.getItem(GVG_CACHE_PREFIX+key);if(!raw)return null;const o=JSON.parse(raw);if(!o||Date.now()-o.t>maxAgeMs)return null;return o.v;}catch{return null;}}
function cacheSet(key,value){try{localStorage.setItem(GVG_CACHE_PREFIX+key,JSON.stringify({t:Date.now(),v:value}));}catch{/* storage full or blocked: just skip caching */}}
function cacheClear(prefix=''){try{Object.keys(localStorage).filter(k=>k.startsWith(GVG_CACHE_PREFIX+prefix)).forEach(k=>localStorage.removeItem(k));}catch{}}

/* ===== Rules (three buttons, editable by the Admin) ===== */
const RULES_DEFAULT=[
 {key:'about',title:'ABOUT 7TH UNIVERSE',body:'- 7th Universe is a community built for Free Fire Guild vs Guild (GvG) competitive matches and tournaments.\n- Daily GvG challenges are posted through this website.\n- Weekly tournaments are decided on the points earned from the daily matches.\n- Monthly tournament registration opens 3 days before the start of each month and is paid.\nNOTE: For any complaint or suggestion, please contact the Admin.\nADMIN CONTACT: +92 309 8970483'},
 {key:'community',title:'COMMUNITY INSTRUCTIONS',body:'- A guild can play a maximum of 7 matches per day.\n- Right after you win a match, submit your result screenshot from the Results section.\n- A win earns +3 points and a loss costs -1 point.\n- Submitting old results (from a previous day) against new challenges is strictly not allowed.\n- One challenge can be played against one guild only.'},
 {key:'match',title:'IN-MATCH RULES',body:'- Roofing is not allowed.\n- Reviving is not allowed.\n- Two-tap is not allowed.\n- Zone packing is not allowed.\n- More than one match per day against the same guild is not allowed.\n- IDs below level 30 are not allowed.\n- BO3 matches are not allowed.\n- An outsider player (not from the guild) is not allowed.\n- PC is not allowed unless both guilds agree.\n- Abusive language is not allowed.\n- One player cannot play for two guilds.\n- Panel users are not allowed.\n- Both guilds must follow the information given in the challenge.\n- Making accusations without proof is not allowed.\nNOTE: Raise any complaint right after the match. Complaints made one day later will not be accepted.'}
];
function rulesBodyHtml(body){
  return String(body||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(line=>{
    const noteMatch=/^NOTE\s*:\s*(.*)$/i.exec(line);
    const text=noteMatch?noteMatch[1]:line.replace(/^[-•*]\s+/,'');
    const linked=escapeHtml(text).replace(/(\+\d[\d ]{8,16}\d)/g,m=>`<a class="rules-phone" href="https://wa.me/${m.replace(/\D/g,'')}" target="_blank" rel="noopener">${m}</a>`);
    return noteMatch?`<div class="rules-note"><b>NOTE</b>${linked}</div>`:`<div class="rules-li"><span>${linked}</span></div>`;
  }).join('');
}
function renderRulesTabs(){
  const tabs=$('rules-tabs'),body=$('rules-body'); if(!tabs||!body) return;
  const list=state.rules?.length?state.rules:RULES_DEFAULT;
  if(!list.some(r=>r.key===state.rulesTab)) state.rulesTab=list[0].key;
  tabs.innerHTML=list.map(r=>`<button type="button" class="rules-tab ${r.key===state.rulesTab?'active':''}" role="tab" aria-selected="${r.key===state.rulesTab}" data-rules-tab="${escapeHtml(r.key)}">${escapeHtml(r.title)}</button>`).join('');
  const cur=list.find(r=>r.key===state.rulesTab)||list[0];
  body.innerHTML=rulesBodyHtml(cur.body);
}
async function loadRules(force=false){
  let rules=force?null:cacheGet('rules',6*60*60*1000);
  if(!rules){
    try{const {data,error}=await db.rpc('get_gvg_rules');if(error)throw error;if(Array.isArray(data)&&data.length){rules=data;cacheSet('rules',rules);}}
    catch(error){console.warn('Rules could not be loaded; showing the built-in text:',error);}
  }
  state.rules=rules||RULES_DEFAULT; renderRulesTabs();
}
function renderRules(){ renderRulesTabs(); }
document.addEventListener('click',e=>{const t=e.target.closest?.('[data-rules-tab]');if(t){state.rulesTab=t.dataset.rulesTab;renderRulesTabs();}});

/* ----- Admin: Rules editor ----- */
async function loadAdminRules(){
  const box=$('rules-editor'); if(!box) return;
  let list=null;
  try{const {data,error}=await adminDb.rpc('get_gvg_rules');if(error)throw error;list=Array.isArray(data)?data:null;}
  catch(error){showStatus('rules-editor-status','error',`Could not load the rules: ${humanizeError(error)}`);}
  list=list?.length?list:RULES_DEFAULT;
  box.innerHTML=list.map(r=>`<div class="rules-edit" data-rule-key="${escapeHtml(r.key)}"><label>BUTTON NAME<input type="text" maxlength="60" data-rule-title value="${escapeHtml(r.title)}" /></label><label>TEXT (one line = one bullet)<textarea data-rule-body maxlength="6000">${escapeHtml(r.body)}</textarea></label><div><button class="btn btn-primary btn-small" type="button" data-action="save-rule" data-key="${escapeHtml(r.key)}">SAVE THIS SECTION</button></div></div>`).join('');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest?.('[data-action="save-rule"]'); if(!b) return;
  const wrap=b.closest('[data-rule-key]'); if(!wrap) return;
  clearStatus('rules-editor-status');
  try{
    b.disabled=true;
    const {error}=await adminDb.rpc('admin_save_gvg_rule',{p_key:wrap.dataset.ruleKey,p_title:wrap.querySelector('[data-rule-title]').value,p_body:wrap.querySelector('[data-rule-body]').value});
    if(error)throw error;
    cacheClear('rules');
    showStatus('rules-editor-status','ok','Saved. Guilds will see the new text the next time they open the Rules section.');
  }catch(error){showStatus('rules-editor-status','error',humanizeError(error));}
  finally{b.disabled=false;}
});

/* ===== v1.12: picture tiles for weapons, PC mode and skills =====
   The drawings below are ORIGINAL vector illustrations. To show real game pictures instead, upload files named
   desert / m1887 / m1887x / m1014 / woodpecker / pc_allow / pc_not_allow / alok / tatsuya / koda  (png, webp or jpg) into assets/FF/ -
   a picture found there automatically replaces the drawing. */
const FF_KEYS={'Desert':'desert','M1887':'m1887','M1887X':'m1887x','M1014':'m1014','Woodpecker':'woodpecker','DJ Alok':'alok','Tatsuya':'tatsuya','Koda':'koda'};
const FF_DEFS='<defs><linearGradient id="ffSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef3"/><stop offset=".45" stop-color="#9aa6b2"/><stop offset="1" stop-color="#46505b"/></linearGradient><linearGradient id="ffDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6772"/><stop offset=".5" stop-color="#2b3138"/><stop offset="1" stop-color="#14171b"/></linearGradient><linearGradient id="ffWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98d4e"/><stop offset=".5" stop-color="#8a5526"/><stop offset="1" stop-color="#4d2c11"/></linearGradient><linearGradient id="ffGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#e0b23f"/><stop offset="1" stop-color="#8a6212"/></linearGradient><radialGradient id="ffGlow" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ff5d73" stop-opacity=".55"/><stop offset="1" stop-color="#ff5d73" stop-opacity="0"/></radialGradient></defs>';
const FF_ART={
  desert:`<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="92" rx="62" ry="5" fill="#000" opacity=".35"/><path d="M104 62 118 66 113 96 94 96 98 62Z" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.5"/><path d="M96 62h16l1 6H97Z" fill="#7b8794" opacity=".5"/><path d="M12 34h110c6 0 10 3 10 8v14c0 4-3 7-8 7H60l-8-13H12c-3 0-5-2-5-5V39c0-3 2-5 5-5Z" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.6"/><path d="M14 40h108" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"/><rect x="26" y="45" width="34" height="5" rx="2" fill="#2b3138" opacity=".8"/><path d="M58 63h30c5 0 7 4 4 8-3 3-6 3-10 3H66c-6 0-10-3-8-11Z" fill="none" stroke="#0b0d10" stroke-width="3"/><path d="M130 38h12v8h-12Z" fill="#2b3138"/><circle cx="21" cy="36" r="2" fill="#0b0d10"/></svg>`,
  m1887:`<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="90" rx="66" ry="5" fill="#000" opacity=".35"/><path d="M6 52c0-6 3-10 9-10l34 2v22l-30 6c-8 1-13-4-13-10Z" fill="url(#ffWood)" stroke="#2a1608" stroke-width="1.6"/><rect x="48" y="43" width="104" height="9" rx="4" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><rect x="48" y="55" width="86" height="7" rx="3" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><path d="M44 40h46l4 28H50l-6-6Z" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.6"/><path d="M84 62c9 0 15 4 15 11s-6 10-14 10c-7 0-9-5-9-8" fill="none" stroke="url(#ffSteel)" stroke-width="3.4"/><path d="M92 54h30l6 4H96Z" fill="url(#ffWood)" stroke="#2a1608" stroke-width="1.2"/><path d="M52 46h36" stroke="#fff" stroke-opacity=".45" stroke-width="1.4"/><circle cx="150" cy="47" r="2.4" fill="#0b0d10"/></svg>`,
  m1887x:`<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="90" rx="66" ry="5" fill="#000" opacity=".35"/><path d="M6 52c0-6 3-10 9-10l34 2v22l-30 6c-8 1-13-4-13-10Z" fill="url(#ffGold)" stroke="#5a3d08" stroke-width="1.6"/><rect x="48" y="36" width="104" height="8" rx="4" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><rect x="48" y="46" width="104" height="8" rx="4" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><rect x="48" y="56" width="86" height="7" rx="3" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><path d="M44 34h46l4 34H50l-6-6Z" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.6"/><path d="M84 64c9 0 15 4 15 11s-6 10-14 10c-7 0-9-5-9-8" fill="none" stroke="url(#ffGold)" stroke-width="3.4"/><path d="M92 56h30l6 4H96Z" fill="url(#ffGold)" stroke="#5a3d08" stroke-width="1.2"/><path d="M52 40h36" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/><circle cx="150" cy="40" r="2.2" fill="#0b0d10"/><circle cx="150" cy="50" r="2.2" fill="#0b0d10"/></svg>`,
  m1014:`<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="90" rx="66" ry="5" fill="#000" opacity=".35"/><path d="M4 46c0-5 3-8 8-8h30v24H14c-6 0-10-4-10-9Z" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.6"/><rect x="40" y="40" width="46" height="16" rx="4" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.6"/><rect x="84" y="43" width="68" height="8" rx="4" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><rect x="84" y="53" width="56" height="6" rx="3" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.3"/><path d="M52 56 58 82 72 82 70 56Z" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.5"/><path d="M92 59h30l5 5H96Z" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.2"/><path d="M44 43h38" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/><circle cx="150" cy="47" r="2.4" fill="#0b0d10"/></svg>`,
  woodpecker:`<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="90" rx="68" ry="5" fill="#000" opacity=".35"/><path d="M4 50c0-5 3-8 8-8h28v22H14c-6 0-10-6-10-14Z" fill="url(#ffWood)" stroke="#2a1608" stroke-width="1.6"/><rect x="38" y="42" width="52" height="14" rx="3" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.6"/><rect x="88" y="46" width="64" height="6" rx="3" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.3"/><path d="M90 52h34l4 6H92Z" fill="url(#ffWood)" stroke="#2a1608" stroke-width="1.2"/><rect x="52" y="26" width="42" height="12" rx="6" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="1.5"/><circle cx="56" cy="32" r="5" fill="#9ccfff" opacity=".85" stroke="#0b0d10" stroke-width="1.2"/><path d="M66 38v4M82 38v4" stroke="#0b0d10" stroke-width="2"/><path d="M58 56 62 76 74 76 72 56Z" fill="url(#ffWood)" stroke="#2a1608" stroke-width="1.4"/><circle cx="154" cy="49" r="2.2" fill="#0b0d10"/></svg>`,
  alok:`<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="url(#ffGlow)"/><circle cx="50" cy="50" r="38" fill="url(#ffDark)" stroke="url(#ffGold)" stroke-width="3.5"/><circle cx="50" cy="50" r="30" fill="none" stroke="#ffcf5a" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="3 4"/><path d="M33 56v-6a17 17 0 0 1 34 0v6" fill="none" stroke="url(#ffGold)" stroke-width="4.5" stroke-linecap="round"/><rect x="28" y="54" width="9" height="15" rx="4" fill="url(#ffGold)"/><rect x="63" y="54" width="9" height="15" rx="4" fill="url(#ffGold)"/><path d="M47 66V45l14-4v21" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44" cy="66" r="3.6" fill="#fff"/><circle cx="58" cy="62" r="3.6" fill="#fff"/></svg>`,
  tatsuya:`<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="url(#ffGlow)"/><circle cx="50" cy="50" r="38" fill="url(#ffDark)" stroke="#ff5d73" stroke-width="3.5"/><path d="M50 18 56 44 82 50 56 56 50 82 44 56 18 50 44 44Z" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.6"/><circle cx="50" cy="50" r="7" fill="#c4122f" stroke="#0b0d10" stroke-width="1.6"/><path d="M26 74 74 26" stroke="#fff" stroke-opacity=".55" stroke-width="2"/></svg>`,
  koda:`<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="url(#ffGlow)"/><path d="M50 10 84 29v42L50 90 16 71V29Z" fill="url(#ffDark)" stroke="url(#ffGold)" stroke-width="3.5" stroke-linejoin="round"/><path d="M50 22 74 36v28L50 78 26 64V36Z" fill="none" stroke="#ffcf5a" stroke-opacity=".35" stroke-width="1.4"/><path d="M38 32v36M38 50l24-18M44 46l20 22" stroke="url(#ffGold)" stroke-width="6" stroke-linecap="round" fill="none"/></svg>`,
  pc:`<svg viewBox="0 0 100 80" aria-hidden="true"><ellipse cx="50" cy="74" rx="34" ry="4" fill="#000" opacity=".35"/><rect x="12" y="6" width="76" height="46" rx="5" fill="url(#ffDark)" stroke="#0b0d10" stroke-width="2"/><rect x="17" y="11" width="66" height="36" rx="2" fill="#0e1a26"/><path d="M17 11h66v14L17 36Z" fill="#9ccfff" opacity=".16"/><path d="M40 52h20l3 10H37Z" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/><rect x="26" y="62" width="48" height="6" rx="3" fill="url(#ffSteel)" stroke="#0b0d10" stroke-width="1.4"/></svg>`
};
function ffPic(key){
  return `<span class="ff-pic"><span class="ff-art">${FF_ART[key]||FF_ART[String(key).startsWith('pc')?'pc':'']||''}</span><img class="ff-img" src="./assets/FF/${key}.png" alt="" loading="lazy" data-ff="${key}" data-i="0" onerror="ffImgFallback(this)" onload="this.parentNode.classList.add('has-img')" /></span>`;
}
window.ffImgFallback=function(img){
  const exts=['png','webp','jpg'];const i=Number(img.dataset.i||0)+1;
  if(i<exts.length){img.dataset.i=String(i);img.src=`./assets/FF/${img.dataset.ff}.${exts[i]}`;}else img.remove();
};
function ffTileInput(type,name,value,label){
  const key=FF_KEYS[value]||'';
  return `<label class="ff-tile"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" />${ffPic(key)}<span class="ff-name">${escapeHtml(label||value)}</span><span class="ff-check" aria-hidden="true">✓</span></label>`;
}
function ensureFfDefs(){if(!document.getElementById('ff-defs'))document.body.insertAdjacentHTML('beforeend',`<svg id="ff-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${FF_DEFS}</svg>`);}
function renderWeaponSkillChoices(){
  ensureFfDefs();
  const wg=$('weapon-grid'), sg=$('skill-grid'), pg=$('pc-grid');
  if(wg) wg.innerHTML=ALLOWED_WEAPONS.map(x=>ffTileInput('checkbox','weapons',x)).join('');
  if(sg) sg.innerHTML=ALLOWED_SKILLS.map(x=>ffTileInput('checkbox','skills',x)).join('');
  if(pg) pg.innerHTML=[['false','PC NOT ALLOW'],['true','PC ALLOW']].map(([v,l])=>`<button type="button" class="ff-tile ff-pc" data-pc="${v}">${ffPic(v==='true'?'pc_allow':'pc_not_allow')}<span class="ff-name">${l}</span><span class="ff-check" aria-hidden="true">✓</span></button>`).join('');
  syncFfTiles();
}
function syncFfTiles(){
  document.querySelectorAll('#challenge-form .ff-tile input').forEach(i=>i.closest('.ff-tile')?.classList.toggle('selected',i.checked));
  const sel=$('challenge-pc-allowed');
  document.querySelectorAll('#pc-grid .ff-tile').forEach(t=>{const on=sel&&sel.value===t.dataset.pc;t.classList.toggle('selected',on);t.setAttribute('aria-pressed',on?'true':'false');});
}
document.addEventListener('change',e=>{if(e.target.closest?.('#challenge-form')) syncFfTiles();});
document.addEventListener('click',e=>{
  const t=e.target.closest?.('#pc-grid .ff-tile'); if(!t) return;
  const sel=$('challenge-pc-allowed'); if(sel){sel.value=t.dataset.pc;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  syncFfTiles();
});
$('challenge-form')?.addEventListener('reset',()=>setTimeout(syncFfTiles,0));

function isPendingRegistrationSaved(){ try{return Boolean(localStorage.getItem('7th-universe-pending-registration-v2'));}catch{return false;} }
function savePendingRegistration(data){ try{ localStorage.setItem('7th-universe-pending-registration-v2',JSON.stringify(data)); }catch{} }
function readPendingRegistration(){ try{return JSON.parse(localStorage.getItem('7th-universe-pending-registration-v2')||'null');}catch{return null;} }
function clearPendingRegistration(){ try{localStorage.removeItem('7th-universe-pending-registration-v2');}catch{} }

function formatWeekLabel(value){
  try{return new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeZone:TIME_ZONE}).format(new Date(value));}
  catch{return String(value||'');}
}


async function loadMyGuild(){
  if(!state.user){state.guild=null;return;}
  const {data,error}=await db.rpc('get_my_gvg_guild');
  if(error){ console.error(error); state.guild=null; return; }
  state.guild=Array.isArray(data)?(data[0]||null):data;
  state.guildFetchedAt=Date.now();
}

/* ===== Ban notice shown inside Challenges and Results (reason + live countdown, or APPEAL for a permanent ban) ===== */
function guildBanInfo(){
  const g=state.guild; if(!g) return null;
  const until=g.ban_until?new Date(g.ban_until):null;
  const active=Boolean(g.is_banned&&(!until||until>new Date()));
  if(!active) return null;
  return {permanent:!until,until,reason:String(g.ban_reason||'').trim()||'Rule violation'};
}
function banCardMarkup(info){
  const clock=info.permanent
    ? `<div class="ban-perm"><div class="ban-perm-label">PERMANENT BAN</div><button type="button" class="ban-appeal" data-action="ban-appeal">APPEAL</button></div>`
    : `<div class="ban-watch" aria-label="Time left until the ban ends"><div class="ban-watch-face"><small>UNBANNED IN</small><b class="ban-clock" data-until="${info.until.toISOString()}">--:--:--</b><em class="ban-days"></em></div></div>`;
  const when=info.permanent?'':`<div class="ban-when">Ban ends on ${escapeHtml(formatDateTime(info.until.toISOString()))} Pakistan time</div>`;
  return `<div class="ban-card"><div class="ban-icon" aria-hidden="true">⛔</div><div class="ban-text"><div class="ban-title">YOUR GUILD IS BANNED</div><div class="ban-reason"><span>REASON</span>${escapeHtml(info.reason)}</div>${when}</div>${clock}</div>`;
}
let banClockTimer=null;
function tickBanClocks(){
  const clocks=document.querySelectorAll('.ban-clock');
  if(!clocks.length){clearInterval(banClockTimer);banClockTimer=null;return;}
  let expired=false;
  clocks.forEach(el=>{
    const ms=new Date(el.dataset.until).getTime()-Date.now();
    if(!(ms>0)){expired=true;return;}
    const t=Math.floor(ms/1000),d=Math.floor(t/86400),hh=Math.floor(t%86400/3600),mm=Math.floor(t%3600/60),ss=t%60;
    el.textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    const dd=el.parentNode.querySelector('.ban-days'); if(dd)dd.textContent=d>0?`${d} DAY${d>1?'S':''}`:'';
  });
  if(expired){clearInterval(banClockTimer);banClockTimer=null;refreshBanState();}
}
function renderBanNotices(){
  const info=guildBanInfo();
  ['challenges','results'].forEach(k=>{
    const slot=$('ban-slot-'+k),panel=$('member-section-'+k); if(!slot||!panel) return;
    panel.classList.toggle('is-banned',Boolean(info));
    slot.innerHTML=info?banCardMarkup(info):'';
  });
  if(info&&!info.permanent){tickBanClocks();clearInterval(banClockTimer);banClockTimer=setInterval(tickBanClocks,1000);}
}
async function refreshBanState(){
  try{await loadMyGuild();}catch{}
  await renderMemberIdentity();setMemberAccessGate();renderBanNotices();
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-action="ban-appeal"]'); if(!b) return;
  /* The APPEAL button is clickable but intentionally does nothing yet. */
  b.classList.add('pressed');setTimeout(()=>b.classList.remove('pressed'),450);
});

function guildApproved(){ return Boolean(state.guild && state.guild.approval_status==='approved' && !state.guild.is_banned && (!state.guild.ban_until || new Date(state.guild.ban_until)<=new Date())); }

async function completePendingRegistration(){
  const pending=readPendingRegistration();
  if(!pending || !state.user) return;
  if(String(pending.email||'').trim().toLowerCase()!==String(state.user.email||'').trim().toLowerCase()) return;

  try{
    const {data,error}=await db.rpc('register_gvg_guild',{
      p_guild_name:pending.guild,
      p_contact:pending.contact
    });
    if(error) throw error;

    clearPendingRegistration();
    state.guild=Array.isArray(data)?(data[0]||null):data;
    // Normalize the registry row once after registration; later view rendering must not repeat this fetch.
    await loadMyGuild();
    showStatus('login-status','ok','Account confirmed and guild registration has been submitted. Admin approval is required.');
  }catch(error){
    const message=String(error?.message||error||'').trim();

    /*
      A pending browser record must never keep retrying forever.
      If the account already owns a guild, or the registration is blocked,
      remove the stale pending request and let the leader see the real state.
    */
    if(/ALREADY_REGISTERED|DUPLICATE_REGISTRATION|contact number is already registered|contact.*already registered/i.test(message)){
      clearPendingRegistration();
      await loadMyGuild();
    }

    showStatus('login-status','error',/DUPLICATE_REGISTRATION|contact number is already registered|contact.*already registered/i.test(message)
      ? 'Supabase still marks this contact number as registered. Since the guild was removed, Admin must verify whether an old leader/contact link remained in the database. Creating another email will not fix this check.'
      : humanizeError(error));
  }
}

async function handleLogin(e){
  e.preventDefault();
  clearStatus('login-status');

  const email=$('login-email').value.trim().toLowerCase();
  const password=$('login-password').value;

  if(!email||!password){
    showStatus('login-status','error','Email and password are required.');
    return;
  }

  try{
    setBusy('login-form',true,'LOGIN TO GVG');

    const {data,error}=await db.auth.signInWithPassword({email,password,options:{captchaToken:await getCaptchaToken('login')}});
    if(error) throw error;

    state.user=data.user;
    clearSectionCache('member:');
    await loadMyGuild();
    await completePendingRegistration();
    await enterMember({skipGuildReload:true});
  }catch(error){
    showStatus('login-status','error',humanizeError(error));
  }finally{
    setBusy('login-form',false,'LOGIN TO GVG');
  }
}

async function handleRegister(e){
  e.preventDefault();
  clearStatus('register-status');

  const guild=$('register-guild').value.trim().replace(/\s+/g,' ');
  const contact=$('register-contact').value.trim();
  const email=$('register-email').value.trim().toLowerCase();
  const password=$('register-password').value;
  const passwordConfirm=$('register-password-confirm').value;

  if(guild&&!isSimpleGuildName(guild)){
    showStatus('register-status','error',SIMPLE_GUILD_NAME_MESSAGE);
    return;
  }

  if(!guild||!contact||!email||!password||!passwordConfirm){
    showStatus('register-status','error','Guild name, contact, email, password and confirm password are required.');
    return;
  }

  if(password.length<8){
    showStatus('register-status','error','Password must be at least 8 characters.');
    return;
  }

  if(password!==passwordConfirm){
    showStatus('register-status','error','Passwords do not match.');
    return;
  }

  const registerWithCurrentUser = async () => {
    const {data:reg,error:regError}=await db.rpc('register_gvg_guild',{
      p_guild_name:guild,
      p_contact:contact
    });

    if(regError) throw regError;

    clearPendingRegistration();
    state.guild=Array.isArray(reg)?(reg[0]||null):reg;
    await loadMyGuild();
    clearSectionCache('member:');
    openView('member');
    await refreshMember({reloadGuild:false});
    syncRegisterNav();
  };

  try{
    setBusy('register-form',true,'CREATE ACCOUNT');

    /*
      Case 1: the browser already has a session for this exact email.
      If its guild was removed, loadMyGuild() returns null, so the same Auth
      account can immediately create a fresh guild_registry row.
    */
    const {data:sessionData}=await db.auth.getSession();
    const currentSession=sessionData?.session;

    if(currentSession?.user){
      const sessionEmail=String(currentSession.user.email||'').trim().toLowerCase();

      if(sessionEmail!==email){
        await db.auth.signOut();
        state.user=null;
        state.guild=null;
      }else{
        state.user=currentSession.user;
        await loadMyGuild();

        if(state.guild){
          showStatus('register-status','error','This account already has an active guild registration. Login with that account or use a different leader account.');
          return;
        }

        await registerWithCurrentUser();
        showStatus('guild-auth-status','ok','Guild registered successfully. Your guild is now pending admin approval.');
        return;
      }
    }

    /*
      Case 2: no matching session.
      Try the entered credentials first. If they work, reuse the existing
      Auth account. This is the normal path for a previously removed guild.
    */
    const loginResult=await db.auth.signInWithPassword({email,password,options:{captchaToken:await getCaptchaToken('register')}});

    if(!loginResult.error){
      state.user=loginResult.data.user;
      await loadMyGuild();

      if(state.guild){
        showStatus('register-status','error','This account already has an active guild registration. Login with that account or use a different leader account.');
        await db.auth.signOut();
        state.user=null;
        state.guild=null;
        return;
      }

      await registerWithCurrentUser();
      showStatus('guild-auth-status','ok','Guild registered successfully. Your guild is now pending admin approval.');
      return;
    }

    /*
      Case 3: credentials did not authenticate.
      Only now do we attempt signUp for a genuinely new account.
      If Supabase says the email already exists, show a clear Auth-account
      message — NEVER call it an already-registered guild.
    */
    const {data,error}=await db.auth.signUp({
      email,
      password,
      options:{data:{account_type:'guild'},captchaToken:await getCaptchaToken('register')}
    });

    if(error){
      const signupMessage=String(error?.message||error||'').trim();
      if(/already registered|user already exists|already been registered/i.test(signupMessage)){
        showStatus(
          'register-status',
          'error',
          'THIS EMAIL ALREADY HAS AN ACCOUNT. Login with the correct password, or use FORGOT PASSWORD. Your guild is not marked as registered by this message.'
        );
        return;
      }
      throw error;
    }

    savePendingRegistration({guild,contact,email});

    if(data.session){
      state.user=data.user;
      await registerWithCurrentUser();
      showStatus('guild-auth-status','ok','Guild registered successfully. Your guild is now pending admin approval.');
    }else{
      showStatus(
        'register-status',
        'info',
        'Account created. Please confirm the email, then login. Your guild registration details are saved and will be submitted automatically after login.'
      );
    }
  }catch(error){
    const message=String(error?.message||error||'').trim();

    if(/DUPLICATE_REGISTRATION|contact number is already registered|contact.*already registered/i.test(message)){
      clearPendingRegistration();
      showStatus('register-status','error','Supabase still marks this contact number as registered. Since the guild was removed, Admin must verify whether an old leader/contact link remained in the database. Creating another email will not fix this check.');
    }else if(/invalid login credentials/i.test(message)){
      showStatus(
        'register-status',
        'error',
        'We could not sign in with this password. If this email is already yours, use the correct password or FORGOT PASSWORD. Otherwise, check the email and try again.'
      );
    }else{
      showStatus('register-status','error',humanizeError(error));
    }
  }finally{
    setBusy('register-form',false,'CREATE ACCOUNT');
  }
}
async function handleForgot(){
  clearStatus('login-status');

  const email=$('login-email').value.trim().toLowerCase();
  if(!email){
    showStatus('login-status','error','Enter your account email first.');
    return;
  }

  try{
    setBusy('forgot-password',true,'SENDING...');
    const redirectTo=`${window.location.origin}${window.location.pathname}`;
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo,captchaToken:await getCaptchaToken('login')});
    if(error) throw error;

    showStatus(
      'login-status',
      'ok',
      'Password reset email requested. Check your inbox and spam folder, then open the reset link.'
    );
  }catch(error){
    showStatus('login-status','error',humanizeError(error));
  }finally{
    setBusy('forgot-password',false,'FORGOT PASSWORD?');
  }
}

async function handleUpdatePassword(event){
  event.preventDefault();
  clearStatus('recovery-status');

  const password=$('recovery-password').value;
  const confirm=$('recovery-password-confirm').value;

  if(password.length<8){
    showStatus('recovery-status','error','Password must be at least 8 characters.');
    return;
  }

  if(password!==confirm){
    showStatus('recovery-status','error','Passwords do not match.');
    return;
  }

  try{
    const {error}=await db.auth.updateUser({password});
    if(error) throw error;

    showStatus(
      'recovery-status',
      'ok',
      'Password updated successfully. You can now login with your new password.'
    );

    setTimeout(async()=>{
      try{await db.auth.signOut();}catch{}
      $('password-recovery-backdrop')?.classList.remove('open');
      $('password-recovery-form')?.reset();
      openView('public');
    },1100);
  }catch(error){
    showStatus('recovery-status','error',humanizeError(error));
  }
}

async function renderMemberIdentity(){
  const info=$('member-identity'), badge=$('member-status-badge'); if(!info||!badge)return;
  if(state.guest){info.textContent=`GUEST VIEW • ${state.guest.guild_name} • READ ONLY`;badge.className='badge badge-gold';badge.textContent='GUEST';return;}
  if(!state.user){info.textContent='Not logged in';badge.className='badge badge-red';badge.textContent='LOGOUT';return;}
  const g=state.guild;
  if(!g){info.textContent=`${state.user.email} • No guild registration yet`;badge.className='badge badge-gold';badge.textContent='NOT REGISTERED';return;}
  info.textContent=`${g.guild_name} • ${formatContact(g.contact)} • ${state.user.email}`;
  if(g.is_banned || (g.ban_until && new Date(g.ban_until)>new Date())){badge.className='badge badge-red';badge.textContent='BANNED';return;}
  badge.className=g.approval_status==='approved'?'badge badge-green':'badge badge-gold'; badge.textContent=String(g.approval_status||'').toUpperCase();
}

async function loadRegisteredGuilds(){
  const target=$('registered-guild-list');
  const countBadge=$('registered-guild-count');
  if(!target) return;
  target.innerHTML='<tr><td colspan="4">Loading registered guilds...</td></tr>';
  try{
    const {data,error}=await db.rpc('get_gvg_registered_guilds');
    if(error) throw error;
    state.registeredGuilds=Array.isArray(data)?data:[];
    state.registeredGuildsLoaded=true;
    if(countBadge) countBadge.textContent=`${state.registeredGuilds.length} GUILDS`;
    target.innerHTML=state.registeredGuilds.length
      ? state.registeredGuilds.map((g,i)=>{
          const banned=Boolean(g.is_banned);
          const status=banned?'BANNED':String(g.approval_status||'').toUpperCase();
          const cls=banned?'registered-status-banned':g.approval_status==='approved'?'registered-status-approved':g.approval_status==='pending'?'registered-status-pending':'registered-status-rejected';
          return `<tr><td class="pos">${escapeHtml(g.rank_no||i+1)}</td><td><div class="registered-guild-name">${escapeHtml(g.guild_name)}</div></td><td class="registered-guild-leaders">${escapeHtml(g.leader_count||0)}</td><td><span class="registered-status ${cls}">${escapeHtml(status)}</span></td></tr>`;
        }).join('')
      : '<tr><td colspan="4">No registered guilds yet.</td></tr>';
  }catch(error){
    console.error('Registered guild load failed:',error);
    target.innerHTML='<tr><td colspan="4">Could not load registered guilds.</td></tr>';
    if(countBadge) countBadge.textContent='ERROR';
  }
}

async function loadLiveChallenges(){
  try{
    const {data,error}=await db.rpc('get_gvg_live_challenges');
    if(error) throw error;
    state.challenges=data||[];
    renderChallenges();
    fillResultChallenges();
  }catch(error){
    console.error(error);
    $('live-challenge-list').innerHTML='<div class="empty">Could not load live challenges.</div>';
  }
}

function challengeStatusLabel(status){
  if(status==='result_pending') return 'RESULT PENDING';
  if(status==='completed') return 'COMPLETED';
  if(status==='cancelled') return 'CANCELLED';
  return 'OPEN';
}

function renderChallenges(){
  const target=$('live-challenge-list');
  if(!target) return;

  target.innerHTML=state.challenges.length
    ? state.challenges.map(c=>{
        const status=String(c.status||'open');
        const canSubmit=status==='open';

        return `<div class="challenge-card" data-state="${escapeHtml(status)}">
          <div class="meta-row">
            <div>
              <div class="kicker">${escapeHtml(c.challenge_code||'CHALLENGE')}</div>
              <div class="name">${escapeHtml(c.guild_name)}</div>
            </div>
            <span class="badge ${status==='open'?'badge-blue':status==='result_pending'?'badge-gold':'badge-green'}">${escapeHtml(challengeStatusLabel(status))}</span>
          </div>
          <div class="challenge-time">MATCH ${escapeHtml(formatTime(c.match_time))}</div>
          <div class="pill-wrap">
            ${(c.weapons||[]).map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')}
            ${(c.active_skills||[]).map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')}
          </div>
          <div class="contact-line">
            <a class="contact-link" href="tel:${escapeHtml(normalizeContact(c.contact_number))}">${escapeHtml(formatContact(c.contact_number))}</a>
            ${canSubmit
              ? `<button class="btn btn-primary btn-small" type="button" data-action="result-from-challenge" data-id="${escapeHtml(c.id)}">SUBMIT RESULT</button>`
              : `<span class="muted" style="font-size:8px">${status==='result_pending'?'RESULT UNDER ADMIN REVIEW.':'RESULT COMPLETED.'}</span>`
            }
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">No current-cycle challenges right now.</div>';
}

let guildSearchSerial = 0;

async function searchGuildSuggestions(query){
  const q=String(query||'').trim();
  // Start live guild lookup after the first two typed characters.
  if(q.length < 2) return [];
  const serial=++guildSearchSerial;
  const localMatches=()=>getResultGuildNames().filter(name=>normalizeGuild(name).includes(normalizeGuild(q)));
  let remoteNames=[];
  try{
    const {data,error}=await db.rpc('search_gvg_guilds',{p_query:q});
    if(error) throw error;
    remoteNames=(data||[]).map(row=>String(row.guild_name||'').trim()).filter(Boolean);
  }catch(error){
    console.error('Guild autocomplete search failed; using cached guild sources:',error);
  }
  if(serial!==guildSearchSerial) return [];
  const unique=new Map();
  // Prefer the backend's ordering, then add matching names from the already-loaded directory/profile/results cache.
  [...remoteNames,...localMatches()].forEach(name=>{
    const clean=String(name||'').trim();
    const key=normalizeGuild(clean);
    if(key&&!unique.has(key))unique.set(key,clean);
  });
  return [...unique.values()].sort((a,b)=>{
    const aa=normalizeGuild(a),bb=normalizeGuild(b),needle=normalizeGuild(q);
    const aStarts=aa.startsWith(needle)?0:1,bStarts=bb.startsWith(needle)?0:1;
    return aStarts-bStarts||aa.localeCompare(bb);
  }).slice(0,10);
}
async function loadGuildOptions(){
  const registryPromise=state.registeredGuildsLoaded
    ? Promise.resolve({data:state.registeredGuilds,error:null})
    : Promise.resolve(db.rpc('get_gvg_registered_guilds')).catch(error=>({data:null,error}));
  const [optionsResult,registryResult]=await Promise.all([
    Promise.resolve(db.rpc('get_gvg_guild_options')).catch(error=>({data:null,error})),
    registryPromise
  ]);
  if(optionsResult.error){
    console.error('Guild options load failed:',optionsResult.error);
    state.guildOptions=[];
  }else state.guildOptions=Array.isArray(optionsResult.data)?optionsResult.data:[];
  if(!registryResult.error&&Array.isArray(registryResult.data)){state.registeredGuilds=registryResult.data;state.registeredGuildsLoaded=true;}
  fillResultGuilds();
}

function getResultGuildNames(){
  const names=[
    ...state.guildOptions.map(g=>g.guild_name),
    ...state.registeredGuilds.map(g=>g.guild_name),
    ...state.guildProfiles.map(g=>g.guild_name),
    ...state.guilds.map(g=>g.guild_name),
    ...state.moderatorGuilds.map(g=>g.guild_name),
    ...state.challenges.map(c=>c.guild_name),
    ...state.results.flatMap(r=>[r.winner_guild,r.loser_guild]),
    state.guild?.guild_name
  ];
  const seen=new Set();
  return names.map(x=>String(x||'').trim()).filter(x=>{
    const key=normalizeGuild(x);
    if(!key||seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b)=>a.localeCompare(b));
}

function paintGuildSuggestions(list,names){
  if(!list) return;
  const clean=[...new Set((names||[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,10);
  if(!clean.length){
    list.classList.remove('open');
    list.innerHTML='';
    return;
  }
  list.innerHTML=clean.map(name=>`<button class="autocomplete-item" type="button" data-suggestion-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  list.classList.add('open');
}

function renderGuildSuggestions(input,list){
  if(!input||!list) return;
  const q=input.value.trim();
  if(q.length<2){
    list.classList.remove('open');
    list.innerHTML='';
    return;
  }
  clearTimeout(input._gvgSuggestTimer);
  input._gvgSuggestTimer=setTimeout(async()=>{
    const value=input.value.trim();
    if(!value) return;
    const names=await searchGuildSuggestions(value);
    if(input.value.trim()!==value) return;
    paintGuildSuggestions(list,names);
  },80);
}

function setupGuildAutocomplete(inputId,listId){
  const input=$(inputId),list=$(listId);
  if(!input||!list||input.dataset.autocompleteReady==='1') return;
  input.dataset.autocompleteReady='1';
  input.addEventListener('input',()=>renderGuildSuggestions(input,list));
  input.addEventListener('focus',()=>renderGuildSuggestions(input,list));
  list.addEventListener('pointerdown',e=>{
    const item=e.target.closest('[data-suggestion-value]');
    if(!item) return;
    e.preventDefault();
    input.value=item.dataset.suggestionValue||'';
    list.classList.remove('open');
    list.innerHTML='';
  });
  document.addEventListener('pointerdown',e=>{
    if(!input.parentElement.contains(e.target)){
      list.classList.remove('open');
    }
  });
}

function fillResultChallenges(){
  const sel=$('result-challenge');
  if(!sel) return;

  const current=sel.value;
  const openChallenges=state.challenges.filter(c=>String(c.status||'open')==='open');

  sel.innerHTML='<option value="">Select an active challenge</option>'+
    openChallenges.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.guild_name)} • ${escapeHtml(formatTime(c.match_time))}</option>`).join('');

  if(openChallenges.some(c=>c.id===current)) sel.value=current;
}
function fillResultGuilds(){
  setupGuildAutocomplete('result-winner','result-winner-suggestions');
  setupGuildAutocomplete('result-loser','result-loser-suggestions');
}
function selectChallengeForResult(id){
  const c=state.challenges.find(x=>x.id===id);
  if(!c)return;
  $('result-challenge').value=id;
  const challenger=String(c.guild_name||'').trim();
  const winnerInput=$('result-winner');
  const loserInput=$('result-loser');
  if(winnerInput)winnerInput.value=challenger;
  if(loserInput)loserInput.value='';
  $('result-form').scrollIntoView({behavior:'smooth',block:'center'});
}

async function uploadResultImages(files){
  if(files.length!==1)throw new Error('Exactly 1 result proof image is required.');
  if(!state.user)throw new Error('LOGIN_REQUIRED: Login required.');
  const urls=[];
  for(const file of files){
    if(file.size>MAX_IMAGE_SIZE)throw new Error('Each image must be 5 MB or smaller.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Only JPG, PNG and WEBP images are allowed.');
    const optimized=await compressImageForStorage(file,{maxDimension:1800,targetBytes:1200*1024,qualities:[0.86,0.80,0.74]});
    const ext=getUploadImageExtension(optimized);
    const path=`results/${state.user.id}/${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from(IMAGE_BUCKET).upload(path,optimized,{
      upsert:false,
      contentType:optimized.type||file.type,
      cacheControl:'31536000'
    });
    if(error)throw error;
    const {data}=db.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    if(data?.publicUrl)urls.push(data.publicUrl);
  }
  return urls;
}

async function handleChallengeSubmit(e){
  e.preventDefault();clearStatus('challenge-status');if(!guildApproved())return showStatus('challenge-status','error','Your guild is not approved or is currently banned.');if(!challengePostingOpen())return showStatus('challenge-status','error','New challenges are allowed from 10:00 AM until 11:59 PM Pakistan time. At 12:00 AM, challenges close.');
  const time=$('challenge-time').value; const weapons=[...document.querySelectorAll('input[name="weapons"]:checked')].map(x=>x.value); const skills=[...document.querySelectorAll('input[name="skills"]:checked')].map(x=>x.value); const pcAllowed=$('challenge-pc-allowed')?.value==='true';
  if(!time||!weapons.length){showStatus('challenge-status','error','Match time and at least one weapon are required.');return;}
  try{setBusy('challenge-submit',true);const {data,error}=await db.rpc('submit_gvg_challenge',{p_challenge_time:time,p_weapons:weapons,p_active_skills:skills,p_pc_allowed:pcAllowed});if(error)throw error;showStatus('challenge-status','ok',`Challenge ${data?.challenge_code||''} posted successfully. PC: ${pcAllowed?'ALLOW':'NOT ALLOW'}.`);$('challenge-form').reset();clearTimePicker();clearSectionCache('member:challenges');await loadLiveChallenges();markSectionLoaded('member:challenges');}catch(error){showStatus('challenge-status','error',humanizeError(error));}finally{setBusy('challenge-submit',false,'POST CHALLENGE');}
}

async function handleResultSubmit(e){
  // V18.5: Results may be submitted at any time for an active challenge.
  e.preventDefault();clearStatus('result-status');if(!guildApproved())return showStatus('result-status','error','Your guild is not approved or is currently banned.');
  const challengeId=$('result-challenge').value,winner=$('result-winner').value,loser=$('result-loser').value,score=$('result-score').value.trim();const files=[$('result-image-1').files[0]].filter(Boolean);
  if(!challengeId||!winner||!loser||!score)return showStatus('result-status','error','Challenge, winner, loser and score are required.'); if(normalizeGuild(winner)===normalizeGuild(loser))return showStatus('result-status','error','Winner and loser must be different.');if(files.length!==1)return showStatus('result-status','error','Upload exactly one result proof image.');
  try{setBusy('result-submit',true);const urls=await uploadResultImages(files);
    // Upload exactly one proof file. The existing production RPC may enforce its legacy 2-slot array; repeat the same URL as a compatibility pointer, never upload a second image.
    const proofUrls=urls.length===1?[urls[0],urls[0]]:urls;
    const {error}=await db.rpc('submit_gvg_result',{p_challenge_id:challengeId,p_winner_guild:winner,p_loser_guild:loser,p_score:score,p_image_urls:proofUrls});if(error)throw error;showStatus('result-status','ok','Result submitted for admin approval.');$('result-form').reset();clearSectionCache('member:');await Promise.all([loadLiveChallenges(),loadApprovedResults(),loadMyResultSubmissions()]);markSectionLoaded('member:challenges');markSectionLoaded('member:approved-results');markSectionLoaded('member:my-results');}catch(error){showStatus('result-status','error',humanizeError(error));}finally{setBusy('result-submit',false,'SUBMIT RESULT');}
}

async function loadMyResultSubmissions(){
  const target=$('my-result-list');
  if(!target) return;

  try{
    const {data,error}=await db.rpc('get_my_gvg_result_submissions');
    if(error) throw error;

    const rows=data||[];

    target.innerHTML=rows.length
      ? rows.map(r=>{
          const cls=r.status==='approved'?'status-approved':r.status==='pending'?'status-pending':'status-rejected';

          return `<div class="my-result-item">
            <div class="result-status-line">
              <div class="result-match">${escapeHtml(r.winner_guild)} <span class="muted">VS</span> ${escapeHtml(r.loser_guild)}</div>
              <span class="status-pill ${cls}">${escapeHtml(r.status)}</span>
            </div>
            <div class="result-meta">SCORE: ${escapeHtml(r.score)} • SUBMITTED: ${escapeHtml(formatDateTime(r.created_at))}</div>
            ${r.rejection_reason?`<div class="result-reason"><b>REJECTION:</b> ${escapeHtml(r.rejection_reason)}</div>`:''}
          </div>`;
        }).join('')
      : '<div class="empty">You have no result submissions yet.</div>';
  }catch(error){
    console.error(error);
    target.innerHTML='<div class="empty">Could not load your result submissions.</div>';
  }
}

async function loadApprovedResults(){
  try{const {data,error}=await db.rpc('get_gvg_approved_results');if(error)throw error;state.results=data||[];const target=$('approved-result-list');target.innerHTML=state.results.length?state.results.map(r=>`<div class="result-slot"><div class="result-teams"><div class="team win"><strong>${escapeHtml(r.winner_guild)}</strong><small>WIN</small></div><div class="vs">VS</div><div class="team loss"><strong>${escapeHtml(r.loser_guild)}</strong><small>DEFEAT</small></div></div><div class="score-line">SCORE • ${escapeHtml(r.score)}</div></div>`).join(''):'<div class="empty">No approved results yet.</div>';}catch(error){console.error(error);$('approved-result-list').innerHTML='<div class="empty">Could not load approved results.</div>';}
}

async function rpcWithTimeout(name, rpcCall, timeoutMs=8000){
  return await Promise.race([
    rpcCall(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${name} request timed out. Please refresh the page.`)),timeoutMs))
  ]);
}

function setRankingMode(mode){
  const allowed=['current-week','week-highest','all-weeks'];
  const selected=allowed.includes(mode)?mode:'current-week';
  state.rankingMode=selected;
  document.querySelectorAll('[data-ranking-mode]').forEach(button=>{
    const active=button.dataset.rankingMode===selected;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  document.querySelectorAll('.ranking-mode-panel').forEach(panel=>{
    const active=panel.id===`ranking-panel-${selected}`;
    panel.classList.toggle('active',active);
    panel.hidden=!active;
  });
  loadSectionCached(`member:ranking:${selected}`,()=>loadRanking(selected),15000);
}

function renderRankingTable(mode,rows){
  const targets={
    'current-week':{id:'ranking-current-week-table',cols:3},
    'week-highest':{id:'ranking-week-highest-table',cols:3},
    'all-weeks':{id:'ranking-all-weeks-table',cols:3}
  };
  const targetInfo=targets[mode];
  if(!targetInfo) return;
  const target=$(targetInfo.id);
  if(!target) return;
  if(!rows.length){
    const emptyText={
      'current-week':'No current-week ranking records yet.',
      'week-highest':'No historical weekly point records found yet.',
      'all-weeks':'No all-weeks point records found yet.'
    }[mode];
    target.innerHTML=`<tr><td colspan="${targetInfo.cols}">${emptyText}</td></tr>`;
    return;
  }
  target.innerHTML=rows.slice(0,10).map((r,i)=>{
    const rank=Number.isFinite(Number(r.rank_no))?Number(r.rank_no):(i+1);
    const points=Number(r.points)||0;
    const pointClass=points<0?'pos-red':'pos-green';
    return `<tr><td class="pos">${escapeHtml(rank)}</td><td><strong>${escapeHtml(r.guild_name)}</strong></td><td class="pts ${pointClass}">${escapeHtml(points)}</td></tr>`;
  }).join('');
}

async function loadRanking(mode=state.rankingMode || 'current-week'){
  const configs={
    'current-week':{rpc:'get_gvg_current_week_top10',name:'Current week ranking'},
    'week-highest':{rpc:'get_gvg_week_highest_points_top10',name:'Week highest points'},
    'all-weeks':{rpc:'get_gvg_all_weeks_top10',name:'All weeks ranking'}
  };
  const selected=configs[mode]?mode:'current-week';
  const config=configs[selected];
  const targetIds={
    'current-week':'ranking-current-week-table',
    'week-highest':'ranking-week-highest-table',
    'all-weeks':'ranking-all-weeks-table'
  };
  const target=$(targetIds[selected]);
  if(target){
    const cols=3;
    target.innerHTML=`<tr><td colspan="${cols}">Loading ${escapeHtml(config.name.toLowerCase())}…</td></tr>`;
  }
  try{
    const {data,error}=await rpcWithTimeout(config.name,()=>db.rpc(config.rpc));
    if(error) throw error;
    const rows=Array.isArray(data)?data:[];
    state.rankingCache[selected]=rows;
    renderRankingTable(selected,rows);
  }catch(error){
    console.error(`${config.name} load failed:`,error);
    if(target){
      const cols=3;
      target.innerHTML=`<tr><td colspan="${cols}">${escapeHtml(humanizeError(error))}</td></tr>`;
    }
  }
}
function syncRegisterNav(){
  const registerButton=$('nav-register'),logoutButton=$('nav-logout');
  if(!registerButton||!logoutButton) return;
  logoutButton.textContent=state.guest?'EXIT GUEST':'LOGOUT';
  if(state.guest){
    logoutButton.classList.remove('hidden');registerButton.classList.add('hidden');
  }else if(state.user){
    logoutButton.classList.remove('hidden');
    /* A logged-in leader whose registry row was removed must still be able
       to open REGISTER and recreate the guild registration. */
    registerButton.classList.toggle('hidden',Boolean(state.guild));
  }else{
    logoutButton.classList.add('hidden');
    registerButton.classList.remove('hidden');
  }
}

async function enterMember({skipGuildReload=false}={}){
  openView('member');
  await refreshMember({reloadGuild:!skipGuildReload});
  if(memberDashboardAllowed()) openMemberSection('rules');
  else setMemberAccessGate();
}
async function refreshMember({reloadGuild=true}={}){
  if(reloadGuild) await loadMyGuild();
  await renderMemberIdentity();
  // Do not prefetch hidden tabs on login. The selected tab loads its own data.
  setMemberAccessGate();
}
async function handleLogout(){cacheClear('rpc:');try{await db.auth.signOut();}catch{}state.guest=null;try{sessionStorage.removeItem('gvg_guest');}catch{}state.user=null;state.guild=null;openView('public');syncRegisterNav();$('login-password').value='';}

/* ------------------------- ADMIN ------------------------- */
async function isAdmin(){
  const {data,error}=await adminDb.rpc('is_gvg_admin'); if(error){console.error(error);return false;} return Boolean(data);
}
function setAdminPanel(loggedIn){
  $('admin-login-view')?.classList.toggle('hidden',!!loggedIn);
  $('admin-dashboard')?.classList.toggle('hidden',!loggedIn);
}
async function handleAdminLogin(e){
  e.preventDefault();
  clearStatus('admin-login-status');
  const email=$('admin-email')?.value.trim()||'';
  const password=$('admin-password')?.value||'';
  if(!email||!password){showStatus('admin-login-status','error','Admin email and password are required.');return;}
  showStatus('admin-login-status','info','Checking admin account…');
  setBusy('admin-login-submit',true,'LOGIN AS ADMIN');
  try{
    const {data,error}=await adminDb.auth.signInWithPassword({email,password,options:{captchaToken:await getCaptchaToken('admin')}});
    if(error)throw error;
    const ok=await isAdmin();
    if(!ok){
      await adminDb.auth.signOut();
      throw new Error('This account is not an active 7TH UNIVERSE admin.');
    }
    state.adminUser=data.user;
    state.adminOk=true;
    clearSectionCache('admin:');
    setAdminPanel(true);
    showStatus('admin-status','ok','Admin login successful.');
    openView('admin');
    openAdminSection('guilds');
    await refreshAdmin();
  }catch(error){
    setAdminPanel(false);
    showStatus('admin-login-status','error',humanizeError(error));
  }finally{
    setBusy('admin-login-submit',false,'LOGIN AS ADMIN');
  }
}
async function restoreAdmin(){
  const {data:{session}}=await adminDb.auth.getSession();
  if(!session){
    state.adminUser=null;
    state.adminOk=false;
    setAdminPanel(false);
    return;
  }
  state.adminUser=session.user;
  state.adminOk=await isAdmin();
  clearSectionCache('admin:');
  setAdminPanel(state.adminOk);
  if(state.adminOk){openView('admin');openAdminSection('guilds');await refreshAdmin();}
}
async function refreshAdmin(){
  if(!state.adminOk)return;
  $('admin-session-label').textContent=`${state.adminUser?.email||''} • Admin session active`;
  // Admin data is fetched only for the visible section via openAdminSection().
}
function guildStatusLabel(g){ if(g.is_banned || (g.ban_until&&new Date(g.ban_until)>new Date()))return 'BANNED'; return String(g.approval_status||'').toUpperCase(); }
function guildStatusClass(g){ if(g.is_banned || (g.ban_until&&new Date(g.ban_until)>new Date()))return 'status-banned'; if(g.approval_status==='approved')return 'status-approved'; if(g.approval_status==='pending')return 'status-pending'; return 'status-rejected'; }
function filteredGuilds(){const q=($('admin-guild-search').value||'').trim().toLowerCase();if(!q)return state.guilds;return state.guilds.filter(g=>[g.guild_name,g.contact,g.approval_status,g.email_list].some(v=>String(v||'').toLowerCase().includes(q)));}
function guildMenu(g){return `<div class="menu-wrap"><button class="dots-btn" type="button" data-menu-button="${escapeHtml(g.id)}">⋮</button><div class="dots-menu" id="menu-${escapeHtml(g.id)}"><button type="button" data-action="guild-info" data-id="${escapeHtml(g.id)}">GUILD INFO</button><button type="button" data-action="guild-edit" data-id="${escapeHtml(g.id)}">EDIT</button><button class="danger" type="button" data-action="guild-remove" data-id="${escapeHtml(g.id)}">REMOVE GUILD</button></div></div>`;}
function renderGuildTable(targetId,rows){const target=$(targetId);if(!target)return;target.innerHTML=rows.length?rows.map(g=>`<tr><td><div class="guild-row"><div class="guild-main"><strong>${escapeHtml(g.guild_name)}</strong><span>${escapeHtml(g.leader_count)} leader(s)</span></div>${guildMenu(g)}</div></td><td><span class="status-pill ${guildStatusClass(g)}">${escapeHtml(guildStatusLabel(g))}</span></td><td><span class="muted" style="font-size:8px">⋮ MENU</span></td></tr>`).join(''):'<tr><td colspan="3">No matching guilds.</td></tr>';}
async function loadAdminGuilds(){
  try{const {data,error}=await adminDb.rpc('admin_get_guild_directory');if(error)throw error;state.guilds=data||[];const pending=state.guilds.filter(g=>String(g.approval_status)==='pending');renderGuildTable('pending-guild-table',pending);renderGuildTable('all-guild-table',filteredGuilds());}catch(error){showStatus('admin-status','error',humanizeError(error));}
}
function leaderArray(g){ try{return Array.isArray(g.leaders)?g.leaders:(typeof g.leaders==='string'?JSON.parse(g.leaders):[]);}catch{return [];} }
function findGuild(id){return state.guilds.find(g=>g.id===id)||null;}
function openModal(html, extraClass=''){const modal=$('modal');modal.classList.remove('hof-detail-modal');if(extraClass)modal.classList.add(extraClass);modal.innerHTML=html;$('modal-backdrop').classList.add('open');}
function closeModal(){$('modal-backdrop').classList.remove('open');$('modal').innerHTML='';$('modal').classList.remove('hof-detail-modal');}
function adminGuildInfo(g){
  const leaders=leaderArray(g);

  const leaderHtml=leaders.length
    ? leaders.map((l,i)=>{
        const status=String(l.approval_status||'pending');
        const cls=status==='approved'?'status-approved':status==='pending'?'status-pending':'status-rejected';

        return `<div class="leader-card">
          <div class="leader-title">LEADER ${i+1}</div>
          <div class="leader-meta">${escapeHtml(l.email||'Email unavailable')}<br>${escapeHtml(formatContact(l.contact||''))}</div>
          <div style="margin-top:8px"><span class="status-pill ${cls}">${escapeHtml(status)}</span></div>
          <div class="modal-actions">
            ${status==='pending'
              ? `<button class="btn btn-green btn-small" type="button" data-action="approve-leader" data-id="${escapeHtml(l.id)}">APPROVE LEADER</button><button class="btn btn-red btn-small" type="button" data-action="reject-leader" data-id="${escapeHtml(l.id)}">REJECT LEADER</button>`
              : status==='rejected'
                ? `<button class="btn btn-gold btn-small" type="button" data-action="approve-leader" data-id="${escapeHtml(l.id)}">APPROVE LEADER</button>`
                : ''
            }
            <button class="btn btn-small btn-gold" type="button" data-action="reset-password" data-email="${escapeHtml(l.email||'')}">RESET PASSWORD</button>
            <button class="btn btn-small btn-gold" type="button" data-action="set-temp-password" data-id="${escapeHtml(l.id)}" data-guild="${escapeHtml(g.guild_name)}">SET TEMP PASSWORD</button>
            <button class="btn btn-small btn-red" type="button" data-action="remove-leader" data-id="${escapeHtml(l.id)}" data-guild="${escapeHtml(g.guild_name)}">REMOVE THIS LEADER</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">No linked leader emails.</div>';

  openModal(`<div class="modal-head"><div><div class="kicker">Guild Information</div><h3>${escapeHtml(g.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div><div class="info-grid"><div class="info-box"><small>Guild Status</small><strong>${escapeHtml(guildStatusLabel(g))}</strong></div><div class="info-box"><small>Current Points</small><strong>${escapeHtml(g.points)}</strong></div><div class="info-box"><small>Leader Count</small><strong>${escapeHtml(g.leader_count)}</strong></div><div class="info-box"><small>Registered</small><strong>${escapeHtml(formatDateTime(g.created_at))}</strong></div></div><div class="kicker" style="margin-top:13px">LEADERS</div><div class="leader-list">${leaderHtml}</div><div class="divider"></div><div class="modal-actions"><button class="btn btn-red" type="button" data-action="guild-remove" data-id="${escapeHtml(g.id)}">REMOVE WHOLE GUILD</button></div>`);
}

function adminGuildEdit(g){
  const originalPoints=Number(g.points)||0;
  const leaders=leaderArray(g);
  const editableLeaders=leaders.filter(l=>l && l.id);
  const first=editableLeaders[0]||{id:g.id,contact:g.contact||'',email:''};
  const leaderOptions=editableLeaders.length?editableLeaders.map((l,i)=>`<option value="${escapeHtml(l.id)}" data-contact="${escapeHtml(l.contact||'')}" data-email="${escapeHtml(l.email||'')}">LEADER ${i+1} • ${escapeHtml(l.email||'Email unavailable')}</option>`).join(''):`<option value="${escapeHtml(g.id)}" data-contact="${escapeHtml(g.contact||'')}">REGISTERED RECORD</option>`;
  openModal(`<div class="modal-head"><div><div class="kicker">Edit Guild</div><h3>${escapeHtml(g.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div><form id="edit-guild-form"><div class="field-grid"><label class="full">LEADER RECORD<select id="edit-leader-id">${leaderOptions}</select></label><label>CONTACT NUMBER<input id="edit-contact" type="tel" value="${escapeHtml(first.contact||g.contact||'')}" required /></label><label class="full">CURRENT WEEK POINTS (MANUAL ADJUSTMENT)<input id="edit-points" type="number" step="1" value="${escapeHtml(g.points)}" required /></label><label class="full">LEADER APPROVAL STATUS<select id="edit-status"><option value="approved" ${editableLeaders[0]?.approval_status==='approved'?'selected':''}>Approved</option><option value="pending" ${editableLeaders[0]?.approval_status==='pending'?'selected':''}>Pending</option><option value="rejected" ${editableLeaders[0]?.approval_status==='rejected'?'selected':''}>Rejected</option></select></label></div><div class="hint">Select the individual leader whose contact/status you want to edit. Weekly points are shared by the guild. Changing CURRENT WEEK POINTS manually changes the ranking total but does not create a match-result point event; only use it for an intentional penalty/correction. Contact/status-only edits should leave the displayed points unchanged.</div><div class="modal-actions"><button class="btn btn-primary" type="submit">SAVE CONTACT / STATUS / POINTS</button><button class="btn btn-gold" id="edit-reset-password" type="button">CHANGE PASSWORD VIA RESET EMAIL</button><button class="btn btn-ghost" type="button" data-action="guild-info" data-id="${escapeHtml(g.id)}">CANCEL</button></div><div id="edit-status-message" class="status"></div></form>`);
  const leaderSelect=$('edit-leader-id');
  const syncSelectedLeader=()=>{
    const o=leaderSelect.options[leaderSelect.selectedIndex];
    $('edit-contact').value=o?.dataset?.contact||'';
    const leader=editableLeaders.find(l=>String(l.id)===String(leaderSelect.value));
    if(leader && $('edit-status')) $('edit-status').value=leader.approval_status||'pending';
  };
  leaderSelect.addEventListener('change',syncSelectedLeader);
  syncSelectedLeader();
  $('edit-reset-password').addEventListener('click',()=>{const o=leaderSelect.options[leaderSelect.selectedIndex];resetLeaderPassword(o?.dataset?.email||'');});
  {const tempBtn=document.createElement('button');tempBtn.type='button';tempBtn.className=$('edit-reset-password').className;tempBtn.textContent='SET TEMP PASSWORD';tempBtn.addEventListener('click',()=>setLeaderTempPassword(leaderSelect.value,g.guild_name));$('edit-reset-password').after(tempBtn);}
  $('edit-guild-form').addEventListener('submit',async(event)=>{event.preventDefault();const leaderId=leaderSelect.value,contact=$('edit-contact').value.trim(),points=Number($('edit-points').value),status=$('edit-status').value;if(!Number.isInteger(points))return showStatus('edit-status-message','error','Points must be a whole number.');try{const {error}=await adminDb.rpc('admin_update_guild_controls',{p_guild_id:leaderId,p_contact:contact,p_points:points===originalPoints?null:points,p_approval_status:status});if(error)throw error;invalidateResultViewCaches();closeModal();showStatus('admin-status','ok','Guild controls updated. Member ranking cache has been invalidated.');await loadAdminGuilds();}catch(error){showStatus('edit-status-message','error',humanizeError(error));}});
}

async function resetLeaderPassword(email){
  if(!email)return;
  if(!await appConfirm(`Send a password reset email to ${email}?`,{title:'Reset leader password',confirmText:'SEND RESET EMAIL'}))return;
  try{
    const redirectTo=`${window.location.origin}${window.location.pathname}`;
    const {error}=await adminDb.auth.resetPasswordForEmail(email,{redirectTo,captchaToken:await getCaptchaToken('admin-reset')});
    if(error)throw error;
    await appAlert('Password reset email sent.',{title:'Email requested',confirmText:'GOT IT'});
  }catch(error){await appAlert(humanizeError(error),{title:'Could not send email',danger:true,confirmText:'CLOSE'});}
}
async function removeGuild(id){
  const g=findGuild(id);if(!g)return;
  const ok=await appConfirm(`Remove the guild registration for:\n\n${g.guild_name}\n\nHistorical challenge and result records will remain.`,{title:'Remove guild registration',confirmText:'REMOVE GUILD',danger:true});
  if(!ok)return;
  try{
    const {error}=await adminDb.rpc('admin_remove_guild',{p_guild_id:id});if(error)throw error;
    clearSectionCache('member:');
    invalidateGuildDirectoryCaches();
    closeModal();showStatus('admin-status','ok','Guild removed from the active registry. Historical challenge/result records remain.');
    await loadAdminGuilds();
  }catch(error){showStatus('admin-status','error',humanizeError(error));}
}
async function setLeaderApproval(leaderId,status){
  let found=null;

  for(const guild of state.guilds){
    const leader=leaderArray(guild).find(l=>String(l.id)===String(leaderId));
    if(leader){found={guild,leader};break;}
  }

  if(!found) return;

  try{
    const {error}=await adminDb.rpc('admin_update_guild_controls',{
      p_guild_id:leaderId,
      p_contact:found.leader.contact||'',
      p_points:null,
      p_approval_status:status
    });

    if(error) throw error;

    closeModal();
    invalidateGuildDirectoryCaches();
    showStatus('admin-status','ok',`Leader ${status}.`);
    await loadAdminGuilds();
  }catch(error){
    showStatus('admin-status','error',humanizeError(error));
  }
}

async function removeLeader(leaderId,guildName){
  const ok=await appConfirm(`Remove this leader from ${guildName||'the guild'}?\n\nThe account remains available, but the database must release its active contact link when the removal is processed.`,{title:'Remove guild leader',confirmText:'REMOVE LEADER',danger:true});
  if(!ok)return;

  try{
    const {error}=await adminDb.rpc('admin_remove_guild_leader',{p_guild_id:leaderId});
    if(error) throw error;

    closeModal();
    clearSectionCache('member:');
    invalidateGuildDirectoryCaches();
    showStatus('admin-status','ok','Leader registration removed. The Auth account remains available for re-registration.');
    await loadAdminGuilds();
  }catch(error){
    showStatus('admin-status','error',humanizeError(error));
  }
}

function preferredResultProofUrls(imageUrls){
  let urls=imageUrls;
  if(typeof urls==='string'){try{urls=JSON.parse(urls);}catch{urls=[];}}
  if(!Array.isArray(urls)||!urls.length)return [];
  // Legacy records had [challenge screenshot, actual result proof]; newer one-upload records contain one URL or two copies of the same URL.
  return [urls.length>=2?urls[1]:urls[0]];
}

async function loadAdminResults(){
  try{const {data,error}=await adminDb.rpc('admin_get_results');if(error)throw error;const rows=data||[];state.results=rows;const target=$('admin-result-table');target.innerHTML=rows.length?rows.map(r=>{const imgs=preferredResultProofUrls(r.image_urls);const gallery=imgs.length?`<details class="proof-details"><summary>OPEN RESULT PROOF</summary><div class="proof-gallery">${imgs.map((u,i)=>`<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><span class="proof-tag">RESULT PROOF</span><img data-proof-src="${escapeHtml(u)}" loading="lazy" decoding="async" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} result proof" /></a>`).join('')}</div></details>`:'<span class="muted">No proof</span>';return `<tr><td><strong>${escapeHtml(r.winner_guild)}</strong><div class="muted" style="margin-top:3px">DEFEAT</div><strong>${escapeHtml(r.loser_guild)}</strong></td><td>${escapeHtml(r.score)}</td><td><strong style="font-size:9px">${escapeHtml(formatDateTime(r.created_at))}</strong><div class="muted" style="margin-top:4px;font-size:7px">PAKISTAN TIME</div></td><td>${gallery}<div style="margin-top:6px"><span class="status-pill ${r.status==='approved'?'status-approved':r.status==='pending'?'status-pending':'status-rejected'}">${escapeHtml(r.status)}</span></div></td><td>${r.status==='pending'?`<div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn-green btn-small" type="button" data-action="approve-result" data-id="${escapeHtml(r.id)}">APPROVE</button><button class="btn btn-red btn-small" type="button" data-action="reject-result" data-id="${escapeHtml(r.id)}">REJECT</button></div>`:'—'}</td></tr>`;}).join(''):'<tr><td colspan="4">No result submissions.</td></tr>';}catch(error){showStatus('admin-status','error',humanizeError(error));}
}
async function approveResult(id){try{const {error}=await adminDb.rpc('admin_approve_result',{p_result_id:id});if(error)throw error;invalidateResultViewCaches();showStatus('admin-status','ok','Result approved. The database point-award function completed; rankings will reload on the next member view. WhatsApp delivery is handled by the webhook bridge.');clearSectionCache('admin:');await Promise.all([loadAdminResults(),loadAdminGuilds()]);markSectionLoaded('admin:results');markSectionLoaded('admin:guilds');}catch(error){showStatus('admin-status','error',humanizeError(error));}}
async function rejectResult(id){
  const reason=await appPrompt('Add a short reason for rejecting this result.','Proof or result issue',{title:'Reject result',confirmText:'REJECT RESULT',placeholder:'Describe the issue...',required:true,danger:true});
  if(reason===null)return;
  try{const {error}=await adminDb.rpc('admin_reject_result',{p_result_id:id,p_reason:reason.trim()||'Rejected by admin'});if(error)throw error;invalidateResultViewCaches();showStatus('admin-status','ok','Result rejected. The challenge is open again while it is still inside its cycle.');clearSectionCache('admin:results');await loadAdminResults();markSectionLoaded('admin:results');}catch(error){showStatus('admin-status','error',humanizeError(error));}
}

async function handleBan(e){e.preventDefault();clearStatus('ban-status');const guild=$('ban-guild').value.trim(),duration=$('ban-duration').value,reason=$('ban-reason').value.trim()||'Rule violation';if(!guild)return showStatus('ban-status','error','Enter the guild name to ban.');let until=null;const now=new Date();if(duration==='1h')until=new Date(now.getTime()+60*60*1000);if(duration==='6h')until=new Date(now.getTime()+6*60*60*1000);if(duration==='1d')until=new Date(now.getTime()+24*60*60*1000);if(duration==='3d')until=new Date(now.getTime()+3*24*60*60*1000);if(duration==='7d')until=new Date(now.getTime()+7*24*60*60*1000);try{const {error}=await adminDb.rpc('admin_ban_guild_identity',{p_guild_name:guild,p_contact:null,p_ban_until:until?until.toISOString():null,p_reason:reason});if(error)throw error;showStatus('ban-status','ok',until?`Guild banned until ${formatDateTime(until)}.`:'Guild permanently banned.');e.target.reset();$('ban-reason').value='Rule violation';await Promise.all([loadAdminGuilds(),loadBans()]);}catch(error){showStatus('ban-status','error',humanizeError(error));}}
async function loadBans(){
  try{const {data,error}=await adminDb.rpc('admin_get_active_bans');if(error)throw error;state.bans=data||[];const target=$('ban-list');target.innerHTML=state.bans.length?state.bans.map(b=>`<div class="challenge-card"><div class="meta-row"><div><div class="name">${escapeHtml(b.guild_name||'Identity ban')}</div><div class="subtle">${escapeHtml(formatContact(b.contact||''))}</div></div><span class="badge badge-red">${b.ban_until?escapeHtml(formatDateTime(b.ban_until)):'PERMANENT'}</span></div><div class="contact-line"><span class="muted" style="font-size:8px">${escapeHtml(b.reason||'Rule violation')}</span><button class="btn btn-green btn-small" type="button" data-action="unban-identity" data-guild="${escapeHtml(b.guild_name||'')}" data-contact="${escapeHtml(b.contact||'')}">UNBAN</button></div></div>`).join(''):'<div class="empty">No active bans.</div>';}catch(error){console.error(error);}
}
async function unbanIdentity(guild,contact){try{const {error}=await adminDb.rpc('admin_unban_guild_identity',{p_guild_name:guild||null,p_contact:contact||null});if(error)throw error;showStatus('admin-status','ok','Guild unbanned.');await Promise.all([loadAdminGuilds(),loadBans()]);}catch(error){showStatus('admin-status','error',humanizeError(error));}}

function weeklyDayDefinitions(weekStart){
  const start=new Date(weekStart);
  const labels=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const keys=['sunday_matches','monday_matches','tuesday_matches','wednesday_matches','thursday_matches','friday_matches','saturday_matches'];
  return labels.map((label,i)=>({label,key:keys[i],date:new Date(start.getTime()+i*24*60*60*1000)}));
}

function openAdminSection(name){
  const section=['guilds','name-changes','results','ban','trophies','rules'].includes(name)?name:'guilds';
  document.querySelectorAll('.admin-panel-view').forEach(el=>{
    const active=el.id===`admin-section-${section}`;
    el.classList.toggle('active',active);
    el.style.display=active?'block':'none';
  });
  document.querySelectorAll('[data-admin-section]').forEach(btn=>{
    const active=btn.dataset.adminSection===section;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',active?'true':'false');
  });
  if(section==='guilds') loadSectionCached('admin:guilds',loadAdminGuilds,15000);
  if(section==='name-changes') loadSectionCached('admin:name-changes',loadAdminGuildNameChangeRequests,15000);
  if(section==='results') loadSectionCached('admin:results',loadAdminResults,10000);
  if(section==='ban') loadSectionCached('admin:bans',loadBans,15000);
  if(section==='trophies') loadSectionCached('admin:trophies',loadHofAdmin,20000);
  if(section==='rules') loadAdminRules();
  window.scrollTo({top:0,behavior:'smooth'});
}


/* ------------------------- LIMITED MODERATOR ------------------------- */
async function isModerator(){
  const {data,error}=await moderatorDb.rpc('is_gvg_moderator');
  if(error){console.error('Moderator role check failed:',error);return false;}
  return Boolean(data);
}
function setModeratorPanel(loggedIn){
  $('moderator-login-view')?.classList.toggle('hidden',!!loggedIn);
  $('moderator-dashboard')?.classList.toggle('hidden',!loggedIn);
}
async function handleModeratorLogin(e){
  e.preventDefault();clearStatus('moderator-login-status');
  const email=$('moderator-email').value.trim().toLowerCase();
  const password=$('moderator-password').value;
  if(!email||!password)return showStatus('moderator-login-status','error','Moderator email and password are required.');
  setBusy('moderator-login-submit',true,'LOGIN AS MODERATOR');
  try{
    const {data,error}=await moderatorDb.auth.signInWithPassword({email,password,options:{captchaToken:await getCaptchaToken('moderator')}});
    if(error)throw error;
    const ok=await isModerator();
    if(!ok){await moderatorDb.auth.signOut();throw new Error('This account is not an active moderator. Admin accounts use the separate Admin Access button.');}
    state.moderatorUser=data.user;state.moderatorOk=true;setModeratorPanel(true);openView('moderator');
    $('moderator-session-label').textContent=`${state.moderatorUser?.email||''} • Limited moderator access`;
    $('moderator-password').value='';showStatus('moderator-results-status','ok','Moderator login successful. Review pending results or manage guild approvals.');
    clearSectionCache('moderator:');
    openModeratorSection('results');
  }catch(error){state.moderatorUser=null;state.moderatorOk=false;setModeratorPanel(false);showStatus('moderator-login-status','error',humanizeError(error));}
  finally{setBusy('moderator-login-submit',false,'LOGIN AS MODERATOR');}
}
async function restoreModerator(){
  const {data:{session}}=await moderatorDb.auth.getSession();
  if(!session){state.moderatorUser=null;state.moderatorOk=false;setModeratorPanel(false);return;}
  state.moderatorUser=session.user;state.moderatorOk=await isModerator();
  clearSectionCache('moderator:');
  if(!state.moderatorOk){await moderatorDb.auth.signOut();state.moderatorUser=null;setModeratorPanel(false);return;}
  setModeratorPanel(true);$('moderator-session-label').textContent=`${state.moderatorUser?.email||''} • Limited moderator access`;
  clearSectionCache('moderator:');
  openModeratorSection('results');
}
async function handleModeratorLogout(){
  try{await moderatorDb.auth.signOut();}catch{}
  state.moderatorUser=null;state.moderatorOk=false;state.moderatorGuilds=[];state.moderatorResults=[];
  setModeratorPanel(false);$('moderator-password').value='';openView(state.user?'member':'public');
}
async function loadModeratorData(){
  if(!state.moderatorOk)return;
  await Promise.all([loadModeratorResults(),loadModeratorGuilds()]);
}
function openModeratorSection(name){
  const section=['results','guilds'].includes(name)?name:'results';
  document.querySelectorAll('[data-moderator-section]').forEach(btn=>{
    const active=btn.dataset.moderatorSection===section;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',active?'true':'false');
  });
  document.querySelectorAll('.moderator-section-view').forEach(panel=>{
    const active=panel.id===`moderator-section-${section}`;
    panel.classList.toggle('active',active);
    panel.style.display=active?'block':'none';
  });
  if(section==='results')loadSectionCached('moderator:results',loadModeratorResults,10000);
  if(section==='guilds')loadSectionCached('moderator:guilds',loadModeratorGuilds,15000);
}
function moderatorStatusLabel(g){
  if(g.is_banned || (g.ban_until && new Date(g.ban_until)>new Date()))return 'BANNED';
  return String(g.approval_status||'unknown').toUpperCase();
}
function renderModeratorGuilds(){
  const target=$('moderator-guild-table');if(!target)return;
  const term=String($('moderator-guild-search')?.value||'').trim().toLowerCase();
  const rows=(state.moderatorGuilds||[]).filter(g=>!term||String(g.guild_name||'').toLowerCase().includes(term));
  target.innerHTML=rows.length?rows.map(g=>{
    const norm=escapeHtml(g.guild_name_normalized||'');
    const status=moderatorStatusLabel(g);
    const isBanned=Boolean(g.is_banned || (g.ban_until && new Date(g.ban_until)>new Date()));
    const cls=isBanned?'status-banned':g.approval_status==='approved'?'status-approved':g.approval_status==='pending'?'status-pending':'status-rejected';
    const approve=g.approval_status==='pending'?`<button class="btn btn-green moderator-action-btn" type="button" data-action="mod-approve-guild" data-guild="${norm}">APPROVE</button>`:'';
    return `<tr><td><div class="moderator-guild-name">${escapeHtml(g.guild_name)}</div><div class="muted" style="margin-top:4px">${escapeHtml(g.leader_count||0)} leader(s)</div></td><td><span class="status-pill ${cls}">${escapeHtml(status)}</span></td><td><div class="moderator-actions">${approve}<button class="btn btn-red moderator-action-btn" type="button" data-action="mod-remove-guild" data-guild="${norm}">REMOVE</button></div></td></tr>`;
  }).join(''):'<tr><td colspan="3">No guilds found.</td></tr>';
}
async function loadModeratorGuilds(){
  const target=$('moderator-guild-table');
  try{
    if(target)target.innerHTML='<tr><td colspan="3">Loading guilds...</td></tr>';
    const {data,error}=await moderatorDb.rpc('moderator_get_guild_directory');if(error)throw error;
    state.moderatorGuilds=data||[];renderModeratorGuilds();
  }catch(error){console.error(error);showStatus('moderator-guild-status','error',humanizeError(error));}
}
async function loadModeratorResults(){
  const target=$('moderator-result-table');if(!target)return;
  target.innerHTML='<tr><td colspan="5">Loading result submissions...</td></tr>';
  try{
    const {data,error}=await moderatorDb.rpc('moderator_get_results');if(error)throw error;
    const rows=data||[];state.moderatorResults=rows;
    target.innerHTML=rows.length?rows.map(r=>{
      const imgs=preferredResultProofUrls(r.image_urls);
      const gallery=imgs.length?`<details class="proof-details"><summary>OPEN RESULT PROOF</summary><div class="proof-gallery">${imgs.map((u,i)=>`<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><span class="proof-tag">RESULT PROOF</span><img data-proof-src="${escapeHtml(u)}" loading="lazy" decoding="async" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} result proof" /></a>`).join('')}</div></details>`:'<span class="muted">No proof</span>';
      const status=String(r.status||'unknown').toLowerCase();
      const actions=status==='pending'?`<div class="moderator-actions"><button class="btn btn-green btn-small moderator-action-btn" type="button" data-action="mod-approve-result" data-id="${escapeHtml(r.id)}">APPROVE</button><button class="btn btn-red btn-small moderator-action-btn" type="button" data-action="mod-reject-result" data-id="${escapeHtml(r.id)}">REJECT</button></div>`:'—';
      return `<tr><td><strong>${escapeHtml(r.winner_guild)}</strong><div class="muted" style="margin:3px 0">DEFEAT</div><strong>${escapeHtml(r.loser_guild)}</strong></td><td>${escapeHtml(r.score)}</td><td><strong style="font-size:9px">${escapeHtml(formatDateTime(r.created_at))}</strong><div class="muted" style="margin-top:4px;font-size:7px">PAKISTAN TIME</div></td><td>${gallery}<div style="margin-top:6px"><span class="status-pill ${status==='approved'?'status-approved':status==='pending'?'status-pending':'status-rejected'}">${escapeHtml(status)}</span></div>${r.rejection_reason?`<div class="muted" style="margin-top:5px">${escapeHtml(r.rejection_reason)}</div>`:''}</td><td>${actions}</td></tr>`;
    }).join(''):'<tr><td colspan="5">No result submissions.</td></tr>';
  }catch(error){console.error(error);target.innerHTML=`<tr><td colspan="5">${escapeHtml(humanizeError(error))}</td></tr>`;showStatus('moderator-results-status','error',humanizeError(error));}
}
async function moderatorApproveGuild(norm){
  const g=state.moderatorGuilds.find(x=>String(x.guild_name_normalized)===String(norm));if(!g)return;
  if(!await appConfirm(`Approve this registered guild?\n\n${g.guild_name}`,{title:'Approve guild registration',confirmText:'APPROVE GUILD'}))return;
  try{const {error}=await moderatorDb.rpc('moderator_approve_guild',{p_guild_name_normalized:norm});if(error)throw error;invalidateGuildDirectoryCaches();showStatus('moderator-guild-status','ok',`${g.guild_name} has been approved.`);await loadModeratorGuilds();}
  catch(error){showStatus('moderator-guild-status','error',humanizeError(error));}
}
async function moderatorRemoveGuild(norm){
  const g=state.moderatorGuilds.find(x=>String(x.guild_name_normalized)===String(norm));if(!g)return;
  if(!await appConfirm(`Remove this guild registration?\n\n${g.guild_name}\n\nHistorical challenge/result records may remain.`,{title:'Remove guild registration',confirmText:'REMOVE GUILD',danger:true}))return;
  try{const {error}=await moderatorDb.rpc('moderator_remove_guild',{p_guild_name_normalized:norm});if(error)throw error;invalidateGuildDirectoryCaches();showStatus('moderator-guild-status','ok',`${g.guild_name} was removed from the guild registry.`);await loadModeratorGuilds();}
  catch(error){showStatus('moderator-guild-status','error',humanizeError(error));}
}
async function moderatorApproveResult(id){
  const row=state.moderatorResults.find(r=>String(r.id)===String(id));if(!row)return;
  if(!await appConfirm(`Approve this result and award weekly points?\n\n${row.winner_guild} defeated ${row.loser_guild}\nScore: ${row.score}\n\nThe existing weekly point-award function will run.`,{title:'Approve match result',confirmText:'APPROVE & AWARD POINTS'}))return;
  try{
    const {error}=await moderatorDb.rpc('moderator_approve_result',{p_result_id:id});if(error)throw error;
    invalidateResultViewCaches();
    showStatus('moderator-results-status','ok','Result approved. The database point-award function completed; member rankings will reload after you return. WhatsApp delivery runs through the webhook bridge.');
    await loadModeratorResults();
  }catch(error){showStatus('moderator-results-status','error',humanizeError(error));}
}
async function moderatorRejectResult(id){
  const reason=await appPrompt('Add a short reason for rejecting this result.','Proof or result issue',{title:'Reject result',confirmText:'REJECT RESULT',placeholder:'Describe the issue...',required:true,danger:true});if(reason===null)return;
  try{
    const {error}=await moderatorDb.rpc('moderator_reject_result',{p_result_id:id,p_reason:reason.trim()||'Rejected by moderator'});if(error)throw error;
    invalidateResultViewCaches();
    showStatus('moderator-results-status','ok','Result rejected. The challenge was reopened when eligible.');
    await loadModeratorResults();
  }catch(error){showStatus('moderator-results-status','error',humanizeError(error));}
}


/* ---------------- GUILD PROFILES, 40 BADGES & HALL OF FAME ---------------- */
/* ===== v1.11: 100-badge achievement system (20 missions x 5 tiers) ===== */
const GVG_TIER_NAMES=['BRONZE','SILVER','GOLD','PLATINUM','DIAMOND'];
const GVG_TIER_KEYS=['bronze','silver','gold','platinum','diamond'];
const GVG_MISSIONS=[
 {n:1,name:'FRONTLINE VETERAN',req:t=>`Play ${t} approved matches`},
 {n:2,name:'VICTORY LEGION',req:t=>`Win ${t} matches`},
 {n:3,name:'ELITE SEASONS',req:t=>`Finish ${t} completed week${t>1?'s':''} in the Top 10 (3+ matches each)`},
 {n:4,name:'WEEK WARLORD',req:t=>`Win ${t} matches in a single week`},
 {n:5,name:'WEEKLY CHAMPION',req:t=>`Be crowned Weekly Champion ${t} time${t>1?'s':''}`},
 {n:6,name:'MONTHLY CHAMPION',req:t=>`Be crowned Monthly Champion ${t} time${t>1?'s':''}`},
 {n:7,name:'IRON WALL',req:t=>`Finish ${t} week${t>1?'s':''} unbeaten (3+ matches, zero losses)`},
 {n:8,name:'SUMMIT POINTS',req:t=>`Score ${t}+ points in a single week`},
 {n:9,name:'CONQUEROR',req:t=>`Defeat ${t} different guilds`},
 {n:10,name:'WORLD TOUR',req:t=>`Face ${t} different guilds`},
 {n:11,name:'FLAWLESS DAYS',req:t=>`Earn ${t} Flawless Day${t>1?'s':''} (3+ matches in a day, all won)`},
 {n:12,name:'RESILIENCE',req:t=>`Win ${t} match${t>1?'es':''} right after a loss`},
 {n:13,name:'NEMESIS',req:t=>`Defeat the same rival ${t} times`},
 {n:14,name:'PODIUM FINISH',req:t=>`Finish ${t} completed week${t>1?'s':''} in the Top 3 (3+ matches each)`},
 {n:15,name:'PRECISION',req:(t,min)=>`Hold a ${t}% win rate over ${min}+ matches`},
 {n:16,name:'WINNING STREAK',req:t=>`Win ${t} matches in a row`},
 {n:17,name:'GIANT SLAYER',req:t=>`Beat ${t} guild${t>1?'s':''} that finished a week in the Top 10`},
 {n:18,name:'ENDURANCE',req:t=>`Play 3+ matches for ${t} weeks in a row`},
 {n:19,name:'LOYALTY',req:t=>`Be active on ${t} different days`},
 {n:20,name:'UNIVERSE LEGEND',req:t=>`Unlock ${t} badges across missions 1 to 19`}
];
function badgeLegacyFile(n){
  const tier=((n-1)%5)+1, set=Math.floor((n-1)/20)+1, row=Math.floor(((n-1)%20)/5)+1;
  return `./assets/badges/badge_${String(n).padStart(3,'0')}_set${set}_row${row}_${GVG_TIER_KEYS[tier-1]}.png`;
}
/* Small WebP badges (about 19 KB each) are used when they exist in assets/b/; otherwise the original PNG is loaded automatically. */
function badgeFile(mission,tier){
  const n=(mission-1)*5+tier;
  return `./assets/b/b${String(n).padStart(3,'0')}.webp`;
}
document.addEventListener('error',e=>{
  const img=e.target;
  if(!img||img.tagName!=='IMG'||img.dataset.fb) return;
  const m=/\/assets\/b\/b(\d{3})\.webp/.exec(img.getAttribute('src')||'');
  if(m){img.dataset.fb='1';img.src=badgeLegacyFile(Number(m[1]));}
},true);
function applyBadgeData(data){
  const d=Array.isArray(data)?data[0]:data;
  state.badgeConfig=Array.isArray(d?.config)?d.config:[];
  state.badgeTierMap={};
  state.badgeConfig.forEach(r=>{(state.badgeTierMap[r.m]=state.badgeTierMap[r.m]||[])[Number(r.t)-1]=r;});
  state.badgeByGuild=new Map((Array.isArray(d?.guilds)?d.guilds:[]).map(g=>[normalizeGuild(g.n),g]));
}
function guildBadgeInfo(p){return state.badgeByGuild?.get(normalizeGuild(p?.guild_name_normalized||p?.guild_name||''))||null;}
function titleTierFromText(t){const x=String(t||'');return x.startsWith('🥉')?1:x.startsWith('🥈')?2:x.startsWith('🥇')?3:x.startsWith('💠')?4:x.startsWith('💎')?5:0;}
function titleChipMarkup(text){
  if(!text) return '';
  const tier=titleTierFromText(text);
  return `<span class="rank-chip ${tier?`tier-${tier}`:'champ'}">${escapeHtml(text)}</span>`;
}
function topBadgeStripMarkup(info){
  if(!info) return '';
  const list=GVG_MISSIONS.map((m,i)=>({m,t:Number(info.t?.[i])||0})).filter(x=>x.t>0).sort((a,b)=>b.t-a.t||a.m.n-b.m.n).slice(0,4);
  if(!list.length) return '';
  return `<div class="badge-strip">${list.map(x=>`<img src="${badgeFile(x.m.n,x.t)}" alt="${escapeHtml(x.m.name)} ${GVG_TIER_NAMES[x.t-1]}" title="${escapeHtml(x.m.name)} · ${GVG_TIER_NAMES[x.t-1]}" loading="lazy" />`).join('')}</div>`;
}
function fmtMissionValue(n,v){const x=Number(v)||0;return n===15?`${x.toFixed(1)}%`:String(Math.round(x*10)/10);}
const GVG_TIER_ICONS=['🥉','🥈','🥇','💠','💎'];
function achInner(norm,tier,sel){
  const info=state.badgeByGuild?.get(norm)||null;
  const tierOf=i=>Number(info?.t?.[i])||0;
  const counts=[1,2,3,4,5].map(T=>GVG_MISSIONS.filter((m,i)=>tierOf(i)>=T).length);
  const tabs=`<div class="ach-tabs">${[1,2,3,4,5].map(T=>`<button type="button" class="ach-tab k${T} ${T===tier?'active':''}" data-ach-tier="${T}"><b>${GVG_TIER_ICONS[T-1]}</b>${GVG_TIER_NAMES[T-1]}<span>${counts[T-1]}/20</span></button>`).join('')}</div>`;
  let detail=`<div class="hint" style="margin:0 0 10px">${GVG_TIER_NAMES[tier-1]} badges: ${counts[tier-1]}/20 unlocked. Tap any badge to see its mission.</div>`;
  if(sel){
    const m=GVG_MISSIONS[sel-1], i=sel-1, v=Number(info?.v?.[i])||0, row=state.badgeTierMap?.[m.n]?.[tier-1];
    const th=Number(row?.th)||0, min=Number(row?.min||0), unlocked=tierOf(i)>=tier;
    const played=Number(info?.v?.[0])||0;
    const pct=unlocked?100:(th?Math.max(0,Math.min(100,Math.round(v/th*100))):0);
    let progress=unlocked?'UNLOCKED':`${fmtMissionValue(m.n,v)} / ${fmtMissionValue(m.n,th)}`;
    if(!unlocked&&m.n===15&&played<min) progress=`${fmtMissionValue(15,v)} · needs ${min}+ matches (${played} played)`;
    detail=`<div class="ach-detail"><img src="${badgeFile(m.n,tier)}" alt="${escapeHtml(m.name)}" /><div><strong>${m.name} • ${GVG_TIER_NAMES[tier-1]}</strong><small>${escapeHtml(m.req(th,min))}</small><div class="ach-bar"><i style="width:${pct}%"></i></div><em>${escapeHtml(progress)}</em></div></div>`;
  }
  const cells=GVG_MISSIONS.map((m,i)=>`<button type="button" class="ach-cell ${tierOf(i)>=tier?'on':'off'} ${sel===m.n?'sel':''}" data-ach-badge="${m.n}" aria-label="${escapeHtml(m.name)} ${GVG_TIER_NAMES[tier-1]}"><img src="${badgeFile(m.n,tier)}" alt="" loading="lazy" /><span>${m.name}</span></button>`).join('');
  return `${tabs}${detail}<div class="ach-grid2">${cells}</div>`;
}
function renderAchievements(profile){
  if(!state.badgeConfig?.length) return '<div class="guild-badge-section-title">ACHIEVEMENTS</div><div class="hint">Achievements are not available right now.</div>';
  const norm=normalizeGuild(profile?.guild_name_normalized||profile?.guild_name||'');
  const info=state.badgeByGuild?.get(norm)||null;
  const score=info?.score||0;
  let start=1;
  for(let T=5;T>=1;T-=1){ if(GVG_MISSIONS.some((m,i)=>(Number(info?.t?.[i])||0)>=T)){start=T;break;} }
  return `<div class="guild-badge-section-title">ACHIEVEMENTS • ${score}/100 BADGES</div><div class="ach-wrap" data-guild="${escapeHtml(norm)}" data-tier="${start}">${achInner(norm,start,0)}</div>`;
}
document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-ach-tier]');
  if(tab){const w=tab.closest('.ach-wrap'); if(w){w.dataset.tier=tab.dataset.achTier; w.innerHTML=achInner(w.dataset.guild,Number(w.dataset.tier),0);} return;}
  const cell=event.target.closest?.('[data-ach-badge]');
  if(cell){const w=cell.closest('.ach-wrap'); if(w){const cur=Number(cell.dataset.achBadge); w.innerHTML=achInner(w.dataset.guild,Number(w.dataset.tier),cur);} }
});
function numberMetric(p,key){return Number(p?.[key]||0);}
function guildAvatarMarkup(p,small=false){return p?.guild_logo_url?`<div class="guild-profile-avatar" ${small?'style="width:56px;height:56px;flex-basis:56px"':''}><img src="${escapeHtml(p.guild_logo_url)}" alt="${escapeHtml(p.guild_name)} logo" loading="lazy" /></div>`:`<div class="guild-profile-avatar" ${small?'style="width:56px;height:56px;flex-basis:56px"':''}><span style="font-size:27px">🛡️</span></div>`;}

/* Guild ranking list: guilds with 5+ approved matches are RANKED by win rate (highest first), so a lucky 1-0 guild cannot sit above a proven one.
   Guilds with fewer matches follow (still by win rate), and guilds with no matches come last. */
const GVG_MIN_RANKED_MATCHES=5;
function guildWinStats(p){const w=Number(p?.wins)||0,l=Number(p?.losses)||0,t=w+l;return {w,l,t,rate:t?w/t:-1};}
function rankGuildProfiles(list){
  const decorated=list.map(p=>({p,s:guildWinStats(p)}));
  const band=x=>x.s.t>=GVG_MIN_RANKED_MATCHES?0:(x.s.t>0?1:2);
  decorated.sort((A,B)=>band(A)-band(B)||B.s.rate-A.s.rate||B.s.t-A.s.t||B.s.w-A.s.w||String(A.p.guild_name||'').localeCompare(String(B.p.guild_name||'')));
  let n=0;
  return decorated.map(x=>{x.p.rank_no=band(x)===0?++n:0;x.p.win_rate_pct=x.s.t?Math.round(x.s.rate*1000)/10:null;x.p.matches_played=x.s.t;return x.p;});
}
function renderPublicGuildProfiles(){
  const target=$('public-guild-profile-grid'); if(!target)return;
  const q=String($('public-guild-profile-search')?.value||'').trim().toLowerCase();
  const rows=(state.guildProfiles||[]).filter(p=>!q||String(p.guild_name||'').toLowerCase().includes(q)||String(p.guild_uid||'').toLowerCase().includes(q));
  const count=$('public-profile-count');if(count)count.textContent=`${rows.length} GUILDS`;
  target.innerHTML=rows.length?rows.map(p=>{const info=guildBadgeInfo(p);return `<article class="guild-profile-card" data-rt="${Number(info?.rt)||0}">${guildAvatarMarkup(p,true)}<div class="guild-profile-main"><div class="guild-profile-name">${p.rank_no?`<span class="rank-no">#${p.rank_no}</span>`:''}${escapeHtml(p.guild_name)}</div><div class="guild-profile-uid">UID: ${escapeHtml(p.guild_uid||'Not added')}</div>${titleChipMarkup(info?.title)}${p.profile_incomplete?'<div class="guild-profile-meta">PROFILE SETUP PENDING · MATCH STATS NOT AVAILABLE</div>':`<div class="guild-profile-meta">${numberMetric(p,'total_played')} PLAYED · ${numberMetric(p,'wins')}W / ${numberMetric(p,'losses')}L${p.win_rate_pct!==null&&p.win_rate_pct!==undefined?` · <span class="wr-chip">${p.win_rate_pct}% WIN RATE</span>`:''}</div>${p.matches_played>0&&p.matches_played<GVG_MIN_RANKED_MATCHES?`<div class="guild-profile-meta" style="opacity:.7">Unranked · needs ${GVG_MIN_RANKED_MATCHES} matches (${p.matches_played} played)</div>`:''}<div class="guild-profile-meta">🏆 ${numberMetric(p,'weekly_trophies')} weekly · ${numberMetric(p,'monthly_trophies')} monthly</div>${topBadgeStripMarkup(info)}`}<button class="btn btn-green btn-small" style="margin-top:8px" type="button" data-action="open-public-guild-profile" data-guild="${escapeHtml(p.guild_name_normalized||normalizeGuild(p.guild_name))}">VIEW PROFILE</button></div></article>`;}).join(''):'<div class="empty">No approved guild profiles match this search.</div>';
}
function setLogoCooldownNote(profile){
  const note=$('guild-logo-cooldown-note'),file=$('guild-profile-logo');if(!note||!file)return;
  const changed=profile?.guild_logo_changed_at?new Date(profile.guild_logo_changed_at).getTime():0;
  const readyAt=changed?changed+3*24*60*60*1000:Date.now();
  const remaining=readyAt-Date.now();
  if(remaining>0){const days=Math.floor(remaining/86400000),hours=Math.ceil((remaining%86400000)/3600000);note.textContent=`Logo change cooldown active. You can change the logo again in approximately ${days} day(s), ${hours} hour(s). Guild UID can still be edited.`;file.disabled=true;}
  else{note.textContent=changed?'Logo change is available. After saving a new logo, the next change is locked for 3 days.':'First logo upload is available immediately. After changing it, a 3-day cooldown applies.';file.disabled=false;}
}
function populateMyGuildProfileEditor(){
  const input=$('guild-profile-uid');if(!input||!state.guild){refreshMyProfileForm();return;}
  const mine=(state.guildProfiles||[]).find(p=>String(p.guild_name_normalized||'')===String(state.guild.guild_name_normalized||normalizeGuild(state.guild.guild_name)));
  if(mine){input.value=mine.guild_uid||'';setLogoCooldownNote(mine);}else{input.value='';setLogoCooldownNote(null);}
}
async function loadPublicGuildProfiles(){
  const target=$('public-guild-profile-grid');
  if(target)target.innerHTML='<div class="empty">Loading approved guild profiles...</div>';
  try{
    const registryPromise=state.guest
      ? Promise.resolve({data:null,error:new Error('guest')})
      : state.registeredGuildsLoaded
      ? Promise.resolve({data:state.registeredGuilds,error:null})
      : Promise.resolve(db.rpc('get_gvg_registered_guilds')).catch(error=>({data:null,error}));
    const [profilesResult,badgeResult,registryResult]=await Promise.all([
      Promise.resolve(readRpc('get_gvg_public_guild_profiles')).catch(error=>({data:null,error})),
      Promise.resolve(readRpc('get_gvg_badges_v2')).catch(error=>({data:null,error})),
      registryPromise
    ]);

    const profilesOk=!profilesResult.error;
    const registryOk=!registryResult.error&&Array.isArray(registryResult.data);
    if(!profilesOk)console.warn('Public guild profile RPC failed; attempting approved registry fallback:',profilesResult.error);
    if(badgeResult.error)console.warn('Badge progress is temporarily unavailable; guild cards will still load:',badgeResult.error);
    if(registryOk){
      state.registeredGuilds=registryResult.data;
      state.registeredGuildsLoaded=true;
    }

    const profiles=profilesOk&&Array.isArray(profilesResult.data)?profilesResult.data:[];
    applyBadgeData(!badgeResult.error?badgeResult.data:null);
    const byGuild=new Map();
    profiles.forEach(profile=>{
      const key=normalizeGuild(profile.guild_name_normalized||profile.guild_name||'');
      if(key&&!byGuild.has(key))byGuild.set(key,{...profile});
    });

    // Approved guilds with missing profile rows remain visible as incomplete cards.
    // Never expose pending/rejected/banned entries through this fallback.
    (state.registeredGuilds||[]).forEach(guild=>{
      const key=normalizeGuild(guild.guild_name_normalized||guild.guild_name||'');
      const status=String(guild.approval_status||'').toLowerCase();
      const isBanned=Boolean(guild.is_banned||(guild.ban_until&&new Date(guild.ban_until)>new Date()));
      if(!key||status!=='approved'||isBanned||byGuild.has(key))return;
      byGuild.set(key,{
        guild_name:guild.guild_name,
        guild_name_normalized:key,
        guild_uid:'',guild_logo_url:'',
        total_played:0,wins:0,losses:0,win_rate:0,
        weekly_trophies:0,monthly_trophies:0,
        profile_incomplete:true
      });
    });

    if(!byGuild.size&&!profilesOk&&!registryOk){
      throw profilesResult.error||registryResult.error||new Error('Could not load guild profiles or the approved guild directory.');
    }

    state.guildProfiles=rankGuildProfiles([...byGuild.values()].map(profile=>({...profile})));
    renderPublicGuildProfiles();
    populateMyGuildProfileEditor();
  }catch(error){
    console.error('Guild profiles failed:',error);
    if(target)target.innerHTML=`<div class="empty">Could not load profiles: ${escapeHtml(humanizeError(error))}</div>`;
    showStatus('guild-profile-status','error',humanizeError(error));
  }
}
function openPublicGuildProfile(norm){
  const p=(state.guildProfiles||[]).find(x=>normalizeGuild(x.guild_name_normalized||x.guild_name)===normalizeGuild(norm));if(!p)return;
  const info=guildBadgeInfo(p);
  const unlocked=info?.score||0;
  const statsMarkup=p.profile_incomplete
    ? '<div class="hint" style="margin-top:10px">This approved guild is listed, but its public profile data has not been created yet. UID, logo, match statistics and achievements will appear after profile data is available.</div>'
    : `<div class="guild-profile-kpis"><div class="guild-profile-kpi"><span>Played</span><strong>${numberMetric(p,'total_played')}</strong></div><div class="guild-profile-kpi"><span>Wins</span><strong>${numberMetric(p,'wins')}</strong></div><div class="guild-profile-kpi"><span>Losses</span><strong>${numberMetric(p,'losses')}</strong></div><div class="guild-profile-kpi"><span>Win Rate</span><strong>${Number(p.win_rate||0).toFixed(1)}%</strong></div></div>
    <div class="guild-profile-kpis"><div class="guild-profile-kpi"><span>Weekly trophies</span><strong>🏆 ${numberMetric(p,'weekly_trophies')}</strong></div><div class="guild-profile-kpi"><span>Monthly trophies</span><strong>👑 ${numberMetric(p,'monthly_trophies')}</strong></div><div class="guild-profile-kpi"><span>Top 10 weeks</span><strong>${numberMetric(p,'top10_weeks')}</strong></div><div class="guild-profile-kpi"><span>Longest streak</span><strong>${numberMetric(p,'max_win_streak')}</strong></div></div>${renderAchievements(p)}<div class="hint" style="margin-top:12px">Statistics use approved results only. Trophies are official awards added by the GVG Admin.</div>`;
  const html=`<div class="modal-head"><div><div class="kicker">Public Guild Profile</div><h3>${escapeHtml(p.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div>
    <div style="display:flex;align-items:center;gap:12px;margin:12px 0">${guildAvatarMarkup(p,true)}<div><div style="font-weight:900">GUILD UID</div><div class="guild-profile-uid">${escapeHtml(p.guild_uid||'Not added yet')}</div>${p.profile_incomplete?'':`<div class="guild-profile-meta">${unlocked}/100 badges earned</div>`}${titleChipMarkup(info?.title)}</div></div>${statsMarkup}`;
  openModal(html);
  fillGuildProfileExtras(p.guild_name_normalized||normalizeGuild(p.guild_name));
}
function publicStoragePathFromUrl(publicUrl,bucket){
  try{
    const url=new URL(String(publicUrl||''));
    const projectHost=new URL(SUPABASE_URL).hostname.toLowerCase();
    if(url.protocol!=='https:'||url.hostname.toLowerCase()!==projectHost)return null;
    const marker=`/storage/v1/object/public/${bucket}/`;
    const index=url.pathname.indexOf(marker);
    if(index<0)return null;
    const path=decodeURIComponent(url.pathname.slice(index+marker.length));
    return path && !path.split('/').some(part=>part==='..') ? path : null;
  }catch{return null;}
}
async function removeReplacedStorageObject(publicUrl,bucket){
  const objectPath=publicStoragePathFromUrl(publicUrl,bucket);
  if(!objectPath)return;
  try{
    const {error}=await db.storage.from(bucket).remove([objectPath]);
    if(error)console.warn(`Could not remove replaced ${bucket} object:`,error.message);
  }catch(error){console.warn(`Could not remove replaced ${bucket} object:`,error?.message||error);}
}

async function uploadGuildLogo(file){
  if(!state.user)throw new Error('LOGIN_REQUIRED: Login to update your guild profile.');
  if(file.size>2*1024*1024)throw new Error('Guild logo must be 2 MB or smaller.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG or WEBP for the guild logo.');
  const optimized=await compressImageForStorage(file,{maxDimension:640,targetBytes:320*1024,qualities:[0.86,0.80,0.74]});
  const ext=getUploadImageExtension(optimized);
  const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const {error}=await db.storage.from('guild-logos').upload(path,optimized,{
    upsert:false,
    contentType:optimized.type||file.type,
    cacheControl:'31536000'
  });
  if(error)throw error;
  const {data}=db.storage.from('guild-logos').getPublicUrl(path);
  if(!data?.publicUrl)throw new Error('Could not create public Guild Logo URL.');
  return data.publicUrl;
}
async function saveMyGuildProfile(e){
  e.preventDefault();clearStatus('guild-profile-status');
  if(!guildApproved())return showStatus('guild-profile-status','error','Only an approved, active guild can update its profile.');
  const myNorm=normalizeGuild(state.guild?.guild_name_normalized||state.guild?.guild_name||'');
  const profile=(state.guildProfiles||[]).find(p=>normalizeGuild(p.guild_name_normalized||p.guild_name||'')===myNorm);
  const file=$('guild-profile-logo').files?.[0]||null;
  if(file){const changed=profile?.guild_logo_changed_at?new Date(profile.guild_logo_changed_at).getTime():0;if(changed&&Date.now()<changed+3*24*60*60*1000)return showStatus('guild-profile-status','error','LOGO COOLDOWN: Your guild logo can only be changed once every 3 days.');}
  let uploadedLogoUrl=null;
  const previousLogoUrl=profile?.guild_logo_url ?? state.guild?.guild_logo_url ?? null;
  try{
    setBusy('guild-profile-save',true,'SAVE GUILD PROFILE');
    let logoUrl=previousLogoUrl;
    if(file){uploadedLogoUrl=await uploadGuildLogo(file);logoUrl=uploadedLogoUrl;}
    const {error}=await db.rpc('save_gvg_guild_profile',{p_guild_uid:$('guild-profile-uid').value.trim()||null,p_logo_url:logoUrl});
    if(error)throw error;
    if(file&&previousLogoUrl&&previousLogoUrl!==logoUrl)await removeReplacedStorageObject(previousLogoUrl,'guild-logos');
    $('guild-profile-logo').value='';
    showStatus('guild-profile-status','ok','Guild profile saved. Old logo file cleanup was requested; the active logo was kept.');
    clearSectionCache('member:guild-profiles');
    await loadPublicGuildProfiles();markSectionLoaded('member:guild-profiles');
  }catch(error){
    if(uploadedLogoUrl)await removeReplacedStorageObject(uploadedLogoUrl,'guild-logos');
    showStatus('guild-profile-status','error',humanizeError(error));
  }
  finally{setBusy('guild-profile-save',false,'SAVE GUILD PROFILE');}
}
function setPfChip(id,kind,text){const c=$(id);if(!c)return;c.className=`pf-chip ${kind}`;c.textContent=text;}
async function loadMyGuildNameChangeStatus(){
  const input=$('pf-name'),note=$('pf-note-name');
  if(!input||!note)return;
  if(!state.user||!state.guild){setPfChip('pf-chip-name','','LOGIN');note.textContent='Login with an approved guild account.';input.disabled=true;return;}
  try{
    const {data,error}=await db.rpc('get_my_gvg_guild_name_change_status');if(error)throw error;
    const row=Array.isArray(data)?(data[0]||null):data;state.guildNameChangeStatus=row;
    const status=String(row?.request_status||'');
    const requested=String(row?.requested_guild_name||'');
    const availableAt=row?.name_change_available_at?new Date(row.name_change_available_at):null;
    const cooldown=Boolean(availableAt&&Number.isFinite(availableAt.getTime())&&availableAt.getTime()>Date.now()+60000);
    if(status==='pending'){
      setPfChip('pf-chip-name','pending','PENDING APPROVAL');
      note.textContent=`Your request for "${requested}" is waiting for Admin approval. Your current name stays active until then.`;
      input.disabled=true;
    }else if(cooldown){
      setPfChip('pf-chip-name','locked','LOCKED');
      note.textContent=`Locked until ${formatDateTime(availableAt.toISOString())} Pakistan time (3-day rule after an approved change).`;
      input.disabled=true;
    }else{
      setPfChip('pf-chip-name','ready','READY');
      note.textContent=status==='rejected'?'Your last request was rejected. A new name needs Admin approval.':'A new name needs Admin approval. Your current name stays active until then.';
      input.disabled=false;
    }
  }catch(error){
    state.guildNameChangeStatus=null;
    setPfChip('pf-chip-name','locked','UNAVAILABLE');
    note.textContent=`Could not check the name status: ${humanizeError(error)}`;
    input.disabled=true;
    console.error('Guild name-change status check failed:',error);
  }
}
function myGuildProfileRow(){
  const myNorm=normalizeGuild(state.guild?.guild_name_normalized||state.guild?.guild_name||'');
  return (state.guildProfiles||[]).find(p=>normalizeGuild(p.guild_name_normalized||p.guild_name||'')===myNorm)||null;
}
function logoLockInfo(profile){
  const changed=profile?.guild_logo_changed_at?new Date(profile.guild_logo_changed_at).getTime():0;
  const readyAt=changed?changed+3*24*60*60*1000:0;
  return {locked:Boolean(readyAt&&readyAt>Date.now()),readyAt,hasLogo:Boolean(profile?.guild_logo_url)};
}
async function refreshMyProfileForm(){
  const g=state.guild;
  if(!g||!$('my-profile-form'))return;
  $('pf-current-name').textContent=g.guild_name||'—';
  $('pf-current-contact').textContent=g.contact?formatContact(g.contact):'—';
  if(!(state.guildProfiles||[]).length){try{await loadPublicGuildProfiles();}catch{}}
  const mine=myGuildProfileRow();
  $('pf-current-uid').textContent=mine?.guild_uid?String(mine.guild_uid):'Not added yet';
  const lock=logoLockInfo(mine);
  const logoInput=$('pf-logo');
  $('pf-current-logo').textContent=lock.hasLogo?'A logo is set. PNG / JPG / WEBP, max 2 MB.':'No logo yet. PNG / JPG / WEBP, max 2 MB.';
  if(lock.locked){
    setPfChip('pf-chip-logo','locked','LOCKED');
    $('pf-note-logo').textContent=`Locked until ${formatDateTime(new Date(lock.readyAt).toISOString())} Pakistan time (3-day rule).`;
    if(logoInput){logoInput.value='';logoInput.disabled=true;}
  }else{
    setPfChip('pf-chip-logo','ready','READY');
    $('pf-note-logo').textContent=lock.hasLogo?'After you change the logo it is locked for 3 days.':'Your first logo upload is allowed at once. After that it is locked for 3 days.';
    if(logoInput)logoInput.disabled=false;
  }
  const uidInput=$('pf-uid');if(uidInput)uidInput.disabled=false;
  await loadMyGuildNameChangeStatus();
}
async function saveMyProfile(e){
  e.preventDefault();clearStatus('my-profile-status');
  if(!guildApproved())return showStatus('my-profile-status','error','Only an approved, active guild can update its profile.');
  const nameNew=$('pf-name').value.trim().replace(/\s+/g,' ');
  const contactNew=$('pf-contact').value.trim();
  const uidNew=$('pf-uid').value.trim();
  const file=$('pf-logo').files?.[0]||null;
  if(!nameNew&&!contactNew&&!uidNew&&!file)return showStatus('my-profile-status','error','Nothing to save. Fill in at least one field.');
  const results=[];let anyError=false,anyOk=false;
  const add=(kind,text)=>{results.push({kind,text});if(kind==='error')anyError=true;if(kind==='ok')anyOk=true;};
  setBusy('my-profile-save',true,'SAVE CHANGES');
  try{
    await refreshMyProfileForm();
    const mine=myGuildProfileRow();
    const lock=logoLockInfo(mine);

    /* ---- UID + logo (one database call) ---- */
    const currentUid=String(mine?.guild_uid||'');
    const uidChanged=Boolean(uidNew)&&uidNew!==currentUid;
    const useLogo=Boolean(file)&&!lock.locked;
    if(file&&lock.locked)add('skip',`Logo skipped: locked until ${formatDateTime(new Date(lock.readyAt).toISOString())} Pakistan time.`);
    if(uidNew&&!uidChanged)add('skip','UID skipped: it is already '+uidNew+'.');
    if(uidChanged||useLogo){
      let uploaded=null;
      const previousLogo=mine?.guild_logo_url??state.guild?.guild_logo_url??null;
      try{
        let logoUrl=previousLogo;
        if(useLogo){uploaded=await uploadGuildLogo(file);logoUrl=uploaded;}
        const {error}=await db.rpc('save_gvg_guild_profile',{p_guild_uid:(uidChanged?uidNew:currentUid)||null,p_logo_url:logoUrl});
        if(error)throw error;
        if(useLogo&&previousLogo&&previousLogo!==logoUrl)await removeReplacedStorageObject(previousLogo,'guild-logos');
        add('ok',[uidChanged?'Guild UID updated':'',useLogo?'Guild logo updated':''].filter(Boolean).join(' and ')+'.');
        $('pf-uid').value='';$('pf-logo').value='';
      }catch(error){
        if(uploaded)await removeReplacedStorageObject(uploaded,'guild-logos');
        add('error','UID / logo: '+humanizeError(error));
      }
    }

    /* ---- Contact number ---- */
    if(contactNew){
      const digits=contactNew.replace(/\D/g,'');
      if(digits.length<10||digits.length>15)add('error','Phone number: enter 10 to 15 digits.');
      else{
        try{
          const {error}=await db.rpc('update_my_gvg_contact',{p_contact:contactNew});
          if(error)throw error;
          add('ok','Phone number updated. New challenges will use it.');
          $('pf-contact').value='';
        }catch(error){add('error','Phone number: '+humanizeError(error));}
      }
    }

    /* ---- Guild name (goes to Admin approval) ---- */
    if(nameNew){
      const st=state.guildNameChangeStatus;
      const availableAt=st?.name_change_available_at?new Date(st.name_change_available_at):null;
      if(st?.request_status==='pending')add('skip','Name skipped: a name request is already waiting for Admin approval.');
      else if(availableAt&&Number.isFinite(availableAt.getTime())&&availableAt.getTime()>Date.now()+60000)add('skip',`Name skipped: locked until ${formatDateTime(availableAt.toISOString())} Pakistan time.`);
      else if(!isSimpleGuildName(nameNew))add('error','Name: '+SIMPLE_GUILD_NAME_MESSAGE);
      else if(normalizeGuild(nameNew)===normalizeGuild(state.guild?.guild_name))add('skip','Name skipped: it is the same as your current name.');
      else{
        try{
          const {error}=await db.rpc('request_gvg_guild_name_change',{p_requested_guild_name:nameNew});
          if(error)throw error;
          add('ok',`Name request "${nameNew}" sent to Admin for approval. Your current name stays active until it is approved.`);
          $('pf-name').value='';
        }catch(error){add('error','Name: '+humanizeError(error));}
      }
    }

    clearSectionCache('member:guild-profiles');cacheClear('rpc:get_gvg_public_guild_profiles');cacheClear('rpc:get_gvg_badges_v2');
    try{await loadMyGuild();await renderMemberIdentity();await loadPublicGuildProfiles();markSectionLoaded('member:guild-profiles');}catch(refreshError){console.warn('Profile refresh failed:',refreshError);}
    await loadMyGuildHub();
    await refreshMyProfileForm();
  }finally{setBusy('my-profile-save',false,'SAVE CHANGES');}
  const el=$('my-profile-status');
  if(el){
    el.className=`status show ${anyError?'error':(anyOk?'ok':'error')}`;
    el.innerHTML=`<ul class="pf-results">${results.map(r=>`<li>${r.kind==='ok'?'✅':(r.kind==='skip'?'⏸️':'⚠️')} ${escapeHtml(r.text)}</li>`).join('')}</ul>`;
  }
}
async function submitGuildNameChangeRequest(e){
  e.preventDefault();clearStatus('guild-name-change-status');
  if(!guildApproved())return showStatus('guild-name-change-status','error','Only an approved, active guild can request a name change.');
  const liveStatus=state.guildNameChangeStatus;
  const availableAt=liveStatus?.name_change_available_at?new Date(liveStatus.name_change_available_at):null;
  if(liveStatus?.request_status==='pending')return showStatus('guild-name-change-status','error','Your current name-change request is already pending Admin approval.');
  if(availableAt&&Number.isFinite(availableAt.getTime())&&availableAt.getTime()>Date.now()+60000)return showStatus('guild-name-change-status','error',`Name-change cooldown is active until ${formatDateTime(availableAt.toISOString())} Pakistan time.`);
  const requested=$('guild-name-change-input').value.trim().replace(/\s+/g,' ');
  if(!isSimpleGuildName(requested))return showStatus('guild-name-change-status','error',SIMPLE_GUILD_NAME_MESSAGE);
  if(normalizeGuild(requested)===normalizeGuild(state.guild?.guild_name))return showStatus('guild-name-change-status','error','Enter a different guild name.');
  try{
    setBusy('guild-name-change-submit',true,'SENDING REQUEST');
    const {error}=await db.rpc('request_gvg_guild_name_change',{p_requested_guild_name:requested});if(error)throw error;
    $('guild-name-change-input').value='';
    showStatus('guild-name-change-status','ok','Name-change request sent. Your current name has not changed. Admin approval is required.');
    await loadMyGuildNameChangeStatus();
  }catch(error){showStatus('guild-name-change-status','error',humanizeError(error));}
  finally{setBusy('guild-name-change-submit',false,'SEND NAME CHANGE REQUEST');await loadMyGuildNameChangeStatus();}
}
function renderAdminGuildNameChangeRequests(){
  const target=$('admin-name-change-list');if(!target)return;
  const rows=state.guildNameChangeRequests||[];
  const tab=$('admin-name-change-tab');if(tab)tab.textContent=`NAME CHANGE REQUESTS (${rows.length})`;
  target.innerHTML=rows.length?rows.map(r=>`<article class="challenge-card"><div class="meta-row"><div><div class="kicker">Pending approval</div><div class="name">${escapeHtml(r.current_guild_name||'Guild')} → ${escapeHtml(r.requested_guild_name||'New name')}</div><div class="subtle">Requested: ${escapeHtml(formatDateTime(r.requested_at))} PKT</div><div class="subtle">Request ID: ${escapeHtml(String(r.id||'').slice(0,8))}</div></div><span class="status-pill status-pending">PENDING</span></div><div class="divider"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-green btn-small" type="button" data-action="approve-guild-name-change" data-id="${escapeHtml(r.id)}">APPROVE NAME</button><button class="btn btn-red btn-small" type="button" data-action="reject-guild-name-change" data-id="${escapeHtml(r.id)}">REJECT REQUEST</button></div></article>`).join(''):'<div class="empty">No pending guild name-change requests.</div>';
}
async function loadAdminGuildNameChangeRequests(){
  const target=$('admin-name-change-list');if(target)target.innerHTML='<div class="empty">Loading name-change requests...</div>';
  try{const {data,error}=await adminDb.rpc('admin_get_gvg_guild_name_change_requests');if(error)throw error;state.guildNameChangeRequests=data||[];renderAdminGuildNameChangeRequests();}
  catch(error){if(target)target.innerHTML=`<div class="empty">Could not load requests: ${escapeHtml(humanizeError(error))}</div>`;console.error('Name-change requests failed:',error);}
}
async function reviewGuildNameChangeRequest(id,approve){
  const request=(state.guildNameChangeRequests||[]).find(r=>String(r.id)===String(id));if(!request)return;
  const decision=approve?'APPROVE':'REJECT';
  const reason=await appPrompt(approve?`Add an optional note for ${request.current_guild_name} → ${request.requested_guild_name}.`:`Enter the reason for rejecting ${request.current_guild_name} → ${request.requested_guild_name}.`,approve?'':'Name-change request not approved.',{title:approve?'Approve guild name change':'Reject guild name change',confirmText:approve?'APPROVE NAME':'REJECT REQUEST',placeholder:approve?'Optional admin note':'Reason for rejection',required:!approve,danger:!approve});
  if(reason===null)return;
  try{const {error}=await adminDb.rpc('admin_review_gvg_guild_name_change',{p_request_id:id,p_approve:approve,p_reason:reason.trim()||null});if(error)throw error;
    if(approve)invalidateGuildDirectoryCaches();
    showStatus('admin-name-change-status','ok',approve?`Guild name approved: ${request.current_guild_name} is now ${request.requested_guild_name}.`:'Guild name-change request rejected.');
    await Promise.all([loadAdminGuildNameChangeRequests(),loadAdminGuilds()]);
  }catch(error){showStatus('admin-name-change-status','error',humanizeError(error));}
}

function trophySvg(){return `<svg viewBox="0 0 220 250" role="img" aria-label="Gold and emerald 3D GVG championship trophy" focusable="false"><defs>
<linearGradient id="gvg-cup-front" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7c8"/><stop offset=".16" stop-color="#f7d36b"/><stop offset=".34" stop-color="#9e6719"/><stop offset=".52" stop-color="#fff0a0"/><stop offset=".72" stop-color="#cc8b21"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>
<linearGradient id="gvg-cup-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#57340a"/><stop offset=".34" stop-color="#b87919"/><stop offset=".62" stop-color="#70430d"/><stop offset="1" stop-color="#2d220b"/></linearGradient>
<linearGradient id="gvg-cup-rim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffbd5"/><stop offset=".32" stop-color="#e4b64c"/><stop offset=".65" stop-color="#80500f"/><stop offset="1" stop-color="#ffeaa0"/></linearGradient>
<linearGradient id="gvg-cup-green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#efffbc"/><stop offset=".24" stop-color="#63ff9a"/><stop offset=".56" stop-color="#10a95a"/><stop offset="1" stop-color="#034c2b"/></linearGradient>
<linearGradient id="gvg-cup-base" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#332008"/><stop offset=".18" stop-color="#f0c75c"/><stop offset=".45" stop-color="#8a5a13"/><stop offset=".72" stop-color="#ffe6a0"/><stop offset="1" stop-color="#503008"/></linearGradient>
<radialGradient id="gvg-cup-glow"><stop stop-color="#63ff96" stop-opacity=".38"/><stop offset="1" stop-color="#0a6f37" stop-opacity="0"/></radialGradient>
<filter id="gvg-cup-shadow" x="-40%" y="-35%" width="180%" height="190%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<ellipse cx="110" cy="225" rx="74" ry="13" fill="#000" opacity=".65" filter="url(#gvg-cup-shadow)"/><ellipse cx="110" cy="220" rx="68" ry="15" fill="url(#gvg-cup-glow)"/>
<!-- Deep rear/side silhouette gives the cup visible thickness when tilted. -->
<path d="M48 47Q30 42 25 55Q21 93 54 111L68 113L74 100L59 93Q39 78 42 59L53 61Z" fill="url(#gvg-cup-side)" stroke="#4a2d0a" stroke-width="3"/>
<path d="M172 47Q190 42 195 55Q199 93 166 111L152 113L146 100L161 93Q181 78 178 59L167 61Z" fill="url(#gvg-cup-side)" stroke="#4a2d0a" stroke-width="3"/>
<path d="M51 37L169 37L160 93Q156 120 128 132L126 158L94 158L92 132Q64 120 60 93Z" fill="url(#gvg-cup-side)" stroke="#4e300a" stroke-width="4" stroke-linejoin="round"/>
<path d="M55 39L165 39L157 90Q153 113 110 130Q67 113 63 90Z" fill="url(#gvg-cup-front)" stroke="#fff0a0" stroke-width="2.5" stroke-linejoin="round"/>
<!-- Inner cup panel, bevelled edges and engraved facets. -->
<path d="M68 49L152 49L145 88Q142 106 110 119Q78 106 75 88Z" fill="#704711" opacity=".75"/>
<path d="M72 48L148 48L142 85Q139 101 110 114Q81 101 78 85Z" fill="url(#gvg-cup-front)" stroke="#fff4c0" stroke-width="1.6"/>
<path d="M72 49L87 55L87 91L101 108L82 94Q77 89 75 77Z" fill="#fff6ce" opacity=".55"/>
<path d="M148 49L135 55L132 91L119 108L138 94Q143 89 145 77Z" fill="#6d410c" opacity=".50"/>
<path d="M110 58L131 80L110 103L89 80Z" fill="url(#gvg-cup-green)" stroke="#f7d66e" stroke-width="3" stroke-linejoin="round"/>
<path d="M110 64L122 80L110 93Z" fill="#e8ffc0" opacity=".82"/><path d="M110 64L98 80L110 93Z" fill="#09834a" opacity=".9"/>
<path d="M58 38L162 38L165 46L55 46Z" fill="url(#gvg-cup-rim)" stroke="#68410e" stroke-width="2"/>
<path d="M49 39Q110 31 171 39" fill="none" stroke="#fff6c1" stroke-width="3" stroke-linecap="round"/>
<!-- Stem and beveled plinth. -->
<path d="M94 128L126 128L131 166L119 176L101 176L89 166Z" fill="url(#gvg-cup-side)" stroke="#5d3a0b" stroke-width="3"/>
<path d="M100 132L120 132L124 163L116 169L104 169L96 163Z" fill="url(#gvg-cup-front)" stroke="#ffe8a0" stroke-width="2"/>
<path d="M101 140L119 140L117 158L103 158Z" fill="url(#gvg-cup-green)" stroke="#f7d66e" stroke-width="1.5"/>
<path d="M78 169L142 169L151 188L69 188Z" fill="url(#gvg-cup-side)" stroke="#4e300a" stroke-width="3"/>
<path d="M71 176L149 176L143 187L77 187Z" fill="url(#gvg-cup-rim)" stroke="#fff0a0" stroke-width="1.5"/>
<path d="M62 188L158 188L170 204L50 204Z" fill="url(#gvg-cup-side)" stroke="#4e300a" stroke-width="3"/>
<path d="M55 191L165 191L156 201L64 201Z" fill="url(#gvg-cup-base)" stroke="#ffe6a0" stroke-width="1.5"/>
<path d="M47 204L173 204L182 215L38 215Z" fill="url(#gvg-cup-rim)" stroke="#70470f" stroke-width="3"/>
<path d="M40 214L180 214L174 225L46 225Z" fill="url(#gvg-cup-base)" stroke="#3d290a" stroke-width="3"/>
<path d="M70 52L76 79M82 45L86 57M143 50L137 76" stroke="#fffbd7" stroke-width="3" stroke-linecap="round" opacity=".76"/>
<path d="M52 233H168" stroke="#40f28a" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>
</svg>`;}
function bindTrophy3D(root=document){root.querySelectorAll('[data-trophy-3d]:not([data-trophy-bound])').forEach(el=>{el.dataset.trophyBound='1';let down=false,lastX=0,lastY=0,rx=-7,ry=-8,pointerId=null;const apply=()=>{el.style.transform=`perspective(1050px) rotateX(${rx}deg) rotateY(${ry}deg)`;};apply();el.addEventListener('pointerdown',e=>{down=true;pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;el.classList.add('is-dragging');try{el.setPointerCapture(e.pointerId);}catch{};e.preventDefault();});el.addEventListener('pointermove',e=>{if(!down||e.pointerId!==pointerId)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;/* Keep the cup broadside: never rotate to a paper-thin edge view. */ry=Math.max(-42,Math.min(42,ry+dx*.55));rx=Math.max(-27,Math.min(27,rx-dy*.45));apply();});const end=e=>{if(pointerId!==null&&e?.pointerId!==undefined&&e.pointerId!==pointerId)return;down=false;pointerId=null;el.classList.remove('is-dragging');};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);});}

/* Monthly tournaments are SEASONS: September 2026 = Season 1, October 2026 = Season 2, November = Season 3,
   December = Season 4, January 2027 = Season 5, and so on (counted without a break). */
const GVG_SEASON_BASE_YEAR=2026, GVG_SEASON_BASE_MONTH=9;
function hofSeasonNumber(year,month){return (Number(year)-GVG_SEASON_BASE_YEAR)*12+Number(month)-GVG_SEASON_BASE_MONTH+1;}
/* In 2026 nothing was played before September, so a saved number below 9 is read directly as the season number (1, 2, ...). */
function hofSeasonOf(year,p){return (Number(year)===GVG_SEASON_BASE_YEAR&&Number(p)<GVG_SEASON_BASE_MONTH)?Number(p):hofSeasonNumber(year,p);}
function hofSeasonMonthName(season){const m=((Number(season)+GVG_SEASON_BASE_MONTH-2)%12+12)%12+1;return HOF_MONTH_NAMES[m-1];}
function hallPeriodLabel(type,number,year){
  if(type==='weekly')return `WEEK ${number}`;
  const y=Number(year)||Number(state.hofYear)||new Date().getFullYear();
  const season=hofSeasonOf(y,number);
  return season>=1?`SEASON ${season}`:new Intl.DateTimeFormat('en',{month:'long'}).format(new Date(Date.UTC(2020,number-1,1)));
}
const HOF_MONTH_NAMES=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
function isDefaultHofLabel(value){return /^(WEEK\s+\d+\s+CHAMPION|MONTHLY\s+CHAMPION|JANUARY\s+CHAMPION|FEBRUARY\s+CHAMPION|MARCH\s+CHAMPION|APRIL\s+CHAMPION|MAY\s+CHAMPION|JUNE\s+CHAMPION|JULY\s+CHAMPION|AUGUST\s+CHAMPION|SEPTEMBER\s+CHAMPION|OCTOBER\s+CHAMPION|NOVEMBER\s+CHAMPION|DECEMBER\s+CHAMPION)$/i.test(String(value||'').trim());}
function syncHofAwardLabelFromPeriod(force=false){
  const label=$('hof-award-label'),type=$('hof-award-type'),period=$('hof-award-period');
  if(!label||!type||!period)return;
  const current=String(label.value||'').trim();
  if(force||label.dataset.autoGenerated==='1'||!current||isDefaultHofLabel(current)){
    const number=Number(period.value)||1;
    label.value=type.value==='weekly'?`WEEK ${number} CHAMPION`:`${hallPeriodLabel('monthly',number,Number($('hof-award-year')?.value)||new Date().getFullYear())} CHAMPION`;
    label.dataset.autoGenerated='1';
  }
}
function isGenericTrophyLabel(label,type,period){
  const value=String(label||'').trim().replace(/\s+/g,' ').toUpperCase();
  const canonical=`${hallPeriodLabel(type,period)} CHAMPION`.toUpperCase();
  if(!value||value===canonical)return true;
  return /^(WEEK\s+\d+\s+CHAMPION|MONTHLY\s+CHAMPION|JANUARY\s+CHAMPION|FEBRUARY\s+CHAMPION|MARCH\s+CHAMPION|APRIL\s+CHAMPION|MAY\s+CHAMPION|JUNE\s+CHAMPION|JULY\s+CHAMPION|AUGUST\s+CHAMPION|SEPTEMBER\s+CHAMPION|OCTOBER\s+CHAMPION|NOVEMBER\s+CHAMPION|DECEMBER\s+CHAMPION)$/.test(value);
}
function canonicalTrophyTitle(award){
  const type=award?.award_type==='monthly'?'monthly':'weekly';
  const period=Number(award?.period_number)||1;
  return `${hallPeriodLabel(type,period,award?.award_year)} CHAMPION`;
}
function customTrophyLabel(award){
  const value=String(award?.trophy_label||'').trim();
  return value&&!isGenericTrophyLabel(value,award?.award_type,Number(award?.period_number))?value:'';
}
async function loadHallOfFame(){
  try{
    const [settingsRes,yearsRes]=await Promise.all([readRpc('get_gvg_hof_settings'),readRpc('get_gvg_hall_of_fame_years',{p_award_type:state.hofMode})]);
    if(settingsRes.error)throw settingsRes.error;if(yearsRes.error)throw yearsRes.error;
    const s=Array.isArray(settingsRes.data)?settingsRes.data[0]:settingsRes.data;if(s)state.hofSettings=s;
    const years=(yearsRes.data||[]).map(x=>Number(x&&typeof x==='object'?x.award_year:x)).filter(Number.isFinite);state.hofYears=years;if(!state.hofYear||!years.includes(Number(state.hofYear)))state.hofYear=Number(state.hofSettings.season_year||years[0]||new Date().getFullYear());
    document.querySelectorAll('[data-hof-type]').forEach(b=>b.classList.toggle('active',b.dataset.hofType===state.hofMode));
    renderHofYearGrid(years);await loadHallOfFameYear();
  }catch(error){console.error('Hall of Fame load failed:',error);$('hof-year-grid').innerHTML=`<div class="empty">Could not load Hall of Fame. Run the supplied Supabase migration first. ${escapeHtml(humanizeError(error))}</div>`;}
}
function renderHofYearGrid(years){const target=$('hof-year-grid');if(!target)return;target.innerHTML=(years||[]).length?years.map(y=>`<button class="hof-year-tile ${Number(y)===Number(state.hofYear)?'active':''}" type="button" data-action="hof-select-year" data-year="${Number(y)}">${Number(y)}<small style="display:block;margin-top:5px;font-size:8px">${state.hofMode==='weekly'?'WEEKLY SEASON':'MONTHLY ARCHIVE'}</small></button>`).join(''):'<div class="empty">No years available.</div>';}
async function loadHallOfFameYear(){
  const target=$('hof-selected-award');if(target)target.innerHTML='<div class="empty">Loading trophy archive...</div>';
  const {data,error}=await readRpc('get_gvg_hall_of_fame',{p_award_type:state.hofMode,p_award_year:Number(state.hofYear)});if(error)throw error;state.hofAwards=data||[];updateHofStats();
  const heading=$('hof-period-heading');if(heading)heading.textContent=state.hofMode==='weekly'?`${state.hofYear} • SELECT WEEK`:`${state.hofYear} • SELECT SEASON`;
  const maxAwardWeek=Math.max(0,...state.hofAwards.filter(a=>a.award_type==='weekly').map(a=>Number(a.period_number)||0));
  const maxAwardMonth=Math.max(0,...state.hofAwards.filter(a=>a.award_type==='monthly').map(a=>Number(a.period_number)||0));
  const selectedYear=Number(state.hofYear),seasonYear=Number(state.hofSettings.season_year);
  /* A new week tile appears by itself: the grid always reaches the highest week that has a champion (or the current week setting). */
  const maxWeek=selectedYear===seasonYear?Math.max(Number(state.hofSettings.current_week||1),maxAwardWeek):(selectedYear<seasonYear?Math.max(53,maxAwardWeek):Math.max(1,maxAwardWeek));
  let periods;
  if(state.hofMode==='weekly'){periods=Array.from({length:Math.max(1,Math.min(60,maxWeek))},(_,i)=>i+1);}
  else{
    const now=new Date(),curYear=now.getFullYear(),curMonth=now.getMonth()+1;
    const first=selectedYear===GVG_SEASON_BASE_YEAR?GVG_SEASON_BASE_MONTH:1;
    const last=selectedYear<curYear?12:(selectedYear===curYear?Math.max(curMonth,maxAwardMonth):Math.max(maxAwardMonth,0));
    const bySeason=new Map();
    state.hofAwards.filter(x=>x.award_type==='monthly').forEach(x=>{const p=Number(x.period_number);bySeason.set(hofSeasonOf(selectedYear,p),p);});
    for(let m=first;m<=Math.min(12,last);m+=1){const sn=hofSeasonOf(selectedYear,m);if(!bySeason.has(sn))bySeason.set(sn,m);}
    periods=[...bySeason.entries()].sort((x,y)=>x[0]-y[0]).map(e=>e[1]);
  }
  const count=periods.length;
  $('hof-period-grid').innerHTML=periods.map(n=>{const found=state.hofAwards.find(a=>Number(a.period_number)===n);return `<button class="hof-period-tile ${found?'has-award':'is-empty'} ${Number(state.hofPeriod)===n?'active':''}" type="button" data-action="hof-select-period" data-period="${n}"><span class="pt-ring">${found?'🏆':'🔒'}</span><b>${escapeHtml(hallPeriodLabel(state.hofMode,n,state.hofYear))}</b>${state.hofMode==='monthly'?`<em class="pt-month">${hofSeasonMonthName(hofSeasonOf(state.hofYear,n))}</em>`:''}<small>${found?escapeHtml(found.guild_name||'CHAMPION'):'AWAITING'}</small></button>`;}).join('');
  if(!state.hofPeriod||state.hofPeriod>count)state.hofPeriod=1;renderHallSelectedAward();
}
function updateHofStats(){
  const list=(state.hofAwards||[]).filter(a=>String(a.award_type)===String(state.hofMode)&&Number(a.award_year)===Number(state.hofYear));
  const set=id=>$(id);
  if(set('hof2-total')) set('hof2-total').textContent=String(list.length);
  if(set('hof2-champs')) set('hof2-champs').textContent=String(new Set(list.map(a=>a.guild_name_normalized||normalizeGuild(a.guild_name))).size);
  const latest=list.slice().sort((a,b)=>Number(b.period_number)-Number(a.period_number))[0];
  if(set('hof2-latest')) set('hof2-latest').textContent=latest?String(latest.guild_name||'—'):'—';
}
function currentHallAward(){
  return (state.hofAwards||[]).find(x=>String(x.award_type)===String(state.hofMode)&&Number(x.award_year)===Number(state.hofYear)&&Number(x.period_number)===Number(state.hofPeriod))||null;
}
function renderHallSelectedAward(){
  const target=$('hof-selected-award');if(!target)return;
  document.querySelectorAll('[data-action="hof-select-period"]').forEach(b=>b.classList.toggle('active',Number(b.dataset.period)===Number(state.hofPeriod)));
  const a=currentHallAward();
  const periodName=hallPeriodLabel(state.hofMode,state.hofPeriod);
  if(!a){
    target.innerHTML=`<div class="hof-awaiting-card"><div class="hof-awaiting-icon">♔</div><div><strong>${escapeHtml(periodName)} ${escapeHtml(String(state.hofYear||''))} · CHAMPION NOT ADDED</strong><div class="hof-awaiting-copy">This period is saved in the archive. When the Admin awards its official trophy, the champion showcase will appear here.</div></div><button class="btn btn-gold btn-small" type="button" data-action="hof-open-details">VIEW PERIOD</button></div>`;
    return;
  }
  const date=a.awarded_at?formatDateTime(a.awarded_at):'';
  const logoUrl=a.guild_logo_url||'';
  const logoHtml=logoUrl?`<img src="${escapeHtml(logoUrl)}" alt="" loading="lazy" />`:'<span>🛡️</span>';
  target.innerHTML=`<article class="hof-award-card hof2-showcase"><div class="hof2-spot" aria-hidden="true"></div><div class="hof2-ribbon">${escapeHtml(canonicalTrophyTitle(a))}</div><div class="hof2-stage"><div class="trophy-3d trophy-inline" data-trophy-3d aria-label="Drag to rotate trophy">${trophySvg()}</div></div><div class="hof2-champ"><div class="hof2-logo">${logoHtml}</div><div class="hof2-guild">${escapeHtml(a.guild_name)}</div><div class="hof2-uid">GUILD UID · ${escapeHtml(a.guild_uid||'NOT ADDED')}</div><div class="hof2-meta">${escapeHtml(String(a.award_year))} · ${escapeHtml(hallPeriodLabel(a.award_type,Number(a.period_number)))}${date?' · '+escapeHtml(date):''}</div>${customTrophyLabel(a)?`<div class="hof2-notes">${escapeHtml(customTrophyLabel(a))}</div>`:''}${a.notes?`<div class="hof2-notes">${escapeHtml(a.notes)}</div>`:''}<div class="hof2-cta"><button class="btn btn-gold btn-small" type="button" data-action="hof-open-details">OPEN CHAMPION SHOWCASE ↗</button></div></div></article>`;
  bindTrophy3D(target);
}
async function openHallOfFamePeriodDetails(){
  const period=Number(state.hofPeriod)||1;
  const year=Number(state.hofYear)||Number(state.hofSettings?.season_year)||new Date().getFullYear();
  const mode=state.hofMode==='monthly'?'monthly':'weekly';
  const periodLabel=hallPeriodLabel(mode,period);
  let award=currentHallAward();
  if(!award){
    openModal(`<div class="hof-detail-shell hof-detail-awaiting"><div class="hof-detail-top"><div><div class="hof-detail-kicker">7TH UNIVERSE · CHAMPIONS LEGACY</div><h2>${escapeHtml(periodLabel)} ${year}</h2><p>This archive slot is ready, but the official champion trophy has not been added yet.</p></div><button class="close-btn" type="button" data-action="close-modal" aria-label="Close champion details">×</button></div><div class="hof-awaiting-hero"><div class="hof-awaiting-orbit"><div class="trophy-3d trophy-awaiting" data-trophy-3d aria-label="Drag to rotate trophy">${trophySvg()}</div></div><span class="hof-detail-status-pill">AWAITING OFFICIAL CHAMPION</span><h3>${escapeHtml(periodLabel)} · ${year}</h3><p>When the Admin awards this period, the guild logo, name, Guild UID and official trophy details will appear in this showcase.</p><button class="btn btn-gold" type="button" data-action="close-modal">BACK TO HALL OF FAME</button></div></div>`, 'hof-detail-modal');
    bindTrophy3D($('modal'));return;
  }
  let profile=(state.guildProfiles||[]).find(p=>String(p.guild_name_normalized||normalizeGuild(p.guild_name))===String(award.guild_name_normalized||normalizeGuild(award.guild_name)))||null;
  if(!profile||(!profile.guild_logo_url&&!award.guild_logo_url)){
    try{
      const {data,error}=await readRpc('get_gvg_public_guild_profiles');
      if(!error&&Array.isArray(data)){
        state.guildProfiles=data;
        profile=data.find(p=>String(p.guild_name_normalized||normalizeGuild(p.guild_name))===String(award.guild_name_normalized||normalizeGuild(award.guild_name)))||profile;
      }
    }catch(error){console.warn('Guild logo could not be refreshed for Hall of Fame modal:',error);}
  }
  const logo=award.guild_logo_url||profile?.guild_logo_url||'';
  const avatar=logo?`<img src="${escapeHtml(logo)}" alt="${escapeHtml(award.guild_name)} guild logo" />`:`<span class="hof-detail-avatar-fallback">🛡️</span>`;
  const played=profile?numberMetric(profile,'total_played'):null;
  const wins=profile?numberMetric(profile,'wins'):null;
  const losses=profile?numberMetric(profile,'losses'):null;
  const winRate=profile?Number(profile.win_rate||0).toFixed(1)+'%':null;
  const date=award.awarded_at?formatDateTime(award.awarded_at):'Official award';
  const periodTitle=hallPeriodLabel(mode,Number(award.period_number),award.award_year);
  const typeTitle=mode==='weekly'?'WEEKLY CHAMPION':'MONTHLY CHAMPION';
  const detailHtml=`<div class="hof-detail-shell"><div class="hof-detail-top"><div><div class="hof-detail-kicker">7TH UNIVERSE · CHAMPIONS LEGACY</div><h2>HALL OF FAME</h2><p>Official champion archive · permanent recognition</p></div><button class="close-btn" type="button" data-action="close-modal" aria-label="Close champion showcase">×</button></div><div class="hof-detail-ribbon"><span>✦ ${escapeHtml(typeTitle)} ✦</span><strong>${escapeHtml(String(award.award_year))} · ${escapeHtml(periodTitle)}</strong></div><div class="hof-detail-layout"><section class="hof-detail-guild-panel"><div class="hof-detail-panel-kicker">CHAMPION GUILD</div><div class="hof-detail-avatar">${avatar}</div><h3>${escapeHtml(award.guild_name||'Champion Guild')}</h3><div class="hof-detail-uid-label">GUILD UID</div><div class="hof-detail-uid">${escapeHtml(award.guild_uid||profile?.guild_uid||'NOT ADDED')}</div>${profile?`<div class="hof-detail-record"><div><small>PLAYED</small><strong>${played}</strong></div><div><small>WINS</small><strong>${wins}</strong></div><div><small>LOSSES</small><strong>${losses}</strong></div><div><small>WIN RATE</small><strong>${winRate}</strong></div></div>`:''}<div class="hof-detail-guild-tag">🏆 OFFICIAL HALL OF FAME GUILD</div></section><section class="hof-detail-trophy-panel"><div class="hof-detail-trophy-glow"></div><div class="hof-detail-trophy-ring"></div><div class="trophy-3d trophy-modal" data-trophy-3d aria-label="Touch and drag to rotate the 3D-style trophy">${trophySvg()}</div><div class="hof-detail-touch-hint"><span>↔</span> TOUCH & DRAG TO ROTATE <span>↕</span></div><div class="hof-detail-floor"></div></section><section class="hof-detail-award-panel"><div class="hof-detail-panel-kicker">OFFICIAL AWARD</div><div class="hof-detail-laurel">♛</div><h3>${escapeHtml(canonicalTrophyTitle(award))}</h3>${customTrophyLabel(award)?`<div class="hof-detail-award-custom-label">${escapeHtml(customTrophyLabel(award))}</div>`:''}<div class="hof-detail-data"><span>SEASON / YEAR</span><strong>${escapeHtml(String(award.award_year))}</strong></div><div class="hof-detail-data"><span>PERIOD</span><strong>${escapeHtml(periodTitle)}</strong></div><div class="hof-detail-data"><span>AWARDED</span><strong>${escapeHtml(date)}</strong></div>${award.notes?`<div class="hof-detail-notes"><span>ADMIN NOTE</span><p>${escapeHtml(award.notes)}</p></div>`:''}<div class="hof-detail-seal">7U <small>CHAMPIONS</small></div></section></div><div class="hof-detail-footer"><span>★ LEGACY EARNED. LEGACY REMEMBERED. ★</span><button class="btn btn-gold" type="button" data-action="close-modal">CLOSE SHOWCASE</button></div></div>`;
  openModal(detailHtml,'hof-detail-modal');bindTrophy3D($('modal'));
}

async function changeHallType(type){if(!['weekly','monthly'].includes(type))return;state.hofMode=type;state.hofYear=null;state.hofPeriod=1;await loadHallOfFame();}
function renderAdminHofAwards(){const target=$('admin-hof-awards-list');if(!target)return;const rows=(state.adminHofAwards||[]).sort((a,b)=>String(b.awarded_at).localeCompare(String(a.awarded_at)));target.innerHTML=rows.length?rows.slice(0,60).map(a=>`<div class="admin-hof-award-row"><div class="admin-hof-award-main"><strong>${escapeHtml(canonicalTrophyTitle(a))} — ${escapeHtml(a.guild_name)}</strong><small>${escapeHtml(String(a.award_year))} · ${escapeHtml(hallPeriodLabel(a.award_type,Number(a.period_number)))} · UID ${escapeHtml(a.guild_uid||'not added')}${customTrophyLabel(a)?' · '+escapeHtml(customTrophyLabel(a)):''}</small></div><button class="btn btn-red btn-small" type="button" data-action="admin-remove-hof-award" data-id="${escapeHtml(a.id)}">REMOVE</button></div>`).join(''):'<div class="empty">No official trophies have been awarded yet.</div>';}
async function loadHofAdmin(){cacheClear('rpc:get_gvg_h');
  try{
    const [profileRes,settingsRes,weeklyYearsRes,monthlyYearsRes]=await Promise.all([
      adminDb.rpc('get_gvg_public_guild_profiles'),adminDb.rpc('get_gvg_hof_settings'),
      adminDb.rpc('get_gvg_hall_of_fame_years',{p_award_type:'weekly'}),adminDb.rpc('get_gvg_hall_of_fame_years',{p_award_type:'monthly'})
    ]);
    for(const r of [profileRes,settingsRes,weeklyYearsRes,monthlyYearsRes])if(r.error)throw r.error;
    const profiles=profileRes.data||[];state.guildProfiles=profiles;
    $('hof-award-guild').innerHTML=profiles.length?profiles.map(p=>`<option value="${escapeHtml(p.guild_name_normalized)}">${escapeHtml(p.guild_name)}${p.guild_uid?' • UID '+escapeHtml(p.guild_uid):''}</option>`).join(''):'<option value="">No approved guilds found</option>';
    const settings=Array.isArray(settingsRes.data)?settingsRes.data[0]:settingsRes.data;if(settings){state.hofSettings=settings;$('hof-season-year').value=settings.season_year;$('hof-current-week').value=settings.current_week;$('hof-award-year').value=settings.season_year;$('hof-award-period').value=settings.current_week;$('hof-award-label').value=`WEEK ${settings.current_week} CHAMPION`;$('hof-award-label').dataset.autoGenerated='1';}
    const pairs=[['weekly',weeklyYearsRes.data||[]],['monthly',monthlyYearsRes.data||[]]],all=[];
    for(const [type,years] of pairs){for(const y of years){const result=await adminDb.rpc('get_gvg_hall_of_fame',{p_award_type:type,p_award_year:Number(y.award_year)});if(result.error)throw result.error;all.push(...(result.data||[]));}}
    state.adminHofAwards=all;renderAdminHofAwards();
  }catch(error){console.error('Admin HoF load failed:',error);showStatus('admin-status','error',`Hall of Fame controls: ${humanizeError(error)}. Apply database/05 migration first.`);const list=$('admin-hof-awards-list');if(list)list.innerHTML=`<div class="empty">${escapeHtml(humanizeError(error))}</div>`;}
}
async function saveHofSeasonSettings(e){e.preventDefault();clearStatus('hof-season-status');try{const year=Number($('hof-season-year').value),week=Number($('hof-current-week').value);const {error}=await adminDb.rpc('admin_update_gvg_hof_settings',{p_season_year:year,p_current_week:week});if(error)throw error;state.hofSettings={season_year:year,current_week:week};cacheClear('rpc:get_gvg_h');showStatus('hof-season-status','ok','Current Hall of Fame season settings saved.');await loadHofAdmin();}catch(error){showStatus('hof-season-status','error',humanizeError(error));}}
async function awardHofTrophy(e){e.preventDefault();clearStatus('hof-award-status');const type=$('hof-award-type').value,year=Number($('hof-award-year').value),period=Number($('hof-award-period').value),guildNorm=$('hof-award-guild').value,label=$('hof-award-label').value.trim(),notes=$('hof-award-notes').value.trim();if(!guildNorm||!label)return showStatus('hof-award-status','error','Choose an approved guild and enter a trophy label.');const already=state.adminHofAwards.find(a=>a.award_type===type&&Number(a.award_year)===year&&Number(a.period_number)===period);if(already&&!await appConfirm(`${hallPeriodLabel(type,period)} ${year} already has ${already.guild_name} as champion. Replace this award with the selected guild?`,{title:'Replace Hall of Fame champion',confirmText:'REPLACE AWARD',danger:true}))return;try{setBusy('hof-award-submit',true,'SAVING AWARD');const {error}=await adminDb.rpc('admin_add_gvg_hall_of_fame_award',{p_guild_name_normalized:guildNorm,p_award_type:type,p_award_year:year,p_period_number:period,p_trophy_label:label,p_notes:notes||null});if(error)throw error;cacheClear('rpc:get_gvg_h');cacheClear('rpc:get_gvg_badges_v2');showStatus('hof-award-status','ok','Official champion trophy saved to Hall of Fame and guild profile.');await loadHofAdmin();}catch(error){showStatus('hof-award-status','error',humanizeError(error));}finally{setBusy('hof-award-submit',false,'AWARD TROPHY');}}
async function removeHofAward(id){const a=state.adminHofAwards.find(x=>String(x.id)===String(id));if(!a)return;if(!await appConfirm(`Remove the official Hall of Fame award?\n\n${a.trophy_label} — ${a.guild_name}\n\nMatch results and ranking points will not be deleted.`,{title:'Remove Hall of Fame award',confirmText:'REMOVE AWARD',danger:true}))return;try{const {error}=await adminDb.rpc('admin_remove_gvg_hall_of_fame_award',{p_award_id:id});if(error)throw error;showStatus('admin-status','ok','Hall of Fame trophy removed.');await loadHofAdmin();}catch(error){showStatus('admin-status','error',humanizeError(error));}}

/* ------------------------- Events ------------------------- */
/* Do not fetch stored proof screenshots until the user expands a proof panel. */
document.addEventListener('toggle',(event)=>{
  const panel=event.target;
  if(!(panel instanceof HTMLDetailsElement)||!panel.matches('.proof-details')||!panel.open)return;
  panel.querySelectorAll('img[data-proof-src]').forEach(img=>{
    if(!img.getAttribute('src'))img.setAttribute('src',img.getAttribute('data-proof-src')||'');
  });
},true);

document.addEventListener('click',async(e)=>{
  const actionEl=e.target.closest('[data-action]');
  if(actionEl){const action=actionEl.dataset.action,id=actionEl.dataset.id;if(action==='result-from-challenge')return selectChallengeForResult(id);if(action==='close-modal')return closeModal();if(action==='guild-info'){const g=findGuild(id);if(g)adminGuildInfo(g);return;}if(action==='guild-edit'){const g=findGuild(id);if(g)adminGuildEdit(g);return;}if(action==='guild-remove')return removeGuild(id);if(action==='approve-leader')return setLeaderApproval(id,'approved');if(action==='reject-leader')return setLeaderApproval(id,'rejected');if(action==='remove-leader')return removeLeader(id,actionEl.dataset.guild||'');if(action==='reset-password')return resetLeaderPassword(actionEl.dataset.email||'');if(action==='approve-result')return approveResult(id);if(action==='reject-result')return rejectResult(id);if(action==='unban-identity')return unbanIdentity(actionEl.dataset.guild||'',actionEl.dataset.contact||'');if(action==='mod-approve-guild')return moderatorApproveGuild(actionEl.dataset.guild||'');if(action==='mod-remove-guild')return moderatorRemoveGuild(actionEl.dataset.guild||'');if(action==='mod-approve-result')return moderatorApproveResult(id);if(action==='mod-reject-result')return moderatorRejectResult(id);if(action==='open-public-guild-profile')return openPublicGuildProfile(actionEl.dataset.guild||'');if(action==='hof-select-year'){state.hofYear=Number(actionEl.dataset.year);state.hofPeriod=1;renderHofYearGrid(state.hofYears||[]);return loadHallOfFameYear();}if(action==='hof-select-period'){state.hofPeriod=Number(actionEl.dataset.period);renderHallSelectedAward();return openHallOfFamePeriodDetails();}if(action==='hof-open-details')return openHallOfFamePeriodDetails();if(action==='admin-remove-hof-award')return removeHofAward(id);if(action==='approve-guild-name-change')return reviewGuildNameChangeRequest(id,true);if(action==='reject-guild-name-change')return reviewGuildNameChangeRequest(id,false);}
  const menuBtn=e.target.closest('[data-menu-button]');if(menuBtn){const id=menuBtn.dataset.menuButton;document.querySelectorAll('.dots-menu.open').forEach(x=>{if(x.id!==`menu-${id}`)x.classList.remove('open')});document.getElementById(`menu-${id}`)?.classList.toggle('open');return;}document.querySelectorAll('.dots-menu.open').forEach(x=>x.classList.remove('open'));
});
document.querySelectorAll('[data-member-section]').forEach(btn=>btn.addEventListener('click',()=>openMemberSection(btn.dataset.memberSection)));
document.querySelectorAll('[data-ranking-mode]').forEach(btn=>btn.addEventListener('click',()=>setRankingMode(btn.dataset.rankingMode)));
document.querySelectorAll('[data-admin-section]').forEach(btn=>btn.addEventListener('click',()=>openAdminSection(btn.dataset.adminSection)));
$('nav-moderator').addEventListener('click',async()=>{openView('moderator');await restoreModerator();});

$('moderator-login-form').addEventListener('submit',handleModeratorLogin);
$('moderator-open-admin-login').addEventListener('click',async()=>{state.adminReturnToModerator=state.moderatorOk;openView('admin');await restoreAdmin();});
$('moderator-admin-access').addEventListener('click',async()=>{state.adminReturnToModerator=state.moderatorOk;openView('admin');await restoreAdmin();});
$('moderator-back').addEventListener('click',async()=>{const target=state.user?'member':'public';openView(target);if(target==='member')await refreshMemberAfterPrivilegedView();});
$('moderator-logout').addEventListener('click',handleModeratorLogout);
$('moderator-guild-search').addEventListener('input',renderModeratorGuilds);
document.querySelectorAll('[data-moderator-section]').forEach(btn=>btn.addEventListener('click',()=>openModeratorSection(btn.dataset.moderatorSection)));

$('nav-register').addEventListener('click',()=>openView('register'));
$('nav-logout').addEventListener('click',handleLogout);
$('back-login').addEventListener('click',()=>openView('public'));
$('admin-back').addEventListener('click',()=>openView(state.adminReturnToModerator&&state.moderatorOk?'moderator':state.user?'member':'public'));
$('login-form').addEventListener('submit',handleLogin);
$('register-form').addEventListener('submit',handleRegister);
$('forgot-password').addEventListener('click',handleForgot);
$('challenge-form').addEventListener('submit',handleChallengeSubmit);
$('result-form').addEventListener('submit',handleResultSubmit);
$('guild-profile-form')?.addEventListener('submit',saveMyGuildProfile);
$('my-profile-form')?.addEventListener('submit',saveMyProfile);

/* ===== v1.9: My Guild hub, phone change, delete account, ban form, temporary password ===== */
function renderHubLogo(g){
  const box=$('my-hub-logo'); if(!box) return;
  const url=String(g?.guild_logo_url||'');
  if(url){ box.innerHTML=''; const img=document.createElement('img'); img.alt=''; img.loading='lazy'; img.src=url; box.appendChild(img); }
  else box.innerHTML='<span>&#9876;</span>';
}
async function loadMyGuildHub(){
  const card=$('my-guild-hub'); if(!card) return;
  const g=state.guild;
  const badge=$('my-hub-status');
  $('my-hub-error').textContent='';
  if(!state.user||!g){
    $('my-hub-name').textContent='NO GUILD';
    $('my-hub-meta').textContent='Login with an approved guild account to see your guild.';
    badge.className='badge badge-red'; badge.textContent='NOT AVAILABLE';
    return;
  }
  $('my-hub-name').textContent=g.guild_name||'GUILD';
  const metaParts=[];
  metaParts.push(g.guild_uid?`UID ${g.guild_uid}`:'UID not added yet');
  if(g.contact) metaParts.push(formatContact(g.contact));
  $('my-hub-meta').textContent=metaParts.join(' • ');
  renderHubLogo(g);
  const current=$('guild-contact-current'); if(current) current.textContent=`Current number: ${g.contact?formatContact(g.contact):'—'}`;
  const banned=g.is_banned&&(!g.ban_until||new Date(g.ban_until)>new Date());
  if(banned){badge.className='badge badge-red';badge.textContent='BANNED';}
  else if(g.approval_status==='approved'){badge.className='badge badge-green';badge.textContent='APPROVED';}
  else {badge.className='badge badge-gold';badge.textContent=String(g.approval_status||'PENDING').toUpperCase();}
  try{
    const {data,error}=await db.rpc('get_my_gvg_week_summary');
    if(error) throw error;
    const d=Array.isArray(data)?data[0]:data; if(!d) return;
    $('my-hub-points').textContent=String(d.points??0);
    $('my-hub-wins').textContent=String(d.wins??0);
    $('my-hub-losses').textContent=String(d.losses??0);
    $('my-hub-rank').textContent=d.rank?`#${d.rank}`:'—';
    const used=Number(d.today_matches)||0, limit=Number(d.today_limit)||7;
    $('my-hub-today').textContent=`${used} / ${limit}`;
    $('my-hub-today-bar').style.width=`${Math.min(100,Math.round(used/limit*100))}%`;
  }catch(error){
    console.error('Guild week summary failed:',error);
    $('my-hub-error').textContent=`Could not load this week's numbers: ${humanizeError(error)}`;
  }
}
async function submitGuildContact(e){
  e.preventDefault(); clearStatus('guild-contact-status');
  if(!guildApproved()) return showStatus('guild-contact-status','error','Only an approved, active guild can change its phone number.');
  const contact=$('guild-contact-input').value.trim();
  const digits=contact.replace(/\D/g,'');
  if(digits.length<10||digits.length>15) return showStatus('guild-contact-status','error','Enter a valid phone number (10 to 15 digits).');
  try{
    setBusy('guild-contact-save',true,'SAVING');
    const {error}=await db.rpc('update_my_gvg_contact',{p_contact:contact});
    if(error) throw error;
    $('guild-contact-input').value='';
    await loadMyGuild(); await renderMemberIdentity(); await loadMyGuildHub();
    showStatus('guild-contact-status','ok','Phone number updated. New challenges will use the new number.');
  }catch(error){ showStatus('guild-contact-status','error',humanizeError(error)); }
  finally{ setBusy('guild-contact-save',false,'SAVE PHONE NUMBER'); }
}
async function submitDeleteAccount(e){
  e.preventDefault(); clearStatus('guild-delete-status');
  if(String($('guild-delete-confirm').value).trim().toUpperCase()!=='DELETE') return showStatus('guild-delete-status','error','Type DELETE in the box to confirm.');
  const ok=await appConfirm('Delete your account?\n\nYour login and phone number will be erased and your access ends immediately. Points, results and Hall of Fame records stay. To come back you must register again and wait for Admin approval.',{title:'Delete my account',confirmText:'DELETE MY ACCOUNT',danger:true});
  if(!ok) return;
  try{
    setBusy('guild-delete-submit',true,'DELETING');
    const {error}=await db.rpc('delete_my_gvg_account',{p_confirm:'DELETE'});
    if(error) throw error;
    $('guild-delete-confirm').value='';
    await handleLogout();
    await appAlert('Your account was deleted. To return, register again and wait for Admin approval.',{title:'Account deleted',confirmText:'OK'});
  }catch(error){ showStatus('guild-delete-status','error',humanizeError(error)); }
  finally{ setBusy('guild-delete-submit',false,'DELETE MY ACCOUNT'); }
}
async function setLeaderTempPassword(registryId,guildName){
  if(!registryId) return;
  const pw=await appPrompt(`Type a TEMPORARY password for the leader of ${guildName||'this guild'} (8 to 72 characters). Send it to the leader privately; they should change it after logging in.`,'',{title:'Set temporary password',confirmText:'SET PASSWORD'});
  if(pw===null||pw===undefined) return;
  const value=String(pw);
  if(value.length<8||value.length>72) return appAlert('The password must be 8 to 72 characters.',{title:'Password too short',danger:true,confirmText:'CLOSE'});
  try{
    const {error}=await adminDb.rpc('admin_set_leader_password',{p_registry_id:registryId,p_new_password:value});
    if(error) throw error;
    await appAlert('Password set. The leader was signed out everywhere and can login with the new password now.',{title:'Done',confirmText:'GOT IT'});
  }catch(error){ await appAlert(humanizeError(error),{title:'Could not set password',danger:true,confirmText:'CLOSE'}); }
}
document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-action="set-temp-password"]'); if(!el) return;
  event.preventDefault(); setLeaderTempPassword(el.dataset.id,el.dataset.guild);
});

$('guild-name-change-form')?.addEventListener('submit',submitGuildNameChangeRequest);


/* ===== v1.11: title chooser (My Profile) ===== */
async function loadMyTitleOptions(){
  const box=$('title-options'); if(!box||!state.user||!state.guild) return;
  try{
    const {data,error}=await db.rpc('get_my_gvg_title_options');
    if(error) throw error;
    const d=(Array.isArray(data)?data[0]:data)||{};
    state.myTitle=d;
    const items=[
      {key:'rank',label:'RANK TITLE',text:d.rank,locked:'Locked. Earn badges to unlock your first rank title.'},
      {key:'weekly',label:'WEEKLY CHAMPION',text:d.weekly,locked:'Locked. Win a Weekly Champion title.'},
      {key:'monthly',label:'MONTHLY CHAMPION',text:d.monthly,locked:'Locked. Win a Monthly Champion title.'},
      {key:'none',label:'NO TITLE',text:'Show only my guild name.',locked:''}
    ];
    box.innerHTML=items.map(it=>{
      const avail=it.key==='none'||Boolean(it.text);
      return `<label class="title-opt ${avail?'':'disabled'}"><input type="radio" name="guild-title-choice" value="${it.key}" ${d.choice===it.key?'checked':''} ${avail?'':'disabled'} /><span><b>${it.label}</b><em>${escapeHtml(avail?(it.text||''):it.locked)}</em></span></label>`;
    }).join('');
    const slot=$('my-hub-title'); if(slot) slot.innerHTML=titleChipMarkup(d.current);
  }catch(error){ console.error('Title options failed:',error); const st=$('guild-title-status'); if(st) showStatus('guild-title-status','error',humanizeError(error)); }
}
async function submitGuildTitle(e){
  e.preventDefault(); clearStatus('guild-title-status');
  const picked=document.querySelector('input[name="guild-title-choice"]:checked')?.value;
  if(!picked) return showStatus('guild-title-status','error','Choose one option first.');
  try{
    setBusy('guild-title-save',true,'SAVING');
    const {error}=await db.rpc('set_my_gvg_title_choice',{p_choice:picked});
    if(error) throw error;
    await loadMyTitleOptions();
    state.guildProfiles=null; clearSectionCache('member:guild-profiles');
    showStatus('guild-title-status','ok','Title saved. It now shows on your profile and in new WhatsApp challenges and results.');
  }catch(error){ showStatus('guild-title-status','error',humanizeError(error)); }
  finally{ setBusy('guild-title-save',false,'SAVE TITLE'); }
}

/* ===== v1.10: Guild section switch, team roster, guild code, guest access, profile extras ===== */
const READ_CACHE_TTL={get_gvg_public_guild_profiles:5*60*1000,get_gvg_badges_v2:15*60*1000,get_gvg_hof_settings:15*60*1000,get_gvg_hall_of_fame_years:15*60*1000,get_gvg_hall_of_fame:10*60*1000,get_gvg_guild_roster:10*60*1000,get_gvg_guild_rival:10*60*1000};
async function readRpc(name,args){
  const ttl=READ_CACHE_TTL[name];
  const key=ttl?`rpc:${name}:${JSON.stringify(args||{})}`:null;
  if(key){const hit=cacheGet(key,ttl);if(hit!==null)return {data:hit,error:null};}
  const res=await readRpcRaw(name,args);
  if(key&&res&&!res.error&&res.data!=null)cacheSet(key,res.data);
  return res;
}
async function readRpcRaw(name,args){
  if(state.guest){
    const map={
      get_gvg_public_guild_profiles:['profiles'],
      get_gvg_public_badge_progress:['badges'],
      get_gvg_badges_v2:['badges2'],
      get_gvg_hof_settings:['hof_settings'],
      get_gvg_hall_of_fame_years:['hof_years',args?.p_award_type],
      get_gvg_hall_of_fame:['hof',args?.p_award_type,args?.p_award_year],
      get_gvg_guild_roster:['roster',args?.p_norm],
      get_gvg_guild_rival:['rival',args?.p_norm]
    };
    const m=map[name];
    if(!m) return {data:null,error:new Error('Not available in guest mode.')};
    return Promise.resolve(db.rpc('guest_read',{p_guild:state.guest.guild_name,p_code:state.guest.code,p_what:m[0],p_arg:m[1]??null,p_year:m[2]??null}));
  }
  return Promise.resolve(db.rpc(name,args));
}
function setGuildView(view){
  const mine=view==='mine'&&!state.guest;
  $('guild-view-mine')?.classList.toggle('hidden',!mine);
  $('guild-view-all')?.classList.toggle('hidden',mine);
  document.querySelectorAll('[data-guild-view]').forEach(b=>{const on=b.dataset.guildView===(mine?'mine':'all');b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
  $('gs-mine')?.classList.toggle('hidden',Boolean(state.guest));
  if(mine){
    loadMyGuildHub();
    refreshMyProfileForm();
    loadMyTitleOptions();
    loadMyRoster();
  }
}
async function loadMyRoster(){
  if(!state.user||!state.guild) return;
  try{
    const {data,error}=await db.rpc('get_my_gvg_roster');
    if(error) throw error;
    state.myRoster=(Array.isArray(data)?data[0]:data)||{};
    renderRosterForm();
  }catch(error){ console.error('Roster load failed:',error); showStatus('guild-roster-status','error',humanizeError(error)); }
}
function updateRosterCount(){
  const n=[...document.querySelectorAll('#roster-grid input')].filter(i=>i.value.trim()).length;
  const c=$('roster-count'); if(c) c.textContent=`${n} / 10`;
}
function renderRosterForm(){
  const grid=$('roster-grid'); if(!grid) return;
  const r=state.myRoster||{};
  const members=Array.isArray(r.members)?r.members:[];
  const locked=r.can_change===false;
  if(!grid.children.length){
    grid.innerHTML=Array.from({length:10},(_,i)=>`<label class="roster-slot"><span>${i+1}</span><input type="text" maxlength="24" data-roster-slot="${i}" placeholder="Member ${i+1}" autocomplete="off" /></label>`).join('');
    grid.addEventListener('input',updateRosterCount);
  }
  grid.querySelectorAll('input').forEach((el,i)=>{el.value=members[i]||'';el.disabled=locked;});
  const save=$('guild-roster-save'); if(save) save.disabled=locked;
  const note=$('roster-lock-note');
  if(note) note.textContent=locked
    ? `Team list is locked until ${formatDateTime(r.next_change_at)} (7-day rule).`
    : (members.length?'You can change the list now. After saving, it is locked for 7 days.':'Your first list is saved immediately. After saving, it is locked for 7 days.');
  const codeNote=$('guild-code-current');
  if(codeNote) codeNote.textContent=r.code?`Current guild code: ${r.code}`:'No code set yet. Guests cannot enter until you set one.';
  updateRosterCount();
}
async function submitRoster(e){
  e.preventDefault(); clearStatus('guild-roster-status');
  if(!guildApproved()) return showStatus('guild-roster-status','error','Only an approved, active guild can submit a team list.');
  const names=[...document.querySelectorAll('#roster-grid input')].map(i=>i.value.trim()).filter(Boolean);
  if(!names.length) return showStatus('guild-roster-status','error','Add at least 1 team member.');
  if(names.some(n=>n.length<2||n.length>24)) return showStatus('guild-roster-status','error','Each name must be 2 to 24 characters.');
  const ok=await appConfirm('Save this team list?\n\nAfter saving you cannot change it for 7 days.',{title:'Save team list',confirmText:'SAVE TEAM LIST'});
  if(!ok) return;
  try{
    setBusy('guild-roster-save',true,'SAVING');
    const {error}=await db.rpc('save_my_gvg_roster',{p_members:names});
    if(error) throw error;
    await loadMyRoster();
    showStatus('guild-roster-status','ok','Team list saved. It is locked for the next 7 days.');
  }catch(error){ showStatus('guild-roster-status','error',humanizeError(error)); }
  finally{ setBusy('guild-roster-save',false,'SAVE TEAM LIST'); }
}
async function submitGuildCode(e){
  e.preventDefault(); clearStatus('guild-code-status');
  if(!guildApproved()) return showStatus('guild-code-status','error','Only an approved, active guild can set a guild code.');
  const code=$('guild-code-input').value.trim();
  if(!/^\d{4}$/.test(code)) return showStatus('guild-code-status','error','The guild code must be exactly 4 digits.');
  try{
    setBusy('guild-code-save',true,'SAVING');
    const {error}=await db.rpc('set_my_gvg_guild_code',{p_code:code});
    if(error) throw error;
    $('guild-code-input').value='';
    await loadMyRoster();
    showStatus('guild-code-status','ok','Guild code saved. Share it only with people who should see the profiles.');
  }catch(error){ showStatus('guild-code-status','error',humanizeError(error)); }
  finally{ setBusy('guild-code-save',false,'SAVE GUILD CODE'); }
}
async function submitGuestLogin(e){
  e.preventDefault(); clearStatus('guest-status');
  const guild=$('guest-guild').value.trim(), code=$('guest-code').value.trim();
  if(!guild||!/^\d{4}$/.test(code)) return showStatus('guest-status','error','Enter the guild name and its 4-digit code.');
  try{
    setBusy('guest-submit',true,'CHECKING');
    const {data,error}=await db.rpc('guest_login',{p_guild:guild,p_code:code});
    if(error) throw error;
    const d=Array.isArray(data)?data[0]:data;
    if(!d||!d.guild_name) throw new Error('Guild name or code is wrong.');
    state.guest={guild_name:d.guild_name,guild_name_normalized:d.guild_name_normalized,code};
    try{sessionStorage.setItem('gvg_guest',JSON.stringify({g:guild,c:code}));}catch{}
    $('guest-code').value='';
    enterGuest();
  }catch(error){ showStatus('guest-status','error',humanizeError(error)); }
  finally{ setBusy('guest-submit',false,'VIEW AS GUEST'); }
}
function enterGuest(){
  clearSectionCache('member:');
  openView('member');
  renderMemberIdentity();
  setMemberAccessGate();
  syncRegisterNav();
  openMemberSection('guild-profiles');
}
async function restoreGuest(){
  let saved=null; try{saved=JSON.parse(sessionStorage.getItem('gvg_guest')||'null');}catch{}
  if(!saved?.g||!saved?.c) return;
  try{
    const {data,error}=await db.rpc('guest_login',{p_guild:saved.g,p_code:saved.c});
    if(error) throw error;
    const d=Array.isArray(data)?data[0]:data;
    if(!d?.guild_name) throw new Error('expired');
    state.guest={guild_name:d.guild_name,guild_name_normalized:d.guild_name_normalized,code:saved.c};
    enterGuest();
  }catch{ try{sessionStorage.removeItem('gvg_guest');}catch{} }
}
async function fillGuildProfileExtras(norm){
  const host=$('modal'); if(!host||!norm) return;
  host.insertAdjacentHTML('beforeend','<div id="pp-extras" class="pp-extras"><div class="hint">Loading team and rival...</div></div>');
  const safe=p=>Promise.resolve(p).catch(error=>({data:null,error}));
  const [rosterRes,rivalRes]=await Promise.all([safe(readRpc('get_gvg_guild_roster',{p_norm:norm})),safe(readRpc('get_gvg_guild_rival',{p_norm:norm}))]);
  const box=$('pp-extras'); if(!box) return;
  const roster=Array.isArray(rosterRes.data)?rosterRes.data[0]:rosterRes.data;
  const members=Array.isArray(roster?.members)?roster.members:[];
  const rival=Array.isArray(rivalRes.data)?rivalRes.data[0]:rivalRes.data;
  let html='';
  html+=`<div class="pp-block"><h4>TEAM ROSTER${members.length?` • ${members.length}`:''}</h4>${members.length?`<ol class="pp-roster">${members.map((n,i)=>`<li><span class="n">${i+1}</span><b>${escapeHtml(n)}</b></li>`).join('')}</ol>`:'<div class="hint">The leader has not submitted a team list yet.</div>'}</div>`;
  if(rival&&Number(rival.matches)>=2){
    html+=`<div class="pp-block"><h4>MAIN RIVAL</h4><div class="pp-rival">${guildAvatarMarkup(rival,true)}<div class="pp-rival-main"><div class="pp-rival-name">${escapeHtml(rival.guild_name||'')}</div><div class="pp-rival-meta">${Number(rival.matches)} matches played • ${Number(rival.wins)} won • ${Number(rival.losses)} lost</div></div></div></div>`;
  }else{
    html+=`<div class="pp-block"><h4>MAIN RIVAL</h4><div class="hint">A rival appears after a guild plays the same opponent at least 2 times.</div></div>`;
  }
  box.innerHTML=html;
}
document.addEventListener('click',event=>{
  const b=event.target.closest?.('[data-guild-view]'); if(b){event.preventDefault();setGuildView(b.dataset.guildView);}
  const t=event.target.closest?.('#guest-toggle'); if(t){const f=$('guest-form');const open=f.classList.toggle('hidden')===false;t.setAttribute('aria-expanded',open?'true':'false');}
});

$('guild-contact-form')?.addEventListener('submit',submitGuildContact);
$('guild-roster-form')?.addEventListener('submit',submitRoster);
$('guild-title-form')?.addEventListener('submit',submitGuildTitle);
$('guild-code-form')?.addEventListener('submit',submitGuildCode);
$('guest-form')?.addEventListener('submit',submitGuestLogin);
$('guild-delete-form')?.addEventListener('submit',submitDeleteAccount);
$('ban-form')?.addEventListener('submit',handleBan);
$('public-guild-profile-search')?.addEventListener('input',renderPublicGuildProfiles);
$('admin-name-change-refresh')?.addEventListener('click',loadAdminGuildNameChangeRequests);
$('hof-season-form')?.addEventListener('submit',saveHofSeasonSettings);
$('hof-award-form')?.addEventListener('submit',awardHofTrophy);
$('hof-admin-refresh')?.addEventListener('click',loadHofAdmin);
document.querySelectorAll('[data-hof-type]').forEach(btn=>btn.addEventListener('click',()=>changeHallType(btn.dataset.hofType)));
$('hof-award-type')?.addEventListener('change',()=>{const type=$('hof-award-type').value;const lab=$('hof-period-number-label');const period=$('hof-award-period');if(type==='weekly'){lab.firstChild.textContent='WEEK NUMBER (1–60)';period.min='1';period.max='60';period.value=String(state.hofSettings.current_week||11);}else{lab.firstChild.textContent='MONTH NUMBER (1–12) • THE SEASON IS CALCULATED';period.min='1';period.max='12';period.value=String(new Date().getMonth()+1);}syncHofAwardLabelFromPeriod(true);});
$('hof-award-period')?.addEventListener('input',()=>syncHofAwardLabelFromPeriod(false));
$('hof-award-year')?.addEventListener('input',()=>syncHofAwardLabelFromPeriod(false));
$('hof-award-label')?.addEventListener('input',()=>{ $('hof-award-label').dataset.autoGenerated='0'; });
$('admin-login-form').addEventListener('submit',handleAdminLogin);
$('admin-logout').addEventListener('click',async()=>{try{await adminDb.auth.signOut();}catch{}state.adminUser=null;state.adminOk=false;const target=state.adminReturnToModerator&&state.moderatorOk?'moderator':state.user?'member':'public';state.adminReturnToModerator=false;openView(target);if(target==='member')await refreshMemberAfterPrivilegedView();});
$('admin-guild-search').addEventListener('input',()=>renderGuildTable('all-guild-table',filteredGuilds()));
$('modal-backdrop').addEventListener('click',(e)=>{if(e.target===$('modal-backdrop'))closeModal();});

db.auth.onAuthStateChange((event,session)=>{
  // Auth event callbacks can fire during login, initial session restore and token refresh.
  // Login/register/boot flows below handle their own data fetches; don't query Supabase
  // again for INITIAL_SESSION, SIGNED_IN or TOKEN_REFRESHED events.
  if(event==='PASSWORD_RECOVERY'){
    $('password-recovery-backdrop').classList.add('open');
    $('recovery-password')?.focus();
    return;
  }
  if(event==='USER_UPDATED'&&session?.user){
    state.user=session.user;
    syncRegisterNav();
    return;
  }
  if(event==='SIGNED_OUT'){
    state.user=null;state.guild=null;clearSectionCache('member:');syncRegisterNav();
    if($('member-dashboard')?.style.display!=='none')openView('public');
  }
});

$('password-recovery-form').addEventListener('submit',async(e)=>{
  e.preventDefault();clearStatus('recovery-status');
  const a=$('recovery-password').value,b=$('recovery-password-confirm').value;
  if(a.length<8)return showStatus('recovery-status','error','Password must be at least 8 characters.');
  if(a!==b)return showStatus('recovery-status','error','Passwords do not match.');
  try{
    const {error}=await db.auth.updateUser({password:a});
    if(error)throw error;
    showStatus('recovery-status','ok','Password updated successfully. You can now login with your new password.');
    setTimeout(async()=>{try{await db.auth.signOut();}catch{}$('password-recovery-backdrop').classList.remove('open');openView('public');},900);
  }catch(error){showStatus('recovery-status','error',humanizeError(error));}
});


(async function boot(){
  renderRules();renderWeaponSkillChoices();
  const {data:{session}}=await db.auth.getSession();
  if(session){state.user=session.user;clearSectionCache('member:');await loadMyGuild();await completePendingRegistration();await enterMember({skipGuildReload:true});syncRegisterNav();}
  else{state.user=null;state.guild=null;syncRegisterNav();openView('public');await restoreGuest();}
  await restoreAdmin();
})();
