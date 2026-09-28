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

const RULES = [
  'Roof / Height — <b>ALLOW NAHI</b>',
  'Revive Karna — <b>ALLOW NAHI</b>',
  'BO3 Matches — <b>ALLOW NAHI</b>',
  '1 Outsider Player — <b>ALLOW NAHI</b>',
  'Zone Packing — <b>ALLOW NAHI</b>',
  'Level 30 Se Low Level ID — <b>ALLOW NAHI</b>',
  'Dono Guilds Ka Agree Na Hone Par PC — <b>ALLOW NAHI</b>',
  'Abusing Language — <b>ALLOW NAHI</b>',
  'One Player Ka Two Guilds Se Khelna — <b>ALLOW NAHI</b>',
  'PANNEL USER — <b>ALLOW NAHI</b>',
  'Proof Ke Baghair Ilzam Lagana — <b>ALLOW NAHI</b>'
];

const ALLOWED_WEAPONS = ['Desert', 'M1887', 'M1887X', 'M1014', 'Woodpecker'];
const ALLOWED_SKILLS = ['DJ Alok', 'Tatsuya', 'Koda'];

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-guild-session-v2', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});
const adminDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-admin-session-v2', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

const state = {
  user: null,
  guild: null,
  adminUser: null,
  adminOk: false,
  top10: [],
  top20: [],
  bottom: null,
  challenges: [],
  guildOptions: [],
  results: [],
  guilds: [],
  bans: []
};

const $ = (id) => document.getElementById(id);

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
function showStatus(id,type,message){ const el=$(id); if(!el) return; el.className=`status show ${type}`; el.textContent=message; }
function clearStatus(id){ const el=$(id); if(!el) return; el.className='status'; el.textContent=''; }
function setBusy(buttonId,busy,label){ const btn=$(buttonId); if(!btn) return; btn.disabled=busy; if(busy) btn.dataset.oldText=btn.textContent; btn.textContent=busy?'PLEASE WAIT…':(label||btn.dataset.oldText||'SUBMIT'); }
function humanizeError(error){ const msg=String(error?.message || error?.error_description || error || 'Unknown error').trim(); return msg.replace(/^(Error:\s*)/i,''); }
function currentPakistanParts(){ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()); const o={}; for(const p of parts) o[p.type]=p.value; return {year:Number(o.year),month:Number(o.month),day:Number(o.day),hour:Number(o.hour)%24,minute:Number(o.minute)}; }
function cycleStartDateKey(){ const p=currentPakistanParts(); const d=new Date(Date.UTC(p.year,p.month-1,p.day)); if(p.hour<10) d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); }
function challengePostingOpen(){ const p=currentPakistanParts(); const mins=p.hour*60+p.minute; return mins>=600 && mins<1380; }
function cycleStartForChallenge(challengeCreatedAt){ const d=new Date(new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(challengeCreatedAt))); if(Number.isNaN(d.getTime())) return null; const p=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(challengeCreatedAt)); const o={}; for(const x of p)o[x.type]=x.value; const local=new Date(Date.UTC(Number(o.year),Number(o.month)-1,Number(o.day),Number(o.hour)%24,Number(o.minute))); if(Number(o.hour)<10)local.setUTCDate(local.getUTCDate()-1); return local.toISOString().slice(0,10); }

function openView(name){
  $('public-landing').style.display = name==='public' || name==='register' ? 'grid' : 'none';
  $('public-view').classList.toggle('hidden',name!=='public');
  $('register-view').classList.toggle('hidden',name!=='register');
  $('member-dashboard').style.display = name==='member' ? 'block' : 'none';
  $('admin-page').style.display = name==='admin' ? 'block' : 'none';
  window.scrollTo({top:0,behavior:'smooth'});
}

function openMemberSection(name){
  const allowed=['rules','challenges','results','ranking'];
  const section=allowed.includes(name)?name:'rules';
  document.querySelectorAll('.member-view').forEach(el=>el.classList.toggle('active',el.id===`member-section-${section}`));
  document.querySelectorAll('[data-member-section]').forEach(btn=>btn.classList.toggle('active',btn.dataset.memberSection===section));
  if(section==='challenges') loadLiveChallenges();
  if(section==='results') { loadLiveChallenges(); loadGuildOptions(); loadApprovedResults(); }
  if(section==='ranking') loadRanking();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderRules(){
  const target=$('rules-grid'); if(!target) return;
  target.innerHTML=RULES.map((rule,i)=>`<div class="rule-item"><div class="rule-no">${i+1}</div><div class="rule-text">${rule}</div></div>`).join('');
}
function renderWeaponSkillChoices(){
  const wg=$('weapon-grid'), sg=$('skill-grid');
  if(wg) wg.innerHTML=ALLOWED_WEAPONS.map((x,i)=>`<label class="rule-item" style="grid-template-columns:32px 1fr;cursor:pointer"><input type="checkbox" name="weapons" value="${escapeHtml(x)}" style="min-height:auto;width:auto;margin:0" /><span>${escapeHtml(x)}</span></label>`).join('');
  if(sg) sg.innerHTML=ALLOWED_SKILLS.map((x)=>`<label class="rule-item" style="grid-template-columns:32px 1fr;cursor:pointer"><input type="checkbox" name="skills" value="${escapeHtml(x)}" style="min-height:auto;width:auto;margin:0" /><span>${escapeHtml(x)}</span></label>`).join('');
}

function isPendingRegistrationSaved(){ try{return Boolean(localStorage.getItem('7th-universe-pending-registration-v2'));}catch{return false;} }
function savePendingRegistration(data){ try{ localStorage.setItem('7th-universe-pending-registration-v2',JSON.stringify(data)); }catch{} }
function readPendingRegistration(){ try{return JSON.parse(localStorage.getItem('7th-universe-pending-registration-v2')||'null');}catch{return null;} }
function clearPendingRegistration(){ try{localStorage.removeItem('7th-universe-pending-registration-v2');}catch{} }

function formatWeekLabel(value){
  try{return new Intl.DateTimeFormat('en-PK',{dateStyle:'medium',timeZone:TIME_ZONE}).format(new Date(value));}
  catch{return String(value||'');}
}

async function loadPublicTop10(){
  try{
    const {data,error}=await db.rpc('get_gvg_all_time_top10');
    if(error) throw error;
    state.top10=data||[];
    const target=$('public-top10-table');
    target.innerHTML=state.top10.length?state.top10.map(r=>`<tr><td class="tiny-rank">${escapeHtml(r.rank_no)}</td><td><strong>${escapeHtml(r.guild_name)}</strong></td><td>${escapeHtml(formatWeekLabel(r.week_start))}</td><td class="tiny-points">${escapeHtml(r.points)}</td></tr>`).join(''):'<tr><td colspan="4">No historical weekly records yet.</td></tr>';
  }catch(error){ console.error(error); $('public-top10-table').innerHTML='<tr><td colspan="4">Could not load Top 10 records.</td></tr>'; }
}

async function loadMyGuild(){
  if(!state.user){state.guild=null;return;}
  const {data,error}=await db.rpc('get_my_gvg_guild');
  if(error){ console.error(error); state.guild=null; return; }
  state.guild=Array.isArray(data)?(data[0]||null):data;
}
function guildApproved(){ return Boolean(state.guild && state.guild.approval_status==='approved' && !state.guild.is_banned && (!state.guild.ban_until || new Date(state.guild.ban_until)<=new Date())); }

async function completePendingRegistration(){
  const pending=readPendingRegistration(); if(!pending || !state.user) return;
  if(String(pending.email||'').toLowerCase()!==String(state.user.email||'').toLowerCase()) return;
  try{
    const {data,error}=await db.rpc('register_gvg_guild',{p_guild_name:pending.guild,p_contact:pending.contact});
    if(error) throw error;
    clearPendingRegistration(); state.guild=data;
    showStatus('login-status','ok','Account confirmed and guild registration has been submitted. Admin approval is required.');
  }catch(error){ showStatus('login-status','error',humanizeError(error)); }
}

async function handleLogin(e){
  e.preventDefault(); clearStatus('login-status');
  const email=$('login-email').value.trim(), password=$('login-password').value;
  if(!email||!password){showStatus('login-status','error','Email and password are required.');return;}
  try{
    setBusy('login-form',false);
    const {data,error}=await db.auth.signInWithPassword({email,password});
    if(error) throw error;
    state.user=data.user; await loadMyGuild(); await completePendingRegistration(); await enterMember();
  }catch(error){showStatus('login-status','error',humanizeError(error));}
}

async function handleRegister(e){
  e.preventDefault(); clearStatus('register-status');
  const guild=$('register-guild').value.trim(), contact=$('register-contact').value.trim(), email=$('register-email').value.trim(), password=$('register-password').value;
  if(!guild||!contact||!email||!password){showStatus('register-status','error','Guild name, contact, email and password are required.');return;}
  if(password.length<8){showStatus('register-status','error','Password must be at least 8 characters.');return;}
  try{
    const {data,error}=await db.auth.signUp({email,password});
    if(error) throw error;
    savePendingRegistration({guild,contact,email});
    if(data.session){
      state.user=data.user; const {data:reg,error:regError}=await db.rpc('register_gvg_guild',{p_guild_name:guild,p_contact:contact}); if(regError) throw regError; clearPendingRegistration(); state.guild=reg; openView('member'); await refreshMember();
    }else{
      showStatus('register-status','info','Account created. Please confirm the email, then login. The guild registration details are saved and will be submitted automatically after login.');
    }
  }catch(error){showStatus('register-status','error',humanizeError(error));}
}

async function handleForgot(){
  clearStatus('login-status'); const email=$('login-email').value.trim(); if(!email){showStatus('login-status','error','Enter your account email first.');return;}
  try{
    const redirectTo=`${window.location.origin}${window.location.pathname}`;
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo}); if(error) throw error;
    showStatus('login-status','ok','Password reset email sent. Open the email and choose a new password.');
  }catch(error){showStatus('login-status','error',humanizeError(error));}
}

async function handleUpdatePassword(event){
  event.preventDefault();
}

async function renderMemberIdentity(){
  const info=$('member-identity'), badge=$('member-status-badge'); if(!info||!badge)return;
  if(!state.user){info.textContent='Not logged in';badge.className='badge badge-red';badge.textContent='LOGOUT';return;}
  const g=state.guild;
  if(!g){info.textContent=`${state.user.email} • No guild registration yet`;badge.className='badge badge-gold';badge.textContent='NOT REGISTERED';return;}
  info.textContent=`${g.guild_name} • ${formatContact(g.contact)} • ${state.user.email}`;
  if(g.is_banned || (g.ban_until && new Date(g.ban_until)>new Date())){badge.className='badge badge-red';badge.textContent='BANNED';return;}
  badge.className=g.approval_status==='approved'?'badge badge-green':'badge badge-gold'; badge.textContent=String(g.approval_status||'').toUpperCase();
}

async function loadLiveChallenges(){
  try{
    const {data,error}=await db.rpc('get_gvg_live_challenges'); if(error) throw error;
    state.challenges=data||[]; renderChallenges(); fillResultChallenges();
  }catch(error){console.error(error); $('live-challenge-list').innerHTML='<div class="empty">Could not load live challenges.</div>';}
}
function renderChallenges(){
  const target=$('live-challenge-list'); if(!target)return;
  target.innerHTML=state.challenges.length?state.challenges.map(c=>`<div class="challenge-card"><div class="meta-row"><div><div class="kicker">${escapeHtml(c.challenge_code||'CHALLENGE')}</div><div class="name">${escapeHtml(c.guild_name)}</div></div><span class="badge badge-blue">OPEN</span></div><div class="challenge-time">MATCH ${escapeHtml(formatTime(c.match_time))}</div><div class="pill-wrap">${(c.weapons||[]).map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')}${(c.active_skills||[]).map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')}</div><div class="contact-line"><a class="contact-link" href="tel:${escapeHtml(normalizeContact(c.contact_number))}">${escapeHtml(formatContact(c.contact_number))}</a><button class="btn btn-primary btn-small" type="button" data-action="result-from-challenge" data-id="${escapeHtml(c.id)}">SUBMIT RESULT</button></div></div>`).join(''):'<div class="empty">No active challenges right now.</div>';
}

async function loadGuildOptions(){
  try{const {data,error}=await db.rpc('get_gvg_guild_options'); if(error)throw error; state.guildOptions=data||[]; fillResultGuilds();}catch(error){console.error(error);}
}
function fillResultChallenges(){
  const sel=$('result-challenge'); if(!sel)return; const current=sel.value; sel.innerHTML='<option value="">Select an active challenge</option>'+state.challenges.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.guild_name)} • ${escapeHtml(formatTime(c.match_time))}</option>`).join(''); if(state.challenges.some(c=>c.id===current))sel.value=current;
}
function closeResultSuggestions(){
  ['result-winner-suggestions','result-loser-suggestions'].forEach(id=>$(id)?.classList.remove('open'));
}
function showResultGuildSuggestions(inputId,listId){
  const input=$(inputId),list=$(listId); if(!input||!list)return;
  const q=String(input.value||'').trim().toLowerCase();
  if(!q){list.innerHTML='';list.classList.remove('open');return;}
  const matches=state.guildOptions
    .map(g=>String(g.guild_name||'').trim())
    .filter(Boolean)
    .filter((name,index,arr)=>arr.indexOf(name)===index)
    .filter(name=>name.toLowerCase().startsWith(q))
    .slice(0,8);
  list.innerHTML=matches.length
    ? matches.map(name=>`<button type="button" class="autocomplete-item" data-guild-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')
    : '<div class="autocomplete-item" style="cursor:default;opacity:.6">No matching guild</div>';
  list.classList.add('open');
}
function bindResultAutocomplete(inputId,listId){
  const input=$(inputId),list=$(listId); if(!input||!list)return;
  input.addEventListener('input',()=>showResultGuildSuggestions(inputId,listId));
  input.addEventListener('focus',()=>showResultGuildSuggestions(inputId,listId));
  list.addEventListener('click',e=>{const btn=e.target.closest('[data-guild-suggestion]');if(!btn)return;input.value=btn.dataset.guildSuggestion||'';list.classList.remove('open');});
}
function initResultAutocomplete(){
  bindResultAutocomplete('result-winner','result-winner-suggestions');
  bindResultAutocomplete('result-loser','result-loser-suggestions');
  document.addEventListener('click',e=>{if(!e.target.closest('.autocomplete-wrap'))closeResultSuggestions();});
}
function fillResultGuilds(){
  closeResultSuggestions();
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
  if(files.length!==2)throw new Error('Exactly 2 proof screenshots are required.'); if(!state.user)throw new Error('LOGIN_REQUIRED: Login required.'); const urls=[];
  for(const file of files){
    if(file.size>MAX_IMAGE_SIZE)throw new Error('Each image must be 5 MB or smaller.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Only JPG, PNG and WEBP images are allowed.');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`results/${state.user.id}/${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from(IMAGE_BUCKET).upload(path,file,{upsert:false,contentType:file.type}); if(error)throw error;
    const {data}=db.storage.from(IMAGE_BUCKET).getPublicUrl(path); if(data?.publicUrl)urls.push(data.publicUrl);
  }
  return urls;
}

async function handleChallengeSubmit(e){
  e.preventDefault();clearStatus('challenge-status');if(!guildApproved())return showStatus('challenge-status','error','Your guild is not approved or is currently banned.');if(!challengePostingOpen())return showStatus('challenge-status','error','New challenges are allowed only from 10:00 AM until before 11:00 PM Pakistan time.');
  const time=$('challenge-time').value; const weapons=[...document.querySelectorAll('input[name="weapons"]:checked')].map(x=>x.value); const skills=[...document.querySelectorAll('input[name="skills"]:checked')].map(x=>x.value);
  if(!time||!weapons.length){showStatus('challenge-status','error','Match time and at least one weapon are required.');return;}
  try{setBusy('challenge-submit',true);const {data,error}=await db.rpc('submit_gvg_challenge',{p_challenge_time:time,p_weapons:weapons,p_active_skills:skills});if(error)throw error;showStatus('challenge-status','ok',`Challenge ${data?.challenge_code||''} posted successfully.`);$('challenge-form').reset();await loadLiveChallenges();}catch(error){showStatus('challenge-status','error',humanizeError(error));}finally{setBusy('challenge-submit',false,'POST CHALLENGE');}
}

async function handleResultSubmit(e){
  e.preventDefault();clearStatus('result-status');if(!guildApproved())return showStatus('result-status','error','Your guild is not approved or is currently banned.');
  const challengeId=$('result-challenge').value,winner=$('result-winner').value,loser=$('result-loser').value,score=$('result-score').value.trim();const files=[$('result-image-1').files[0],$('result-image-2').files[0]].filter(Boolean);
  if(!challengeId||!winner||!loser||!score)return showStatus('result-status','error','Challenge, winner, loser and score are required.'); if(normalizeGuild(winner)===normalizeGuild(loser))return showStatus('result-status','error','Winner and loser must be different.');if(files.length!==2)return showStatus('result-status','error','Exactly 2 proof screenshots are required.');
  try{setBusy('result-submit',true);const urls=await uploadResultImages(files);const {error}=await db.rpc('submit_gvg_result',{p_challenge_id:challengeId,p_winner_guild:winner,p_loser_guild:loser,p_score:score,p_image_urls:urls});if(error)throw error;showStatus('result-status','ok','Result submitted for admin approval.');$('result-form').reset();await loadLiveChallenges();await loadApprovedResults();}catch(error){showStatus('result-status','error',humanizeError(error));}finally{setBusy('result-submit',false,'SUBMIT RESULT');}
}

async function loadApprovedResults(){
  try{const {data,error}=await db.rpc('get_gvg_approved_results');if(error)throw error;state.results=data||[];const target=$('approved-result-list');target.innerHTML=state.results.length?state.results.map(r=>`<div class="result-slot"><div class="result-teams"><div class="team win"><strong>${escapeHtml(r.winner_guild)}</strong><small>WIN</small></div><div class="vs">VS</div><div class="team loss"><strong>${escapeHtml(r.loser_guild)}</strong><small>DEFEAT</small></div></div><div class="score-line">SCORE • ${escapeHtml(r.score)}</div></div>`).join(''):'<div class="empty">No approved results yet.</div>';}catch(error){console.error(error);$('approved-result-list').innerHTML='<div class="empty">Could not load approved results.</div>';}
}

async function loadRanking(){
  try{
    const [a,b]=await Promise.all([db.rpc('get_gvg_weekly_top20'),db.rpc('get_gvg_weekly_bottom')]);
    if(a.error)throw a.error;
    if(b.error)throw b.error;
    state.top20=a.data||[];
    state.bottom=Array.isArray(b.data)?(b.data[0]||null):b.data;
    $('member-top20-table').innerHTML=state.top20.length?state.top20.map(r=>`<tr><td class="pos">${escapeHtml(r.rank_no)}</td><td><strong>${escapeHtml(r.guild_name)}</strong></td><td class="pts ${Number(r.points)<0?'pos-red':'pos-green'}">${escapeHtml(r.points)}</td></tr>`).join(''):'<tr><td colspan="3">No ranking data yet.</td></tr>';
    $('bottom-guild').innerHTML=state.bottom?`<strong>${escapeHtml(state.bottom.guild_name)}</strong><span>${escapeHtml(state.bottom.points)} points</span>`:'<div class="muted" style="font-size:9px">No current weekly guilds.</div>';
  }catch(error){console.error(error);}
}

async function enterMember(){openView('member');openMemberSection('rules');await refreshMember();}
async function refreshMember(){
  await loadMyGuild();await renderMemberIdentity();await Promise.all([loadLiveChallenges(),loadGuildOptions(),loadApprovedResults(),loadRanking()]);
}
async function handleLogout(){try{await db.auth.signOut();}catch{}state.user=null;state.guild=null;openView('public');$('nav-logout').classList.add('hidden');$('nav-register').classList.remove('hidden');$('login-password').value='';await loadPublicTop10();}

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
    const {data,error}=await adminDb.auth.signInWithPassword({email,password});
    if(error)throw error;
    const ok=await isAdmin();
    if(!ok){
      await adminDb.auth.signOut();
      throw new Error('This account is not an active 7TH UNIVERSE admin.');
    }
    state.adminUser=data.user;
    state.adminOk=true;
    setAdminPanel(true);
    showStatus('admin-status','ok','Admin login successful.');
    openView('admin');
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
  setAdminPanel(state.adminOk);
  if(state.adminOk){openView('admin');await refreshAdmin();}
}
async function refreshAdmin(){
  if(!state.adminOk)return; $('admin-session-label').textContent=`${state.adminUser?.email||''} • Admin session active`;
  await Promise.all([loadAdminGuilds(),loadAdminResults(),loadBans()]);
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
function openModal(html){$('modal').innerHTML=html;$('modal-backdrop').classList.add('open');}
function closeModal(){$('modal-backdrop').classList.remove('open');$('modal').innerHTML='';}
function adminGuildInfo(g){
  const leaders=leaderArray(g);
  const leaderHtml=leaders.length?leaders.map((l,i)=>`<div class="leader-card"><div class="leader-title">LEADER ${i+1}</div><div class="leader-meta">${escapeHtml(l.email||'Email unavailable')}<br>${escapeHtml(formatContact(l.contact||''))}</div><div class="modal-actions"><button class="btn btn-small btn-gold" type="button" data-action="reset-password" data-email="${escapeHtml(l.email||'')}">RESET PASSWORD</button></div></div>`).join(''):'<div class="empty">No linked leader emails.</div>';
  const pending=g.approval_status==='pending';
  openModal(`<div class="modal-head"><div><div class="kicker">Guild Information</div><h3>${escapeHtml(g.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div><div class="info-grid"><div class="info-box"><small>Status</small><strong>${escapeHtml(guildStatusLabel(g))}</strong></div><div class="info-box"><small>Current Points</small><strong>${escapeHtml(g.points)}</strong></div><div class="info-box"><small>Leader Count</small><strong>${escapeHtml(g.leader_count)}</strong></div><div class="info-box"><small>Registered</small><strong>${escapeHtml(formatDateTime(g.created_at))}</strong></div></div><div class="kicker" style="margin-top:13px">Leaders</div><div class="leader-list">${leaderHtml}</div>${pending?`<div class="divider"></div><div class="modal-actions"><button class="btn btn-green" type="button" data-action="approve-guild" data-id="${escapeHtml(g.id)}">APPROVE GUILD</button><button class="btn btn-red" type="button" data-action="reject-guild" data-id="${escapeHtml(g.id)}">REJECT GUILD</button></div>`:''}`);
}
function adminGuildEdit(g){
  const leaders=leaderArray(g);
  const editableLeaders=leaders.filter(l=>l && l.id);
  const first=editableLeaders[0]||{id:g.id,contact:g.contact||'',email:''};
  const leaderOptions=editableLeaders.length?editableLeaders.map((l,i)=>`<option value="${escapeHtml(l.id)}" data-contact="${escapeHtml(l.contact||'')}" data-email="${escapeHtml(l.email||'')}">LEADER ${i+1} • ${escapeHtml(l.email||'Email unavailable')}</option>`).join(''):`<option value="${escapeHtml(g.id)}" data-contact="${escapeHtml(g.contact||'')}">REGISTERED RECORD</option>`;
  openModal(`<div class="modal-head"><div><div class="kicker">Edit Guild</div><h3>${escapeHtml(g.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div><form id="edit-guild-form"><div class="field-grid"><label class="full">LEADER RECORD<select id="edit-leader-id">${leaderOptions}</select></label><label>CONTACT NUMBER<input id="edit-contact" type="tel" value="${escapeHtml(first.contact||g.contact||'')}" required /></label><label>CURRENT WEEK POINTS<input id="edit-points" type="number" step="1" value="${escapeHtml(g.points)}" required /></label><label class="full">APPROVAL STATUS<select id="edit-status"><option value="approved" ${g.approval_status==='approved'?'selected':''}>Approved</option><option value="pending" ${g.approval_status==='pending'?'selected':''}>Pending</option><option value="rejected" ${g.approval_status==='rejected'?'selected':''}>Rejected</option></select></label></div><div class="hint">Select the leader record whose contact number you want to edit. Weekly points and approval status are shared by the whole guild.</div><div class="modal-actions"><button class="btn btn-primary" type="submit">SAVE CONTACT + POINTS</button><button class="btn btn-gold" id="edit-reset-password" type="button">CHANGE PASSWORD VIA RESET EMAIL</button><button class="btn btn-ghost" type="button" data-action="guild-info" data-id="${escapeHtml(g.id)}">CANCEL</button></div><div id="edit-status-message" class="status"></div></form>`);
  const leaderSelect=$('edit-leader-id');
  leaderSelect.addEventListener('change',()=>{const o=leaderSelect.options[leaderSelect.selectedIndex];$('edit-contact').value=o?.dataset?.contact||'';});
  $('edit-reset-password').addEventListener('click',()=>{const o=leaderSelect.options[leaderSelect.selectedIndex];resetLeaderPassword(o?.dataset?.email||'');});
  $('edit-guild-form').addEventListener('submit',async(event)=>{event.preventDefault();const leaderId=leaderSelect.value,contact=$('edit-contact').value.trim(),points=Number($('edit-points').value),status=$('edit-status').value;if(!Number.isInteger(points))return showStatus('edit-status-message','error','Points must be a whole number.');try{const {error}=await adminDb.rpc('admin_update_guild_controls',{p_guild_id:leaderId,p_contact:contact,p_points:points,p_approval_status:status});if(error)throw error;closeModal();showStatus('admin-status','ok','Guild controls updated.');await loadAdminGuilds();}catch(error){showStatus('edit-status-message','error',humanizeError(error));}});
}

async function resetLeaderPassword(email){
  if(!email)return; if(!confirm(`Send password reset email to ${email}?`))return; try{const redirectTo=`${window.location.origin}${window.location.pathname}`;const {error}=await adminDb.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;alert('Password reset email sent.');}catch(error){alert(humanizeError(error));}
}
async function removeGuild(id){const g=findGuild(id);if(!g)return;if(!confirm(`ARE YOU SURE TO WANT REMOVE THIS GUILD?\n\n${g.guild_name}`))return;try{const {error}=await adminDb.rpc('admin_remove_guild',{p_guild_id:id});if(error)throw error;closeModal();showStatus('admin-status','ok','Guild removed from registry. Historical challenge/result records remain.');await loadAdminGuilds();}catch(error){showStatus('admin-status','error',humanizeError(error));}}
async function setGuildApproval(id,status){const g=findGuild(id);if(!g)return;try{const leaders=leaderArray(g);const contact=leaders[0]?.contact||g.contact||'';const {error}=await adminDb.rpc('admin_update_guild_controls',{p_guild_id:id,p_contact:contact,p_points:Number(g.points)||0,p_approval_status:status});if(error)throw error;closeModal();showStatus('admin-status','ok',`Guild ${status}.`);await loadAdminGuilds();}catch(error){showStatus('admin-status','error',humanizeError(error));}}

async function loadAdminResults(){
  try{const {data,error}=await adminDb.rpc('admin_get_results');if(error)throw error;const rows=data||[];state.results=rows;const target=$('admin-result-table');target.innerHTML=rows.length?rows.map(r=>{const imgs=Array.isArray(r.image_urls)?r.image_urls.slice(0,2):[];const gallery=imgs.length?`<details class="proof-details"><summary>OPEN ${imgs.length} PROOF SCREENSHOTS</summary><div class="proof-gallery">${imgs.map((u,i)=>`<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><span class="proof-tag">PROOF ${i+1}</span><img src="${escapeHtml(u)}" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} proof ${i+1}" /></a>`).join('')}</div></details>`:'<span class="muted">No proof</span>';return `<tr><td><strong>${escapeHtml(r.winner_guild)}</strong><div class="muted" style="margin-top:3px">DEFEAT</div><strong>${escapeHtml(r.loser_guild)}</strong></td><td>${escapeHtml(r.score)}</td><td>${gallery}<div style="margin-top:6px"><span class="status-pill ${r.status==='approved'?'status-approved':r.status==='pending'?'status-pending':'status-rejected'}">${escapeHtml(r.status)}</span></div></td><td>${r.status==='pending'?`<div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn-green btn-small" type="button" data-action="approve-result" data-id="${escapeHtml(r.id)}">APPROVE</button><button class="btn btn-red btn-small" type="button" data-action="reject-result" data-id="${escapeHtml(r.id)}">REJECT</button></div>`:'—'}</td></tr>`;}).join(''):'<tr><td colspan="4">No result submissions.</td></tr>';}catch(error){showStatus('admin-status','error',humanizeError(error));}
}
async function approveResult(id){try{const {error}=await adminDb.rpc('admin_approve_result',{p_result_id:id});if(error)throw error;showStatus('admin-status','ok','Result approved and weekly points awarded.');await Promise.all([loadAdminResults(),loadAdminGuilds()]);}catch(error){showStatus('admin-status','error',humanizeError(error));}}
async function rejectResult(id){const reason=prompt('Reason for rejection:','Proof or result issue');if(reason===null)return;try{const {error}=await adminDb.rpc('admin_reject_result',{p_result_id:id,p_reason:reason.trim()||'Rejected by admin'});if(error)throw error;showStatus('admin-status','ok','Result rejected. The challenge is open again while it is still inside its cycle.');await loadAdminResults();}catch(error){showStatus('admin-status','error',humanizeError(error));}}

async function handleBan(e){e.preventDefault();clearStatus('ban-status');const guild=$('ban-guild').value.trim(),contact=$('ban-contact').value.trim(),duration=$('ban-duration').value,reason=$('ban-reason').value.trim()||'Rule violation';if(!guild&&!contact)return showStatus('ban-status','error','Enter a guild name or contact number.');let until=null;const now=new Date();if(duration==='1h')until=new Date(now.getTime()+60*60*1000);if(duration==='6h')until=new Date(now.getTime()+6*60*60*1000);if(duration==='1d')until=new Date(now.getTime()+24*60*60*1000);if(duration==='3d')until=new Date(now.getTime()+3*24*60*60*1000);if(duration==='7d')until=new Date(now.getTime()+7*24*60*60*1000);try{const {error}=await adminDb.rpc('admin_ban_guild_identity',{p_guild_name:guild||null,p_contact:contact||null,p_ban_until:until?until.toISOString():null,p_reason:reason});if(error)throw error;showStatus('ban-status','ok',until?`Guild banned until ${formatDateTime(until)}.`:'Guild permanently banned.');e.target.reset();$('ban-reason').value='Rule violation';await Promise.all([loadAdminGuilds(),loadBans()]);}catch(error){showStatus('ban-status','error',humanizeError(error));}}
async function loadBans(){
  try{const {data,error}=await adminDb.rpc('admin_get_active_bans');if(error)throw error;state.bans=data||[];const target=$('ban-list');target.innerHTML=state.bans.length?state.bans.map(b=>`<div class="challenge-card"><div class="meta-row"><div><div class="name">${escapeHtml(b.guild_name||'Identity ban')}</div><div class="subtle">${escapeHtml(formatContact(b.contact||''))}</div></div><span class="badge badge-red">${b.ban_until?escapeHtml(formatDateTime(b.ban_until)):'PERMANENT'}</span></div><div class="contact-line"><span class="muted" style="font-size:8px">${escapeHtml(b.reason||'Rule violation')}</span><button class="btn btn-green btn-small" type="button" data-action="unban-identity" data-guild="${escapeHtml(b.guild_name||'')}" data-contact="${escapeHtml(b.contact||'')}">UNBAN</button></div></div>`).join(''):'<div class="empty">No active bans.</div>';}catch(error){console.error(error);}
}
async function unbanIdentity(guild,contact){try{const {error}=await adminDb.rpc('admin_unban_guild_identity',{p_guild_name:guild||null,p_contact:contact||null});if(error)throw error;showStatus('admin-status','ok','Guild unbanned.');await Promise.all([loadAdminGuilds(),loadBans()]);}catch(error){showStatus('admin-status','error',humanizeError(error));}}

/* ------------------------- Events ------------------------- */
document.addEventListener('click',async(e)=>{
  const actionEl=e.target.closest('[data-action]');
  if(actionEl){const action=actionEl.dataset.action,id=actionEl.dataset.id;if(action==='result-from-challenge')return selectChallengeForResult(id);if(action==='close-modal')return closeModal();if(action==='guild-info'){const g=findGuild(id);if(g)adminGuildInfo(g);return;}if(action==='guild-edit'){const g=findGuild(id);if(g)adminGuildEdit(g);return;}if(action==='guild-remove')return removeGuild(id);if(action==='approve-guild')return setGuildApproval(id,'approved');if(action==='reject-guild')return setGuildApproval(id,'rejected');if(action==='reset-password')return resetLeaderPassword(actionEl.dataset.email||'');if(action==='approve-result')return approveResult(id);if(action==='reject-result')return rejectResult(id);if(action==='unban-identity')return unbanIdentity(actionEl.dataset.guild||'',actionEl.dataset.contact||'');}
  const menuBtn=e.target.closest('[data-menu-button]');if(menuBtn){const id=menuBtn.dataset.menuButton;document.querySelectorAll('.dots-menu.open').forEach(x=>{if(x.id!==`menu-${id}`)x.classList.remove('open')});document.getElementById(`menu-${id}`)?.classList.toggle('open');return;}document.querySelectorAll('.dots-menu.open').forEach(x=>x.classList.remove('open'));
});
document.querySelectorAll('[data-member-section]').forEach(btn=>btn.addEventListener('click',()=>openMemberSection(btn.dataset.memberSection)));
initResultAutocomplete();
$('nav-admin').addEventListener('click',async()=>{openView('admin');await restoreAdmin();});
$('nav-register').addEventListener('click',()=>openView('register'));
$('nav-logout').addEventListener('click',handleLogout);
$('back-login').addEventListener('click',()=>openView('public'));
$('admin-back').addEventListener('click',()=>openView(state.user?'member':'public'));
$('login-form').addEventListener('submit',handleLogin);
$('register-form').addEventListener('submit',handleRegister);
$('forgot-password').addEventListener('click',handleForgot);
$('challenge-form').addEventListener('submit',handleChallengeSubmit);
$('result-form').addEventListener('submit',handleResultSubmit);
$('admin-login-form').addEventListener('submit',handleAdminLogin);
$('admin-logout').addEventListener('click',async()=>{try{await adminDb.auth.signOut();}catch{}state.adminUser=null;state.adminOk=false;openView(state.user?'member':'public');});
$('admin-guild-search').addEventListener('input',()=>renderGuildTable('all-guild-table',filteredGuilds()));
$('modal-backdrop').addEventListener('click',(e)=>{if(e.target===$('modal-backdrop'))closeModal();});

db.auth.onAuthStateChange(async(event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
    $('password-recovery-backdrop').classList.add('open');
    return;
  }
  if(session){state.user=session.user;await loadMyGuild();if(!location.hash.includes('admin')){openView('member');await refreshMember();}$('nav-logout').classList.remove('hidden');$('nav-register').classList.add('hidden');}
  else {state.user=null;state.guild=null;openView('public');$('nav-logout').classList.add('hidden');$('nav-register').classList.remove('hidden');}
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
  if(session){state.user=session.user;await loadMyGuild();await completePendingRegistration();await enterMember();$('nav-logout').classList.remove('hidden');$('nav-register').classList.add('hidden');}
  else{openView('public');await loadPublicTop10();}
  await restoreAdmin();
})();
