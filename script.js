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
function setBusy(buttonId,busy,label){ let btn=$(buttonId); if(btn?.tagName==='FORM') btn=btn.querySelector('button[type=submit]'); if(!btn) return; btn.disabled=busy; if(busy) btn.dataset.oldText=btn.textContent; btn.textContent=busy?'PLEASE WAIT…':(label||btn.dataset.oldText||'SUBMIT'); }
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

function memberDashboardAllowed(){
  return Boolean(state.user && guildApproved());
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

  document.querySelectorAll('.member-view').forEach(el=>{
    if(!allowed) el.classList.remove('active');
  });
}

function openMemberSection(name){
  const allowed=['rules','challenges','results','ranking'];
  const section=allowed.includes(name)?name:'rules';

  if(!memberDashboardAllowed()){
    setMemberAccessGate();
    return;
  }

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
    showStatus('login-status','ok','Account confirmed and guild registration has been submitted. Admin approval is required.');
  }catch(error){
    const message=String(error?.message||error||'').trim();

    /*
      A pending browser record must never keep retrying forever.
      If the account already owns a guild, or the registration is blocked,
      remove the stale pending request and let the leader see the real state.
    */
    if(/ALREADY_REGISTERED/i.test(message)){
      clearPendingRegistration();
      await loadMyGuild();
    }

    showStatus('login-status','error',humanizeError(error));
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

    const {data,error}=await db.auth.signInWithPassword({email,password});
    if(error) throw error;

    state.user=data.user;
    await loadMyGuild();
    await completePendingRegistration();
    await enterMember();
  }catch(error){
    showStatus('login-status','error',humanizeError(error));
  }finally{
    setBusy('login-form',false,'LOGIN TO GVG');
  }
}

async function handleRegister(e){
  e.preventDefault();
  clearStatus('register-status');

  const guild=$('register-guild').value.trim();
  const contact=$('register-contact').value.trim();
  const email=$('register-email').value.trim().toLowerCase();
  const password=$('register-password').value;
  const passwordConfirm=$('register-password-confirm').value;

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
    openView('member');
    await refreshMember();
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
    const loginResult=await db.auth.signInWithPassword({email,password});

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
      options:{data:{account_type:'guild'}}
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

    if(/invalid login credentials/i.test(message)){
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
    const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo});
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
  if(!state.user){info.textContent='Not logged in';badge.className='badge badge-red';badge.textContent='LOGOUT';return;}
  const g=state.guild;
  if(!g){info.textContent=`${state.user.email} • No guild registration yet`;badge.className='badge badge-gold';badge.textContent='NOT REGISTERED';return;}
  info.textContent=`${g.guild_name} • ${formatContact(g.contact)} • ${state.user.email}`;
  if(g.is_banned || (g.ban_until && new Date(g.ban_until)>new Date())){badge.className='badge badge-red';badge.textContent='BANNED';return;}
  badge.className=g.approval_status==='approved'?'badge badge-green':'badge badge-gold'; badge.textContent=String(g.approval_status||'').toUpperCase();
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
  if(!q) return [];
  const serial=++guildSearchSerial;
  try{
    const {data,error}=await db.rpc('search_gvg_guilds',{p_query:q});
    if(error) throw error;
    if(serial!==guildSearchSerial) return [];
    return (data||[])
      .map(r=>String(r.guild_name||'').trim())
      .filter(Boolean);
  }catch(error){
    console.error('Guild autocomplete search failed:',error);
    return getResultGuildNames()
      .filter(name=>name.toLowerCase().startsWith(q.toLowerCase()))
      .slice(0,10);
  }
}

async function loadGuildOptions(){
  try{
    const {data,error}=await db.rpc('get_gvg_guild_options');
    if(error) throw error;
    state.guildOptions=data||[];
  }catch(error){
    console.error('Guild options load failed:',error);
    state.guildOptions=[];
  }
  fillResultGuilds();
}

function getResultGuildNames(){
  const names=[
    ...state.guildOptions.map(g=>g.guild_name),
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
  if(q.length<1){
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
  try{setBusy('result-submit',true);const urls=await uploadResultImages(files);const {error}=await db.rpc('submit_gvg_result',{p_challenge_id:challengeId,p_winner_guild:winner,p_loser_guild:loser,p_score:score,p_image_urls:urls});if(error)throw error;showStatus('result-status','ok','Result submitted for admin approval.');$('result-form').reset();await Promise.all([loadLiveChallenges(),loadApprovedResults(),loadMyResultSubmissions()]);}catch(error){showStatus('result-status','error',humanizeError(error));}finally{setBusy('result-submit',false,'SUBMIT RESULT');}
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

async function loadRanking(){
  const topTarget=$('member-top20-table');
  const bottomTarget=$('bottom-guild');

  if(topTarget) topTarget.innerHTML='<tr><td colspan="3">Loading ranking…</td></tr>';
  if(bottomTarget) bottomTarget.innerHTML='<div class="muted" style="font-size:9px">Loading…</div>';

  /*
     Primary Top 20 source = the original/current-week leaderboard RPC.
     This RPC already exists in the live project. We use it first so the
     ranking does not depend on the newer helper RPC being present in the
     PostgREST schema cache. If it fails, fall back to the V18 helper.
  */
  try{
    let topResult=await rpcWithTimeout('Top 20 ranking',()=>db.rpc('get_gvg_weekly_leaderboard'));
    if(topResult?.error) throw topResult.error;
    let rows=(topResult?.data||[]).slice(0,20);

    if(!rows.length){
      try{
        const fallback=await rpcWithTimeout('Top 20 fallback',()=>db.rpc('get_gvg_weekly_top20'));
        if(fallback?.error) throw fallback.error;
        rows=fallback?.data||[];
      }catch(fallbackError){
        console.warn('Top 20 fallback failed:',fallbackError);
      }
    }

    state.top20=rows;
    if(topTarget){
      topTarget.innerHTML=state.top20.length
        ? state.top20.map((r,i)=>{
            const rank=Number.isFinite(Number(r.rank_no))?Number(r.rank_no):(i+1);
            return `<tr><td class="pos">${escapeHtml(rank)}</td><td><strong>${escapeHtml(r.guild_name)}</strong></td><td class="pts ${Number(r.points)<0?'pos-red':'pos-green'}">${escapeHtml(r.points)}</td></tr>`;
          }).join('')
        : '<tr><td colspan="3">No current-week ranking records yet.</td></tr>';
    }
  }catch(error){
    console.error('Top 20 ranking load failed:',error);
    if(topTarget) topTarget.innerHTML=`<tr><td colspan="3">${escapeHtml(humanizeError(error))}</td></tr>`;
  }

  /* Bottom Guild remains its own independent request. */
  try{
    const bottomResult=await rpcWithTimeout('Bottom guild',()=>db.rpc('get_gvg_weekly_bottom'));
    if(bottomResult?.error) throw bottomResult.error;
    state.bottom=Array.isArray(bottomResult?.data)
      ? (bottomResult.data[0]||null)
      : bottomResult?.data;
    if(bottomTarget){
      bottomTarget.innerHTML=state.bottom
        ? `<div class="bottom-guild-name">${escapeHtml(state.bottom.guild_name)}</div><div class="bottom-guild-points">${escapeHtml(state.bottom.points)} POINTS</div><div class="bottom-guild-record">WINS ${escapeHtml(state.bottom.wins)} • LOSSES ${escapeHtml(state.bottom.losses)}</div>`
        : '<div class="muted" style="font-size:9px">No current-week ranking record yet.</div>';
    }
  }catch(error){
    console.error('Bottom guild load failed:',error);
    if(bottomTarget) bottomTarget.innerHTML=`<div class="muted" style="font-size:9px">${escapeHtml(humanizeError(error))}</div>`;
  }
}

function syncRegisterNav(){
  const registerButton=$('nav-register'),logoutButton=$('nav-logout');
  if(!registerButton||!logoutButton) return;
  if(state.user){
    logoutButton.classList.remove('hidden');
    /* A logged-in leader whose registry row was removed must still be able
       to open REGISTER and recreate the guild registration. */
    registerButton.classList.toggle('hidden',Boolean(state.guild));
  }else{
    logoutButton.classList.add('hidden');
    registerButton.classList.remove('hidden');
  }
}

async function enterMember(){
  openView('member');
  await refreshMember();
  if(memberDashboardAllowed()) openMemberSection('rules');
  else setMemberAccessGate();
}
async function refreshMember(){
  await loadMyGuild();
  await renderMemberIdentity();
  setMemberAccessGate();

  if(memberDashboardAllowed()){
    await Promise.all([
      loadLiveChallenges(),
      loadGuildOptions(),
      loadApprovedResults(),
      loadMyResultSubmissions(),
      loadRanking()
    ]);
  }
  setMemberAccessGate();
}
async function handleLogout(){try{await db.auth.signOut();}catch{}state.user=null;state.guild=null;openView('public');syncRegisterNav();$('login-password').value='';await loadPublicTop10();}

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
  setAdminPanel(state.adminOk);
  if(state.adminOk){openView('admin');openAdminSection('guilds');await refreshAdmin();}
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
            <button class="btn btn-small btn-red" type="button" data-action="remove-leader" data-id="${escapeHtml(l.id)}" data-guild="${escapeHtml(g.guild_name)}">REMOVE THIS LEADER</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">No linked leader emails.</div>';

  openModal(`<div class="modal-head"><div><div class="kicker">Guild Information</div><h3>${escapeHtml(g.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div><div class="info-grid"><div class="info-box"><small>Guild Status</small><strong>${escapeHtml(guildStatusLabel(g))}</strong></div><div class="info-box"><small>Current Points</small><strong>${escapeHtml(g.points)}</strong></div><div class="info-box"><small>Leader Count</small><strong>${escapeHtml(g.leader_count)}</strong></div><div class="info-box"><small>Registered</small><strong>${escapeHtml(formatDateTime(g.created_at))}</strong></div></div><div class="kicker" style="margin-top:13px">LEADERS</div><div class="leader-list">${leaderHtml}</div><div class="divider"></div><div class="modal-actions"><button class="btn btn-red" type="button" data-action="guild-remove" data-id="${escapeHtml(g.id)}">REMOVE WHOLE GUILD</button></div>`);
}

function adminGuildEdit(g){
  const leaders=leaderArray(g);
  const editableLeaders=leaders.filter(l=>l && l.id);
  const first=editableLeaders[0]||{id:g.id,contact:g.contact||'',email:''};
  const leaderOptions=editableLeaders.length?editableLeaders.map((l,i)=>`<option value="${escapeHtml(l.id)}" data-contact="${escapeHtml(l.contact||'')}" data-email="${escapeHtml(l.email||'')}">LEADER ${i+1} • ${escapeHtml(l.email||'Email unavailable')}</option>`).join(''):`<option value="${escapeHtml(g.id)}" data-contact="${escapeHtml(g.contact||'')}">REGISTERED RECORD</option>`;
  openModal(`<div class="modal-head"><div><div class="kicker">Edit Guild</div><h3>${escapeHtml(g.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div><form id="edit-guild-form"><div class="field-grid"><label class="full">LEADER RECORD<select id="edit-leader-id">${leaderOptions}</select></label><label>CONTACT NUMBER<input id="edit-contact" type="tel" value="${escapeHtml(first.contact||g.contact||'')}" required /></label><label>CURRENT WEEK POINTS<input id="edit-points" type="number" step="1" value="${escapeHtml(g.points)}" required /></label><label class="full">LEADER APPROVAL STATUS<select id="edit-status"><option value="approved" ${editableLeaders[0]?.approval_status==='approved'?'selected':''}>Approved</option><option value="pending" ${editableLeaders[0]?.approval_status==='pending'?'selected':''}>Pending</option><option value="rejected" ${editableLeaders[0]?.approval_status==='rejected'?'selected':''}>Rejected</option></select></label></div><div class="hint">Select the individual leader record whose contact/status you want to edit. Weekly points remain shared by the guild.</div><div class="modal-actions"><button class="btn btn-primary" type="submit">SAVE CONTACT + POINTS</button><button class="btn btn-gold" id="edit-reset-password" type="button">CHANGE PASSWORD VIA RESET EMAIL</button><button class="btn btn-ghost" type="button" data-action="guild-info" data-id="${escapeHtml(g.id)}">CANCEL</button></div><div id="edit-status-message" class="status"></div></form>`);
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
  $('edit-guild-form').addEventListener('submit',async(event)=>{event.preventDefault();const leaderId=leaderSelect.value,contact=$('edit-contact').value.trim(),points=Number($('edit-points').value),status=$('edit-status').value;if(!Number.isInteger(points))return showStatus('edit-status-message','error','Points must be a whole number.');try{const {error}=await adminDb.rpc('admin_update_guild_controls',{p_guild_id:leaderId,p_contact:contact,p_points:points,p_approval_status:status});if(error)throw error;closeModal();showStatus('admin-status','ok','Guild controls updated.');await loadAdminGuilds();}catch(error){showStatus('edit-status-message','error',humanizeError(error));}});
}

async function resetLeaderPassword(email){
  if(!email)return; if(!confirm(`Send password reset email to ${email}?`))return; try{const redirectTo=`${window.location.origin}${window.location.pathname}`;const {error}=await adminDb.auth.resetPasswordForEmail(email,{redirectTo});if(error)throw error;alert('Password reset email sent.');}catch(error){alert(humanizeError(error));}
}
async function removeGuild(id){const g=findGuild(id);if(!g)return;if(!confirm(`ARE YOU SURE TO WANT REMOVE THIS GUILD?\n\n${g.guild_name}`))return;try{const {error}=await adminDb.rpc('admin_remove_guild',{p_guild_id:id});if(error)throw error;closeModal();showStatus('admin-status','ok','Guild removed from registry. Historical challenge/result records remain.');await loadAdminGuilds();}catch(error){showStatus('admin-status','error',humanizeError(error));}}
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
      p_points:Number(found.guild.points)||0,
      p_approval_status:status
    });

    if(error) throw error;

    closeModal();
    showStatus('admin-status','ok',`Leader ${status}.`);
    await loadAdminGuilds();
  }catch(error){
    showStatus('admin-status','error',humanizeError(error));
  }
}

async function removeLeader(leaderId,guildName){
  if(!confirm(`ARE YOU SURE TO WANT REMOVE THIS LEADER?\n\n${guildName||'Guild Leader'}`)) return;

  try{
    const {error}=await adminDb.rpc('admin_remove_guild_leader',{p_guild_id:leaderId});
    if(error) throw error;

    closeModal();
    showStatus('admin-status','ok','Leader removed. The Auth account remains available for re-registration.');
    await loadAdminGuilds();
  }catch(error){
    showStatus('admin-status','error',humanizeError(error));
  }
}

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

function openAdminSection(name){
  const section=['guilds','results','ban'].includes(name)?name:'guilds';
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
  if(section==='guilds') loadAdminGuilds();
  if(section==='results') loadAdminResults();
  if(section==='ban') loadBans();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ------------------------- Events ------------------------- */
document.addEventListener('click',async(e)=>{
  const actionEl=e.target.closest('[data-action]');
  if(actionEl){const action=actionEl.dataset.action,id=actionEl.dataset.id;if(action==='result-from-challenge')return selectChallengeForResult(id);if(action==='close-modal')return closeModal();if(action==='guild-info'){const g=findGuild(id);if(g)adminGuildInfo(g);return;}if(action==='guild-edit'){const g=findGuild(id);if(g)adminGuildEdit(g);return;}if(action==='guild-remove')return removeGuild(id);if(action==='approve-leader')return setLeaderApproval(id,'approved');if(action==='reject-leader')return setLeaderApproval(id,'rejected');if(action==='remove-leader')return removeLeader(id,actionEl.dataset.guild||'');if(action==='reset-password')return resetLeaderPassword(actionEl.dataset.email||'');if(action==='approve-result')return approveResult(id);if(action==='reject-result')return rejectResult(id);if(action==='unban-identity')return unbanIdentity(actionEl.dataset.guild||'',actionEl.dataset.contact||'');}
  const menuBtn=e.target.closest('[data-menu-button]');if(menuBtn){const id=menuBtn.dataset.menuButton;document.querySelectorAll('.dots-menu.open').forEach(x=>{if(x.id!==`menu-${id}`)x.classList.remove('open')});document.getElementById(`menu-${id}`)?.classList.toggle('open');return;}document.querySelectorAll('.dots-menu.open').forEach(x=>x.classList.remove('open'));
});
document.querySelectorAll('[data-member-section]').forEach(btn=>btn.addEventListener('click',()=>openMemberSection(btn.dataset.memberSection)));
document.querySelectorAll('[data-admin-section]').forEach(btn=>btn.addEventListener('click',()=>openAdminSection(btn.dataset.adminSection)));
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
    $('recovery-password')?.focus();
    return;
  }
  if(session){state.user=session.user;await loadMyGuild();syncRegisterNav();if(!location.hash.includes('admin')){openView('member');await refreshMember();}}
  else {state.user=null;state.guild=null;syncRegisterNav();openView('public');}
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
  if(session){state.user=session.user;await loadMyGuild();await completePendingRegistration();await enterMember();syncRegisterNav();}
  else{state.user=null;state.guild=null;syncRegisterNav();openView('public');await loadPublicTop10();}
  await restoreAdmin();
})();
