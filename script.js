/*
  7TH UNIVERSE GVG — Updated frontend
  Uses two separate Supabase sessions:
  - db       = Guild session
  - adminDb  = Admin session
  This prevents the Admin email/session from replacing the Guild account session.
*/

const SUPABASE_URL = 'https://ypnpeiglbiycbexpeibb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_5ei0IhM1tQ15u5pAIIavhQ_alE9O3bl';
const TIME_ZONE = 'Asia/Karachi';
const IMAGE_BUCKET = 'result-images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const WHATSAPP_NOTIFY_ENDPOINT = '';

const { createClient } = window.supabase;

const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-guild-session', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

const adminDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: '7th-universe-admin-session', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
});

const ALLOWED_WEAPONS = ['Desert', 'M1887', 'M1887X', 'M1014', 'Woodpecker'];
const ALLOWED_SKILLS = ['DJ Alok', 'Tatsuya', 'Koda'];

const state = {
  user: null,
  guild: null,
  adminUser: null,
  admin: null,
  challenges: [],
  results: [],
  leaderboard: [],
  bottom: null,
  history: [],
  guilds: [],
  blocks: [],
  adminResults: []
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeGuild(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeContact(value) {
  let n = String(value || '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = `92${n.slice(1)}`;
  return n;
}

function formatContact(value) {
  const n = normalizeContact(value);
  if (!n) return '';
  if (n.startsWith('92') && n.length === 12) return `+92 ${n.slice(2,5)} ${n.slice(5,8)} ${n.slice(8)}`;
  return `+${n}`;
}

function formatTime(value) {
  if (!value) return '--:--';
  const [hText, mText = '00'] = String(value).split(':');
  const h = Number(hText);
  if (!Number.isFinite(h)) return '--:--';
  return `${h % 12 || 12}:${String(mText).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }).format(d);
}

function formatWeek(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeZone: TIME_ZONE }).format(d);
}

function currentPakistanParts() {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}

function postingWindowOpen() {
  const { hour, minute } = currentPakistanParts();
  const total = hour * 60 + minute;
  return total >= 600 && total < 1380;
}

function selectedValues(selector) {
  return [...document.querySelectorAll(selector)].filter((el) => el.checked).map((el) => el.value);
}

function showStatus(id, type, message) {
  const el = $(id);
  if (!el) return;
  el.className = `status show ${type}`;
  el.textContent = message;
}

function clearStatus(id) {
  const el = $(id);
  if (!el) return;
  el.className = 'status';
  el.textContent = '';
}

function setButtonBusy(id, busy, restoreText) {
  const btn = $(id);
  if (!btn) return;
  if (busy) {
    btn.disabled = true;
    btn.dataset.oldText = btn.textContent;
    btn.innerHTML = '<span class="loader"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = restoreText || btn.dataset.oldText || 'Submit';
  }
}

function humanizeDbError(error) {
  const message = String(error?.message || error?.details || error || 'Request failed.');
  if (/LOGIN_REQUIRED/i.test(message)) return 'Please login to continue.';
  if (/ALREADY_REGISTERED/i.test(message)) return 'This account already has a registered guild.';
  if (/DUPLICATE_REGISTRATION/i.test(message)) return 'This contact number is already registered.';
  if (/GUILD_LEADER_LIMIT/i.test(message)) return 'This guild already has 2 leaders.';
  if (/INVALID_GUILD/i.test(message)) return 'Invalid guild name.';
  if (/INVALID_CONTACT/i.test(message)) return 'Invalid contact number.';
  if (/APPROVAL/i.test(message)) return 'This guild is not approved yet or is currently banned.';
  if (/BAN_ACTIVE/i.test(message)) return 'This guild is currently banned.';
  if (/BLOCKED/i.test(message)) return 'This guild or contact number is currently blocked.';
  if (/DAILY_CHALLENGE_LIMIT/i.test(message)) return 'This guild has reached the 10-challenge daily limit.';
  if (/COOLDOWN/i.test(message)) return 'Please wait 15 minutes before posting another challenge.';
  if (/TIME_WINDOW/i.test(message)) return 'Challenge posting is open only from 10:00 AM until before 11:00 PM Pakistan time.';
  if (/DAILY_RESULT_LIMIT/i.test(message)) return 'This guild has reached the 5-result daily limit.';
  if (/IMAGE_LIMIT/i.test(message)) return 'Exactly 2 proof screenshots are required.';
  if (/RESULT_EXISTS/i.test(message)) return 'This challenge already has a result submission.';
  if (/RESULT_MATCH/i.test(message)) return 'The selected challenge does not match the submitted guilds.';
  if (/RESULT_ACTOR/i.test(message)) return 'The logged-in guild must be either the winner or the loser.';
  if (/RESULT_GUILD/i.test(message)) return 'Both result guilds must be registered, approved and not banned.';
  if (/CHALLENGE_NOT_FOUND/i.test(message)) return 'Challenge not found or it is no longer open.';
  if (/ADMIN_ONLY/i.test(message)) return 'Admin access required.';
  if (/Invalid login credentials/i.test(message)) return 'Invalid email or password.';
  if (/Email not confirmed/i.test(message)) return 'Please confirm your email before logging in.';
  if (/not linked as an active/i.test(message)) return 'This Auth account is not linked as an active 7TH UNIVERSE admin.';
  return message.trim();
}

function guildIsApproved() {
  if (!state.user || !state.guild) return false;
  const banned = state.guild.is_banned === true || Boolean(state.guild.ban_until && new Date(state.guild.ban_until) > new Date());
  return state.guild.approval_status === 'approved' && !banned;
}

function guildStatusText(guild) {
  if (!guild) return 'No guild is registered with this account. Complete Guild Registration below.';
  const banned = guild.is_banned === true || Boolean(guild.ban_until && new Date(guild.ban_until) > new Date());
  if (banned) return guild.ban_until ? `BANNED until ${formatDateTime(guild.ban_until)}.` : 'BANNED permanently.';
  if (guild.approval_status === 'approved') return 'Your guild is approved. Challenge and Results are unlocked.';
  if (guild.approval_status === 'rejected') return 'Your guild registration was rejected by an admin.';
  return 'Your guild registration is pending admin approval.';
}

async function loadMyGuild() {
  state.guild = null;
  if (!state.user) return null;
  const { data, error } = await db.from('guild_registry').select('id,user_id,guild_name,contact,approval_status,is_banned,ban_until,ban_reason,created_at,updated_at').eq('user_id', state.user.id).maybeSingle();
  if (error) throw error;
  state.guild = data || null;
  return state.guild;
}

function syncGuildRegistrationForm() {
  const email = $('guild-register-email');
  const password = $('guild-register-password');
  if (!email) return;
  if (state.user) {
    email.value = state.user.email || '';
    email.readOnly = true;
    if (password) {
      password.required = false;
      password.disabled = true;
      password.value = '';
      password.placeholder = 'Not required while logged in';
    }
  } else {
    email.readOnly = false;
    if (password) {
      password.required = true;
      password.disabled = false;
      password.placeholder = 'Minimum 8 characters';
    }
  }
}

function updateGuildUI() {
  document.querySelectorAll('.auth-required').forEach((el) => el.classList.toggle('hidden', !guildIsApproved()));
  $('nav-auth')?.classList.toggle('hidden', !!state.user);
  $('nav-logout')?.classList.toggle('hidden', !state.user);
  $('guild-account-card')?.classList.toggle('hidden', !state.user);
  if ($('guild-account-info')) $('guild-account-info').textContent = state.user?.email || '';
  if ($('guild-account-message')) $('guild-account-message').textContent = guildStatusText(state.guild);
  if ($('guild-account-badge')) {
    const badge = $('guild-account-badge');
    badge.textContent = state.guild ? String(state.guild.approval_status || 'pending').toUpperCase() : 'NOT REGISTERED';
    badge.className = `badge ${guildIsApproved() ? 'badge-ok' : state.guild?.approval_status === 'rejected' ? 'badge-danger' : 'badge-pending'}`;
  }
  if ($('guild-name')) $('guild-name').value = state.guild?.guild_name || '';
  if ($('contact')) $('contact').value = state.guild?.contact || '';
  syncGuildRegistrationForm();
}

async function refreshGuildAuth() {
  try {
    const { data: { user } } = await db.auth.getUser();
    state.user = user || null;
    await loadMyGuild();
    updateGuildUI();
  } catch (error) {
    console.error('Guild auth refresh failed', error);
    state.user = null;
    state.guild = null;
    updateGuildUI();
  }
}

async function handleGuildLogin(event) {
  event.preventDefault();
  clearStatus('guild-auth-status');
  const email = $('guild-login-email')?.value.trim() || '';
  const password = $('guild-login-password')?.value || '';
  if (!email || !password) return showStatus('guild-auth-status', 'error', 'Email and password are required.');
  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshGuildAuth();
    if (!state.guild) {
      showStatus('guild-auth-status', 'info', 'Login successful. This account has no registered guild yet. Complete Guild Registration below.');
      navigate('auth', true);
      return;
    }
    if (!guildIsApproved()) {
      showStatus('guild-auth-status', 'info', guildStatusText(state.guild));
      navigate('auth', true);
      return;
    }
    showStatus('guild-auth-status', 'ok', 'Login successful. Challenge and Results are now available.');
    navigate('challenge', true);
  } catch (error) {
    showStatus('guild-auth-status', 'error', humanizeDbError(error));
  }
}

async function registerGuildForCurrentUser(guild, contact) {
  if (!state.user) throw new Error('LOGIN_REQUIRED: Login required.');
  const { data, error } = await db.rpc('register_gvg_guild', { p_guild_name: guild, p_contact: contact });
  if (error) throw error;
  state.guild = Array.isArray(data) ? data[0] : data;
  await refreshGuildAuth();
  return state.guild;
}

async function handleGuildRegister(event) {
  event.preventDefault();
  clearStatus('guild-auth-status');
  const guild = $('guild-register-name')?.value.trim() || '';
  const contact = $('guild-register-contact')?.value.trim() || '';
  const email = $('guild-register-email')?.value.trim() || '';
  const password = $('guild-register-password')?.value || '';
  if (!guild || !contact || !email) return showStatus('guild-auth-status', 'error', 'Guild name, contact and email are required.');
  if (!state.user && password.length < 8) return showStatus('guild-auth-status', 'error', 'Password must be at least 8 characters.');
  try {
    if (state.user) {
      if (String(state.user.email || '').trim().toLowerCase() !== email.toLowerCase()) throw new Error('Registration email must match the currently logged-in guild account.');
      if (state.guild) return showStatus('guild-auth-status', 'info', guildStatusText(state.guild));
      await registerGuildForCurrentUser(guild, contact);
      showStatus('guild-auth-status', 'ok', 'Guild registered successfully. The record is ready for admin approval.');
      return;
    }
    const login = await db.auth.signInWithPassword({ email, password });
    if (!login.error) {
      await refreshGuildAuth();
      if (state.guild) return showStatus('guild-auth-status', 'info', guildStatusText(state.guild));
      await registerGuildForCurrentUser(guild, contact);
      showStatus('guild-auth-status', 'ok', 'Guild registered successfully. The record is ready for admin approval.');
      return;
    }
    const { data, error } = await db.auth.signUp({ email, password, options: { data: { account_type: 'guild' } } });
    if (error) {
      if (/already registered|already exists|user already/i.test(String(error.message || ''))) throw new Error('This email already has an account. Login with that email and password, then register the guild.');
      throw error;
    }
    if (data?.session) {
      await refreshGuildAuth();
      if (!state.guild) await registerGuildForCurrentUser(guild, contact);
      showStatus('guild-auth-status', 'ok', 'Guild registered successfully. The record is ready for admin approval.');
    } else {
      showStatus('guild-auth-status', 'info', 'Account created. Confirm your email, then login and complete Guild Registration. Admin approval is required.');
    }
  } catch (error) {
    showStatus('guild-auth-status', 'error', humanizeDbError(error));
  } finally {
    syncGuildRegistrationForm();
  }
}

async function handleGuildLogout() {
  try { await db.auth.signOut(); } catch (error) { console.error(error); }
  state.user = null;
  state.guild = null;
  updateGuildUI();
  navigate('home', true);
}

function mapChallengeRow(row) {
  const rawContact = row.contact_normalized || row.contact_number || '';
  const guildName = row.guild_name || row.guild_name_normalized || 'Unknown Guild';
  return {
    ...row,
    guild_name: String(guildName).toUpperCase(),
    challenge_time: row.match_time,
    contact: formatContact(rawContact)
  };
}

function challengeMessage(challenge) {
  return ['7TH UNIVERSE GVG', '', `Guild: ${challenge.guild_name}`, `Time: ${formatTime(challenge.challenge_time)}`, `Weapons: ${(challenge.weapons || []).join(', ') || 'Not specified'}`, `Active Skills: ${(challenge.active_skills || []).join(', ') || 'None'}`, `Contact: ${challenge.contact}`].join('\n');
}

function openWhatsApp(challengeId) {
  const challenge = state.challenges.find((x) => x.id === challengeId);
  if (!challenge) return;
  const n = normalizeContact(challenge.contact);
  if (!n) return alert('No valid contact number is available.');
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(challengeMessage(challenge))}`, '_blank', 'noopener,noreferrer');
}

async function notifyWhatsApp(challenge) {
  if (!WHATSAPP_NOTIFY_ENDPOINT) return;
  try {
    await fetch(WHATSAPP_NOTIFY_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'new_challenge', challenge }) });
  } catch (error) { console.warn('WhatsApp notification failed', error); }
}

function navigateToResultForChallenge(challengeId) {
  const select = $('result-challenge');
  navigate('results', true);
  setTimeout(() => {
    if (select) select.value = challengeId;
  }, 20);
}

function renderChallengeCard(challenge) {
  const weapons = (challenge.weapons || []).map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join('') || '<span class="pill">Not specified</span>';
  const skills = (challenge.active_skills || []).map((x) => `<span class="pill">${escapeHtml(x)}</span>`).join('') || '<span class="pill">None</span>';
  return `<div class="challenge-card">
    <div class="meta-row"><div><div class="name">${escapeHtml(challenge.guild_name)}</div><div class="subtle">Open challenge • no date</div></div><span class="badge badge-open">OPEN</span></div>
    <div class="challenge-time">${escapeHtml(formatTime(challenge.challenge_time))}</div>
    <div class="pill-wrap"><strong class="small muted">WEAPONS</strong></div><div class="pill-wrap" style="margin-top:-4px">${weapons}</div>
    <div class="pill-wrap"><strong class="small muted">SKILLS</strong></div><div class="pill-wrap" style="margin-top:-4px">${skills}</div>
    <div class="card-actions" style="margin-top:13px"><a class="contact-link" href="tel:+${escapeHtml(normalizeContact(challenge.contact))}">${escapeHtml(challenge.contact)}</a><button class="btn btn-small" type="button" data-action="whatsapp" data-id="${escapeHtml(challenge.id)}">WhatsApp</button><button class="btn btn-small btn-primary" type="button" data-action="copy" data-id="${escapeHtml(challenge.id)}">Copy Number</button>${guildIsApproved() ? `<button class="btn btn-small btn-success" type="button" data-action="result" data-id="${escapeHtml(challenge.id)}">Submit Result</button>` : ''}</div>
  </div>`;
}

function renderChallengeLists() {
  const search = (($('home-challenge-search')?.value || $('challenge-search')?.value || '').trim().toLowerCase());
  const html = state.challenges.filter((c) => !search || String(c.guild_name || '').toLowerCase().includes(search)).map(renderChallengeCard).join('') || '<div class="empty">No open challenges found.</div>';
  if ($('home-challenge-list')) $('home-challenge-list').innerHTML = html;
  if ($('challenge-list')) $('challenge-list').innerHTML = html;
}

async function loadChallenges() {
  try {
    const { data, error } = await db.from('challenges').select('id,challenge_code,challenger_leader_id,challenger_guild_id,opponent_guild_id,challenge_everyone,match_time,weapons,active_skills,contact_number,status,created_at,accepted_by_leader_id,accepted_by_guild_id,accepted_at,user_id,guild_name_normalized,contact_normalized,completed_at').eq('status', 'open').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    state.challenges = (data || []).map(mapChallengeRow);
    renderChallengeLists();
    fillResultChallenges();
    await updateStats();
  } catch (error) {
    console.error(error);
    const html = '<div class="empty">Could not load challenges.</div>';
    if ($('home-challenge-list')) $('home-challenge-list').innerHTML = html;
    if ($('challenge-list')) $('challenge-list').innerHTML = html;
  }
}

function initTimePicker() {
  const hour = $('time-hour'), minute = $('time-minute'), ampm = $('time-ampm');
  if (!hour || !minute || !ampm) return;
  hour.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('');
  minute.innerHTML = Array.from({ length: 60 }, (_, i) => `<option value="${String(i).padStart(2, '0')}">${String(i).padStart(2, '0')}</option>`).join('');
  const now = currentPakistanParts();
  hour.value = String(now.hour % 12 || 12);
  minute.value = String(now.minute).padStart(2, '0');
  ampm.value = now.hour >= 12 ? 'PM' : 'AM';
}

function getSelectedTime24() {
  let h = Number($('time-hour')?.value || 12);
  const m = Number($('time-minute')?.value || 0);
  const ap = $('time-ampm')?.value || 'AM';
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

async function handleChallengeSubmit(event) {
  event.preventDefault();
  clearStatus('challenge-status');
  if (!guildIsApproved()) return navigate('auth', true);
  if (!postingWindowOpen()) return showStatus('challenge-status', 'error', 'Challenges can only be posted from 10:00 AM until before 11:00 PM Pakistan time.');
  const weapons = selectedValues('#weapon-options input');
  const skills = selectedValues('#skill-options input');
  if (!weapons.length) return showStatus('challenge-status', 'error', 'Select at least one weapon.');
  if (weapons.some((x) => !ALLOWED_WEAPONS.includes(x))) return showStatus('challenge-status', 'error', 'Invalid weapon selection.');
  if (skills.some((x) => !ALLOWED_SKILLS.includes(x))) return showStatus('challenge-status', 'error', 'Invalid skill selection.');
  setButtonBusy('challenge-submit', true);
  try {
    const { data, error } = await db.rpc('submit_gvg_challenge', { p_challenge_time: getSelectedTime24(), p_weapons: weapons, p_active_skills: skills });
    if (error) throw error;
    $('challenge-form')?.reset();
    initTimePicker();
    showStatus('challenge-status', 'ok', 'Challenge submitted successfully.');
    await loadChallenges();
    const returned = Array.isArray(data) ? data[0] : data;
    if (returned) await notifyWhatsApp({ ...returned, guild_name: String(returned.guild_name_normalized || state.guild?.guild_name || '').toUpperCase(), challenge_time: returned.match_time || null, contact: formatContact(returned.contact_number || state.guild?.contact || '') });
  } catch (error) {
    showStatus('challenge-status', 'error', humanizeDbError(error));
  } finally {
    setButtonBusy('challenge-submit', false, 'Confirm Challenge');
  }
}

function renderLeaderboardTable(targetId, rows) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = rows.length ? rows.map((g) => `<tr><td><span class="rank-number">${escapeHtml(g.rank_no)}</span></td><td><strong>${escapeHtml(g.guild_name)}</strong></td><td><span class="points ${Number(g.points) < 0 ? 'negative' : 'positive'}">${escapeHtml(g.points)}</span></td><td>${escapeHtml(g.wins)}</td><td>${escapeHtml(g.losses)}</td></tr>`).join('') : '<tr><td colspan="5">No approved results yet this week.</td></tr>';
}

async function loadLeaderboard() {
  try {
    const { data, error } = await db.rpc('get_gvg_weekly_leaderboard');
    if (error) throw error;
    state.leaderboard = data || [];
    renderLeaderboardTable('home-ranking-table', state.leaderboard);
    renderLeaderboardTable('ranking-table', state.leaderboard);
  } catch (error) {
    console.error('Leaderboard load failed', error);
  }
}

async function loadBottom() {
  try {
    const { data, error } = await db.rpc('get_gvg_weekly_bottom');
    if (error) throw error;
    state.bottom = Array.isArray(data) ? data[0] : data;
    if ($('bottom-card')) {
      $('bottom-card').innerHTML = state.bottom ? `<strong>${escapeHtml(state.bottom.guild_name)}</strong><div class="sub">${escapeHtml(state.bottom.points)} points • ${escapeHtml(state.bottom.wins)}W / ${escapeHtml(state.bottom.losses)}L</div>` : '<div class="sub">No weekly records yet.</div>';
    }
  } catch (error) {
    console.error('Bottom load failed', error);
  }
}

async function loadHistory() {
  try {
    const { data, error } = await db.rpc('get_gvg_all_time_top10');
    if (error) throw error;
    state.history = data || [];
    if ($('history-list')) {
      $('history-list').innerHTML = state.history.length ? state.history.map((r) => `<div class="history-item"><div class="pos">#${escapeHtml(r.rank_no)}</div><div><div class="guild">${escapeHtml(r.guild_name)}</div><div class="week">Week started ${escapeHtml(formatWeek(r.week_start))} • ${escapeHtml(r.wins)}W / ${escapeHtml(r.losses)}L</div></div><div class="score">${escapeHtml(r.points)}</div></div>`).join('') : '<div class="empty">No historical weekly records yet.</div>';
    }
  } catch (error) {
    console.error('History load failed', error);
  }
}

async function loadRankings() {
  await Promise.all([loadLeaderboard(), loadBottom(), loadHistory()]);
}

async function loadResults() {
  try {
    const { data, error } = await db.from('challenge_results').select('id,challenge_id,winner_guild,loser_guild,score,image_urls,status,created_at').eq('status', 'approved').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    state.results = data || [];
    renderResults();
    await updateStats();
  } catch (error) {
    console.error('Result load failed', error);
    if ($('result-list')) $('result-list').innerHTML = '<div class="empty">Could not load results.</div>';
  }
}

function renderResults() {
  if (!$('result-list')) return;
  $('result-list').innerHTML = state.results.length ? state.results.map((r) => {
    const images = Array.isArray(r.image_urls) ? r.image_urls.slice(0, 2) : [];
    return `<div class="card"><div class="meta-row"><div><div class="match-name">${escapeHtml(r.winner_guild)} <span class="muted">def.</span> ${escapeHtml(r.loser_guild)}</div><div class="subtle">Score: ${escapeHtml(r.score)}</div></div><span class="badge badge-ok">APPROVED</span></div>${images.length ? `<div class="image-grid">${images.map((url, i) => `<a class="proof" href="${escapeHtml(url)}" target="_blank" rel="noopener"><span class="proof-label">PROOF ${i + 1}</span><img src="${escapeHtml(url)}" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} proof ${i + 1}"></a>`).join('')}</div>` : '<div class="hint">No proof images stored.</div>'}</div>`;
  }).join('') : '<div class="empty">No approved results yet.</div>';
}

function fillResultChallenges() {
  const select = $('result-challenge');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Select an open challenge</option>' + state.challenges.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.guild_name)} — ${escapeHtml(formatTime(c.challenge_time))}</option>`).join('');
  if (state.challenges.some((x) => x.id === current)) select.value = current;
}

async function uploadResultImages(files) {
  const selected = [...files].filter(Boolean);
  if (selected.length !== 2) throw new Error('IMAGE_LIMIT: Exactly 2 proof screenshots are required.');
  if (!state.user) throw new Error('LOGIN_REQUIRED: Login required.');
  const urls = [];
  for (const file of selected) {
    if (file.size > MAX_IMAGE_SIZE) throw new Error('Each image must be 5 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Only JPG, PNG and WEBP images are allowed.');
    const ext = String(file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `results/${state.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from(IMAGE_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = db.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
}

async function handleResultSubmit(event) {
  event.preventDefault();
  clearStatus('result-status');
  if (!guildIsApproved()) return navigate('auth', true);
  const challengeId = $('result-challenge')?.value || '';
  const winner = $('winner-guild')?.value.trim() || '';
  const loser = $('loser-guild')?.value.trim() || '';
  const score = $('score')?.value.trim() || '';
  const files = [$('result-image-1')?.files?.[0], $('result-image-2')?.files?.[0]].filter(Boolean);
  if (!challengeId || !winner || !loser || !score) return showStatus('result-status', 'error', 'Challenge, winner, loser and score are required.');
  if (normalizeGuild(winner) === normalizeGuild(loser)) return showStatus('result-status', 'error', 'Winner and loser must be different.');
  if (files.length !== 2) return showStatus('result-status', 'error', 'Exactly 2 proof screenshots are required.');
  setButtonBusy('result-submit', true);
  try {
    const imageUrls = await uploadResultImages(files);
    const { error } = await db.rpc('submit_gvg_result', { p_challenge_id: challengeId, p_winner_guild: winner, p_loser_guild: loser, p_score: score, p_image_urls: imageUrls });
    if (error) throw error;
    showStatus('result-status', 'ok', 'Result submitted. It will appear publicly only after admin approval.');
    $('result-form')?.reset();
    await loadChallenges();
    await loadResults();
  } catch (error) {
    showStatus('result-status', 'error', humanizeDbError(error));
  } finally {
    setButtonBusy('result-submit', false, 'Submit Result for Approval');
  }
}

async function updateStats() {
  try {
    const { data, error } = await db.rpc('get_gvg_stats');
    if (error) throw error;
    const stats = Array.isArray(data) ? data[0] || {} : data || {};
    if ($('stat-open')) $('stat-open').textContent = String(stats.open_challenges ?? state.challenges.length ?? 0);
    if ($('stat-results')) $('stat-results').textContent = String(stats.today_result_submissions ?? 0);
    if ($('stat-approved-results')) $('stat-approved-results').textContent = String(stats.today_approved_results ?? 0);
    if ($('stat-guilds')) $('stat-guilds').textContent = String(stats.approved_guilds ?? 0);
  } catch (error) {
    console.warn('Stats failed', error);
  }
}

/* ============================ ADMIN ============================ */

async function isCurrentUserAdmin() {
  const { data: { user } } = await adminDb.auth.getUser();
  if (!user) { state.admin = null; state.adminUser = null; return false; }
  const { data, error } = await adminDb.from('admins').select('id,admin_name,is_active,created_at').eq('id', user.id).eq('is_active', true).maybeSingle();
  if (error) { console.warn('Admin check failed', error); state.admin = null; state.adminUser = null; return false; }
  state.adminUser = user;
  state.admin = data || null;
  return !!data;
}

async function handleAdminLogin(event) {
  event.preventDefault();
  clearStatus('admin-login-status');
  const email = $('admin-email')?.value.trim() || '';
  const password = $('admin-password')?.value || '';
  if (!email || !password) return showStatus('admin-login-status', 'error', 'Admin email and password are required.');
  try {
    const { error } = await adminDb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const ok = await isCurrentUserAdmin();
    if (!ok) {
      await adminDb.auth.signOut();
      throw new Error('This Auth account is not linked as an active 7TH UNIVERSE admin.');
    }
    await restoreAdmin();
    showStatus('admin-login-status', 'ok', 'Admin login successful. Guild session remains separate.');
  } catch (error) {
    showStatus('admin-login-status', 'error', humanizeDbError(error));
  }
}

async function handleAdminLogout() {
  try { await adminDb.auth.signOut(); } catch (error) { console.error(error); }
  state.adminUser = null;
  state.admin = null;
  $('admin-login-panel')?.classList.remove('hidden');
  $('admin-dashboard')?.classList.add('hidden');
}

async function restoreAdmin() {
  const ok = await isCurrentUserAdmin();
  $('admin-login-panel')?.classList.toggle('hidden', ok);
  $('admin-dashboard')?.classList.toggle('hidden', !ok);
  if (!ok) return;
  if ($('admin-user-label')) $('admin-user-label').textContent = state.adminUser?.email || '';
  await refreshAdmin();
}

async function refreshAdmin() {
  if (!(await isCurrentUserAdmin())) return;
  await Promise.all([loadGuilds(), loadBlocks(), loadAdminResults(), loadAdminChallenges()]);
}

function getCurrentWeekPoint(guildName) {
  const row = state.guilds.find((g) => normalizeGuild(g.guild_name) === normalizeGuild(guildName));
  return row ? Number(row.points || 0) : 0;
}

function fillGuildEditor(guild) {
  if (!guild) return;
  $('reg-guild-id').value = guild.id || '';
  $('reg-guild-name').value = guild.guild_name || '';
  $('reg-contact').value = guild.contact || '';
  $('reg-status').value = guild.approval_status || 'approved';
  $('reg-points').value = String(guild.points ?? 0);
  $('reg-ban-until').value = guild.ban_until ? new Date(guild.ban_until).toISOString().slice(0,16) : '';
  $('reg-ban-reason').value = guild.ban_reason || 'Rule violation';
  document.getElementById('guild-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearGuildEditor() {
  $('guild-form')?.reset();
  $('reg-guild-id').value = '';
  $('reg-status').value = 'approved';
  $('reg-points').value = '0';
  $('reg-ban-reason').value = 'Rule violation';
}

function filteredGuilds() {
  const q = ($('admin-guild-search')?.value || '').trim().toLowerCase();
  if (!q) return state.guilds;
  return state.guilds.filter((g) => [g.guild_name, g.contact, g.user_id, g.email, g.approval_status].some((v) => String(v || '').toLowerCase().includes(q)));
}

function renderGuilds() {
  const target = $('guild-table');
  if (!target) return;
  const rows = filteredGuilds();
  target.innerHTML = rows.length ? rows.map((g) => `<tr><td><strong>${escapeHtml(g.guild_name)}</strong><div class="subtle">Leader: ${escapeHtml(g.email || '—')}</div></td><td>${escapeHtml(formatContact(g.contact))}</td><td>${escapeHtml(g.leader_count)}</td><td>${escapeHtml(g.approval_status)}</td><td><span class="points ${Number(g.points) < 0 ? 'negative' : 'positive'}">${escapeHtml(g.points)}</span></td><td>${g.ban_until && new Date(g.ban_until) > new Date() ? escapeHtml(formatDateTime(g.ban_until)) : g.is_banned ? 'Permanent' : '—'}</td><td><button class="btn btn-small btn-primary" type="button" data-action="edit-guild" data-id="${escapeHtml(g.id)}">Edit</button>${g.is_banned || (g.ban_until && new Date(g.ban_until) > new Date()) ? `<button class="btn btn-small btn-success" type="button" data-action="unban-guild" data-id="${escapeHtml(g.id)}">Unban</button>` : `<button class="btn btn-small btn-danger" type="button" data-action="ban-guild" data-id="${escapeHtml(g.id)}">Ban</button>`} <button class="btn btn-small btn-danger" type="button" data-action="remove-guild" data-id="${escapeHtml(g.id)}">Remove</button></td></tr>`).join('') : '<tr><td colspan="7">No matching registered guilds.</td></tr>';
}

async function loadGuilds() {
  try {
    const { data, error } = await adminDb.rpc('admin_get_guilds');
    if (error) throw error;
    state.guilds = data || [];
    renderGuilds();
  } catch (error) {
    console.error('Guild list load failed', error);
    showStatus('admin-status', 'error', humanizeDbError(error));
  }
}

async function handleGuildSave(event) {
  event.preventDefault();
  clearStatus('admin-status');
  const id = $('reg-guild-id')?.value || '';
  const guild = $('reg-guild-name')?.value.trim() || '';
  const contact = $('reg-contact')?.value.trim() || '';
  const status = $('reg-status')?.value || 'approved';
  const points = Number($('reg-points')?.value || 0);
  const banUntil = $('reg-ban-until')?.value ? new Date($('reg-ban-until').value).toISOString() : null;
  const reason = $('reg-ban-reason')?.value.trim() || 'Rule violation';
  try {
    if (!guild || !contact) throw new Error('Guild name and contact are required.');
    if (!Number.isInteger(points)) throw new Error('Points must be a whole number.');
    if (id) {
      const { error } = await adminDb.rpc('admin_update_guild_record', {
        p_guild_id: id,
        p_guild_name: guild,
        p_contact: contact,
        p_approval_status: status,
        p_ban_until: banUntil,
        p_ban_reason: reason,
        p_points: points
      });
      if (error) throw error;
    } else {
      const { error } = await adminDb.rpc('admin_upsert_guild', { p_guild_name: guild, p_contact: contact, p_approval_status: status, p_ban_until: banUntil, p_ban_reason: reason });
      if (error) throw error;
    }
    showStatus('admin-status', 'ok', 'Guild, contact and current-week points saved.');
    await loadGuilds();
    await loadRankings();
  } catch (error) {
    showStatus('admin-status', 'error', humanizeDbError(error));
  }
}

async function quickGuildBan(id, permanent = false) {
  try {
    let iso = null;
    if (!permanent) {
      const input = prompt('Enter ban end as YYYY-MM-DD HH:MM (Pakistan time), or leave blank for permanent:', '');
      if (input === null) return;
      if (input.trim()) {
        const date = new Date(`${input.trim().replace(' ', 'T')}+05:00`);
        if (Number.isNaN(date.getTime())) throw new Error('Invalid ban date/time.');
        iso = date.toISOString();
      }
      permanent = !iso;
    }
    const { error } = await adminDb.rpc('admin_set_guild_ban', { p_guild_id: id, p_ban_until: permanent ? null : iso, p_reason: 'Admin ban' });
    if (error) throw error;
    showStatus('admin-status', 'ok', permanent ? 'Permanent ban applied to the guild.' : 'Temporary ban applied to the guild.');
    await loadGuilds();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function unbanGuild(id) {
  try {
    const { error } = await adminDb.rpc('admin_unban_guild', { p_guild_id: id });
    if (error) throw error;
    showStatus('admin-status', 'ok', 'Guild unbanned.');
    await loadGuilds();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function removeGuild(id) {
  if (!confirm('Remove only this leader registration from the guild registry? Existing result/challenge data is not deleted.')) return;
  try {
    const { error } = await adminDb.rpc('admin_remove_guild', { p_guild_id: id });
    if (error) throw error;
    showStatus('admin-status', 'ok', 'Leader registration removed. Existing results and challenges remain.');
    await loadGuilds();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function handleBlock(event) {
  event.preventDefault();
  clearStatus('admin-status');
  try {
    const guild = $('block-guild')?.value.trim() || null;
    const contact = $('block-number')?.value.trim() || null;
    const until = $('block-until')?.value ? new Date($('block-until').value).toISOString() : null;
    const reason = $('block-reason')?.value.trim() || 'Rule violation';
    if (!guild && !contact) throw new Error('Enter a guild name or a contact number.');
    const { error } = await adminDb.rpc('admin_create_block', { p_guild_name: guild, p_contact: contact, p_blocked_until: until, p_reason: reason });
    if (error) throw error;
    event.target.reset();
    $('block-reason').value = 'Rule violation';
    showStatus('admin-status', 'ok', 'Block created.');
    await loadBlocks();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function loadBlocks() {
  try {
    const { data, error } = await adminDb.from('blocks').select('id,guild_name,contact,blocked_until,reason,created_at').order('created_at', { ascending: false });
    if (error) throw error;
    state.blocks = data || [];
    if ($('block-table')) $('block-table').innerHTML = state.blocks.length ? state.blocks.map((b) => `<tr><td>${escapeHtml(b.guild_name || '—')}<br>${escapeHtml(b.contact || '')}</td><td>${b.blocked_until ? escapeHtml(formatDateTime(b.blocked_until)) : 'Permanent'}</td><td>${escapeHtml(b.reason || '—')}</td><td><button class="btn btn-small btn-success" type="button" data-action="unblock" data-id="${escapeHtml(b.id)}">Unblock</button></td></tr>`).join('') : '<tr><td colspan="4">No blocks.</td></tr>';
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function unblock(id) {
  try {
    const { error } = await adminDb.rpc('admin_delete_block', { p_block_id: id });
    if (error) throw error;
    showStatus('admin-status', 'ok', 'Block removed.');
    await loadBlocks();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function loadAdminResults() {
  try {
    const { data, error } = await adminDb.rpc('admin_get_results');
    if (error) throw error;
    state.adminResults = data || [];
    const target = $('admin-result-table');
    if (!target) return;
    target.innerHTML = state.adminResults.length ? state.adminResults.map((r) => {
      const images = Array.isArray(r.image_urls) ? r.image_urls.slice(0, 2) : [];
      const proofHtml = images.length ? `<div class="image-grid" style="min-width:250px">${images.map((url, i) => `<a class="proof" href="${escapeHtml(url)}" target="_blank" rel="noopener"><span class="proof-label">PROOF ${i + 1}</span><img src="${escapeHtml(url)}" alt="${escapeHtml(r.winner_guild)} vs ${escapeHtml(r.loser_guild)} proof ${i + 1}"></a>`).join('')}</div>` : '<span class="muted">No screenshots</span>';
      return `<tr><td><strong>${escapeHtml(r.winner_guild)}</strong><div class="subtle">WINNER</div><strong>${escapeHtml(r.loser_guild)}</strong><div class="subtle">LOSER</div></td><td><strong>${escapeHtml(r.score)}</strong></td><td>${proofHtml}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(formatDateTime(r.created_at))}</td><td>${r.status === 'pending' ? `<button class="btn btn-small btn-success" type="button" data-action="approve-result" data-id="${escapeHtml(r.id)}">Approve</button> <button class="btn btn-small btn-danger" type="button" data-action="reject-result" data-id="${escapeHtml(r.id)}">Reject</button>` : '—'}</td></tr>`;
    }).join('') : '<tr><td colspan="6">No result submissions.</td></tr>';
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function approveResult(id) {
  try {
    const { error } = await adminDb.rpc('admin_approve_result', { p_result_id: id });
    if (error) throw error;
    showStatus('admin-status', 'ok', 'Result approved and points updated.');
    await Promise.all([loadAdminResults(), loadResults(), loadChallenges(), loadRankings(), loadGuilds()]);
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function rejectResult(id) {
  const reason = prompt('Reason for rejection:', 'Proof or result issue');
  if (reason === null) return;
  try {
    const { error } = await adminDb.rpc('admin_reject_result', { p_result_id: id, p_reason: reason.trim() || 'Rejected by admin' });
    if (error) throw error;
    showStatus('admin-status', 'ok', 'Result rejected. The challenge is open again.');
    await loadAdminResults();
    await loadChallenges();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function loadAdminChallenges() {
  try {
    const { data, error } = await adminDb.from('challenges').select('id,challenge_code,challenger_guild_id,opponent_guild_id,challenge_everyone,match_time,weapons,active_skills,contact_number,status,created_at,accepted_by_leader_id,accepted_by_guild_id,accepted_at,user_id,guild_name_normalized,contact_normalized,completed_at').order('created_at', { ascending: false }).limit(250);
    if (error) throw error;
    const rows = (data || []).map(mapChallengeRow);
    if ($('admin-challenge-table')) $('admin-challenge-table').innerHTML = rows.length ? rows.map((c) => `<tr><td><strong>${escapeHtml(c.guild_name)}</strong></td><td>${escapeHtml(c.contact)}</td><td>${escapeHtml(formatTime(c.match_time))}</td><td>${escapeHtml((c.weapons || []).join(', '))}</td><td>${escapeHtml((c.active_skills || []).join(', ') || 'None')}</td><td>${escapeHtml(c.status)}</td><td>${!['completed','cancelled'].includes(c.status) ? `<button class="btn btn-small btn-danger" type="button" data-action="cancel-challenge" data-id="${escapeHtml(c.id)}">Cancel</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="7">No challenges.</td></tr>';
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

async function cancelChallenge(id) {
  if (!confirm('Cancel this challenge?')) return;
  try {
    const { error } = await adminDb.rpc('admin_cancel_challenge', { p_challenge_id: id });
    if (error) throw error;
    showStatus('admin-status', 'ok', 'Challenge cancelled.');
    await loadAdminChallenges();
    await loadChallenges();
  } catch (error) { showStatus('admin-status', 'error', humanizeDbError(error)); }
}

/* ========================== NAVIGATION ========================= */

function navigate(page, force = false) {
  if (['challenge', 'results'].includes(page) && !guildIsApproved() && !force) page = 'auth';
  document.querySelectorAll('.page').forEach((section) => section.classList.remove('active'));
  const target = $(`page-${page}`);
  if (target) target.classList.add('active');
  document.querySelectorAll('[data-page-link]').forEach((btn) => btn.classList.toggle('active', btn.dataset.pageLink === page));
  if (page === 'home') { loadChallenges(); loadLeaderboard(); }
  if (page === 'challenge') { updateGuildUI(); loadChallenges(); }
  if (page === 'results') { loadChallenges(); loadResults(); }
  if (page === 'ranking') loadRankings();
  if (page === 'admin') restoreAdmin();
  if (page === 'auth') refreshGuildAuth();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wire() {
  document.querySelectorAll('[data-page-link]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.pageLink); }));
  $('nav-logout')?.addEventListener('click', handleGuildLogout);
  $('guild-login-form')?.addEventListener('submit', handleGuildLogin);
  $('guild-register-form')?.addEventListener('submit', handleGuildRegister);
  $('challenge-form')?.addEventListener('submit', handleChallengeSubmit);
  $('result-form')?.addEventListener('submit', handleResultSubmit);
  $('admin-login-form')?.addEventListener('submit', handleAdminLogin);
  $('admin-logout')?.addEventListener('click', handleAdminLogout);
  $('guild-form')?.addEventListener('submit', handleGuildSave);
  $('clear-guild-edit')?.addEventListener('click', clearGuildEditor);
  $('block-form')?.addEventListener('submit', handleBlock);
  $('home-challenge-search')?.addEventListener('input', renderChallengeLists);
  $('challenge-search')?.addEventListener('input', renderChallengeLists);
  $('admin-guild-search')?.addEventListener('input', renderGuilds);

  document.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;
    if (action === 'whatsapp') return openWhatsApp(id);
    if (action === 'copy') {
      const c = state.challenges.find((x) => x.id === id);
      if (c) copyContact(c.contact);
      return;
    }
    if (action === 'result') return navigateToResultForChallenge(id);
    if (action === 'edit-guild') {
      const g = state.guilds.find((x) => x.id === id);
      return fillGuildEditor(g);
    }
    if (action === 'ban-guild') return quickGuildBan(id);
    if (action === 'unban-guild') return unbanGuild(id);
    if (action === 'remove-guild') return removeGuild(id);
    if (action === 'unblock') return unblock(id);
    if (action === 'approve-result') return approveResult(id);
    if (action === 'reject-result') return rejectResult(id);
    if (action === 'cancel-challenge') return cancelChallenge(id);
  });
}

async function copyContact(value) {
  const text = String(value || '');
  if (!text) return alert('No contact number available.');
  try { await navigator.clipboard.writeText(text); alert('Contact number copied.'); } catch { alert(text); }
}

window.navigate = navigate;
window.openWhatsApp = openWhatsApp;
window.copyText = copyContact;
window.approveResult = approveResult;
window.rejectResult = rejectResult;
window.cancelChallenge = cancelChallenge;

(async function boot() {
  initTimePicker();
  wire();
  db.auth.onAuthStateChange(() => setTimeout(refreshGuildAuth, 0));
  adminDb.auth.onAuthStateChange(() => setTimeout(restoreAdmin, 0));
  await refreshGuildAuth();
  await restoreAdmin();
  await Promise.all([loadChallenges(), loadResults(), loadRankings(), updateStats()]);
})();
