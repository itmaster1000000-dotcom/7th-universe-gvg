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
const moderatorDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-moderator-session-v1', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

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
  weeklyMatches: [],
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
function humanizeError(error){ const msg=String(error?.message || error?.error_description || error || 'Unknown error').trim(); return msg.replace(/^(Error:\s*)/i,''); }
function currentPakistanParts(){ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()); const o={}; for(const p of parts) o[p.type]=p.value; return {year:Number(o.year),month:Number(o.month),day:Number(o.day),hour:Number(o.hour)%24,minute:Number(o.minute)}; }
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
  const allowed=['rules','challenges','results','ranking','registered-guilds','guild-profiles','hall-of-fame'];
  const section=allowed.includes(name)?name:'rules';

  if(!memberDashboardAllowed()){
    setMemberAccessGate();
    return;
  }

  document.querySelectorAll('.member-view').forEach(el=>el.classList.toggle('active',el.id===`member-section-${section}`));
  document.querySelectorAll('[data-member-section]').forEach(btn=>btn.classList.toggle('active',btn.dataset.memberSection===section));
  if(section==='challenges') loadLiveChallenges();
  if(section==='results') { loadLiveChallenges(); loadGuildOptions(); loadApprovedResults(); }
  if(section==='ranking') setRankingMode(state.rankingMode || 'current-week');
  if(section==='registered-guilds') loadRegisteredGuilds();
  if(section==='guild-profiles') { loadPublicGuildProfiles(); loadMyGuildNameChangeStatus(); }
  if(section==='hall-of-fame') loadHallOfFame();
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

async function loadRegisteredGuilds(){
  const target=$('registered-guild-list');
  const countBadge=$('registered-guild-count');
  if(!target) return;
  target.innerHTML='<tr><td colspan="4">Loading registered guilds...</td></tr>';
  try{
    const {data,error}=await db.rpc('get_gvg_registered_guilds');
    if(error) throw error;
    state.registeredGuilds=data||[];
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
  if(files.length!==1)throw new Error('Exactly 1 result proof image is required.'); if(!state.user)throw new Error('LOGIN_REQUIRED: Login required.'); const urls=[];
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
  e.preventDefault();clearStatus('challenge-status');if(!guildApproved())return showStatus('challenge-status','error','Your guild is not approved or is currently banned.');if(!challengePostingOpen())return showStatus('challenge-status','error','New challenges are allowed from 10:00 AM until 11:59 PM Pakistan time. At 12:00 AM, challenges close.');
  const time=$('challenge-time').value; const weapons=[...document.querySelectorAll('input[name="weapons"]:checked')].map(x=>x.value); const skills=[...document.querySelectorAll('input[name="skills"]:checked')].map(x=>x.value); const pcAllowed=$('challenge-pc-allowed')?.value==='true';
  if(!time||!weapons.length){showStatus('challenge-status','error','Match time and at least one weapon are required.');return;}
  try{setBusy('challenge-submit',true);const {data,error}=await db.rpc('submit_gvg_challenge',{p_challenge_time:time,p_weapons:weapons,p_active_skills:skills,p_pc_allowed:pcAllowed});if(error)throw error;showStatus('challenge-status','ok',`Challenge ${data?.challenge_code||''} posted successfully. PC: ${pcAllowed?'ALLOW':'NOT ALLOW'}.`);$('challenge-form').reset();clearTimePicker();await loadLiveChallenges();}catch(error){showStatus('challenge-status','error',humanizeError(error));}finally{setBusy('challenge-submit',false,'POST CHALLENGE');}
}

async function handleResultSubmit(e){
  // V18.5: Results may be submitted at any time for an active challenge.
  e.preventDefault();clearStatus('result-status');if(!guildApproved())return showStatus('result-status','error','Your guild is not approved or is currently banned.');
  const challengeId=$('result-challenge').value,winner=$('result-winner').value,loser=$('result-loser').value,score=$('result-score').value.trim();const files=[$('result-image-1').files[0]].filter(Boolean);
  if(!challengeId||!winner||!loser||!score)return showStatus('result-status','error','Challenge, winner, loser and score are required.'); if(normalizeGuild(winner)===normalizeGuild(loser))return showStatus('result-status','error','Winner and loser must be different.');if(files.length!==1)return showStatus('result-status','error','Upload exactly one result proof image.');
  try{setBusy('result-submit',true);const urls=await uploadResultImages(files);
    // Upload exactly one proof file. The existing production RPC may enforce its legacy 2-slot array; repeat the same URL as a compatibility pointer, never upload a second image.
    const proofUrls=urls.length===1?[urls[0],urls[0]]:urls;
    const {error}=await db.rpc('submit_gvg_result',{p_challenge_id:challengeId,p_winner_guild:winner,p_loser_guild:loser,p_score:score,p_image_urls:proofUrls});if(error)throw error;showStatus('result-status','ok','Result submitted for admin approval.');$('result-form').reset();await Promise.all([loadLiveChallenges(),loadApprovedResults(),loadMyResultSubmissions()]);}catch(error){showStatus('result-status','error',humanizeError(error));}finally{setBusy('result-submit',false,'SUBMIT RESULT');}
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
  loadRanking(selected);
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
      loadRanking(state.rankingMode || 'current-week'),
      loadRegisteredGuilds()
    ]);
  }
  setMemberAccessGate();
}
async function handleLogout(){try{await db.auth.signOut();}catch{}state.user=null;state.guild=null;openView('public');syncRegisterNav();$('login-password').value='';}

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
  await Promise.all([loadAdminGuilds(),loadAdminResults(),loadBans(),loadAdminWeeklyMatches(),loadAdminGuildNameChangeRequests()]);
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

function preferredResultProofUrls(imageUrls){
  let urls=imageUrls;
  if(typeof urls==='string'){try{urls=JSON.parse(urls);}catch{urls=[];}}
  if(!Array.isArray(urls)||!urls.length)return [];
  // Legacy records had [challenge screenshot, actual result proof]; newer one-upload records contain one URL or two copies of the same URL.
  return [urls.length>=2?urls[1]:urls[0]];
}

async function loadAdminResults(){
  try{const {data,error}=await adminDb.rpc('admin_get_results');if(error)throw error;const rows=data||[];state.results=rows;const target=$('admin-result-table');target.innerHTML=rows.length?rows.map(r=>{const imgs=preferredResultProofUrls(r.image_urls);const gallery=imgs.length?`<details class="proof-details"><summary>OPEN RESULT PROOF</summary><div class="proof-gallery">${imgs.map((u,i)=>`<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><span class="proof-tag">RESULT PROOF</span><img src="${escapeHtml(u)}" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} result proof" /></a>`).join('')}</div></details>`:'<span class="muted">No proof</span>';return `<tr><td><strong>${escapeHtml(r.winner_guild)}</strong><div class="muted" style="margin-top:3px">DEFEAT</div><strong>${escapeHtml(r.loser_guild)}</strong></td><td>${escapeHtml(r.score)}</td><td><strong style="font-size:9px">${escapeHtml(formatDateTime(r.created_at))}</strong><div class="muted" style="margin-top:4px;font-size:7px">PAKISTAN TIME</div></td><td>${gallery}<div style="margin-top:6px"><span class="status-pill ${r.status==='approved'?'status-approved':r.status==='pending'?'status-pending':'status-rejected'}">${escapeHtml(r.status)}</span></div></td><td>${r.status==='pending'?`<div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn btn-green btn-small" type="button" data-action="approve-result" data-id="${escapeHtml(r.id)}">APPROVE</button><button class="btn btn-red btn-small" type="button" data-action="reject-result" data-id="${escapeHtml(r.id)}">REJECT</button></div>`:'—'}</td></tr>`;}).join(''):'<tr><td colspan="4">No result submissions.</td></tr>';}catch(error){showStatus('admin-status','error',humanizeError(error));}
}
async function approveResult(id){try{const {error}=await adminDb.rpc('admin_approve_result',{p_result_id:id});if(error)throw error;showStatus('admin-status','ok','Result approved and weekly points awarded.');await Promise.all([loadAdminResults(),loadAdminGuilds()]);}catch(error){showStatus('admin-status','error',humanizeError(error));}}
async function rejectResult(id){const reason=prompt('Reason for rejection:','Proof or result issue');if(reason===null)return;try{const {error}=await adminDb.rpc('admin_reject_result',{p_result_id:id,p_reason:reason.trim()||'Rejected by admin'});if(error)throw error;showStatus('admin-status','ok','Result rejected. The challenge is open again while it is still inside its cycle.');await loadAdminResults();}catch(error){showStatus('admin-status','error',humanizeError(error));}}

async function handleBan(e){e.preventDefault();clearStatus('ban-status');const guild=$('ban-guild').value.trim(),contact=$('ban-contact').value.trim(),duration=$('ban-duration').value,reason=$('ban-reason').value.trim()||'Rule violation';if(!guild&&!contact)return showStatus('ban-status','error','Enter a guild name or contact number.');let until=null;const now=new Date();if(duration==='1h')until=new Date(now.getTime()+60*60*1000);if(duration==='6h')until=new Date(now.getTime()+6*60*60*1000);if(duration==='1d')until=new Date(now.getTime()+24*60*60*1000);if(duration==='3d')until=new Date(now.getTime()+3*24*60*60*1000);if(duration==='7d')until=new Date(now.getTime()+7*24*60*60*1000);try{const {error}=await adminDb.rpc('admin_ban_guild_identity',{p_guild_name:guild||null,p_contact:contact||null,p_ban_until:until?until.toISOString():null,p_reason:reason});if(error)throw error;showStatus('ban-status','ok',until?`Guild banned until ${formatDateTime(until)}.`:'Guild permanently banned.');e.target.reset();$('ban-reason').value='Rule violation';await Promise.all([loadAdminGuilds(),loadBans()]);}catch(error){showStatus('ban-status','error',humanizeError(error));}}
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

function renderWeeklyMatches(rows){
  const dayTarget=$('weekly-day-grid');
  const guildTarget=$('weekly-guild-table');
  const windowTarget=$('weekly-window');
  const totalTarget=$('weekly-total-results');
  const activeTarget=$('weekly-active-guilds');
  const topDayTarget=$('weekly-top-day');
  const topDayCountTarget=$('weekly-top-day-count');
  const refreshTarget=$('weekly-last-refresh');
  if(!dayTarget||!guildTarget) return;

  state.weeklyMatches=rows||[];
  if(!rows.length){
    dayTarget.innerHTML='<div class="empty">No registered guilds are available for this week.</div>';
    guildTarget.innerHTML='<tr><td colspan="11">No registered guilds found.</td></tr>';
    if(totalTarget) totalTarget.textContent='0';
    if(activeTarget) activeTarget.textContent='0';
    if(topDayTarget) topDayTarget.textContent='—';
    if(topDayCountTarget) topDayCountTarget.textContent='No matches yet';
    return;
  }

  const first=rows[0];
  if(windowTarget) windowTarget.textContent=`CURRENT WEEK • ${formatWeekRange(first.week_start)}`;
  const defs=weeklyDayDefinitions(first.week_start);
  const dayTotals=defs.map(d=>({label:d.label,count:rows.reduce((sum,r)=>sum+Number(r[d.key]||0),0)}));
  const totalResults=Number(first.week_end?rows.reduce((sum,r)=>sum+Number(r.total_matches||0),0):0)/2;
  const activeGuilds=rows.filter(r=>Number(r.total_matches||0)>0).length;
  const topDay=dayTotals.reduce((a,b)=>b.count>a.count?b:a,{label:'—',count:0});
  if(totalTarget) totalTarget.textContent=String(Math.round(totalResults));
  if(activeTarget) activeTarget.textContent=String(activeGuilds);
  if(topDayTarget) topDayTarget.textContent=topDay.count?topDay.label:'—';
  if(topDayCountTarget) topDayCountTarget.textContent=topDay.count?`${Math.round(topDay.count/2)} match results`:'No matches yet';
  if(refreshTarget) refreshTarget.textContent=formatDateTime(new Date());

  dayTarget.innerHTML=dayTotals.map((d,i)=>`<div class="weekly-day-card ${d.count&&d.label===defs[(new Date().getDay())]?.label?'today':''}"><span>${d.label}</span><strong>${escapeHtml(Math.round(d.count/2))}</strong><small>match results</small></div>`).join('');

  guildTarget.innerHTML=rows.map(r=>{
    const total=Number(r.total_matches||0);
    const leaderCount=Number(r.leader_count||0);
    return `<tr class="${total?'live-row':''}">
      <td><div class="weekly-guild-row-name">${escapeHtml(r.guild_name)}</div><div class="muted" style="margin-top:3px;font-size:7px">${leaderCount} LEADER${leaderCount===1?'':'S'}</div></td>
      <td class="weekly-count">${escapeHtml(r.sunday_matches||0)}</td><td class="weekly-count">${escapeHtml(r.monday_matches||0)}</td><td class="weekly-count">${escapeHtml(r.tuesday_matches||0)}</td><td class="weekly-count">${escapeHtml(r.wednesday_matches||0)}</td><td class="weekly-count">${escapeHtml(r.thursday_matches||0)}</td><td class="weekly-count">${escapeHtml(r.friday_matches||0)}</td><td class="weekly-count">${escapeHtml(r.saturday_matches||0)}</td>
      <td class="weekly-count weekly-total">${escapeHtml(total)}</td><td class="weekly-count weekly-win">${escapeHtml(r.wins||0)}</td><td class="weekly-count weekly-loss">${escapeHtml(r.losses||0)}</td>
    </tr>`;
  }).join('');
}

async function loadAdminWeeklyMatches(){
  const dayTarget=$('weekly-day-grid');
  const guildTarget=$('weekly-guild-table');
  if(!dayTarget||!guildTarget) return;
  dayTarget.innerHTML='<div class="empty">Loading weekly day records...</div>';
  guildTarget.innerHTML='<tr><td colspan="11">Loading weekly guild records...</td></tr>';
  try{
    const {data,error}=await adminDb.rpc('admin_get_weekly_match_stats');
    if(error) throw error;
    renderWeeklyMatches(data||[]);
  }catch(error){
    console.error('Weekly match analytics failed:',error);
    dayTarget.innerHTML=`<div class="empty">${escapeHtml(humanizeError(error))}</div>`;
    guildTarget.innerHTML=`<tr><td colspan="11">${escapeHtml(humanizeError(error))}</td></tr>`;
  }
}

function openAdminSection(name){
  const section=['guilds','name-changes','results','weekly','ban','trophies'].includes(name)?name:'guilds';
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
  if(section==='name-changes') loadAdminGuildNameChangeRequests();
  if(section==='results') loadAdminResults();
  if(section==='weekly') loadAdminWeeklyMatches();
  if(section==='ban') loadBans();
  if(section==='trophies') loadHofAdmin();
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
    const {data,error}=await moderatorDb.auth.signInWithPassword({email,password});
    if(error)throw error;
    const ok=await isModerator();
    if(!ok){await moderatorDb.auth.signOut();throw new Error('This account is not an active moderator. Admin accounts use the separate Admin Access button.');}
    state.moderatorUser=data.user;state.moderatorOk=true;setModeratorPanel(true);openView('moderator');
    $('moderator-session-label').textContent=`${state.moderatorUser?.email||''} • Limited moderator access`;
    $('moderator-password').value='';showStatus('moderator-results-status','ok','Moderator login successful. Review pending results or manage guild approvals.');
    openModeratorSection('results');
    await loadModeratorData();
  }catch(error){state.moderatorUser=null;state.moderatorOk=false;setModeratorPanel(false);showStatus('moderator-login-status','error',humanizeError(error));}
  finally{setBusy('moderator-login-submit',false,'LOGIN AS MODERATOR');}
}
async function restoreModerator(){
  const {data:{session}}=await moderatorDb.auth.getSession();
  if(!session){state.moderatorUser=null;state.moderatorOk=false;setModeratorPanel(false);return;}
  state.moderatorUser=session.user;state.moderatorOk=await isModerator();
  if(!state.moderatorOk){await moderatorDb.auth.signOut();state.moderatorUser=null;setModeratorPanel(false);return;}
  setModeratorPanel(true);$('moderator-session-label').textContent=`${state.moderatorUser?.email||''} • Limited moderator access`;
  openModeratorSection('results');
  await loadModeratorData();
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
  if(section==='results')loadModeratorResults();
  if(section==='guilds')loadModeratorGuilds();
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
      const gallery=imgs.length?`<details class="proof-details"><summary>OPEN RESULT PROOF</summary><div class="proof-gallery">${imgs.map((u,i)=>`<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><span class="proof-tag">RESULT PROOF</span><img src="${escapeHtml(u)}" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} result proof" /></a>`).join('')}</div></details>`:'<span class="muted">No proof</span>';
      const status=String(r.status||'unknown').toLowerCase();
      const actions=status==='pending'?`<div class="moderator-actions"><button class="btn btn-green btn-small moderator-action-btn" type="button" data-action="mod-approve-result" data-id="${escapeHtml(r.id)}">APPROVE</button><button class="btn btn-red btn-small moderator-action-btn" type="button" data-action="mod-reject-result" data-id="${escapeHtml(r.id)}">REJECT</button></div>`:'—';
      return `<tr><td><strong>${escapeHtml(r.winner_guild)}</strong><div class="muted" style="margin:3px 0">DEFEAT</div><strong>${escapeHtml(r.loser_guild)}</strong></td><td>${escapeHtml(r.score)}</td><td><strong style="font-size:9px">${escapeHtml(formatDateTime(r.created_at))}</strong><div class="muted" style="margin-top:4px;font-size:7px">PAKISTAN TIME</div></td><td>${gallery}<div style="margin-top:6px"><span class="status-pill ${status==='approved'?'status-approved':status==='pending'?'status-pending':'status-rejected'}">${escapeHtml(status)}</span></div>${r.rejection_reason?`<div class="muted" style="margin-top:5px">${escapeHtml(r.rejection_reason)}</div>`:''}</td><td>${actions}</td></tr>`;
    }).join(''):'<tr><td colspan="5">No result submissions.</td></tr>';
  }catch(error){console.error(error);target.innerHTML=`<tr><td colspan="5">${escapeHtml(humanizeError(error))}</td></tr>`;showStatus('moderator-results-status','error',humanizeError(error));}
}
async function moderatorApproveGuild(norm){
  const g=state.moderatorGuilds.find(x=>String(x.guild_name_normalized)===String(norm));if(!g)return;
  if(!confirm(`APPROVE this registered guild?\n\n${g.guild_name}`))return;
  try{const {error}=await moderatorDb.rpc('moderator_approve_guild',{p_guild_name_normalized:norm});if(error)throw error;showStatus('moderator-guild-status','ok',`${g.guild_name} has been approved.`);await loadModeratorGuilds();}
  catch(error){showStatus('moderator-guild-status','error',humanizeError(error));}
}
async function moderatorRemoveGuild(norm){
  const g=state.moderatorGuilds.find(x=>String(x.guild_name_normalized)===String(norm));if(!g)return;
  if(!confirm(`PERMANENTLY REMOVE this guild registration?\n\n${g.guild_name}\n\nHistorical challenge/result records may remain.`))return;
  try{const {error}=await moderatorDb.rpc('moderator_remove_guild',{p_guild_name_normalized:norm});if(error)throw error;showStatus('moderator-guild-status','ok',`${g.guild_name} was removed from the guild registry.`);await loadModeratorGuilds();}
  catch(error){showStatus('moderator-guild-status','error',humanizeError(error));}
}
async function moderatorApproveResult(id){
  const row=state.moderatorResults.find(r=>String(r.id)===String(id));if(!row)return;
  if(!confirm(`APPROVE RESULT AND AWARD WEEKLY POINTS?\n\n${row.winner_guild} defeated ${row.loser_guild}\nScore: ${row.score}\n\nThis will run the existing weekly point-award function.`))return;
  try{
    const {error}=await moderatorDb.rpc('moderator_approve_result',{p_result_id:id});if(error)throw error;
    showStatus('moderator-results-status','ok','Result approved. The existing weekly points function has been called.');
    await loadModeratorResults();
  }catch(error){showStatus('moderator-results-status','error',humanizeError(error));}
}
async function moderatorRejectResult(id){
  const reason=prompt('Reason for rejection:','Proof or result issue');if(reason===null)return;
  try{
    const {error}=await moderatorDb.rpc('moderator_reject_result',{p_result_id:id,p_reason:reason.trim()||'Rejected by moderator'});if(error)throw error;
    showStatus('moderator-results-status','ok','Result rejected. The challenge was reopened when eligible.');
    await loadModeratorResults();
  }catch(error){showStatus('moderator-results-status','error',humanizeError(error));}
}


/* ---------------- GUILD PROFILES, 40 BADGES & HALL OF FAME ---------------- */
const GVG_BADGES = [
 {id:1,name:'First Battle',file:'01_first_battle.png',desc:'Complete 1 match.',metric:'total_played',min:1},
 {id:2,name:'Active Guild',file:'02_active_guild.png',desc:'Complete 5 matches.',metric:'total_played',min:5},
 {id:3,name:'Battle Ready',file:'03_battle_ready.png',desc:'Complete 10 matches.',metric:'total_played',min:10},
 {id:4,name:'Challenger',file:'04_challenger.png',desc:'Complete 25 matches.',metric:'total_played',min:25},
 {id:5,name:'Arena Regular',file:'05_arena_regular.png',desc:'Complete 50 matches.',metric:'total_played',min:50},
 {id:6,name:'Elite Presence',file:'06_elite_presence.png',desc:'Complete 100 matches.',metric:'total_played',min:100},
 {id:7,name:'Legendary Presence',file:'07_legendary_presence.png',desc:'Complete 200 matches.',metric:'total_played',min:200},
 {id:8,name:'First Victory',file:'08_first_victory.png',desc:'Win 1 match.',metric:'wins',min:1},
 {id:9,name:'Triple Threat',file:'09_triple_threat.png',desc:'Win 3 matches.',metric:'wins',min:3},
 {id:10,name:'Five Victories',file:'10_five_victories.png',desc:'Win 5 matches.',metric:'wins',min:5},
 {id:11,name:'Victory Hunter',file:'11_victory_hunter.png',desc:'Win 10 matches.',metric:'wins',min:10},
 {id:12,name:'Battle Master',file:'12_battle_master.png',desc:'Win 25 matches.',metric:'wins',min:25},
 {id:13,name:'Elite Winner',file:'13_elite_winner.png',desc:'Win 50 matches.',metric:'wins',min:50},
 {id:14,name:'Century of Victories',file:'14_century_of_victories.png',desc:'Win 100 matches.',metric:'wins',min:100},
 {id:15,name:'Legendary Conqueror',file:'15_legendary_conqueror.png',desc:'Win 200 matches.',metric:'wins',min:200},
 {id:16,name:'Hot Streak',file:'16_hot_streak.png',desc:'Win 3 consecutive matches.',metric:'max_win_streak',min:3},
 {id:17,name:'Unstoppable',file:'17_unstoppable.png',desc:'Win 5 consecutive matches.',metric:'max_win_streak',min:5},
 {id:18,name:'Dominator',file:'18_dominator.png',desc:'Win 7 consecutive matches.',metric:'max_win_streak',min:7},
 {id:19,name:'Perfect Ten',file:'19_perfect_ten.png',desc:'Win 10 consecutive matches.',metric:'max_win_streak',min:10},
 {id:20,name:'Unbroken Legend',file:'20_unbroken_legend.png',desc:'Win 15 consecutive matches.',metric:'max_win_streak',min:15},
 {id:21,name:'Sharp Tacticians',file:'21_sharp_tacticians.png',desc:'Reach 60% win rate with at least 10 matches.',metric:'win_rate',min:60,minPlayed:10},
 {id:22,name:'Elite Tacticians',file:'22_elite_tacticians.png',desc:'Reach 70% win rate with at least 10 matches.',metric:'win_rate',min:70,minPlayed:10},
 {id:23,name:'Champion Standard',file:'23_champion_standard.png',desc:'Reach 80% win rate with at least 10 matches.',metric:'win_rate',min:80,minPlayed:10},
 {id:24,name:'Supreme Guild',file:'24_supreme_guild.png',desc:'Reach 90% win rate with at least 10 matches.',metric:'win_rate',min:90,minPlayed:10},
 {id:25,name:'Near Perfect',file:'25_near_perfect.png',desc:'Reach 95% win rate with at least 20 matches.',metric:'win_rate',min:95,minPlayed:20},
 {id:26,name:'Top Ten Debut',file:'26_top_ten_debut.png',desc:'Finish in weekly Top 10 once.',metric:'top10_weeks',min:1},
 {id:27,name:'Top Ten Regular',file:'27_top_ten_regular.png',desc:'Finish in weekly Top 10 for 5 different weeks.',metric:'top10_weeks',min:5},
 {id:28,name:'Top Five Finisher',file:'28_top_five_finisher.png',desc:'Finish in weekly Top 5 for 3 different weeks.',metric:'top5_weeks',min:3},
 {id:29,name:'Podium Contender',file:'29_podium_contender.png',desc:'Finish in weekly Top 3 for 3 different weeks.',metric:'top3_weeks',min:3},
 {id:30,name:'Weekly Number One',file:'30_weekly_number_one.png',desc:'Finish first in weekly ranking once.',metric:'weekly_number_one_count',min:1},
 {id:31,name:'Weekly Dominator',file:'31_weekly_dominator.png',desc:'Finish in weekly Top 5 for 5 different weeks.',metric:'top5_weeks',min:5},
 {id:32,name:'Consistent Challenger',file:'32_consistent_challenger.png',desc:'Finish in weekly Top 10 for 10 different weeks.',metric:'top10_weeks',min:10},
 {id:33,name:'Four-Week Commitment',file:'33_four_week_commitment.png',desc:'Complete matches in 4 consecutive competition weeks.',metric:'max_consecutive_active_weeks',min:4},
 {id:34,name:'Eight-Week Commitment',file:'34_eight_week_commitment.png',desc:'Complete matches in 8 consecutive competition weeks.',metric:'max_consecutive_active_weeks',min:8},
 {id:35,name:'Rival Collector',file:'35_rival_collector.png',desc:'Play against 10 different guilds.',metric:'opponents_count',min:10},
 {id:36,name:'Rival Breaker',file:'36_rival_breaker.png',desc:'Defeat 10 different guilds.',metric:'opponent_wins',min:10},
 {id:37,name:'Guild Conqueror',file:'37_guild_conqueror.png',desc:'Defeat 25 different guilds.',metric:'opponent_wins',min:25},
 {id:38,name:'Monthly Marathon',file:'38_monthly_marathon.png',desc:'Complete 20 matches in one month.',metric:'max_month_matches',min:20},
 {id:39,name:'Veteran Guild',file:'39_veteran_guild.png',desc:'Play in at least 6 different months.',metric:'active_months',min:6},
 {id:40,name:'Legacy Guild',file:'40_legacy_guild.png',desc:'Play in at least 12 different months.',metric:'active_months',min:12}
];
function numberMetric(p,key){return Number(p?.[key]||0);}
function badgeUnlocked(b,p){return numberMetric(p,`badge_${b.metric}`)>=b.min && (!b.minPlayed||numberMetric(p,'badge_total_played')>=b.minPlayed);}
function badgeImgPath(file){return `./${file}`;}
function guildAvatarMarkup(p,small=false){return p?.guild_logo_url?`<div class="guild-profile-avatar" ${small?'style="width:56px;height:56px;flex-basis:56px"':''}><img src="${escapeHtml(p.guild_logo_url)}" alt="${escapeHtml(p.guild_name)} logo" loading="lazy" /></div>`:`<div class="guild-profile-avatar" ${small?'style="width:56px;height:56px;flex-basis:56px"':''}><span style="font-size:27px">🛡️</span></div>`;}
function renderPublicGuildProfiles(){
  const target=$('public-guild-profile-grid'); if(!target)return;
  const q=String($('public-guild-profile-search')?.value||'').trim().toLowerCase();
  const rows=(state.guildProfiles||[]).filter(p=>!q||String(p.guild_name||'').toLowerCase().includes(q)||String(p.guild_uid||'').toLowerCase().includes(q));
  const count=$('public-profile-count');if(count)count.textContent=`${rows.length} GUILDS`;
  target.innerHTML=rows.length?rows.map(p=>`<article class="guild-profile-card">${guildAvatarMarkup(p,true)}<div class="guild-profile-main"><div class="guild-profile-name">${escapeHtml(p.guild_name)}</div><div class="guild-profile-uid">UID: ${escapeHtml(p.guild_uid||'Not added')}</div><div class="guild-profile-meta">${numberMetric(p,'total_played')} PLAYED · ${numberMetric(p,'wins')}W / ${numberMetric(p,'losses')}L</div><div class="guild-profile-meta">🏆 ${numberMetric(p,'weekly_trophies')} weekly · ${numberMetric(p,'monthly_trophies')} monthly</div><button class="btn btn-green btn-small" style="margin-top:8px" type="button" data-action="open-public-guild-profile" data-guild="${escapeHtml(p.guild_name_normalized)}">VIEW PROFILE</button></div></article>`).join(''):'<div class="empty">No approved guild profiles match this search.</div>';
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
  const input=$('guild-profile-uid');if(!input||!state.guild)return;
  const mine=(state.guildProfiles||[]).find(p=>String(p.guild_name_normalized||'')===String(state.guild.guild_name_normalized||normalizeGuild(state.guild.guild_name)));
  if(mine){input.value=mine.guild_uid||'';setLogoCooldownNote(mine);}else{input.value='';setLogoCooldownNote(null);}
}
async function loadPublicGuildProfiles(){
  const target=$('public-guild-profile-grid');if(target)target.innerHTML='<div class="empty">Loading profiles, match stats and fresh badge missions...</div>';
  try{
    const [profilesResult,badgeResult]=await Promise.all([
      db.rpc('get_gvg_public_guild_profiles'),
      db.rpc('get_gvg_public_badge_progress')
    ]);
    if(profilesResult.error)throw profilesResult.error;
    if(badgeResult.error)throw badgeResult.error;
    const profiles=Array.isArray(profilesResult.data)?profilesResult.data:[];
    const progressRows=Array.isArray(badgeResult.data)?badgeResult.data:[];
    const progressByGuild=new Map(progressRows.map(row=>[String(row.guild_name_normalized||''),row]));
    state.guildProfiles=profiles.map(profile=>({
      ...profile,
      ...(progressByGuild.get(String(profile.guild_name_normalized||''))||{})
    }));
    renderPublicGuildProfiles();populateMyGuildProfileEditor();
  }catch(error){console.error('Guild profiles failed:',error);if(target)target.innerHTML=`<div class="empty">Could not load profiles: ${escapeHtml(humanizeError(error))}</div>`;showStatus('guild-profile-status','error',humanizeError(error));}
}
function renderBadgeGrid(profile,showLocked=true){
  const earned=GVG_BADGES.filter(b=>badgeUnlocked(b,profile));
  const shown=showLocked?GVG_BADGES:earned;
  const started=profile?.badge_program_started_at?formatDateTime(profile.badge_program_started_at):'the program start date';
  return `<div class="guild-badge-section-title">UNLOCKED BADGES • ${earned.length}/40</div><div class="hint" style="margin:0 0 10px">Badge missions count only approved results from ${escapeHtml(started)} onward. Older match history does not unlock badges; lifetime statistics and Weekly/Monthly Champion trophies are unchanged.</div><div class="guild-badge-grid">${shown.map(b=>{const ok=badgeUnlocked(b,profile);return `<div class="guild-badge-item ${ok?'unlocked':'locked'}"><img src="${badgeImgPath(b.file)}" alt="${escapeHtml(b.name)}" loading="lazy" /><strong>${escapeHtml(b.name)}</strong><small>${escapeHtml(b.desc)}</small><span class="guild-badge-status ${ok?'complete':'pending'}">${ok?'UNLOCKED':'LOCKED'}</span></div>`;}).join('')}</div>`;
}
function openPublicGuildProfile(norm){
  const p=(state.guildProfiles||[]).find(x=>String(x.guild_name_normalized)===String(norm));if(!p)return;
  const unlocked=GVG_BADGES.filter(b=>badgeUnlocked(b,p)).length;
  const html=`<div class="modal-head"><div><div class="kicker">Public Guild Profile</div><h3>${escapeHtml(p.guild_name)}</h3></div><button class="close-btn" type="button" data-action="close-modal">×</button></div>
    <div style="display:flex;align-items:center;gap:12px;margin:12px 0">${guildAvatarMarkup(p,true)}<div><div style="font-weight:900">GUILD UID</div><div class="guild-profile-uid">${escapeHtml(p.guild_uid||'Not added yet')}</div><div class="guild-profile-meta">${unlocked}/40 achievements unlocked</div></div></div>
    <div class="guild-profile-kpis"><div class="guild-profile-kpi"><span>Played</span><strong>${numberMetric(p,'total_played')}</strong></div><div class="guild-profile-kpi"><span>Wins</span><strong>${numberMetric(p,'wins')}</strong></div><div class="guild-profile-kpi"><span>Losses</span><strong>${numberMetric(p,'losses')}</strong></div><div class="guild-profile-kpi"><span>Win Rate</span><strong>${Number(p.win_rate||0).toFixed(1)}%</strong></div></div>
    <div class="guild-profile-kpis"><div class="guild-profile-kpi"><span>Weekly trophies</span><strong>🏆 ${numberMetric(p,'weekly_trophies')}</strong></div><div class="guild-profile-kpi"><span>Monthly trophies</span><strong>👑 ${numberMetric(p,'monthly_trophies')}</strong></div><div class="guild-profile-kpi"><span>Top 10 weeks</span><strong>${numberMetric(p,'top10_weeks')}</strong></div><div class="guild-profile-kpi"><span>Longest streak</span><strong>${numberMetric(p,'max_win_streak')}</strong></div></div>
    ${renderBadgeGrid(p,true)}<div class="hint" style="margin-top:12px">Statistics use approved results only. Trophies are official awards added by the GVG Admin.</div>`;
  openModal(html);
}
async function uploadGuildLogo(file){
  if(!state.user)throw new Error('LOGIN_REQUIRED: Login to update your guild profile.');
  if(file.size>2*1024*1024)throw new Error('Guild logo must be 2 MB or smaller.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG or WEBP for the guild logo.');
  const ext=(file.name.split('.').pop()||'png').toLowerCase().replace(/[^a-z0-9]/g,'')||'png';
  const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const {error}=await db.storage.from('guild-logos').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
  const {data}=db.storage.from('guild-logos').getPublicUrl(path);if(!data?.publicUrl)throw new Error('Could not create public Guild Logo URL.');return data.publicUrl;
}
async function saveMyGuildProfile(e){
  e.preventDefault();clearStatus('guild-profile-status');
  if(!guildApproved())return showStatus('guild-profile-status','error','Only an approved, active guild can update its profile.');
  const myNorm=String(state.guild?.guild_name_normalized||normalizeGuild(state.guild?.guild_name));
  const profile=(state.guildProfiles||[]).find(p=>String(p.guild_name_normalized)===myNorm);
  const file=$('guild-profile-logo').files?.[0]||null;
  if(file){const changed=profile?.guild_logo_changed_at?new Date(profile.guild_logo_changed_at).getTime():0;if(changed&&Date.now()<changed+3*24*60*60*1000)return showStatus('guild-profile-status','error','LOGO COOLDOWN: Your guild logo can only be changed once every 3 days.');}
  try{
    setBusy('guild-profile-save',true,'SAVE GUILD PROFILE');
    let logoUrl=profile?.guild_logo_url ?? state.guild?.guild_logo_url ?? null;if(file)logoUrl=await uploadGuildLogo(file);
    const {data,error}=await db.rpc('save_gvg_guild_profile',{p_guild_uid:$('guild-profile-uid').value.trim()||null,p_logo_url:logoUrl});if(error)throw error;
    $('guild-profile-logo').value='';
    showStatus('guild-profile-status','ok','Guild profile saved. Logo cooldown is enforced by the database for 3 days.');
    await loadPublicGuildProfiles();
  }catch(error){showStatus('guild-profile-status','error',humanizeError(error));}
  finally{setBusy('guild-profile-save',false,'SAVE GUILD PROFILE');}
}
async function loadMyGuildNameChangeStatus(){
  const note=$('guild-name-change-note'),button=$('guild-name-change-submit');
  if(!note||!button||!state.user||!state.guild){if(note)note.textContent='Login with an approved guild account to request a name change.';if(button)button.disabled=true;return;}
  try{
    const {data,error}=await db.rpc('get_my_gvg_guild_name_change_status');if(error)throw error;
    const row=Array.isArray(data)?(data[0]||null):data;state.guildNameChangeStatus=row;
    const current=String(row?.current_guild_name||state.guild.guild_name||'');
    const status=String(row?.request_status||'');
    const requested=String(row?.requested_guild_name||'');
    const availableAt=row?.name_change_available_at?new Date(row.name_change_available_at):null;
    const isPending=status==='pending';
    const cooldown=availableAt&&availableAt.getTime()>Date.now();
    if(isPending){note.textContent=`Current name: ${current}. Request pending Admin approval: “${requested}”. Your current name stays active until approval.`;button.disabled=true;}
    else if(cooldown){note.textContent=`Current name: ${current}. Name changes become available after ${formatDateTime(availableAt.toISOString())} Pakistan time.`;button.disabled=true;}
    else if(status==='approved'){note.textContent=`Current name: ${current}. Your latest name-change request was approved. A new request is available now.`;button.disabled=false;}
    else if(status==='rejected'){note.textContent=`Current name: ${current}. Previous request was rejected${row?.review_reason?`: ${row.review_reason}`:'.'} You may submit a new request if the 3-day cooldown has passed.`;button.disabled=false;}
    else{note.textContent=`Current name: ${current}. Enter a new name; the Admin must approve it. After approval, the next change request has a 3-day cooldown.`;button.disabled=false;}
  }catch(error){note.textContent=`Could not load request status: ${humanizeError(error)}`;button.disabled=false;}
}
async function submitGuildNameChangeRequest(e){
  e.preventDefault();clearStatus('guild-name-change-status');
  if(!guildApproved())return showStatus('guild-name-change-status','error','Only an approved, active guild can request a name change.');
  const requested=$('guild-name-change-input').value.trim();
  if(requested.length<3||requested.length>50)return showStatus('guild-name-change-status','error','New guild name must be 3 to 50 characters.');
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
  const reason=prompt(approve?`Optional approval note for ${request.current_guild_name} → ${request.requested_guild_name}:`:`Reason for rejecting ${request.current_guild_name} → ${request.requested_guild_name}:`,approve?'':'Name-change request not approved.');
  if(reason===null)return;
  if(!approve&&!reason.trim())return showStatus('admin-name-change-status','error','Please enter a rejection reason.');
  try{const {error}=await adminDb.rpc('admin_review_gvg_guild_name_change',{p_request_id:id,p_approve:approve,p_reason:reason.trim()||null});if(error)throw error;
    showStatus('admin-name-change-status','ok',approve?`Guild name approved: ${request.current_guild_name} is now ${request.requested_guild_name}.`:'Guild name-change request rejected.');
    await Promise.all([loadAdminGuildNameChangeRequests(),loadAdminGuilds()]);
  }catch(error){showStatus('admin-name-change-status','error',humanizeError(error));}
}

function trophySvg(){return `<svg viewBox="0 0 160 180" role="img" aria-label="3D gold championship trophy"><defs><linearGradient id="gvg-trophy-gold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff4b0"/><stop offset=".24" stop-color="#d99b2d"/><stop offset=".48" stop-color="#fff0a0"/><stop offset=".73" stop-color="#8b5712"/><stop offset="1" stop-color="#ffe28b"/></linearGradient><linearGradient id="gvg-trophy-side" x1="0" x2="1"><stop offset="0" stop-color="#6c4514"/><stop offset=".5" stop-color="#e7b94d"/><stop offset="1" stop-color="#51320b"/></linearGradient><linearGradient id="gvg-trophy-green" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#e7ffbf"/><stop offset=".45" stop-color="#21dc73"/><stop offset="1" stop-color="#07572d"/></linearGradient><filter id="gvg-trophy-shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs><ellipse cx="80" cy="164" rx="45" ry="8" fill="#e9b94a" opacity=".2" filter="url(#gvg-trophy-shadow)"/><g stroke="#5b390d" stroke-width="2" stroke-linejoin="round"><path d="M48 24H112L107 72Q105 91 89 99L92 120H68L71 99Q55 91 53 72Z" fill="url(#gvg-trophy-side)"/><path d="M52 25H108L103 68Q101 84 80 95Q59 84 57 68Z" fill="url(#gvg-trophy-gold)"/><path d="M52 34H30Q29 61 47 72L57 74L55 61Q43 56 43 43H53Z" fill="url(#gvg-trophy-gold)"/><path d="M108 34H130Q131 61 113 72L103 74L105 61Q117 56 117 43H107Z" fill="url(#gvg-trophy-gold)"/><path d="M68 98H92L95 124H65Z" fill="url(#gvg-trophy-side)"/><path d="M58 123H102L112 139H48Z" fill="url(#gvg-trophy-gold)"/><path d="M42 140H118L128 151H32Z" fill="url(#gvg-trophy-side)"/><path d="M36 151H124L133 161H27Z" fill="url(#gvg-trophy-gold)"/><path d="M80 40L89 55L80 70L71 55Z" fill="url(#gvg-trophy-green)"/><path d="M80 48L84 55L80 62L76 55Z" fill="#eaffb8" stroke="none"/></g><path d="M60 30L65 67M73 30L75 39" stroke="#fffbd3" stroke-width="3" stroke-linecap="round" opacity=".68"/><path d="M24 169H136" stroke="#47ef86" stroke-width="2" opacity=".55"/></svg>`;}
function bindTrophy3D(root=document){root.querySelectorAll('[data-trophy-3d]:not([data-trophy-bound])').forEach(el=>{el.dataset.trophyBound='1';let down=false,lastX=0,lastY=0,rx=-8,ry=0;const apply=()=>{el.style.transform=`perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`;};el.addEventListener('pointerdown',e=>{down=true;lastX=e.clientX;lastY=e.clientY;try{el.setPointerCapture(e.pointerId);}catch{};});el.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;ry+=dx*.9;rx=Math.max(-35,Math.min(35,rx-dy*.7));apply();});const end=()=>{down=false;};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);});}
function hallPeriodLabel(type,number){return type==='weekly'?`WEEK ${number}`:new Intl.DateTimeFormat('en',{month:'long'}).format(new Date(Date.UTC(2020,number-1,1)));}
async function loadHallOfFame(){
  try{
    const [settingsRes,yearsRes]=await Promise.all([db.rpc('get_gvg_hof_settings'),db.rpc('get_gvg_hall_of_fame_years',{p_award_type:state.hofMode})]);
    if(settingsRes.error)throw settingsRes.error;if(yearsRes.error)throw yearsRes.error;
    const s=Array.isArray(settingsRes.data)?settingsRes.data[0]:settingsRes.data;if(s)state.hofSettings=s;
    const years=(yearsRes.data||[]).map(x=>Number(x.award_year));state.hofYears=years;if(!state.hofYear||!years.includes(Number(state.hofYear)))state.hofYear=Number(state.hofSettings.season_year||years[0]||new Date().getFullYear());
    document.querySelectorAll('[data-hof-type]').forEach(b=>b.classList.toggle('active',b.dataset.hofType===state.hofMode));
    renderHofYearGrid(years);await loadHallOfFameYear();
  }catch(error){console.error('Hall of Fame load failed:',error);$('hof-year-grid').innerHTML=`<div class="empty">Could not load Hall of Fame. Run the supplied Supabase migration first. ${escapeHtml(humanizeError(error))}</div>`;}
}
function renderHofYearGrid(years){const target=$('hof-year-grid');if(!target)return;target.innerHTML=(years||[]).length?years.map(y=>`<button class="hof-year-tile ${Number(y)===Number(state.hofYear)?'active':''}" type="button" data-action="hof-select-year" data-year="${Number(y)}">${Number(y)}<small style="display:block;margin-top:5px;font-size:8px">${state.hofMode==='weekly'?'WEEKLY SEASON':'MONTHLY ARCHIVE'}</small></button>`).join(''):'<div class="empty">No years available.</div>';}
async function loadHallOfFameYear(){
  const target=$('hof-selected-award');if(target)target.innerHTML='<div class="empty">Loading trophy archive...</div>';
  const {data,error}=await db.rpc('get_gvg_hall_of_fame',{p_award_type:state.hofMode,p_award_year:Number(state.hofYear)});if(error)throw error;state.hofAwards=data||[];
  const heading=$('hof-period-heading');if(heading)heading.textContent=state.hofMode==='weekly'?`${state.hofYear} • SELECT WEEK`:`${state.hofYear} • SELECT MONTH`;
  const maxAwardWeek=Math.max(0,...state.hofAwards.filter(a=>a.award_type==='weekly').map(a=>Number(a.period_number)||0));const selectedYear=Number(state.hofYear);const seasonYear=Number(state.hofSettings.season_year);const maxWeek=selectedYear===seasonYear?Number(state.hofSettings.current_week||11):(selectedYear<seasonYear?Math.max(53,maxAwardWeek):Math.max(1,maxAwardWeek));
  const count=state.hofMode==='weekly'?Math.max(1,Math.min(60,maxWeek)):12;
  $('hof-period-grid').innerHTML=Array.from({length:count},(_,i)=>i+1).map(n=>{const found=state.hofAwards.find(a=>Number(a.period_number)===n);return `<button class="hof-period-tile ${Number(state.hofPeriod)===n?'active':''}" type="button" data-action="hof-select-period" data-period="${n}">${escapeHtml(hallPeriodLabel(state.hofMode,n))}<small>${found?'🏆 CHAMPION ADDED':'AWAITING CHAMPION'}</small></button>`;}).join('');
  if(!state.hofPeriod||state.hofPeriod>count)state.hofPeriod=1;renderHallSelectedAward();
}
function renderHallSelectedAward(){
  const target=$('hof-selected-award');if(!target)return;
  document.querySelectorAll('[data-action="hof-select-period"]').forEach(b=>b.classList.toggle('active',Number(b.dataset.period)===Number(state.hofPeriod)));
  const a=(state.hofAwards||[]).find(x=>Number(x.period_number)===Number(state.hofPeriod));
  if(!a){target.innerHTML=`<div class="empty" style="padding:25px 12px;border:1px dashed rgba(255,213,113,.20);border-radius:14px"><strong>${escapeHtml(hallPeriodLabel(state.hofMode,state.hofPeriod))} CHAMPION NOT ADDED YET</strong><div style="margin-top:7px">Official champion record will appear here after Admin awards the trophy.</div></div>`;return;}
  const date=a.awarded_at?formatDateTime(a.awarded_at):'';
  target.innerHTML=`<article class="hof-award-card"><div class="trophy-3d" data-trophy-3d aria-label="Drag to rotate trophy">${trophySvg()}</div><div><div class="hof-award-label">${escapeHtml(a.trophy_label||hallPeriodLabel(state.hofMode,state.hofPeriod)+' CHAMPION')}</div><div class="hof-award-guild">${escapeHtml(a.guild_name)}</div><div class="hof-award-uid">GUILD UID: ${escapeHtml(a.guild_uid||'Not added')}</div><div class="hof-award-meta">${escapeHtml(String(a.award_year))} · ${escapeHtml(hallPeriodLabel(a.award_type,Number(a.period_number)))}${date?' · AWARDED '+escapeHtml(date):''}</div>${a.notes?`<div class="hof-award-notes">${escapeHtml(a.notes)}</div>`:''}<div class="hint" style="margin-top:11px">Touch and drag the trophy left/right or up/down to rotate it.</div></div></article>`;bindTrophy3D(target);
}
async function changeHallType(type){if(!['weekly','monthly'].includes(type))return;state.hofMode=type;state.hofYear=null;state.hofPeriod=1;await loadHallOfFame();}
function renderAdminHofAwards(){const target=$('admin-hof-awards-list');if(!target)return;const rows=(state.adminHofAwards||[]).sort((a,b)=>String(b.awarded_at).localeCompare(String(a.awarded_at)));target.innerHTML=rows.length?rows.slice(0,60).map(a=>`<div class="admin-hof-award-row"><div class="admin-hof-award-main"><strong>${escapeHtml(a.trophy_label)} — ${escapeHtml(a.guild_name)}</strong><small>${escapeHtml(String(a.award_year))} · ${escapeHtml(hallPeriodLabel(a.award_type,Number(a.period_number)))} · UID ${escapeHtml(a.guild_uid||'not added')}</small></div><button class="btn btn-red btn-small" type="button" data-action="admin-remove-hof-award" data-id="${escapeHtml(a.id)}">REMOVE</button></div>`).join(''):'<div class="empty">No official trophies have been awarded yet.</div>';}
async function loadHofAdmin(){
  try{
    const [profileRes,settingsRes,weeklyYearsRes,monthlyYearsRes]=await Promise.all([
      adminDb.rpc('get_gvg_public_guild_profiles'),adminDb.rpc('get_gvg_hof_settings'),
      adminDb.rpc('get_gvg_hall_of_fame_years',{p_award_type:'weekly'}),adminDb.rpc('get_gvg_hall_of_fame_years',{p_award_type:'monthly'})
    ]);
    for(const r of [profileRes,settingsRes,weeklyYearsRes,monthlyYearsRes])if(r.error)throw r.error;
    const profiles=profileRes.data||[];state.guildProfiles=profiles;
    $('hof-award-guild').innerHTML=profiles.length?profiles.map(p=>`<option value="${escapeHtml(p.guild_name_normalized)}">${escapeHtml(p.guild_name)}${p.guild_uid?' • UID '+escapeHtml(p.guild_uid):''}</option>`).join(''):'<option value="">No approved guilds found</option>';
    const settings=Array.isArray(settingsRes.data)?settingsRes.data[0]:settingsRes.data;if(settings){state.hofSettings=settings;$('hof-season-year').value=settings.season_year;$('hof-current-week').value=settings.current_week;$('hof-award-year').value=settings.season_year;$('hof-award-period').value=settings.current_week;$('hof-award-label').value=`WEEK ${settings.current_week} CHAMPION`;}
    const pairs=[['weekly',weeklyYearsRes.data||[]],['monthly',monthlyYearsRes.data||[]]],all=[];
    for(const [type,years] of pairs){for(const y of years){const result=await adminDb.rpc('get_gvg_hall_of_fame',{p_award_type:type,p_award_year:Number(y.award_year)});if(result.error)throw result.error;all.push(...(result.data||[]));}}
    state.adminHofAwards=all;renderAdminHofAwards();
  }catch(error){console.error('Admin HoF load failed:',error);showStatus('admin-status','error',`Hall of Fame controls: ${humanizeError(error)}. Apply database/05 migration first.`);const list=$('admin-hof-awards-list');if(list)list.innerHTML=`<div class="empty">${escapeHtml(humanizeError(error))}</div>`;}
}
async function saveHofSeasonSettings(e){e.preventDefault();clearStatus('hof-season-status');try{const year=Number($('hof-season-year').value),week=Number($('hof-current-week').value);const {error}=await adminDb.rpc('admin_update_gvg_hof_settings',{p_season_year:year,p_current_week:week});if(error)throw error;state.hofSettings={season_year:year,current_week:week};showStatus('hof-season-status','ok','Current Hall of Fame season settings saved.');await loadHofAdmin();}catch(error){showStatus('hof-season-status','error',humanizeError(error));}}
async function awardHofTrophy(e){e.preventDefault();clearStatus('hof-award-status');const type=$('hof-award-type').value,year=Number($('hof-award-year').value),period=Number($('hof-award-period').value),guildNorm=$('hof-award-guild').value,label=$('hof-award-label').value.trim(),notes=$('hof-award-notes').value.trim();if(!guildNorm||!label)return showStatus('hof-award-status','error','Choose an approved guild and enter a trophy label.');const already=state.adminHofAwards.find(a=>a.award_type===type&&Number(a.award_year)===year&&Number(a.period_number)===period);if(already&&!confirm(`${hallPeriodLabel(type,period)} ${year} already has a champion: ${already.guild_name}. Replace it with the selected guild?`))return;try{setBusy('hof-award-submit',true,'SAVING AWARD');const {error}=await adminDb.rpc('admin_add_gvg_hall_of_fame_award',{p_guild_name_normalized:guildNorm,p_award_type:type,p_award_year:year,p_period_number:period,p_trophy_label:label,p_notes:notes||null});if(error)throw error;showStatus('hof-award-status','ok','Official champion trophy saved to Hall of Fame and guild profile.');await loadHofAdmin();}catch(error){showStatus('hof-award-status','error',humanizeError(error));}finally{setBusy('hof-award-submit',false,'AWARD TROPHY');}}
async function removeHofAward(id){const a=state.adminHofAwards.find(x=>String(x.id)===String(id));if(!a)return;if(!confirm(`Remove the official Hall of Fame award?\n\n${a.trophy_label} — ${a.guild_name}\n\nThis does not delete match results or ranking points.`))return;try{const {error}=await adminDb.rpc('admin_remove_gvg_hall_of_fame_award',{p_award_id:id});if(error)throw error;showStatus('admin-status','ok','Hall of Fame trophy removed.');await loadHofAdmin();}catch(error){showStatus('admin-status','error',humanizeError(error));}}

/* ------------------------- Events ------------------------- */
document.addEventListener('click',async(e)=>{
  const actionEl=e.target.closest('[data-action]');
  if(actionEl){const action=actionEl.dataset.action,id=actionEl.dataset.id;if(action==='result-from-challenge')return selectChallengeForResult(id);if(action==='close-modal')return closeModal();if(action==='guild-info'){const g=findGuild(id);if(g)adminGuildInfo(g);return;}if(action==='guild-edit'){const g=findGuild(id);if(g)adminGuildEdit(g);return;}if(action==='guild-remove')return removeGuild(id);if(action==='approve-leader')return setLeaderApproval(id,'approved');if(action==='reject-leader')return setLeaderApproval(id,'rejected');if(action==='remove-leader')return removeLeader(id,actionEl.dataset.guild||'');if(action==='reset-password')return resetLeaderPassword(actionEl.dataset.email||'');if(action==='approve-result')return approveResult(id);if(action==='reject-result')return rejectResult(id);if(action==='unban-identity')return unbanIdentity(actionEl.dataset.guild||'',actionEl.dataset.contact||'');if(action==='mod-approve-guild')return moderatorApproveGuild(actionEl.dataset.guild||'');if(action==='mod-remove-guild')return moderatorRemoveGuild(actionEl.dataset.guild||'');if(action==='mod-approve-result')return moderatorApproveResult(id);if(action==='mod-reject-result')return moderatorRejectResult(id);if(action==='open-public-guild-profile')return openPublicGuildProfile(actionEl.dataset.guild||'');if(action==='hof-select-year'){state.hofYear=Number(actionEl.dataset.year);state.hofPeriod=1;renderHofYearGrid(state.hofYears||[]);return loadHallOfFameYear();}if(action==='hof-select-period'){state.hofPeriod=Number(actionEl.dataset.period);return renderHallSelectedAward();}if(action==='admin-remove-hof-award')return removeHofAward(id);if(action==='approve-guild-name-change')return reviewGuildNameChangeRequest(id,true);if(action==='reject-guild-name-change')return reviewGuildNameChangeRequest(id,false);}
  const menuBtn=e.target.closest('[data-menu-button]');if(menuBtn){const id=menuBtn.dataset.menuButton;document.querySelectorAll('.dots-menu.open').forEach(x=>{if(x.id!==`menu-${id}`)x.classList.remove('open')});document.getElementById(`menu-${id}`)?.classList.toggle('open');return;}document.querySelectorAll('.dots-menu.open').forEach(x=>x.classList.remove('open'));
});
document.querySelectorAll('[data-member-section]').forEach(btn=>btn.addEventListener('click',()=>openMemberSection(btn.dataset.memberSection)));
document.querySelectorAll('[data-ranking-mode]').forEach(btn=>btn.addEventListener('click',()=>setRankingMode(btn.dataset.rankingMode)));
document.querySelectorAll('[data-admin-section]').forEach(btn=>btn.addEventListener('click',()=>openAdminSection(btn.dataset.adminSection)));
$('nav-moderator').addEventListener('click',async()=>{openView('moderator');await restoreModerator();});

$('moderator-login-form').addEventListener('submit',handleModeratorLogin);
$('moderator-open-admin-login').addEventListener('click',async()=>{state.adminReturnToModerator=state.moderatorOk;openView('admin');await restoreAdmin();});
$('moderator-admin-access').addEventListener('click',async()=>{state.adminReturnToModerator=state.moderatorOk;openView('admin');await restoreAdmin();});
$('moderator-back').addEventListener('click',()=>openView(state.user?'member':'public'));
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
$('guild-name-change-form')?.addEventListener('submit',submitGuildNameChangeRequest);
$('public-guild-profile-search')?.addEventListener('input',renderPublicGuildProfiles);
$('admin-name-change-refresh')?.addEventListener('click',loadAdminGuildNameChangeRequests);
$('hof-season-form')?.addEventListener('submit',saveHofSeasonSettings);
$('hof-award-form')?.addEventListener('submit',awardHofTrophy);
$('hof-admin-refresh')?.addEventListener('click',loadHofAdmin);
document.querySelectorAll('[data-hof-type]').forEach(btn=>btn.addEventListener('click',()=>changeHallType(btn.dataset.hofType)));
$('hof-award-type')?.addEventListener('change',()=>{const type=$('hof-award-type').value;const lab=$('hof-period-number-label');const period=$('hof-award-period');const label=$('hof-award-label');if(type==='weekly'){lab.firstChild.textContent='WEEK NUMBER (1–60)';period.min='1';period.max='60';period.value=String(state.hofSettings.current_week||11);label.value=`WEEK ${period.value} CHAMPION`;}else{lab.firstChild.textContent='MONTH NUMBER (1–12)';period.min='1';period.max='12';period.value='1';label.value='MONTHLY CHAMPION';}});
$('hof-award-period')?.addEventListener('input',()=>{const type=$('hof-award-type').value;const label=$('hof-award-label');if(!label.value.trim()||/^(WEEK|MONTH)\s+\d+|MONTHLY CHAMPION/i.test(label.value))label.value=type==='weekly'?`WEEK ${$('hof-award-period').value} CHAMPION`:`${hallPeriodLabel('monthly',Number($('hof-award-period').value)||1).toUpperCase()} CHAMPION`;});
$('admin-login-form').addEventListener('submit',handleAdminLogin);
$('admin-logout').addEventListener('click',async()=>{try{await adminDb.auth.signOut();}catch{}state.adminUser=null;state.adminOk=false;const target=state.adminReturnToModerator&&state.moderatorOk?'moderator':state.user?'member':'public';state.adminReturnToModerator=false;openView(target);});
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
  else{state.user=null;state.guild=null;syncRegisterNav();openView('public');}
  await restoreAdmin();
})();
