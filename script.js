/*
  7TH UNIVERSE GVG
  Public frontend + Supabase JS v2.
  NEVER put a service_role/secret key here.
*/

const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_PROJECT_URL_HERE';
const SUPABASE_PUBLISHABLE_KEY = 'PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE';
const WHATSAPP_NOTIFY_ENDPOINT = '';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const TZ = 'Asia/Karachi';
const WEAPONS = ['Desert', 'M1887', 'M1887X', 'M1014', 'Woodpecker'];
const SKILLS = ['DJ Alok', 'Tatsuya', 'Koda'];
const BUCKET = 'result-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const state = {
  user: null,
  guild: null,
  admin: null,
  challenges: [],
  results: [],
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

function normalizeContact(raw) {
  let n = String(raw || '').replace(/\D/g, '');

  if (n.startsWith('00')) {
    n = n.slice(2);
  }

  if (n.startsWith('0')) {
    n = '92' + n.slice(1);
  }

  return n;
}

function normalizeGuild(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function waNumber(raw) {
  return normalizeContact(raw);
}

function formatTime(value) {
  if (!value) return '--:--';

  const [h, m] = String(value).split(':');

  let hour = Number(h);
  hour = hour % 12 || 12;

  return `${hour}:${m || '00'} ${Number(h) >= 12 ? 'PM' : 'AM'}`;
}

function formatDateTime(value) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TZ
  }).format(new Date(value));
}

function showStatus(id, type, message) {
  const el = $(id);

  if (!el) return;

  el.className = `status show ${type}`;
  el.textContent = message;
}

function clearStatus(id) {
  const el = $(id);

  if (el) {
    el.className = 'status';
    el.textContent = '';
  }
}

function currentPakistanParts() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = Object.fromEntries(
    fmt
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );

  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function postingWindowOpen() {
  const { hour, minute } = currentPakistanParts();

  const mins = hour * 60 + minute;

  return mins >= 600 && mins < 1380;
}

function selectedValues(selector) {
  return [
    ...document.querySelectorAll(selector + ':checked')
  ].map((x) => x.value);
}

function setButtonBusy(id, busy, text) {
  const b = $(id);

  if (!b) return;

  b.disabled = busy;

  if (busy) {
    b.dataset.oldText = b.textContent;
    b.innerHTML = '<span class="loader"></span>';
  } else {
    b.textContent =
      text ||
      b.dataset.oldText ||
      'Submit';
  }
}

function initTimePicker() {
  $('time-hour').innerHTML = Array.from(
    { length: 12 },
    (_, i) =>
      `<option value="${i + 1}">
        ${String(i + 1).padStart(2, '0')}
      </option>`
  ).join('');

  $('time-minute').innerHTML = Array.from(
    { length: 60 },
    (_, i) =>
      `<option value="${String(i).padStart(2, '0')}">
        ${String(i).padStart(2, '0')}
      </option>`
  ).join('');

  const now = currentPakistanParts();

  let h = now.hour % 12 || 12;

  $('time-hour').value = String(h);

  $('time-minute').value =
    String(now.minute).padStart(2, '0');

  $('time-ampm').value =
    now.hour >= 12 ? 'PM' : 'AM';
}

function getTime24() {
  let h = Number(
    $('time-hour').value || 12
  );

  const m = Number(
    $('time-minute').value || 0
  );

  const ap = $('time-ampm').value;

  if (ap === 'PM' && h !== 12) {
    h += 12;
  }

  if (ap === 'AM' && h === 12) {
    h = 0;
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function challengeMessage(ch) {
  const weapons =
    Array.isArray(ch.weapons) && ch.weapons.length
      ? ch.weapons.join(', ')
      : 'Not specified';

  const skills =
    Array.isArray(ch.active_skills) &&
    ch.active_skills.length
      ? ch.active_skills.join(', ')
      : 'None';

  return [
    '7TH UNIVERSE GVG',
    '',
    `Guild: ${ch.guild_name}`,
    `Time: ${formatTime(ch.challenge_time)}`,
    `Weapons: ${weapons}`,
    `Active Skills: ${skills}`,
    `Contact: ${ch.contact}`
  ].join('\n');
}

function openWhatsApp(ch) {
  window.open(
    `https://wa.me/${waNumber(ch.contact)}?text=${encodeURIComponent(
      challengeMessage(ch)
    )}`,
    '_blank',
    'noopener,noreferrer'
  );
}

async function notifyWhatsApp(ch) {
  if (!WHATSAPP_NOTIFY_ENDPOINT) return;

  try {
    await fetch(WHATSAPP_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'new_challenge',
        challenge: ch
      })
    });
  } catch (err) {
    console.warn(
      'WhatsApp notification failed',
      err
    );
  }
}

function renderChallengeCard(ch) {
  const weapons =
    Array.isArray(ch.weapons) &&
    ch.weapons.length
      ? ch.weapons
          .map(
            (w) =>
              `<span class="pill">${escapeHtml(w)}</span>`
          )
          .join('')
      : '<span class="pill">Not specified</span>';

  const skills =
    Array.isArray(ch.active_skills) &&
    ch.active_skills.length
      ? ch.active_skills
          .map(
            (s) =>
              `<span class="pill">${escapeHtml(s)}</span>`
          )
          .join('')
      : '<span class="pill">None</span>';

  return `
    <div class="card">

      <div class="row">

        <div>
          <div class="challenge-name">
            ${escapeHtml(ch.guild_name)}
          </div>

          <div class="challenge-meta">
            Open challenge • no date
          </div>
        </div>

        <span class="badge badge-open">
          OPEN
        </span>

      </div>

      <div style="margin-top:10px">

        <span class="muted small">
          MATCH TIME
        </span>

        <div style="
          font-size:19px;
          font-weight:900;
          margin-top:2px
        ">
          ${escapeHtml(
            formatTime(ch.challenge_time)
          )}
        </div>

      </div>

      <div class="pill-wrap">
        <strong class="small">
          WEAPONS
        </strong>
      </div>

      <div
        class="pill-wrap"
        style="margin-top:-3px"
      >
        ${weapons}
      </div>

      <div class="pill-wrap">
        <strong class="small">
          SKILLS
        </strong>
      </div>

      <div
        class="pill-wrap"
        style="margin-top:-3px"
      >
        ${skills}
      </div>

      <div class="card-actions">

        <a
          class="contact"
          href="tel:+${escapeHtml(
            waNumber(ch.contact)
          )}"
        >
          ${escapeHtml(ch.contact)}
        </a>

        <button
          class="btn btn-small"
          onclick='openWhatsApp(${JSON.stringify(ch).replace(
            /'/g,
            '&#039;'
          )})'
        >
          WhatsApp
        </button>

        <button
          class="btn btn-small btn-primary"
          onclick='copyText(${JSON.stringify(ch.contact)})'
        >
          Copy Number
        </button>

      </div>

    </div>
  `;
}

function renderChallengeLists() {
  const a =
    $('challenge-search')?.value?.trim().toLowerCase() ||
    $('challenge-search-2')?.value?.trim().toLowerCase() ||
    '';

  const list = state.challenges.filter(
    (ch) =>
      !a ||
      String(ch.guild_name || '')
        .toLowerCase()
        .includes(a)
  );

  const html = list.length
    ? list.map(renderChallengeCard).join('')
    : '<div class="empty">No open challenges found.</div>';

  if ($('home-challenge-list')) {
    $('home-challenge-list').innerHTML = html;
  }

  if ($('challenge-list')) {
    $('challenge-list').innerHTML = html;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(
      String(text)
    );

    alert('Contact number copied.');
  } catch {
    alert(String(text));
  }
}

async function loadChallenges() {
  try {
    const {
      data,
      error
    } = await db
      .from('challenges')
      .select(
        'id,guild_name,challenge_time,weapons,active_skills,contact,status,created_at'
      )
      .eq('status', 'open')
      .order('created_at', {
        ascending: false
      })
      .limit(100);

    if (error) throw error;

    state.challenges = data || [];

    renderChallengeLists();
    fillResultChallenges();
    updateStats();
  } catch (err) {
    console.error(err);

    if ($('challenge-list')) {
      $('challenge-list').innerHTML =
        '<div class="empty">Could not load challenges.</div>';
    }
  }
}

async function loadResults() {
  try {
    const {
      data,
      error
    } = await db
      .from('challenge_results')
      .select(
        'id,challenge_id,winner_guild,loser_guild,score,image_urls,status,created_at'
      )
      .eq('status', 'approved')
      .order('created_at', {
        ascending: false
      })
      .limit(100);

    if (error) throw error;

    state.results = data || [];

    renderResults();
    updateStats();
  } catch (err) {
    console.error(err);

    if ($('result-list')) {
      $('result-list').innerHTML =
        '<div class="empty">Could not load results.</div>';
    }
  }
}

function renderResults() {
  const html = state.results.length
    ? state.results
        .map(
          (r) => `
            <div class="card">

              <div class="row">

                <div>

                  <div class="challenge-name">
                    ${escapeHtml(r.winner_guild)}
                    <span class="muted">def.</span>
                    ${escapeHtml(r.loser_guild)}
                  </div>

                  <div class="challenge-meta">
                    ${escapeHtml(r.score)}
                  </div>

                </div>

                <span class="badge badge-approved">
                  APPROVED
                </span>

              </div>

              ${
                Array.isArray(r.image_urls) &&
                r.image_urls.length
                  ? `
                    <div class="image-grid">

                      ${r.image_urls
                        .slice(0, 2)
                        .map(
                          (u) => `
                            <a
                              href="${escapeHtml(u)}"
                              target="_blank"
                              rel="noopener"
                            >
                              <img
                                src="${escapeHtml(u)}"
                                alt="Result proof"
                              >
                            </a>
                          `
                        )
                        .join('')}

                    </div>
                  `
                  : ''
              }

            </div>
          `
        )
        .join('')
    : '<div class="empty">No approved results yet.</div>';

  $('result-list').innerHTML = html;
}

function fillResultChallenges() {
  const sel = $('result-challenge');

  if (!sel) return;

  const current = sel.value;

  const open = state.challenges.filter(
    (c) => c.status === 'open'
  );

  sel.innerHTML =
    '<option value="">Select an open challenge</option>' +
    open
      .map(
        (c) =>
          `<option value="${c.id}">
            ${escapeHtml(c.guild_name)}
            — ${escapeHtml(formatTime(c.challenge_time))}
          </option>`
      )
      .join('');

  if (open.some((c) => c.id === current)) {
    sel.value = current;
  }
}

async function updateStats() {
  try {
    const {
      data,
      error
    } = await db.rpc('get_gvg_stats');

    if (error) throw error;

    const s = data?.[0] || {};

    $('stat-open').textContent = String(
      s.open_challenges ??
      state.challenges.length ??
      0
    );

    $('stat-results').textContent = String(
      s.today_result_submissions ?? 0
    );

    $('stat-approved-results').textContent =
      String(
        s.today_approved_results ?? 0
      );

    $('stat-guilds').textContent = String(
      s.approved_guilds ?? 0
    );
  } catch (err) {
    console.warn(
      'Stats failed',
      err
    );
  }
}

async function handleChallengeSubmit(e) {
  e.preventDefault();

  clearStatus('challenge-status');

  if (!postingWindowOpen()) {
    showStatus(
      'challenge-status',
      'error',
      'Challenges can only be posted from 10:00 AM until before 11:00 PM Pakistan time.'
    );

    return;
  }

  if (!guildIsApproved()) {
    showStatus(
      'challenge-status',
      'error',
      'Only an admin-approved, non-banned guild account can post challenges.'
    );

    navigate('auth', true);

    return;
  }

  const weapons = selectedValues(
    '#weapon-options input'
  );

  const skills = selectedValues(
    '#skill-options input'
  );

  if (!weapons.length) {
    showStatus(
      'challenge-status',
      'error',
      'Select at least one weapon.'
    );

    return;
  }

  setButtonBusy(
    'challenge-submit',
    true
  );

  try {
    const {
      data,
      error
    } = await db.rpc(
      'submit_gvg_challenge',
      {
        p_challenge_time:
          getTime24(),

        p_weapons:
          weapons,

        p_active_skills:
          skills
      }
    );

    if (error) throw error;

    const ch = Array.isArray(data)
      ? data[0]
      : data;

    showStatus(
      'challenge-status',
      'ok',
      'Challenge submitted successfully.'
    );

    e.target.reset();

    initTimePicker();

    await loadChallenges();

    await notifyWhatsApp(ch);

  } catch (err) {
    console.error(err);

    showStatus(
      'challenge-status',
      'error',
      humanizeDbError(err)
    );

  } finally {
    setButtonBusy(
      'challenge-submit',
      false,
      'Confirm Challenge'
    );
  }
}

function humanizeDbError(err) {
  const msg = String(
    err?.message ||
    err ||
    'Request failed.'
  );

  if (
    msg.includes('LOGIN_REQUIRED')
  ) {
    return 'Please login to continue.';
  }

  if (
    msg.includes('REGISTRATION')
  ) {
    return 'Register your guild first.';
  }

  if (
    msg.includes('ALREADY_REGISTERED')
  ) {
    return 'This account already has a registered guild.';
  }

  if (
    msg.includes('DUPLICATE_REGISTRATION')
  ) {
    return 'This guild name or contact number is already registered.';
  }

  if (
    msg.includes('RESULT_ACTOR')
  ) {
    return 'Your logged-in guild must be one of the two guilds in the result.';
  }

  if (
    msg.includes('APPROVAL')
  ) {
    return 'This guild is not approved yet. Ask an admin to approve/register it.';
  }

  if (
    msg.includes('BAN_ACTIVE')
  ) {
    return 'This guild is currently banned.';
  }

  if (
    msg.includes('BLOCKED')
  ) {
    return 'This guild or contact number is currently blocked.';
  }

  if (
    msg.includes('DAILY_CHALLENGE_LIMIT')
  ) {
    return 'This guild has reached its 10-challenge daily limit.';
  }

  if (
    msg.includes('COOLDOWN')
  ) {
    return 'Please wait 15 minutes before posting another challenge for this guild.';
  }

  if (
    msg.includes('TIME_WINDOW')
  ) {
    return 'Challenge posting is open only from 10:00 AM to before 11:00 PM Pakistan time.';
  }

  if (
    msg.includes('DAILY_RESULT_LIMIT')
  ) {
    return 'This guild has reached the 5-result daily limit.';
  }

  if (
    msg.includes('IMAGE_LIMIT')
  ) {
    return 'Maximum 2 pictures are allowed per result.';
  }

  if (
    msg.includes('RESULT_MATCH')
  ) {
    return 'The selected challenge must belong to one of the two guilds in the result.';
  }

  if (
    msg.includes('RESULT_GUILD')
  ) {
    return 'Both result guilds must be approved and not banned.';
  }

  if (
    msg.includes('RESULT_EXISTS')
  ) {
    return 'This challenge already has a result submission.';
  }

  return (
    msg
      .replace(/^.*?P0001.*?:/, '')
      .trim() ||
    msg
  );
}

async function uploadResultImages(files) {
  const selected = [...files].filter(Boolean);

  if (selected.length > 2) {
    throw new Error(
      'IMAGE_LIMIT: Maximum 2 pictures are allowed.'
    );
  }

  const urls = [];

  for (const file of selected) {

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        'Each image must be 5 MB or smaller.'
      );
    }

    const ext = (
      file.name.split('.').pop() ||
      'jpg'
    ).toLowerCase();

    const uid = state.user?.id;

    if (!uid) {
      throw new Error(
        'LOGIN_REQUIRED: Please login to upload result pictures.'
      );
    }

    const path =
      `results/${uid}/${crypto.randomUUID()}.${ext}`;

    const {
      error
    } = await db.storage
      .from(BUCKET)
      .upload(
        path,
        file,
        {
          upsert: false,
          contentType: file.type
        }
      );

    if (error) throw error;

    const {
      data
    } = db.storage
      .from(BUCKET)
      .getPublicUrl(path);

    urls.push(data.publicUrl);
  }

  return urls;
}

async function handleResultSubmit(e) {
  e.preventDefault();

  clearStatus('result-status');

  if (!guildIsApproved()) {
    showStatus(
      'result-status',
      'error',
      'Only an admin-approved, non-banned guild account can submit results.'
    );

    navigate('auth', true);

    return;
  }

  setButtonBusy(
    'result-submit',
    true
  );

  try {

    const files = [
      $('result-image-1').files[0],
      $('result-image-2').files[0]
    ].filter(Boolean);

    if (files.length > 2) {
      throw new Error(
        'IMAGE_LIMIT: Maximum 2 pictures are allowed.'
      );
    }

    const challengeId =
      $('result-challenge').value;

    if (!challengeId) {
      throw new Error(
        'Select an open challenge.'
      );
    }

    const winner =
      $('winner-guild').value.trim();

    const loser =
      $('loser-guild').value.trim();

    const score =
      $('score').value.trim();

    if (!winner || !loser || !score) {
      throw new Error(
        'Winner guild, loser guild and score are required.'
      );
    }

    const imageUrls =
      await uploadResultImages(files);

    const {
      error
    } = await db.rpc(
      'submit_gvg_result',
      {
        p_challenge_id:
          challengeId,

        p_winner_guild:
          winner,

        p_loser_guild:
          loser,

        p_score:
          score,

        p_image_urls:
          imageUrls
      }
    );

    if (error) throw error;

    showStatus(
      'result-status',
      'ok',
      'Result submitted. It will be published after admin approval.'
    );

    e.target.reset();

    await loadChallenges();
    await loadResults();

  } catch (err) {
    console.error(err);

    showStatus(
      'result-status',
      'error',
      humanizeDbError(err)
    );

  } finally {
    setButtonBusy(
      'result-submit',
      false,
      'Submit Result for Approval'
    );
  }
}

function guildIsApproved() {
  const g = state.guild;

  if (!state.user || !g) {
    return false;
  }

  const banActive =
    !!(
      g.is_banned ||
      (
        g.ban_until &&
        new Date(g.ban_until) > new Date()
      )
    );

  return (
    g.approval_status === 'approved' &&
    !banActive
  );
}

function guildStatusText(g) {
  if (!g) {
    return 'No guild is registered with this account.';
  }

    const banned =
    !!(
      g.is_banned ||
      (
        g.ban_until &&
        new Date(g.ban_until) > new Date()
      )
    );

  if (banned) {
    return g.ban_until
      ? `BANNED until ${formatDateTime(g.ban_until)}.`
      : 'BANNED permanently.';
  }

  if (
    g.approval_status === 'approved'
  ) {
    return 'Your guild is approved. Challenge and Results are unlocked.';
  }

  if (
    g.approval_status === 'rejected'
  ) {
    return 'Your guild registration was rejected by an admin.';
  }

  return 'Your guild registration is pending admin approval.';
}

function updateChallengeIdentity() {
  const name = $('guild-name');
  const contact = $('contact');

  if (name) {
    name.value =
      state.guild?.guild_name || '';
  }

  if (contact) {
    contact.value =
      state.guild?.contact || '';
  }
}

function applyAuthUI() {
  const approved =
    guildIsApproved();

  document
    .querySelectorAll('.auth-required')
    .forEach((el) =>
      el.classList.toggle(
        'hidden',
        !approved
      )
    );

  $('nav-auth')?.classList.toggle(
    'hidden',
    !!state.user
  );

  $('nav-logout')?.classList.toggle(
    'hidden',
    !state.user
  );

  $('guild-account-card')?.classList.toggle(
    'hidden',
    !state.user
  );

  if ($('guild-account-info')) {
    $('guild-account-info').textContent =
      state.user?.email || '';
  }

  if ($('guild-account-badge')) {
    $('guild-account-badge').textContent =
      state.guild
        ? String(
            state.guild.approval_status ||
            ''
          ).toUpperCase()
        : 'NOT REGISTERED';

    $('guild-account-badge').className =
      `badge ${
        approved
          ? 'badge-approved'
          : state.guild?.approval_status ===
            'rejected'
          ? 'badge-rejected'
          : 'badge-pending'
      }`;
  }

  if ($('guild-account-message')) {
    $('guild-account-message').innerHTML =
      escapeHtml(
        guildStatusText(
          state.guild
        )
      );
  }

  updateChallengeIdentity();

  const active =
    document
      .querySelector('.page.active')
      ?.id
      ?.replace('page-', '');

  if (
    ['challenge', 'results'].includes(
      active
    ) &&
    !approved
  ) {
    navigate('auth', true);
  }
}

async function loadMyGuild() {
  state.guild = null;

  if (!state.user) {
    applyAuthUI();
    return null;
  }

  const {
    data,
    error
  } = await db
    .from('guild_registry')
    .select(
      'id,user_id,guild_name,contact,approval_status,is_banned,ban_until,ban_reason,created_at,updated_at'
    )
    .eq(
      'user_id',
      state.user.id
    )
    .maybeSingle();

  if (error) throw error;

  state.guild = data || null;

  return state.guild;
}

async function refreshGuildAuth() {
  try {

    const {
      data: { user }
    } = await db.auth.getUser();

    state.user =
      user || null;

    await loadMyGuild();

    applyAuthUI();

  } catch (err) {
    console.error(
      'Auth refresh failed',
      err
    );

    state.user = null;
    state.guild = null;

    applyAuthUI();
  }
}

async function handleGuildLogin(e) {
  e.preventDefault();

  clearStatus(
    'guild-auth-status'
  );

  const email =
    $('guild-login-email')
      .value
      .trim();

  const password =
    $('guild-login-password')
      .value;

  try {

    const {
      error
    } = await db.auth.signInWithPassword(
      {
        email,
        password
      }
    );

    if (error) throw error;

    await refreshGuildAuth();

    if (!state.guild) {
      showStatus(
        'guild-auth-status',
        'error',
        'This account has no active guild registry. Register your guild again below.'
      );

      return;
    }

    if (!guildIsApproved()) {
      showStatus(
        'guild-auth-status',
        'info',
        guildStatusText(
          state.guild
        )
      );

      navigate(
        'auth',
        true
      );

      return;
    }

    showStatus(
      'guild-auth-status',
      'ok',
      'Login successful. Challenge and Results are now available.'
    );

    navigate(
      'challenge',
      true
    );

  } catch (err) {

    showStatus(
      'guild-auth-status',
      'error',
      err.message ||
      'Login failed.'
    );
  }
}

async function handleGuildRegister(e) {
  e.preventDefault();

  clearStatus(
    'guild-auth-status'
  );

  const guild =
    $('guild-register-name')
      .value
      .trim();

  const contact =
    $('guild-register-contact')
      .value
      .trim();

  const email =
    $('guild-register-email')
      .value
      .trim();

  const password =
    $('guild-register-password')
      .value;

  if (
    !guild ||
    !contact ||
    !email ||
    !password
  ) {
    showStatus(
      'guild-auth-status',
      'error',
      'Guild name, contact, email and password are required.'
    );

    return;
  }

  if (password.length < 8) {
    showStatus(
      'guild-auth-status',
      'error',
      'Password must be at least 8 characters.'
    );

    return;
  }

  try {

    let signupError = null;

    const {
      data,
      error
    } = await db.auth.signUp(
      {
        email,
        password,

        options: {
          data: {
            account_type: 'guild',
            guild_name: guild,
            contact: contact
          }
        }
      }
    );

    signupError = error;

    if (
      signupError &&
      /already registered|already exists|user already/i.test(
        String(
          signupError.message || ''
        )
      )
    ) {

      const login =
        await db.auth.signInWithPassword(
          {
            email,
            password
          }
        );

      if (login.error) {
        throw signupError;
      }

      const {
        error: regError
      } = await db.rpc(
        'register_gvg_guild',
        {
          p_guild_name:
            guild,

          p_contact:
            contact
        }
      );

      if (regError) {
        throw regError;
      }

      await refreshGuildAuth();

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered again and is pending admin approval.'
      );

      return;
    }

    if (signupError) {
      throw signupError;
    }

    await refreshGuildAuth();

    if (data.session) {

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered. Your account is pending admin approval.'
      );

    } else {

      showStatus(
        'guild-auth-status',
        'info',
        'Registration created. Check your email to confirm the account, then login. Admin approval is still required before Challenge and Results unlock.'
      );
    }

  } catch (err) {

    showStatus(
      'guild-auth-status',
      'error',
      humanizeDbError(err)
    );
  }
}

async function handleGuildLogout() {
  await db.auth.signOut();

  state.user = null;
  state.guild = null;

  applyAuthUI();

  navigate(
    'home',
    true
  );

  showStatus(
    'guild-auth-status',
    'info',
    'Logged out.'
  );
}

async function isCurrentUserAdmin() {
  const {
    data: { user }
  } = await db.auth.getUser();

  if (!user) {
    state.admin = null;
    return false;
  }

  const {
    data,
    error
  } = await db
    .from('admins')
    .select(
      'user_id,email'
    )
    .eq(
      'user_id',
      user.id
    )
    .maybeSingle();

  if (error) {
    console.warn(error);
    return false;
  }

  state.admin = data || null;

  return !!data;
}

async function restoreAdmin() {
  const ok =
    await isCurrentUserAdmin();

  $('admin-login-panel')
    .classList
    .toggle(
      'hidden',
      ok
    );

  $('admin-dashboard')
    .classList
    .toggle(
      'hidden',
      !ok
    );

  if (ok) {

    const {
      data: { user }
    } = await db.auth.getUser();

    $('admin-user-label').textContent =
      user?.email || '';

    await refreshAdmin();
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();

  clearStatus(
    'admin-login-status'
  );

  const email =
    $('admin-email')
      .value
      .trim();

  const password =
    $('admin-password')
      .value;

  try {

    const {
      error
    } = await db.auth.signInWithPassword(
      {
        email,
        password
      }
    );

    if (error) throw error;

    await restoreAdmin();

    showStatus(
      'admin-login-status',
      'ok',
      'Logged in.'
    );

  } catch (err) {

    showStatus(
      'admin-login-status',
      'error',
      err.message ||
      'Login failed.'
    );
  }
}

async function handleAdminLogout() {
  await db.auth.signOut();

  state.admin = null;

  $('admin-login-panel')
    .classList
    .remove('hidden');

  $('admin-dashboard')
    .classList
    .add('hidden');
}

async function handleGuildSave(e) {
  e.preventDefault();

  clearStatus('admin-status');

  try {

    const guild =
      $('reg-guild-name')
        .value
        .trim();

    const contact =
      $('reg-contact')
        .value
        .trim();

    const status =
      $('reg-status')
        .value;

    const banUntil =
      $('reg-ban-until')
        .value
        ? new Date(
            $('reg-ban-until').value
          ).toISOString()
        : null;

    const reason =
      $('reg-ban-reason')
        .value
        .trim() ||
      null;

    if (!guild || !contact) {
      throw new Error(
        'Guild name and contact are required.'
      );
    }

    const {
      error
    } = await db.rpc(
      'admin_upsert_guild',
      {
        p_guild_name:
          guild,

        p_contact:
          contact,

        p_approval_status:
          status,

        p_ban_until:
          banUntil,

        p_ban_reason:
          reason
      }
    );

    if (error) throw error;

    e.target.reset();

    $('reg-status').value =
      'approved';

    $('reg-ban-reason').value =
      'Rule violation';

    showStatus(
      'admin-status',
      'ok',
      'Guild saved.'
    );

    await loadGuilds();

  } catch (err) {

    console.error(err);

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(err)
    );
  }
}

async function loadGuilds() {
  try {

    const {
      data,
      error
    } = await db
      .from('guild_registry')
      .select(
        'id,guild_name,contact,approval_status,ban_until,ban_reason,created_at'
      )
      .order(
        'guild_name',
        {
          ascending: true
        }
      );

    if (error) throw error;

    state.guilds =
      data || [];

    $('guild-table').innerHTML =
      state.guilds.length
        ? state.guilds
            .map(
              (g) => `
                <tr>

                  <td>
                    ${escapeHtml(
                      g.guild_name
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      g.approval_status
                    )}
                  </td>

                  <td>
                    ${
                      g.ban_until &&
                      new Date(
                        g.ban_until
                      ) > new Date()
                        ? escapeHtml(
                            formatDateTime(
                              g.ban_until
                            )
                          )
                        : '—'
                    }
                  </td>

                  <td>

                    <button
                      class="btn btn-small btn-success"
                      onclick="quickGuildBan('${g.id}')"
                    >
                      Ban
                    </button>

                    <button
                      class="btn btn-small btn-danger"
                      onclick="removeGuild('${g.id}')"
                    >
                      Remove
                    </button>

                  </td>

                </tr>
              `
            )
            .join('')
        : '<tr><td colspan="4">No guilds.</td></tr>';

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Guild load failed.'
    );
  }
}

async function quickGuildBan(id) {
  const until =
    prompt(
      'Enter ban end as YYYY-MM-DD HH:MM (Pakistan time), or leave blank for permanent:',
      ''
    );

  if (until === null) {
    return;
  }

  try {

    let iso = null;

    if (until.trim()) {

      const parsed =
        new Date(
          until
            .trim()
            .replace(
              ' ',
              'T'
            ) +
          '+05:00'
        );

      if (
        Number.isNaN(
          parsed.getTime()
        )
      ) {
        throw new Error(
          'Invalid ban date/time.'
        );
      }

      iso =
        parsed.toISOString();
    }

    const {
      error
    } = await db.rpc(
      'admin_set_guild_ban',
      {
        p_guild_id:
          id,

        p_ban_until:
          iso,

        p_reason:
          'Admin ban'
      }
    );

    if (error) throw error;

    showStatus(
      'admin-status',
      'ok',
      'Ban updated.'
    );

    await loadGuilds();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Ban failed.'
    );
  }
}

async function removeGuild(id) {
  if (
    !confirm(
      'Remove this guild from the registry? It can be registered again later.'
    )
  ) {
    return;
  }

  try {

    const {
      error
    } = await db.rpc(
      'admin_remove_guild',
      {
        p_guild_id:
          id
      }
    );

    if (error) throw error;

    showStatus(
      'admin-status',
      'ok',
      'Guild removed from registry.'
    );

    await loadGuilds();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Remove failed.'
    );
  }
}

async function handleBlock(e) {
  e.preventDefault();

  clearStatus(
    'admin-status'
  );

  try {

    const guild =
      $('block-guild')
        .value
        .trim() ||
      null;

    const contact =
      $('block-number')
        .value
        .trim() ||
      null;

    const until =
      $('block-until')
        .value
        ? new Date(
            $('block-until').value
          ).toISOString()
        : null;

    const reason =
      $('block-reason')
        .value
        .trim() ||
      'Rule violation';

    if (!guild && !contact) {
      throw new Error(
        'Enter a guild name or a contact number.'
      );
    }

    const {
      error
    } = await db.rpc(
      'admin_create_block',
      {
        p_guild_name:
          guild,

        p_contact:
          contact,

        p_blocked_until:
          until,

        p_reason:
          reason
      }
    );

    if (error) throw error;

    e.target.reset();

    $('block-reason').value =
      'Rule violation';

    showStatus(
      'admin-status',
      'ok',
      'Block created.'
    );

    await loadBlocks();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Block failed.'
    );
  }
}

async function loadBlocks() {
  try {

    const {
      data,
      error
    } = await db
      .from('blocks')
      .select(
        'id,guild_name,contact,blocked_until,reason,created_at'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );

    if (error) throw error;

    state.blocks =
      data || [];

    $('block-table').innerHTML =
      state.blocks.length
        ? state.blocks
            .map(
              (b) => `
                <tr>

                  <td>
                    ${escapeHtml(
                      b.guild_name ||
                      '—'
                    )}
                    <br>
                    ${escapeHtml(
                      b.contact || ''
                    )}
                  </td>

                  <td>
                    ${
                      b.blocked_until
                        ? escapeHtml(
                            formatDateTime(
                              b.blocked_until
                            )
                          )
                        : 'Permanent'
                    }
                  </td>

                  <td>
                    ${escapeHtml(
                      b.reason ||
                      '—'
                    )}
                  </td>

                  <td>
                    <button
                      class="btn btn-small btn-success"
                      onclick="unblock('${b.id}')"
                    >
                      Unblock
                    </button>
                  </td>

                </tr>
              `
            )
            .join('')
        : '<tr><td colspan="4">No blocks.</td></tr>';

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Block load failed.'
    );
  }
}

async function unblock(id) {
  try {

    const {
      error
    } = await db.rpc(
      'admin_delete_block',
      {
        p_block_id:
          id
      }
    );

    if (error) throw error;

    showStatus(
      'admin-status',
      'ok',
      'Block removed.'
    );

    await loadBlocks();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Unblock failed.'
    );
  }
}

async function loadAdminResults() {
  try {

    const {
      data,
      error
    } = await db.rpc(
      'admin_get_results'
    );

    if (error) throw error;

    state.adminResults =
      data || [];

    $('admin-result-table').innerHTML =
      state.adminResults.length
        ? state.adminResults
            .map(
              (r) => `
                <tr>

                  <td>
                    <strong>
                      ${escapeHtml(
                        r.winner_guild
                      )}
                    </strong>

                    def.

                    <strong>
                      ${escapeHtml(
                        r.loser_guild
                      )}
                    </strong>
                  </td>

                  <td>
                    ${escapeHtml(
                      r.score
                    )}
                  </td>

                  <td>
                    ${
                      Array.isArray(
                        r.image_urls
                      )
                        ? r.image_urls.length
                        : 0
                    }
                  </td>

                  <td>
                    ${escapeHtml(
                      r.status
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      formatDateTime(
                        r.created_at
                      )
                    )}
                  </td>

                  <td>

                    ${
                      r.status ===
                      'pending'
                        ? `
                          <button
                            class="btn btn-small btn-success"
                            onclick="approveResult('${r.id}')"
                          >
                            Approve
                          </button>

                          <button
                            class="btn btn-small btn-danger"
                            onclick="rejectResult('${r.id}')"
                          >
                            Reject
                          </button>
                        `
                        : '—'
                    }

                  </td>

                </tr>
              `
            )
            .join('')
        : '<tr><td colspan="6">No result submissions.</td></tr>';

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Result review load failed.'
    );
  }
}

async function approveResult(id) {
  try {

    const {
      error
    } = await db.rpc(
      'admin_approve_result',
      {
        p_result_id:
          id
      }
    );

    if (error) throw error;

    showStatus(
      'admin-status',
      'ok',
      'Result approved.'
    );

    await loadAdminResults();
    await loadResults();
    await loadChallenges();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Approve failed.'
    );
  }
}

async function rejectResult(id) {
  const reason =
    prompt(
      'Reason for rejection:',
      'Proof or result issue'
    );

  if (reason === null) {
    return;
  }

  try {

    const {
      error
    } = await db.rpc(
      'admin_reject_result',
      {
        p_result_id:
          id,

        p_reason:
          reason
      }
    );

    if (error) throw error;

    showStatus(
      'admin-status',
      'ok',
      'Result rejected. The challenge is open again.'
    );

    await loadAdminResults();
    await loadChallenges();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Reject failed.'
    );
  }
}

async function loadAdminChallenges() {
  try {

    const {
      data,
      error
    } = await db
      .from('challenges')
      .select(
        'id,guild_name,challenge_time,weapons,active_skills,status,created_at'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(200);

    if (error) throw error;

    $('admin-challenge-table').innerHTML =
      data?.length
        ? data
            .map(
              (c) => `
                <tr>

                  <td>
                    ${escapeHtml(
                      c.guild_name
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      formatTime(
                        c.challenge_time
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      (c.weapons || [])
                        .join(', ')
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      (c.active_skills || [])
                        .join(', ') ||
                      'None'
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      c.status
                    )}
                  </td>

                  <td>

                    <button
                      class="btn btn-small btn-danger"
                      onclick="cancelChallenge('${c.id}')"
                    >
                      Cancel
                    </button>

                  </td>

                </tr>
              `
            )
            .join('')
        : '<tr><td colspan="6">No challenges.</td></tr>';

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Challenge load failed.'
    );
  }
}

async function cancelChallenge(id) {
  if (
    !confirm(
      'Cancel this challenge?'
    )
  ) {
    return;
  }

  try {

    const {
      error
    } = await db.rpc(
      'admin_cancel_challenge',
      {
        p_challenge_id:
          id
      }
    );

    if (error) throw error;

    showStatus(
      'admin-status',
      'ok',
      'Challenge cancelled.'
    );

    await loadAdminChallenges();
    await loadChallenges();

  } catch (err) {

    showStatus(
      'admin-status',
      'error',
      err.message ||
      'Cancel failed.'
    );
  }
}

async function refreshAdmin() {
  await Promise.all([
    loadGuilds(),
    loadBlocks(),
    loadAdminResults(),
    loadAdminChallenges()
  ]);
}

function navigate(page, force = false) {
  const protectedPage =
    ['challenge', 'results']
      .includes(page);

  if (
    protectedPage &&
    !guildIsApproved() &&
    !force
  ) {
    page = 'auth';
  }

  document
    .querySelectorAll('.page')
    .forEach((p) =>
      p.classList.remove(
        'active'
      )
    );

  const target =
    $(`page-${page}`);

  if (target) {
    target.classList.add(
      'active'
    );
  }

  document
    .querySelectorAll(
      '[data-page-link]'
    )
    .forEach((b) =>
      b.classList.toggle(
        'active',
        b.dataset.pageLink ===
          page
      )
    );

  if (
    page === 'home' &&
    guildIsApproved()
  ) {
    loadChallenges();
  }

  if (
    page === 'challenge' &&
    guildIsApproved()
  ) {
    updateChallengeIdentity();
    loadChallenges();
  }

  if (
    page === 'results' &&
    guildIsApproved()
  ) {
    loadChallenges();
    loadResults();
  }

  if (page === 'admin') {
    restoreAdmin();
  }

  if (page === 'auth') {
    refreshGuildAuth();
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function wire() {

  document
    .querySelectorAll(
      '[data-page-link]'
    )
    .forEach((el) =>
      el.addEventListener(
        'click',
        (e) => {
          e.preventDefault();

          navigate(
            el.dataset.pageLink
          );
        }
      )
    );

  $('nav-logout')
    ?.addEventListener(
      'click',
      handleGuildLogout
    );

  $('challenge-form')
    .addEventListener(
      'submit',
      handleChallengeSubmit
    );

  $('result-form')
    .addEventListener(
      'submit',
      handleResultSubmit
    );

  $('guild-login-form')
    .addEventListener(
      'submit',
      handleGuildLogin
    );

  $('guild-register-form')
    .addEventListener(
      'submit',
      handleGuildRegister
    );

  $('admin-login-form')
    .addEventListener(
      'submit',
      handleAdminLogin
    );

  $('admin-logout')
    .addEventListener(
      'click',
      handleAdminLogout
    );

  $('guild-form')
    .addEventListener(
      'submit',
      handleGuildSave
    );

  $('block-form')
    .addEventListener(
      'submit',
      handleBlock
    );

  $('challenge-search')
    ?.addEventListener(
      'input',
      renderChallengeLists
    );

  $('challenge-search-2')
    ?.addEventListener(
      'input',
      renderChallengeLists
    );
}

window.openWhatsApp =
  openWhatsApp;

window.copyText =
  copyText;

window.loadChallenges =
  loadChallenges;

window.loadResults =
  loadResults;

window.loadAdminResults =
  loadAdminResults;

window.loadAdminChallenges =
  loadAdminChallenges;

window.quickGuildBan =
  quickGuildBan;

window.removeGuild =
  removeGuild;

window.unblock =
  unblock;

window.approveResult =
  approveResult;

window.rejectResult =
  rejectResult;

window.cancelChallenge =
  cancelChallenge;

window.navigate =
  navigate;

(async function boot() {
  try {

    initTimePicker();

    wire();

    db.auth.onAuthStateChange(
      (_event, _session) => {
        setTimeout(
          () =>
            refreshGuildAuth(),
          0
        );
      }
    );

    await refreshGuildAuth();

    if (guildIsApproved()) {
      await loadChallenges();
    }

    await updateStats();

    await restoreAdmin();

  } catch (err) {

    console.error(
      'Boot failed',
      err
    );

    showStatus(
      'guild-auth-status',
      'error',
      err.message ||
      'Website startup failed.'
    );
  }
})();
