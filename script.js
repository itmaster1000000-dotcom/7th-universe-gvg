/*
============================================================
7TH UNIVERSE GVG
SCRIPT.JS
============================================================

IMPORTANT:
1. Put your Supabase URL below.
2. Put your Supabase PUBLISHABLE/ANON key below.
3. NEVER put service_role / secret key in this file.

Database schema used by this script:

admins
- id
- admin_name
- is_active
- created_at

guild_registry
- id
- user_id
- guild_name
- guild_name_normalized
- contact
- contact_normalized
- approval_status
- is_banned
- ban_until
- ban_reason
- created_at
- updated_at

challenges
- id
- challenge_code
- challenger_leader_id
- challenger_guild_id
- opponent_guild_id
- challenge_everyone
- match_time
- weapons
- active_skills
- contact_number
- status
- created_at
- accepted_by_leader_id
- accepted_by_guild_id
- accepted_at
- user_id
- guild_name_normalized
- contact_normalized
- completed_at

challenge_results
- id
- challenge_id
- winner_guild
- loser_guild
- score
- image_urls
- status
- rejection_reason
- reviewed_at
- reviewed_by
- created_at

============================================================
*/

const SUPABASE_URL = 'https://ypnpeiglbiycbexpeibb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_5ei0IhM1tQ15u5pAIIavhQ_alE9O3bl';

const WHATSAPP_NOTIFY_ENDPOINT = '';

const { createClient } = window.supabase;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

/* ============================================================
   CONSTANTS
============================================================ */

const TIME_ZONE = 'Asia/Karachi';

const IMAGE_BUCKET = 'result-images';

const MAX_IMAGE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_WEAPONS = [
  'Desert',
  'M1887',
  'M1887X',
  'M1014',
  'Woodpecker'
];

const ALLOWED_SKILLS = [
  'DJ Alok',
  'Tatsuya',
  'Koda'
];

/* ============================================================
   APP STATE
============================================================ */

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

/* ============================================================
   HELPERS
============================================================ */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeGuild(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeContact(value) {
  let n = String(value || '')
    .replace(/\D/g, '');

  if (n.startsWith('00')) {
    n = n.substring(2);
  }

  if (n.startsWith('0')) {
    n = '92' + n.substring(1);
  }

  return n;
}

function formatTime(timeValue) {
  if (!timeValue) {
    return '--:--';
  }

  const parts =
    String(timeValue).split(':');

  let hour =
    Number(parts[0] || 0);

  const minute =
    String(parts[1] || '00')
      .padStart(2, '0');

  const ampm =
    hour >= 12 ? 'PM' : 'AM';

  hour =
    hour % 12 || 12;

  return `${hour}:${minute} ${ampm}`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'en-PK',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: TIME_ZONE
    }
  ).format(new Date(value));
}

function showStatus(
  id,
  type,
  message
) {
  const el = $(id);

  if (!el) {
    return;
  }

  el.className =
    `status show ${type}`;

  el.textContent =
    String(message || '');
}

function clearStatus(id) {
  const el = $(id);

  if (!el) {
    return;
  }

  el.className =
    'status';

  el.textContent =
    '';
}

function selectedValues(selector) {
  return [
    ...document.querySelectorAll(
      `${selector}:checked`
    )
  ].map(
    (input) =>
      input.value
  );
}

function postingWindowOpen() {
  const parts =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }
    )
      .formatToParts(new Date());

  const map =
    Object.fromEntries(
      parts.map(
        (p) => [
          p.type,
          p.value
        ]
      )
    );

  const hour =
    Number(map.hour || 0);

  const minute =
    Number(map.minute || 0);

  const total =
    hour * 60 + minute;

  return (
    total >= 600 &&
    total < 1380
  );
}

function setBusy(
  buttonId,
  busy,
  originalText
) {
  const button =
    $(buttonId);

  if (!button) {
    return;
  }

  button.disabled =
    busy;

  if (busy) {
    button.dataset.oldText =
      button.textContent;

    button.innerHTML =
      '<span class="loader"></span>';
  } else {
    button.textContent =
      originalText ||
      button.dataset.oldText ||
      'Submit';
  }
}

function humanizeError(error) {
  const message =
    String(
      error?.message ||
      error ||
      'Something went wrong.'
    );

  if (
    message.includes(
      'LOGIN_REQUIRED'
    )
  ) {
    return 'Please login first.';
  }

  if (
    message.includes(
      'REGISTRATION'
    )
  ) {
    return 'Please register your guild first.';
  }

  if (
    message.includes(
      'ALREADY_REGISTERED'
    )
  ) {
    return 'This account already has a registered guild.';
  }

  if (
    message.includes(
      'DUPLICATE_REGISTRATION'
    )
  ) {
    return 'Guild name or contact number is already registered.';
  }

  if (
    message.includes(
      'APPROVAL'
    )
  ) {
    return 'Your guild is not approved yet.';
  }

  if (
    message.includes(
      'BAN_ACTIVE'
    )
  ) {
    return 'Your guild is currently banned.';
  }

  if (
    message.includes(
      'BLOCKED'
    )
  ) {
    return 'Your guild or contact number is blocked.';
  }

  if (
    message.includes(
      'DAILY_CHALLENGE_LIMIT'
    )
  ) {
    return 'You have reached the 10 challenges daily limit.';
  }

  if (
    message.includes(
      'COOLDOWN'
    )
  ) {
    return 'Please wait 15 minutes before posting another challenge.';
  }

  if (
    message.includes(
      'TIME_WINDOW'
    )
  ) {
    return 'Challenge posting is available only from 10:00 AM to before 11:00 PM Pakistan time.';
  }

  if (
    message.includes(
      'INVALID_WEAPON'
    )
  ) {
    return 'One or more selected weapons are invalid.';
  }

  if (
    message.includes(
      'INVALID_SKILL'
    )
  ) {
    return 'One or more selected skills are invalid.';
  }

  if (
    message.includes(
      'DAILY_RESULT_LIMIT'
    )
  ) {
    return 'One of the guilds has reached the 5 results daily limit.';
  }

  if (
    message.includes(
      'IMAGE_LIMIT'
    )
  ) {
    return 'Maximum 2 pictures are allowed.';
  }

  if (
    message.includes(
      'RESULT_ACTOR'
    )
  ) {
    return 'Your logged-in guild must be part of this result.';
  }

  if (
    message.includes(
      'RESULT_MATCH'
    )
  ) {
    return 'The result guilds do not match the selected challenge.';
  }

  if (
    message.includes(
      'RESULT_GUILD'
    )
  ) {
    return 'Both result guilds must be approved and active.';
  }

  if (
    message.includes(
      'CHALLENGE_CLOSED'
    )
  ) {
    return 'This challenge is no longer open.';
  }

  if (
    message.includes(
      'ADMIN_ONLY'
    )
  ) {
    return 'Admin access required.';
  }

  return message;
}

/* ============================================================
   TIME PICKER
============================================================ */

function initTimePicker() {
  const hourSelect =
    $('time-hour');

  const minuteSelect =
    $('time-minute');

  if (!hourSelect ||
      !minuteSelect) {
    return;
  }

  hourSelect.innerHTML =
    Array.from(
      { length: 12 },
      (_, i) =>
        `<option value="${i + 1}">
          ${String(i + 1).padStart(2, '0')}
        </option>`
    ).join('');

  minuteSelect.innerHTML =
    Array.from(
      { length: 60 },
      (_, i) =>
        `<option value="${String(i).padStart(2, '0')}">
          ${String(i).padStart(2, '0')}
        </option>`
    ).join('');

  const parts =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }
    )
      .formatToParts(new Date());

  const map =
    Object.fromEntries(
      parts.map(
        (p) => [
          p.type,
          p.value
        ]
      )
    );

  let hour =
    Number(map.hour || 0);

  const minute =
    String(map.minute || '00');

  const ampm =
    hour >= 12
      ? 'PM'
      : 'AM';

  hour =
    hour % 12 || 12;

  hourSelect.value =
    String(hour);

  minuteSelect.value =
    minute;

  if ($('time-ampm')) {
    $('time-ampm').value =
      ampm;
  }
}

function getSelectedTime24() {
  let hour =
    Number(
      $('time-hour')?.value ||
      12
    );

  const minute =
    Number(
      $('time-minute')?.value ||
      0
    );

  const ampm =
    $('time-ampm')?.value ||
    'AM';

  if (
    ampm === 'PM' &&
    hour !== 12
  ) {
    hour += 12;
  }

  if (
    ampm === 'AM' &&
    hour === 12
  ) {
    hour = 0;
  }

  return (
    String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0') +
    ':00'
  );
}

/* ============================================================
   AUTH + GUILD
============================================================ */

function guildIsApproved() {
  if (
    !state.user ||
    !state.guild
  ) {
    return false;
  }

  const banned =
    state.guild.is_banned === true ||
    (
      state.guild.ban_until &&
      new Date(
        state.guild.ban_until
      ) > new Date()
    );

  return (
    state.guild.approval_status ===
      'approved' &&
    !banned
  );
}

function guildStatusText() {
  const g =
    state.guild;

  if (!g) {
    return 'No guild is registered with this account.';
  }

  const banned =
    g.is_banned === true ||
    (
      g.ban_until &&
      new Date(
        g.ban_until
      ) > new Date()
    );

  if (banned) {
    if (g.ban_until) {
      return (
        `BANNED until ${
          formatDateTime(
            g.ban_until
          )
        }.`
      );
    }

    return 'BANNED permanently.';
  }

  if (
    g.approval_status ===
    'approved'
  ) {
    return (
      'Your guild is approved. Challenge and Results are unlocked.'
    );
  }

  if (
    g.approval_status ===
    'rejected'
  ) {
    return (
      'Your guild registration was rejected by an admin.'
    );
  }

  return (
    'Your guild registration is pending admin approval.'
  );
}

async function loadMyGuild() {
  state.guild =
    null;

  if (!state.user) {
    applyGuildUI();
    return null;
  }

  const {
    data,
    error
  } = await db
    .from('guild_registry')
    .select(
      `
      id,
      user_id,
      guild_name,
      guild_name_normalized,
      contact,
      contact_normalized,
      approval_status,
      is_banned,
      ban_until,
      ban_reason,
      created_at,
      updated_at
      `
    )
    .eq(
      'user_id',
      state.user.id
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.guild =
    data || null;

  return state.guild;
}

async function refreshAuth() {
  const {
    data: {
      user
    }
  } = await db.auth.getUser();

  state.user =
    user || null;

  await loadMyGuild();

  applyGuildUI();
}

function applyGuildUI() {
  const approved =
    guildIsApproved();

  document
    .querySelectorAll(
      '.auth-required'
    )
    .forEach(
      (element) => {
        element.classList.toggle(
          'hidden',
          !approved
        );
      }
    );

  if ($('nav-auth')) {
    $('nav-auth')
      .classList
      .toggle(
        'hidden',
        !!state.user
      );
  }

  if ($('nav-logout')) {
    $('nav-logout')
      .classList
      .toggle(
        'hidden',
        !state.user
      );
  }

  if ($('guild-account-card')) {
    $('guild-account-card')
      .classList
      .toggle(
        'hidden',
        !state.user
      );
  }

  if ($('guild-account-info')) {
    $('guild-account-info')
      .textContent =
      state.user?.email ||
      '';
  }

  if ($('guild-account-badge')) {
    const status =
      state.guild?.approval_status ||
      'not_registered';

    $('guild-account-badge')
      .textContent =
      status.toUpperCase();

    $('guild-account-badge')
      .className =
      'badge ' +
      (
        approved
          ? 'badge-approved'
          : status === 'rejected'
            ? 'badge-rejected'
            : 'badge-pending'
      );
  }

  if ($('guild-account-message')) {
    $('guild-account-message')
      .textContent =
      guildStatusText();
  }

  if ($('guild-name')) {
    $('guild-name').value =
      state.guild?.guild_name ||
      '';
  }

  if ($('contact')) {
    $('contact').value =
      state.guild?.contact ||
      '';
  }

  const currentPage =
    document
      .querySelector(
        '.page.active'
      )
      ?.id
      ?.replace(
        'page-',
        ''
      );

  if (
    ['challenge', 'results']
      .includes(
        currentPage
      ) &&
    !approved
  ) {
    navigate(
      'auth',
      true
    );
  }
}

async function handleGuildLogin(
  event
) {
  event.preventDefault();

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
    } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    await refreshAuth();

    if (!state.guild) {
      showStatus(
        'guild-auth-status',
        'error',
        'Login successful, but this account has no registered guild.'
      );

      return;
    }

    if (!guildIsApproved()) {
      showStatus(
        'guild-auth-status',
        'info',
        guildStatusText()
      );

      return;
    }

    showStatus(
      'guild-auth-status',
      'ok',
      'Login successful. Your guild is approved.'
    );

    navigate(
      'challenge'
    );

  } catch (error) {
    showStatus(
      'guild-auth-status',
      'error',
      error.message ||
      'Login failed.'
    );
  }
}

async function handleGuildRegister(
  event
) {
  event.preventDefault();

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
      'All registration fields are required.'
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
    const {
      data,
      error
    } =
      await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            account_type:
              'guild',
            guild_name:
              guild,
            contact:
              contact
          }
        }
      });

    if (error) {
      throw error;
    }

    state.user =
      data.user ||
      null;

    if (data.session) {
      await refreshAuth();

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Status: Pending approval.'
      );
    } else {
      showStatus(
        'guild-auth-status',
        'info',
        'Registration successful. Confirm your email, then login. Admin approval is still required.'
      );
    }

  } catch (error) {
    showStatus(
      'guild-auth-status',
      'error',
      humanizeError(error)
    );
  }
}

async function guildLogout() {
  await db.auth.signOut();

  state.user =
    null;

  state.guild =
    null;

  state.admin =
    null;

  applyGuildUI();

  navigate(
    'home',
    true
  );
}

/* ============================================================
   ADMIN AUTH
============================================================ */

async function isCurrentUserAdmin() {
  const {
    data: {
      user
    }
  } = await db.auth.getUser();

  if (!user) {
    state.admin =
      null;

    return false;
  }

  const {
    data,
    error
  } = await db
    .from('admins')
    .select(
      'id,admin_name,is_active,created_at'
    )
    .eq(
      'id',
      user.id
    )
    .eq(
      'is_active',
      true
    )
    .maybeSingle();

  if (error) {
    console.error(
      'Admin check:',
      error
    );

    state.admin =
      null;

    return false;
  }

  state.admin =
    data || null;

  return !!data;
}

async function restoreAdmin() {
  const ok =
    await isCurrentUserAdmin();

  if ($('admin-login-panel')) {
    $('admin-login-panel')
      .classList
      .toggle(
        'hidden',
        ok
      );
  }

  if ($('admin-dashboard')) {
    $('admin-dashboard')
      .classList
      .toggle(
        'hidden',
        !ok
      );
  }

  if (ok) {
    if ($('admin-user-label')) {
      $('admin-user-label')
        .textContent =
        state.user?.email ||
        state.admin?.admin_name ||
        '';
    }

    await refreshAdmin();
  }
}

async function handleAdminLogin(
  event
) {
  event.preventDefault();

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
    } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    state.user =
      (
        await db.auth.getUser()
      ).data.user;

    const isAdmin =
      await isCurrentUserAdmin();

    if (!isAdmin) {
      await db.auth.signOut();

      state.user =
        null;

      throw new Error(
        'This account is not registered as an active admin.'
      );
    }

    showStatus(
      'admin-login-status',
      'ok',
      'Admin login successful.'
    );

    await restoreAdmin();

  } catch (error) {
    showStatus(
      'admin-login-status',
      'error',
      error.message ||
      'Admin login failed.'
    );
  }
}

async function adminLogout() {
  await db.auth.signOut();

  state.user =
    null;

  state.admin =
    null;

  if ($('admin-login-panel')) {
    $('admin-login-panel')
      .classList
      .remove('hidden');
  }

  if ($('admin-dashboard')) {
    $('admin-dashboard')
      .classList
      .add('hidden');
  }

  navigate(
    'home',
    true
  );
}

/* ============================================================
   CHALLENGE LIST
============================================================ */

function displayGuildName(
  normalized
) {
  const found =
    state.guilds.find(
      (g) =>
        g.guild_name_normalized ===
        normalized
    );

  return (
    found?.guild_name ||
    String(normalized || '')
      .replace(/\b\w/g, (c) =>
        c.toUpperCase()
      )
  );
}

function renderChallengeCard(
  challenge
) {
  const guildName =
    displayGuildName(
      challenge.guild_name_normalized
    );

  const weapons =
    Array.isArray(
      challenge.weapons
    ) &&
    challenge.weapons.length
      ? challenge.weapons
          .map(
            (weapon) =>
              `<span class="pill">
                ${escapeHtml(weapon)}
              </span>`
          )
          .join('')
      : `
          <span class="pill">
            None
          </span>
        `;

    const skills =
    Array.isArray(
      challenge.active_skills
    ) &&
    challenge.active_skills.length
      ? challenge.active_skills
          .map(
            (skill) =>
              `<span class="pill">
                ${escapeHtml(skill)}
              </span>`
          )
          .join('')
      : `
          <span class="pill">
            None
          </span>
        `;

  const contact =
    challenge.contact_number ||
    '';

  return `
    <div class="card">

      <div class="row">

        <div>

          <div class="challenge-name">
            ${escapeHtml(guildName)}
          </div>

          <div class="challenge-meta">
            Challenge
            ${
              challenge.challenge_code
                ? `• ${escapeHtml(
                    challenge.challenge_code
                  )}`
                : ''
            }
          </div>

        </div>

        <span class="badge badge-open">
          ${escapeHtml(
            String(
              challenge.status ||
              'open'
            ).toUpperCase()
          )}
        </span>

      </div>

      <div style="margin-top:10px">

        <div class="muted small">
          TIME
        </div>

        <div style="
          font-size:18px;
          font-weight:900;
          margin-top:2px
        ">
          ${escapeHtml(
            formatTime(
              challenge.match_time
            )
          )}
        </div>

      </div>

      <div class="pill-wrap">
        <strong class="small">
          WEAPONS
        </strong>
      </div>

      <div class="pill-wrap">
        ${weapons}
      </div>

      <div class="pill-wrap">
        <strong class="small">
          SKILLS
        </strong>
      </div>

      <div class="pill-wrap">
        ${skills}
      </div>

      <div class="card-actions">

        <a
          class="contact"
          href="tel:+${escapeHtml(
            normalizeContact(
              contact
            )
          )}"
        >
          ${escapeHtml(contact)}
        </a>

        <button
          class="btn btn-small"
          data-wa-contact="${escapeHtml(
            contact
          )}"
        >
          WhatsApp
        </button>

        <button
          class="btn btn-small"
          data-copy="${escapeHtml(
            contact
          )}"
        >
          Copy Number
        </button>

      </div>

    </div>
  `;
}

function renderChallengeLists() {
  const search1 =
    $('challenge-search')
      ?.value
      ?.trim()
      ?.toLowerCase() ||
    '';

  const search2 =
    $('challenge-search-2')
      ?.value
      ?.trim()
      ?.toLowerCase() ||
    '';

  const query =
    search1 || search2;

  const list =
    state.challenges.filter(
      (challenge) => {
        const name =
          displayGuildName(
            challenge.guild_name_normalized
          ).toLowerCase();

        return (
          !query ||
          name.includes(query)
        );
      }
    );

  const html =
    list.length
      ? list
          .map(
            renderChallengeCard
          )
          .join('')
      : `
        <div class="empty">
          No open challenges found.
        </div>
      `;

  if ($('home-challenge-list')) {
    $('home-challenge-list')
      .innerHTML =
      html;
  }

  if ($('challenge-list')) {
    $('challenge-list')
      .innerHTML =
      html;
  }
}

async function loadChallenges() {
  try {

    /*
      ACTUAL DATABASE COLUMNS
      are used here.
    */

    const {
      data,
      error
    } = await db
      .from('challenges')
      .select(
        `
        id,
        challenge_code,
        challenger_leader_id,
        challenger_guild_id,
        opponent_guild_id,
        challenge_everyone,
        match_time,
        weapons,
        active_skills,
        contact_number,
        status,
        created_at,
        accepted_by_leader_id,
        accepted_by_guild_id,
        accepted_at,
        user_id,
        guild_name_normalized,
        contact_normalized,
        completed_at
        `
      )
      .in(
        'status',
        [
          'open',
          'result_pending',
          'completed'
        ]
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(200);

    if (error) {
      throw error;
    }

    state.challenges =
      data || [];

    renderChallengeLists();

    fillResultChallenges();

    updateStats();

  } catch (error) {

    console.error(
      'Challenge load failed:',
      error
    );

    const html =
      `
      <div class="empty">
        Unable to load challenges.
      </div>
      `;

    if ($('home-challenge-list')) {
      $('home-challenge-list')
        .innerHTML =
        html;
    }

    if ($('challenge-list')) {
      $('challenge-list')
        .innerHTML =
        html;
    }
  }
}

/* ============================================================
   CHALLENGE SUBMISSION
============================================================ */

async function submitChallenge(
  event
) {
  event.preventDefault();

  clearStatus(
    'challenge-status'
  );

  if (!guildIsApproved()) {
    showStatus(
      'challenge-status',
      'error',
      'Only approved guilds can post challenges.'
    );

    navigate(
      'auth',
      true
    );

    return;
  }

  if (!postingWindowOpen()) {
    showStatus(
      'challenge-status',
      'error',
      'Challenges can only be posted from 10:00 AM to before 11:00 PM Pakistan time.'
    );

    return;
  }

  const weapons =
    selectedValues(
      '#page-challenge input[id^="w-"]'
    );

  const skills =
    selectedValues(
      '#page-challenge input[id^="s-"]'
    );

  if (!weapons.length) {
    showStatus(
      'challenge-status',
      'error',
      'Select at least one weapon.'
    );

    return;
  }

  const invalidWeapon =
    weapons.find(
      (weapon) =>
        !ALLOWED_WEAPONS.includes(
          weapon
        )
    );

  if (invalidWeapon) {
    showStatus(
      'challenge-status',
      'error',
      'Invalid weapon selected.'
    );

    return;
  }

  const invalidSkill =
    skills.find(
      (skill) =>
        !ALLOWED_SKILLS.includes(
          skill
        )
    );

  if (invalidSkill) {
    showStatus(
      'challenge-status',
      'error',
      'Invalid skill selected.'
    );

    return;
  }

  setBusy(
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
          getSelectedTime24(),

        p_weapons:
          weapons,

        p_active_skills:
          skills
      }
    );

    if (error) {
      throw error;
    }

    showStatus(
      'challenge-status',
      'ok',
      'Challenge submitted successfully.'
    );

    event.target.reset();

    initTimePicker();

    await loadChallenges();

    if (
      WHATSAPP_NOTIFY_ENDPOINT
    ) {
      await notifyWhatsApp(
        data
      );
    }

  } catch (error) {

    console.error(
      'Challenge submit:',
      error
    );

    showStatus(
      'challenge-status',
      'error',
      humanizeError(error)
    );

  } finally {

    setBusy(
      'challenge-submit',
      false,
      'Confirm Challenge'
    );
  }
}

/* ============================================================
   WHATSAPP
============================================================ */

function whatsappText(
  challenge
) {
  const guild =
    displayGuildName(
      challenge.guild_name_normalized
    );

  const weapons =
    Array.isArray(
      challenge.weapons
    )
      ? challenge.weapons.join(
          ', '
        )
      : 'None';

  const skills =
    Array.isArray(
      challenge.active_skills
    ) &&
    challenge.active_skills.length
      ? challenge.active_skills.join(
          ', '
        )
      : 'None';

  return [
    '7TH UNIVERSE GVG',
    '',
    `Guild: ${guild}`,
    `Time: ${formatTime(
      challenge.match_time
    )}`,
    `Weapons: ${weapons}`,
    `Active Skills: ${skills}`,
    `Contact: ${
      challenge.contact_number ||
      ''
    }`
  ].join('\n');
}

function openWhatsAppForContact(
  contact
) {
  const number =
    normalizeContact(
      contact
    );

  if (!number) {
    return;
  }

  window.open(
    `https://wa.me/${number}`,
    '_blank',
    'noopener,noreferrer'
  );
}

function openWhatsAppWithText(
  challenge
) {
  const number =
    normalizeContact(
      challenge.contact_number
    );

  if (!number) {
    return;
  }

  const text =
    whatsappText(
      challenge
    );

  window.open(
    `https://wa.me/${number}?text=${
      encodeURIComponent(text)
    }`,
    '_blank',
    'noopener,noreferrer'
  );
}

async function notifyWhatsApp(
  challenge
) {
  if (
    !WHATSAPP_NOTIFY_ENDPOINT
  ) {
    return;
  }

  try {

    await fetch(
      WHATSAPP_NOTIFY_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body:
          JSON.stringify({
            type:
              'new_challenge',
            challenge
          })
      }
    );

  } catch (error) {

    console.warn(
      'WhatsApp notification failed:',
      error
    );
  }
}

/* ============================================================
   RESULTS
============================================================ */

function fillResultChallenges() {
  const select =
    $('result-challenge');

  if (!select) {
    return;
  }

  const current =
    select.value;

  const openChallenges =
    state.challenges.filter(
      (challenge) =>
        challenge.status ===
        'open'
    );

  select.innerHTML =
    `
    <option value="">
      Select an open challenge
    </option>
    ` +
    openChallenges
      .map(
        (challenge) => `
          <option
            value="${challenge.id}"
          >
            ${escapeHtml(
              displayGuildName(
                challenge.guild_name_normalized
              )
            )}
            —
            ${escapeHtml(
              formatTime(
                challenge.match_time
              )
            )}
          </option>
        `
      )
      .join('');

  if (
    openChallenges.some(
      (challenge) =>
        challenge.id ===
        current
    )
  ) {
    select.value =
      current;
  }
}

function renderResults() {
  const html =
    state.results.length
      ? state.results
          .map(
            (result) => `
              <div class="card">

                <div class="row">

                  <div>

                    <div class="challenge-name">
                      ${escapeHtml(
                        result.winner_guild
                      )}

                      <span class="muted">
                        def.
                      </span>

                      ${escapeHtml(
                        result.loser_guild
                      )}
                    </div>

                    <div class="challenge-meta">
                      ${escapeHtml(
                        result.score
                      )}
                    </div>

                  </div>

                  <span class="badge badge-approved">
                    APPROVED
                  </span>

                </div>

                ${
                  Array.isArray(
                    result.image_urls
                  ) &&
                  result.image_urls.length
                    ? `
                      <div class="image-grid">

                        ${
                          result.image_urls
                            .slice(0,2)
                            .map(
                              (url) => `
                                <a
                                  href="${escapeHtml(
                                    url
                                  )}"
                                  target="_blank"
                                  rel="noopener"
                                >
                                  <img
                                    src="${escapeHtml(
                                      url
                                    )}"
                                    alt="Result proof"
                                  >
                                </a>
                              `
                            )
                            .join('')
                        }

                      </div>
                    `
                    : ''
                }

              </div>
            `
          )
          .join('')
      : `
        <div class="empty">
          No approved results yet.
        </div>
      `;

  if ($('result-list')) {
    $('result-list')
      .innerHTML =
      html;
  }
}

async function loadResults() {
  try {

    const {
      data,
      error
    } = await db
      .from(
        'challenge_results'
      )
      .select(
        `
        id,
        challenge_id,
        winner_guild,
        loser_guild,
        score,
        image_urls,
        status,
        rejection_reason,
        reviewed_at,
        reviewed_by,
        created_at
        `
      )
      .eq(
        'status',
        'approved'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(200);

    if (error) {
      throw error;
    }

    state.results =
      data || [];

    renderResults();

    updateStats();

  } catch (error) {

    console.error(
      'Results load:',
      error
    );

    if ($('result-list')) {
      $('result-list')
        .innerHTML =
        `
          <div class="empty">
            Unable to load results.
          </div>
        `;
    }
  }
}

/* ============================================================
   RESULT IMAGE UPLOAD
============================================================ */

async function uploadResultImages(
  files
) {
  const selected =
    Array.from(
      files || []
    ).filter(Boolean);

  if (
    selected.length > 2
  ) {
    throw new Error(
      'IMAGE_LIMIT: Maximum 2 pictures are allowed.'
    );
  }

  const urls = [];

  for (
    const file of selected
  ) {

    if (
      file.size >
      MAX_IMAGE_SIZE
    ) {
      throw new Error(
        'Image must be 5 MB or smaller.'
      );
    }

    const extension =
      (
        file.name
          .split('.')
          .pop() ||
        'jpg'
      ).toLowerCase();

    const path =
      `results/${
        state.user.id
      }/${
        crypto.randomUUID()
      }.${extension}`;

    const {
      error
    } =
      await db.storage
        .from(
          IMAGE_BUCKET
        )
        .upload(
          path,
          file,
          {
            upsert: false,
            contentType:
              file.type
          }
        );

    if (error) {
      throw error;
    }

    const {
      data
    } =
      db.storage
        .from(
          IMAGE_BUCKET
        )
        .getPublicUrl(
          path
        );

    urls.push(
      data.publicUrl
    );
  }

  return urls;
}

async function submitResult(
  event
) {
  event.preventDefault();

  clearStatus(
    'result-status'
  );

  if (!guildIsApproved()) {
    showStatus(
      'result-status',
      'error',
      'Only approved guilds can submit results.'
    );

    navigate(
      'auth',
      true
    );

    return;
  }

  setBusy(
    'result-submit',
    true
  );

  try {

    const challengeId =
      $('result-challenge')
        .value;

    const winner =
      $('winner-guild')
        .value
        .trim();

    const loser =
      $('loser-guild')
        .value
        .trim();

    const score =
      $('score')
        .value
        .trim();

    if (!challengeId) {
      throw new Error(
        'Please select an open challenge.'
      );
    }

    if (!winner) {
      throw new Error(
        'Winner guild is required.'
      );
    }

    if (!loser) {
      throw new Error(
        'Loser guild is required.'
      );
    }

    if (
      normalizeGuild(winner) ===
      normalizeGuild(loser)
    ) {
      throw new Error(
        'Winner and loser guilds must be different.'
      );
    }

    if (!score) {
      throw new Error(
        'Score/result is required.'
      );
    }

    const files = [
      $('result-image-1')
        ?.files?.[0],
      $('result-image-2')
        ?.files?.[0]
    ].filter(Boolean);

    if (
      files.length > 2
    ) {
      throw new Error(
        'IMAGE_LIMIT: Maximum 2 pictures are allowed.'
      );
    }

    const imageUrls =
      await uploadResultImages(
        files
      );

    const {
      error
    } =
      await db.rpc(
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

    if (error) {
      throw error;
    }

    showStatus(
      'result-status',
      'ok',
      'Result submitted successfully. Waiting for admin approval.'
    );

    event.target.reset();

    await loadResults();
    await loadChallenges();

  } catch (error) {

    console.error(
      'Result submit:',
      error
    );

    showStatus(
      'result-status',
      'error',
      humanizeError(error)
    );

  } finally {

    setBusy(
      'result-submit',
      false,
      'Submit Result for Approval'
    );
  }
}

/* ============================================================
   ADMIN - GUILD REGISTRY
============================================================ */

async function handleGuildSave(
  event
) {
  event.preventDefault();

  clearStatus(
    'admin-status'
  );

  try {

    const guildName =
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
            $('reg-ban-until')
              .value
          ).toISOString()
        : null;

    const banReason =
      $('reg-ban-reason')
        .value
        .trim() ||
      null;

    if (
      !guildName ||
      !contact
    ) {
      throw new Error(
        'Guild name and contact are required.'
      );
    }

    const {
      error
    } =
      await db.rpc(
        'admin_upsert_guild',
        {
          p_guild_name:
            guildName,

          p_contact:
            contact,

          p_approval_status:
            status,

          p_ban_until:
            banUntil,

          p_ban_reason:
            banReason
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Guild saved successfully.'
    );

    event.target.reset();

    if ($('reg-status')) {
      $('reg-status')
        .value =
        'approved';
    }

    if ($('reg-ban-reason')) {
      $('reg-ban-reason')
        .value =
        'Rule violation';
    }

    await loadGuilds();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

async function loadGuilds() {
  try {

    const {
      data,
      error
    } =
      await db
        .from(
          'guild_registry'
        )
        .select(
          `
          id,
          user_id,
          guild_name,
          guild_name_normalized,
          contact,
          contact_normalized,
          approval_status,
          is_banned,
          ban_until,
          ban_reason,
          created_at,
          updated_at
          `
        )
        .order(
          'guild_name',
          {
            ascending: true
          }
        );

    if (error) {
      throw error;
    }

    state.guilds =
      data || [];

    renderGuildTable();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

function renderGuildTable() {
  const tbody =
    $('guild-table');

  if (!tbody) {
    return;
  }

  if (!state.guilds.length) {
    tbody.innerHTML =
      `
        <tr>
          <td colspan="4">
            No guilds found.
          </td>
        </tr>
      `;

    return;
  }

  tbody.innerHTML =
    state.guilds
      .map(
        (guild) => `
          <tr>

            <td>
              ${escapeHtml(
                guild.guild_name
              )}
            </td>

            <td>
              ${escapeHtml(
                guild.approval_status
              )}
            </td>

            <td>
              ${
                guild.ban_until &&
                new Date(
                  guild.ban_until
                ) > new Date()
                  ? escapeHtml(
                      formatDateTime(
                        guild.ban_until
                      )
                    )
                  : guild.is_banned
                    ? 'Permanent'
                    : '—'
              }
            </td>

            <td>

              <button
                class="btn btn-small btn-success"
                data-ban-guild="${escapeHtml(
                  guild.id
                )}"
              >
                Ban
              </button>

              <button
                class="btn btn-small btn-danger"
                data-remove-guild="${escapeHtml(
                  guild.id
                )}"
              >
                Remove
              </button>

            </td>

          </tr>
        `
      )
      .join('');
}

async function quickGuildBan(
  guildId
) {
  const value =
    prompt(
      'Enter ban end as YYYY-MM-DD HH:MM (Pakistan time). Leave blank for permanent ban.',
      ''
    );

  if (value === null) {
    return;
  }

  try {

    let banUntil =
      null;

    if (
      value.trim()
    ) {

      const parsed =
        new Date(
          value
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

      banUntil =
        parsed.toISOString();
    }

    const {
      error
    } =
      await db.rpc(
        'admin_set_guild_ban',
        {
          p_guild_id:
            guildId,

          p_ban_until:
            banUntil,

          p_reason:
            'Admin ban'
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Guild ban updated.'
    );

    await loadGuilds();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

async function removeGuild(
  guildId
) {
  if (
    !confirm(
      'Remove this guild from the registry? It can register again later.'
    )
  ) {
    return;
  }

  try {

    const {
      error
    } =
      await db.rpc(
        'admin_remove_guild',
        {
          p_guild_id:
            guildId
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Guild removed from registry.'
    );

    await loadGuilds();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

/* ============================================================
   ADMIN - BLOCKS
============================================================ */

async function handleBlock(
  event
) {
  event.preventDefault();

  clearStatus(
    'admin-status'
  );

  const guild =
    $('block-guild')
      .value
      .trim();

  const contact =
    $('block-number')
      .value
      .trim();

  if (
    !guild &&
    !contact
  ) {
    showStatus(
      'admin-status',
      'error',
      'Enter a guild name or contact number.'
    );

    return;
  }

  try {

    const blockUntil =
      $('block-until')
        .value
        ? new Date(
            $('block-until')
              .value
          ).toISOString()
        : null;

    const reason =
      $('block-reason')
        .value
        .trim() ||
      'Rule violation';

    const {
      error
    } =
      await db.rpc(
        'admin_create_block',
        {
          p_guild_name:
            guild || null,

          p_contact:
            contact || null,

          p_blocked_until:
            blockUntil,

          p_reason:
            reason
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Block created.'
    );

    event.target.reset();

    if ($('block-reason')) {
      $('block-reason')
        .value =
        'Rule violation';
    }

    await loadBlocks();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

async function loadBlocks() {
  try {

    const {
      data,
      error
    } =
      await db
        .from('blocks')
        .select(
          `
          id,
          guild_name,
          guild_name_normalized,
          contact,
          contact_normalized,
          blocked_until,
          reason,
          created_at
          `
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        );

    if (error) {
      throw error;
    }

    state.blocks =
      data || [];

    renderBlockTable();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

function renderBlockTable() {
  const tbody =
    $('block-table');

  if (!tbody) {
    return;
  }

  if (!state.blocks.length) {
    tbody.innerHTML =
      `
        <tr>
          <td colspan="4">
            No blocks.
          </td>
        </tr>
      `;

    return;
  }

  tbody.innerHTML =
    state.blocks
      .map(
        (block) => `
          <tr>

            <td>
              ${escapeHtml(
                block.guild_name ||
                '—'
              )}

              <br>

              ${escapeHtml(
                block.contact ||
                ''
              )}
            </td>

            <td>
              ${
                block.blocked_until
                  ? escapeHtml(
                      formatDateTime(
                        block.blocked_until
                      )
                    )
                  : 'Permanent'
              }
            </td>

            <td>
              ${escapeHtml(
                block.reason ||
                ''
              )}
            </td>

            <td>

              <button
                class="btn btn-small btn-success"
                data-unblock="${escapeHtml(
                  block.id
                )}"
              >
                Unblock
              </button>

            </td>

          </tr>
        `
      )
      .join('');
}

async function unblock(
  blockId
) {
  try {

    const {
      error
    } =
      await db.rpc(
        'admin_delete_block',
        {
          p_block_id:
            blockId
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Block removed.'
    );

    await loadBlocks();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

/* ============================================================
   ADMIN - RESULTS
============================================================ */

async function loadAdminResults() {
  try {

    const {
      data,
      error
    } =
      await db.rpc(
        'admin_get_results'
      );

    if (error) {
      throw error;
    }

    state.adminResults =
      data || [];

    renderAdminResults();

  } catch (error) {

    console.error(
      'Admin results:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      error.message ||
      'Result review load failed.'
    );
  }
}

function renderAdminResults() {
  const tbody =
    $('admin-result-table');

  if (!tbody) {
    return;
  }

  if (!state.adminResults.length) {
    tbody.innerHTML =
      `
        <tr>
          <td colspan="6">
            No result submissions.
          </td>
        </tr>
      `;

    return;
  }

  tbody.innerHTML =
    state.adminResults
      .map(
        (result) => `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  result.winner_guild
                )}
              </strong>

              def.

              <strong>
                ${escapeHtml(
                  result.loser_guild
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                result.score
              )}
            </td>

            <td>
              ${
                Array.isArray(
                  result.image_urls
                )
                  ? result.image_urls
                      .map(
                        (url) => `
                          <a
                            href="${escapeHtml(
                              url
                            )}"
                            target="_blank"
                            rel="noopener"
                          >
                            View
                          </a>
                        `
                      )
                      .join(
                        ' '
                      )
                  : '0'
              }
            </td>

            <td>
              ${escapeHtml(
                result.status
              )}
            </td>

            <td>
              ${escapeHtml(
                formatDateTime(
                  result.created_at
                )
              )}
            </td>

            <td>

              ${
                result.status ===
                'pending'
                  ? `
                    <button
                      class="btn btn-small btn-success"
                      data-approve-result="${escapeHtml(
                        result.id
                      )}"
                    >
                      Approve
                    </button>

                    <button
                      class="btn btn-small btn-danger"
                      data-reject-result="${escapeHtml(
                        result.id
                      )}"
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
      .join('');
}

async function approveResult(
  resultId
) {
  try {

    const {
      error
    } =
      await db.rpc(
        'admin_approve_result',
        {
          p_result_id:
            resultId
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Result approved.'
    );

    await loadAdminResults();
    await loadResults();
    await loadChallenges();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

async function rejectResult(
  resultId
) {
  const reason =
    prompt(
      'Reason for rejection:',
      'Proof or result issue'
    );

  if (
    reason === null
  ) {
    return;
  }

  try {

    const {
      error
    } =
      await db.rpc(
        'admin_reject_result',
        {
          p_result_id:
            resultId,

          p_reason:
            reason ||
            'Rejected by admin'
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Result rejected. Challenge is open again.'
    );

    await loadAdminResults();
    await loadResults();
    await loadChallenges();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

/* ============================================================
   ADMIN - CHALLENGES
============================================================ */

async function loadAdminChallenges() {
  try {

    const {
      data,
      error
    } =
      await db
        .from('challenges')
        .select(
          `
          id,
          challenge_code,
          challenger_leader_id,
          challenger_guild_id,
          opponent_guild_id,
          challenge_everyone,
          match_time,
          weapons,
          active_skills,
          contact_number,
          status,
          created_at,
          accepted_by_leader_id,
          accepted_by_guild_id,
          accepted_at,
          user_id,
          guild_name_normalized,
          contact_normalized,
          completed_at
          `
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        )
        .limit(300);

    if (error) {
      throw error;
    }

    renderAdminChallenges(
      data || []
    );

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

function renderAdminChallenges(
  challenges
) {
  const tbody =
    $('admin-challenge-table');

  if (!tbody) {
    return;
  }

  if (!challenges.length) {
    tbody.innerHTML =
      `
        <tr>
          <td colspan="6">
            No challenges.
          </td>
        </tr>
      `;

    return;
  }

  tbody.innerHTML =
    challenges
      .map(
        (challenge) => `
          <tr>

            <td>
              ${escapeHtml(
                displayGuildName(
                  challenge.guild_name_normalized
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                formatTime(
                  challenge.match_time
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                (
                  challenge.weapons ||
                  []
                ).join(', ')
              )}
            </td>

            <td>
              ${escapeHtml(
                (
                  challenge.active_skills ||
                  []
                ).join(', ') ||
                'None'
              )}
            </td>

            <td>
              ${escapeHtml(
                challenge.status ||
                ''
              )}
            </td>

            <td>

              <button
                class="btn btn-small btn-danger"
                data-cancel-challenge="${escapeHtml(
                  challenge.id
                )}"
              >
                Cancel
              </button>

            </td>

          </tr>
        `
      )
      .join('');
}

async function cancelChallenge(
  challengeId
) {
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
    } =
      await db.rpc(
        'admin_cancel_challenge',
        {
          p_challenge_id:
            challengeId
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Challenge cancelled.'
    );

    await loadAdminChallenges();
    await loadChallenges();

  } catch (error) {

    showStatus(
      'admin-status',
      'error',
      humanizeError(error)
    );
  }
}

/* ============================================================
   ADMIN REFRESH
============================================================ */

async function refreshAdmin() {
  await Promise.all([
    loadGuilds(),
    loadBlocks(),
    loadAdminResults(),
    loadAdminChallenges()
  ]);
}

/* ============================================================
   STATS
============================================================ */

async function updateStats() {
  try {

    const {
      data,
      error
    } =
      await db.rpc(
        'get_gvg_stats'
      );

    if (error) {
      throw error;
    }

    const stats =
      data?.[0] ||
      {};

    if ($('stat-open')) {
      $('stat-open')
        .textContent =
        String(
          stats.open_challenges ??
          state.challenges.length ??
          0
        );
    }

    if ($('stat-results')) {
      $('stat-results')
        .textContent =
        String(
          stats.today_result_submissions ??
          0
        );
    }

    if ($('stat-approved-results')) {
      $('stat-approved-results')
        .textContent =
        String(
          stats.today_approved_results ??
          0
        );
    }

    if ($('stat-guilds')) {
      $('stat-guilds')
        .textContent =
        String(
          stats.approved_guilds ??
          0
        );
    }

  } catch (error) {

    console.warn(
      'Stats failed:',
      error
    );
  }
}

/* ============================================================
   NAVIGATION
============================================================ */

function navigate(
  page,
  force = false
) {
  const protectedPage =
    [
      'challenge',
      'results'
    ].includes(
      page
    );

  if (
    protectedPage &&
    !guildIsApproved() &&
    !force
  ) {
    page =
      'auth';
  }

  document
    .querySelectorAll(
      '.page'
    )
    .forEach(
      (section) =>
        section.classList.remove(
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
    .forEach(
      (button) => {
        button.classList.toggle(
          'active',
          button.dataset.pageLink ===
            page
        );
      }
    );

  if (page === 'home') {
    loadChallenges();
    loadResults();
    updateStats();
  }

  if (
    page === 'challenge'
  ) {
    if (
      guildIsApproved()
    ) {
      applyGuildUI();
      loadChallenges();
    }
  }

  if (
    page === 'results'
  ) {
    if (
      guildIsApproved()
    ) {
      loadChallenges();
      loadResults();
    }
  }

  if (
    page === 'admin'
  ) {
    restoreAdmin();
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* ============================================================
   EVENT HANDLERS
============================================================ */

function wireEvents() {

  document
    .querySelectorAll(
      '[data-page-link]'
    )
    .forEach(
      (element) => {
        element.addEventListener(
          'click',
          (event) => {
            event.preventDefault();

            navigate(
              element.dataset.pageLink
            );
          }
        );
      }
    );

  $('guild-login-form')
    ?.addEventListener(
      'submit',
      handleGuildLogin
    );

  $('guild-register-form')
    ?.addEventListener(
      'submit',
      handleGuildRegister
    );

  $('guild-login-password')
    ?.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key ===
          'Enter'
        ) {
          event.target
            .form
            ?.requestSubmit();
        }
      }
    );

  $('challenge-form')
    ?.addEventListener(
      'submit',
      submitChallenge
    );

  $('result-form')
    ?.addEventListener(
      'submit',
      submitResult
    );

  $('admin-login-form')
    ?.addEventListener(
      'submit',
      handleAdminLogin
    );

  $('admin-logout')
    ?.addEventListener(
      'click',
      adminLogout
    );

  $('nav-logout')
    ?.addEventListener(
      'click',
      guildLogout
    );

  $('guild-form')
    ?.addEventListener(
      'submit',
      handleGuildSave
    );

  $('block-form')
    ?.addEventListener(
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

  document.addEventListener(
    'click',
    async (event) => {

      const waButton =
        event.target.closest(
          '[data-wa-contact]'
        );

      if (waButton) {
        openWhatsAppForContact(
          waButton.dataset
            .waContact
        );

        return;
      }

      const copyButton =
        event.target.closest(
          '[data-copy]'
        );

      if (copyButton) {

        try {

          await navigator.clipboard.writeText(
            copyButton.dataset.copy
          );

          alert(
            'Contact number copied.'
          );

        } catch {

          alert(
            copyButton.dataset.copy
          );
        }

        return;
      }

      const banButton =
        event.target.closest(
          '[data-ban-guild]'
        );

      if (banButton) {

        await quickGuildBan(
          banButton.dataset
            .banGuild
        );

        return;
      }

      const removeButton =
        event.target.closest(
          '[data-remove-guild]'
        );

      if (removeButton) {

        await removeGuild(
          removeButton.dataset
            .removeGuild
        );

        return;
      }

      const unblockButton =
        event.target.closest(
          '[data-unblock]'
        );

      if (unblockButton) {

        await unblock(
          unblockButton.dataset
            .unblock
        );

        return;
      }

      const approveButton =
        event.target.closest(
          '[data-approve-result]'
        );

      if (approveButton) {

        await approveResult(
          approveButton.dataset
            .approveResult
        );

        return;
      }

      const rejectButton =
        event.target.closest(
          '[data-reject-result]'
        );

      if (rejectButton) {

        await rejectResult(
          rejectButton.dataset
            .rejectResult
        );

        return;
      }

      const cancelButton =
        event.target.closest(
          '[data-cancel-challenge]'
        );

      if (cancelButton) {

        await cancelChallenge(
          cancelButton.dataset
            .cancelChallenge
        );

        return;
      }

    }
  );
}

/* ============================================================
   AUTH STATE
============================================================ */

function setupAuthListener() {

  db.auth.onAuthStateChange(
    (
      _event,
      _session
    ) => {

      setTimeout(
        async () => {

          try {

            await refreshAuth();

          } catch (
            error
          ) {

            console.error(
              'Auth refresh:',
              error
            );
          }

        },
        0
      );

    }
  );
}

/* ============================================================
   GLOBAL FUNCTIONS
============================================================ */

window.loadChallenges =
  loadChallenges;

window.loadResults =
  loadResults;

window.loadAdminResults =
  loadAdminResults;

window.loadAdminChallenges =
  loadAdminChallenges;

window.navigate =
  navigate;

window.openWhatsAppForContact =
  openWhatsAppForContact;

window.openWhatsAppWithText =
  openWhatsAppWithText;

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

/* ============================================================
   BOOT
============================================================ */

(async function boot() {

  try {

    if (
      SUPABASE_URL.includes(
        'PASTE_YOUR_'
      ) ||
      SUPABASE_PUBLISHABLE_KEY.includes(
        'PASTE_YOUR_'
      )
    ) {

      console.warn(
        'Supabase URL / key have not been configured yet.'
      );

    }

    initTimePicker();

    wireEvents();

    setupAuthListener();

    await refreshAuth();

    await loadChallenges();

    await loadResults();

    await updateStats();

    await restoreAdmin();

  } catch (error) {

    console.error(
      '7TH UNIVERSE GVG startup error:',
      error
    );

    showStatus(
      'guild-auth-status',
      'error',
      error.message ||
      'Website startup failed.'
    );

  }

})();
