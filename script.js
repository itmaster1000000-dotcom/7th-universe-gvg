/*
  7TH UNIVERSE GVG
  Frontend for the current index.html + current Supabase schema.

  IMPORTANT:
  1) Use ONLY the Supabase Project URL + Publishable/Anon key.
  2) NEVER put a service_role / secret key in this file.
  3) Existing Supabase Auth users can log in and then register a guild.
  4) Public challenge/result display uses the normalized fields that
     exist in the current challenges table.
*/

const SUPABASE_URL =
  'https://ypnpeiglbiycbexpeibb.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_5ei0IhM1tQ15u5pAIIavhQ_alE9O3bl';

const WHATSAPP_NOTIFY_ENDPOINT = '';

const { createClient } = window.supabase;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

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

const $ = (id) =>
  document.getElementById(id);

/* ============================================================
   HELPERS
   ============================================================ */

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
  let number = String(value || '')
    .replace(/\D/g, '');

  if (number.startsWith('00')) {
    number = number.slice(2);
  }

  if (number.startsWith('0')) {
    number =
      `92${number.slice(1)}`;
  }

  return number;
}

function formatContact(value) {
  const number =
    normalizeContact(value);

  if (!number) {
    return '';
  }

  if (
    number.startsWith('92') &&
    number.length === 12
  ) {
    return (
      `+92 ${number.slice(2, 5)} ` +
      `${number.slice(5, 8)} ` +
      `${number.slice(8)}`
    );
  }

  return `+${number}`;
}

function formatTime(value) {
  if (!value) {
    return '--:--';
  }

  const [
    hourText,
    minuteText = '00'
  ] = String(value).split(':');

  const hour24 =
    Number(hourText);

  if (!Number.isFinite(hour24)) {
    return '--:--';
  }

  const hour12 =
    hour24 % 12 || 12;

  const suffix =
    hour24 >= 12
      ? 'PM'
      : 'AM';

  return (
    `${hour12}:` +
    `${String(minuteText).padStart(2, '0')} ` +
    `${suffix}`
  );
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'en-PK',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: TIME_ZONE
    }
  ).format(date);
}

function currentPakistanParts() {
  const formatter =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }
    );

  const parts =
    Object.fromEntries(
      formatter
        .formatToParts(new Date())
        .map(
          (part) => [
            part.type,
            part.value
          ]
        )
    );

  return {
    hour:
      Number(parts.hour),

    minute:
      Number(parts.minute)
  };
}

function postingWindowOpen() {
  const {
    hour,
    minute
  } =
    currentPakistanParts();

  const totalMinutes =
    hour * 60 + minute;

  return (
    totalMinutes >= 600 &&
    totalMinutes < 1380
  );
}

function selectedValues(
  selector
) {
  return [
    ...document.querySelectorAll(
      selector
    )
  ]
    .filter(
      (input) => input.checked
    )
    .map(
      (input) => input.value
    );
}

function showStatus(
  id,
  type,
  message
) {
  const element = $(id);

  if (!element) {
    return;
  }

  element.className =
    `status show ${type}`;

  element.textContent =
    message;
}

function clearStatus(id) {
  const element = $(id);

  if (!element) {
    return;
  }

  element.className =
    'status';

  element.textContent =
    '';
}

function setButtonBusy(
  id,
  busy,
  restoreText
) {
  const button = $(id);

  if (!button) {
    return;
  }

  if (busy) {
    button.disabled = true;

    button.dataset.oldText =
      button.textContent;

    button.innerHTML =
      '<span class="loader"></span>';
  } else {
    button.disabled = false;

    button.textContent =
      restoreText ||
      button.dataset.oldText ||
      'Submit';
  }
}

function humanizeDbError(
  error
) {
  const message =
    String(
      error?.message ||
      error?.details ||
      error ||
      'Request failed.'
    );

  if (
    /LOGIN_REQUIRED/i.test(
      message
    )
  ) {
    return (
      'Please login to continue.'
    );
  }

  if (
    /ALREADY_REGISTERED/i.test(
      message
    )
  ) {
    return (
      'This account already has a registered guild.'
    );
  }

  if (
    /DUPLICATE_REGISTRATION/i.test(
      message
    )
  ) {
    return (
      'This guild name or contact number is already registered.'
    );
  }

  if (
    /INVALID_GUILD/i.test(
      message
    )
  ) {
    return (
      'Invalid guild name.'
    );
  }

  if (
    /INVALID_CONTACT/i.test(
      message
    )
  ) {
    return (
      'Invalid contact number.'
    );
  }

  if (
    /APPROVAL/i.test(
      message
    )
  ) {
    return (
      'This guild is not approved yet.'
    );
  }

  if (
    /BAN_ACTIVE/i.test(
      message
    )
  ) {
    return (
      'This guild is currently banned.'
    );
  }

  if (
    /BLOCKED/i.test(
      message
    )
  ) {
    return (
      'This guild or contact number is currently blocked.'
    );
  }

  if (
    /DAILY_CHALLENGE_LIMIT/i.test(
      message
    )
  ) {
    return (
      'This guild has reached its 10-challenge daily limit.'
    );
  }

  if (
    /COOLDOWN/i.test(
      message
    )
  ) {
    return (
      'Please wait 15 minutes before posting another challenge.'
    );
  }

  if (
    /TIME_WINDOW/i.test(
      message
    )
  ) {
    return (
      'Challenge posting is open only from 10:00 AM until before 11:00 PM Pakistan time.'
    );
  }

  if (
    /DAILY_RESULT_LIMIT/i.test(
      message
    )
  ) {
    return (
      'This guild has reached the 5-result daily limit.'
    );
  }

  if (
    /IMAGE_LIMIT/i.test(
      message
    )
  ) {
    return (
      'Maximum 2 pictures are allowed per result.'
    );
  }

  if (
    /RESULT_EXISTS/i.test(
      message
    )
  ) {
    return (
      'This challenge already has a result submission.'
    );
  }

  if (
    /RESULT_MATCH/i.test(
      message
    )
  ) {
    return (
      'The selected challenge does not match the submitted guilds.'
    );
  }

  if (
    /RESULT_GUILD/i.test(
      message
    )
  ) {
    return (
      'Both result guilds must be approved and not banned.'
    );
  }

  if (
    /CHALLENGE_NOT_FOUND/i.test(
      message
    )
  ) {
    return (
      'Challenge not found.'
    );
  }

  if (
    /GUILD_NOT_FOUND/i.test(
      message
    )
  ) {
    return (
      'Guild not found.'
    );
  }

  if (
    /ADMIN_ONLY/i.test(
      message
    )
  ) {
    return (
      'Admin access required.'
    );
  }

  if (
    /Invalid login credentials/i.test(
      message
    )
  ) {
    return (
      'Invalid email or password.'
    );
  }

  if (
    /Email not confirmed/i.test(
      message
    )
  ) {
    return (
      'Please confirm your email before logging in.'
    );
  }

  if (
    /User already registered/i.test(
      message
    )
  ) {
    return (
      'This email already has an account. Login first, then register the guild.'
    );
  }

  return message.trim();
}

/* ============================================================
   TIME PICKER
   ============================================================ */

function initTimePicker() {
  const hour =
    $('time-hour');

  const minute =
    $('time-minute');

  const ampm =
    $('time-ampm');

  if (
    !hour ||
    !minute ||
    !ampm
  ) {
    return;
  }

  hour.innerHTML =
    Array.from(
      { length: 12 },
      (_, index) => {
        const value =
          index + 1;

        return `
          <option value="${value}">
            ${String(value).padStart(2, '0')}
          </option>
        `;
      }
    ).join('');

  minute.innerHTML =
    Array.from(
      { length: 60 },
      (_, index) => {
        const value =
          String(index).padStart(
            2,
            '0'
          );

        return `
          <option value="${value}">
            ${value}
          </option>
        `;
      }
    ).join('');

  const now =
    currentPakistanParts();

  const hour12 =
    now.hour % 12 || 12;

  hour.value =
    String(hour12);

  minute.value =
    String(now.minute)
      .padStart(2, '0');

  ampm.value =
    now.hour >= 12
      ? 'PM'
      : 'AM';
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
    `${String(hour).padStart(2, '0')}:` +
    `${String(minute).padStart(2, '0')}:00`
  );
}

/* ============================================================
   AUTH + GUILD STATUS
   ============================================================ */

function guildIsApproved() {
  const guild =
    state.guild;

  if (
    !state.user ||
    !guild
  ) {
    return false;
  }

  const banActive =
    guild.is_banned === true ||
    Boolean(
      guild.ban_until &&
      new Date(
        guild.ban_until
      ) > new Date()
    );

  return (
    guild.approval_status ===
      'approved' &&
    !banActive
  );
}

function guildStatusText(
  guild
) {
  if (!guild) {
    return (
      'No guild is registered with this account. ' +
      'Complete Guild Registration below.'
    );
  }

  const banned =
    guild.is_banned === true ||
    Boolean(
      guild.ban_until &&
      new Date(
        guild.ban_until
      ) > new Date()
    );

  if (banned) {
    return guild.ban_until
      ? `BANNED until ${formatDateTime(
          guild.ban_until
        )}.`
      : 'BANNED permanently.';
  }

  if (
    guild.approval_status ===
    'approved'
  ) {
    return (
      'Your guild is approved. ' +
      'Challenge and Results are unlocked.'
    );
  }

  if (
    guild.approval_status ===
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
  state.guild = null;

  if (!state.user) {
    return null;
  }

  const {
    data,
    error
  } =
    await db
      .from('guild_registry')
      .select(`
        id,
        user_id,
        guild_name,
        contact,
        approval_status,
        is_banned,
        ban_until,
        ban_reason,
        created_at,
        updated_at
      `)
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

function updateChallengeIdentity() {
  const name =
    $('guild-name');

  const contact =
    $('contact');

  if (name) {
    name.value =
      state.guild?.guild_name ||
      '';
  }

  if (contact) {
    contact.value =
      state.guild?.contact ||
      '';
  }
}

function syncRegistrationForm() {
  const email =
    $('guild-register-email');

  const password =
    $('guild-register-password');

  if (!email) {
    return;
  }

  if (state.user) {
    email.value =
      state.user.email ||
      '';

    email.readOnly =
      true;

    if (password) {
      password.required =
        false;

      password.disabled =
        true;

      password.value =
        '';

      password.placeholder =
        'Not required while logged in';
    }
  } else {
    email.readOnly =
      false;

    if (password) {
      password.disabled =
        false;

      password.required =
        true;

      password.placeholder =
        'Minimum 8 characters';
    }
  }
}

function applyAuthUI() {
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

  $('nav-auth')
    ?.classList.toggle(
      'hidden',
      !!state.user
    );

  $('nav-logout')
    ?.classList.toggle(
      'hidden',
      !state.user
    );

  $('guild-account-card')
    ?.classList.toggle(
      'hidden',
      !state.user
    );

  if (
    $('guild-account-info')
  ) {
    $('guild-account-info')
      .textContent =
      state.user?.email ||
      '';
  }

  if (
    $('guild-account-badge')
  ) {
    const badge =
      $('guild-account-badge');

    badge.textContent =
      state.guild
        ? String(
            state.guild
              .approval_status ||
            'pending'
          ).toUpperCase()
        : 'NOT REGISTERED';

    badge.className =
      `badge ${
        approved
          ? 'badge-approved'
          : state.guild
              ?.approval_status ===
            'rejected'
            ? 'badge-rejected'
            : 'badge-pending'
      }`;
  }

  if (
    $('guild-account-message')
  ) {
    $('guild-account-message')
      .textContent =
      guildStatusText(
        state.guild
      );
  }

  updateChallengeIdentity();
  syncRegistrationForm();

  const activePage =
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
      .includes(activePage) &&
    !approved
  ) {
    navigate(
      'auth',
      true
    );
  }
}

async function refreshGuildAuth() {
  try {
    const {
      data: {
        user
      }
    } =
      await db.auth.getUser();

    state.user =
      user || null;

    await loadMyGuild();

    applyAuthUI();
  } catch (error) {
    console.error(
      'Auth refresh failed:',
      error
    );

    state.user = null;
    state.guild = null;

    applyAuthUI();
  }
}

/* ============================================================
   GUILD LOGIN
   ============================================================ */

async function handleGuildLogin(
  event
) {
  event.preventDefault();

  clearStatus(
    'guild-auth-status'
  );

  const email =
    $('guild-login-email')
      ?.value
      ?.trim() ||
    '';

  const password =
    $('guild-login-password')
      ?.value ||
    '';

  if (
    !email ||
    !password
  ) {
    showStatus(
      'guild-auth-status',
      'error',
      'Email and password are required.'
    );

    return;
  }

  try {
    const {
      error
    } =
      await db.auth
        .signInWithPassword({
          email,
          password
        });

    if (error) {
      throw error;
    }

    await refreshGuildAuth();

    if (!state.guild) {
      showStatus(
        'guild-auth-status',
        'info',
        'Login successful. This account has no registered guild yet. Complete Guild Registration below.'
      );

      navigate(
        'auth',
        true
      );

      return;
    }

    if (
      !guildIsApproved()
    ) {
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
  } catch (error) {
    console.error(
      'Guild login failed:',
      error
    );

    showStatus(
      'guild-auth-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

/* ============================================================
   GUILD REGISTRATION
   ============================================================ */

async function registerGuildForCurrentUser(
  guild,
  contact
) {
  if (!state.user) {
    throw new Error(
      'LOGIN_REQUIRED: Login required.'
    );
  }

  const {
    data,
    error
  } =
    await db.rpc(
      'register_gvg_guild',
      {
        p_guild_name:
          guild,

        p_contact:
          contact
      }
    );

  if (error) {
    throw error;
  }

  state.guild =
    Array.isArray(data)
      ? data[0]
      : data;

  await refreshGuildAuth();

  return state.guild;
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
      ?.value
      ?.trim() ||
    '';

  const contact =
    $('guild-register-contact')
      ?.value
      ?.trim() ||
    '';

  const email =
    $('guild-register-email')
      ?.value
      ?.trim() ||
    '';

  const password =
    $('guild-register-password')
      ?.value ||
    '';

  if (
    !guild ||
    !contact ||
    !email
  ) {
    showStatus(
      'guild-auth-status',
      'error',
      'Guild name, contact and email are required.'
    );

    return;
  }

  if (
    !state.user &&
    password.length < 8
  ) {
    showStatus(
      'guild-auth-status',
      'error',
      'Password must be at least 8 characters.'
    );

    return;
  }

  try {

    /*
      EXISTING LOGGED-IN ACCOUNT:
      Register only the guild. Do NOT call signUp again.
    */

    if (state.user) {
      const currentEmail =
        String(
          state.user.email ||
          ''
        )
          .trim()
          .toLowerCase();

      if (
        currentEmail !==
        email.toLowerCase()
      ) {
        throw new Error(
          'Registration email must match the currently logged-in account.'
        );
      }

      if (state.guild) {
        showStatus(
          'guild-auth-status',
          'info',
          guildStatusText(
            state.guild
          )
        );

        return;
      }

      await registerGuildForCurrentUser(
        guild,
        contact
      );

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Your guild is now PENDING admin approval.'
      );

      return;
    }

    /*
      NOT LOGGED IN:
      First try login. If it works, register the guild.
    */

    const loginResult =
      await db.auth
        .signInWithPassword({
          email,
          password
        });

    if (
      !loginResult.error
    ) {
      await refreshGuildAuth();

      if (state.guild) {
        showStatus(
          'guild-auth-status',
          'info',
          guildStatusText(
            state.guild
          )
        );

        return;
      }

      await registerGuildForCurrentUser(
        guild,
        contact
      );

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Your guild is now PENDING admin approval.'
      );

      return;
    }

    /*
      NEW AUTH ACCOUNT:
      Create the Auth account.
    */

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
              'guild'
          }
        }
      });

    if (error) {
      const text =
        String(
          error.message ||
          ''
        );

      if (
        /already registered|already exists|user already/i.test(
          text
        )
      ) {
        throw new Error(
          'This email already has an account. Login with that email and password, then complete Guild Registration.'
        );
      }

      throw error;
    }

    /*
      No email confirmation:
      create the guild immediately.
    */

    if (data?.session) {
      await refreshGuildAuth();

      if (!state.guild) {
        await registerGuildForCurrentUser(
          guild,
          contact
        );
      }

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Your guild is now PENDING admin approval.'
      );

      return;
    }

    /*
      Email confirmation enabled.
    */

    showStatus(
      'guild-auth-status',
      'info',
      'Account created. Confirm your email, then login and complete Guild Registration. Admin approval is still required.'
    );

  } catch (error) {

    console.error(
      'Guild registration failed:',
      error
    );

    showStatus(
      'guild-auth-status',
      'error',
      humanizeDbError(
        error
      )
    );

  } finally {

    syncRegistrationForm();
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */

async function handleGuildLogout() {

  try {

    const {
      error
    } =
      await db.auth.signOut();

    if (error) {
      throw error;
    }

  } catch (error) {

    console.error(
      'Logout failed:',
      error
    );
  }

  state.user = null;
  state.guild = null;
  state.admin = null;

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

/* ============================================================
   PUBLIC CHALLENGES
   ============================================================ */

function mapChallengeRow(
  row
) {
  const guildName =
    row.guild_name_normalized ||
    'Unknown Guild';

  const rawContact =
    row.contact_normalized ||
    row.contact_number ||
    '';

  return {

    id:
      row.id,

    challenge_code:
      row.challenge_code ||
      '',

    challenger_leader_id:
      row.challenger_leader_id ||
      null,

    challenger_guild_id:
      row.challenger_guild_id ||
      null,

    opponent_guild_id:
      row.opponent_guild_id ||
      null,

    challenge_everyone:
      row.challenge_everyone ??
      true,

    match_time:
      row.match_time ||
      null,

    weapons:
      Array.isArray(
        row.weapons
      )
        ? row.weapons
        : [],

    active_skills:
      Array.isArray(
        row.active_skills
      )
        ? row.active_skills
        : [],

    contact_number:
      row.contact_number ||
      '',

    contact_normalized:
      row.contact_normalized ||
      '',

    status:
      row.status ||
      'open',

    created_at:
      row.created_at ||
      null,

    accepted_by_leader_id:
      row.accepted_by_leader_id ||
      null,

    accepted_by_guild_id:
      row.accepted_by_guild_id ||
      null,

    accepted_at:
      row.accepted_at ||
      null,

    user_id:
      row.user_id ||
      null,

    guild_name_normalized:
      row.guild_name_normalized ||
      '',

    completed_at:
      row.completed_at ||
      null,

    /* UI aliases */

    guild_name:
      String(
        guildName
      ).toUpperCase(),

    challenge_time:
      row.match_time ||
      null,

    contact:
      formatContact(
        rawContact
      )
  };
}

function challengeMessage(
  challenge
) {
  const weapons =
    challenge.weapons.length
      ? challenge.weapons.join(
          ', '
        )
      : 'Not specified';

  const skills =
    challenge.active_skills.length
      ? challenge.active_skills.join(
          ', '
        )
      : 'None';

  return [
    '7TH UNIVERSE GVG',
    '',
    `Guild: ${challenge.guild_name}`,
    `Time: ${formatTime(
      challenge.challenge_time
    )}`,
    `Weapons: ${weapons}`,
    `Active Skills: ${skills}`,
    `Contact: ${challenge.contact}`
  ].join('\n');
}

function openWhatsApp(
  challengeId
) {
  const challenge =
    state.challenges.find(
      (item) =>
        item.id ===
        challengeId
    );

  if (!challenge) {
    return;
  }

  const number =
    normalizeContact(
      challenge.contact
    );

  if (!number) {
    alert(
      'No valid contact number is available.'
    );

    return;
  }

  const url =
    `https://wa.me/${number}` +
    `?text=${encodeURIComponent(
      challengeMessage(
        challenge
      )
    )}`;

  window.open(
    url,
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
        body: JSON.stringify({
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

function renderChallengeCard(
  challenge
) {
  const weapons =
    challenge.weapons.length
      ? challenge.weapons
          .map(
            (weapon) =>
              `
                <span class="pill">
                  ${escapeHtml(
                    weapon
                  )}
                </span>
              `
          )
          .join('')
      : `
          <span class="pill">
            Not specified
          </span>
        `;

  const skills =
    challenge.active_skills.length
      ? challenge.active_skills
          .map(
            (skill) =>
              `
                <span class="pill">
                  ${escapeHtml(
                    skill
                  )}
                </span>
              `
          )
          .join('')
      : `
          <span class="pill">
            None
          </span>
        `;

  return `
    <div
      class="card"
      data-challenge-id="${escapeHtml(
        challenge.id
      )}"
    >

      <div class="row">

        <div>

          <div class="challenge-name">
            ${escapeHtml(
              challenge.guild_name
            )}
          </div>

          <div class="challenge-meta">
            Open challenge • no date
          </div>

        </div>

        <span class="badge badge-open">
          OPEN
        </span>

      </div>

      <div
        style="
          margin-top:10px
        "
      >

        <span class="muted small">
          MATCH TIME
        </span>

        <div
          style="
            font-size:19px;
            font-weight:900;
            margin-top:2px
          "
        >
          ${escapeHtml(
            formatTime(
              challenge.challenge_time
            )
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
            normalizeContact(
              challenge.contact
            )
          )}"
        >
          ${escapeHtml(
            challenge.contact
          )}
        </a>

        <button
          class="btn btn-small js-whatsapp"
          type="button"
          data-id="${escapeHtml(
            challenge.id
          )}"
        >
          WhatsApp
        </button>

        <button
          class="btn btn-small btn-primary js-copy-number"
          type="button"
          data-id="${escapeHtml(
            challenge.id
          )}"
        >
          Copy Number
        </button>

      </div>

    </div>
  `;
}

function renderChallengeLists() {

  const firstSearch =
    $('challenge-search')
      ?.value
      ?.trim()
      .toLowerCase() ||
    '';

  const secondSearch =
    $('challenge-search-2')
      ?.value
      ?.trim()
      .toLowerCase() ||
    '';

  const search =
    firstSearch ||
    secondSearch;

  const filtered =
    state.challenges.filter(
      (challenge) => {

        const guild =
          String(
            challenge.guild_name ||
            ''
          ).toLowerCase();

        return (
          !search ||
          guild.includes(search)
        );
      }
    );

  const html =
    filtered.length
      ? filtered
          .map(
            renderChallengeCard
          )
          .join('')
      : `
          <div class="empty">
            No open challenges found.
          </div>
        `;

  if (
    $('home-challenge-list')
  ) {
    $('home-challenge-list')
      .innerHTML =
      html;
  }

  if (
    $('challenge-list')
  ) {
    $('challenge-list')
      .innerHTML =
      html;
  }
}

async function copyContact(
  value
) {
  const text =
    String(value || '');

  if (!text) {
    alert(
      'No contact number available.'
    );

    return;
  }

  try {

    await navigator
      .clipboard
      .writeText(
        text
      );

    alert(
      'Contact number copied.'
    );

  } catch (error) {

    console.warn(
      'Clipboard failed:',
      error
    );

    alert(text);
  }
}

window.copyText =
  copyContact;

/* ============================================================
   LOAD CHALLENGES
   ============================================================ */

async function loadChallenges() {

  try {

    const {
      data,
      error
    } =
      await db
        .from('challenges')
        .select(`
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
        `)
        .eq(
          'status',
          'open'
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
        .limit(100);

    if (error) {
      throw error;
    }

    state.challenges =
      (data || [])
        .map(
          mapChallengeRow
        );

    renderChallengeLists();

    fillResultChallenges();

    await updateStats();

  } catch (error) {

    console.error(
      'Challenge load failed:',
      error
    );

    if (
      $('challenge-list')
    ) {
      $('challenge-list')
        .innerHTML =
        `
          <div class="empty">
            Could not load challenges.
          </div>
        `;
    }

    if (
      $('home-challenge-list')
    ) {
      $('home-challenge-list')
        .innerHTML =
        `
          <div class="empty">
            Could not load challenges.
          </div>
        `;
    }
  }
}

/* ============================================================
   CHALLENGE SUBMISSION
   ============================================================ */

async function handleChallengeSubmit(
  event
) {

  event.preventDefault();

  clearStatus(
    'challenge-status'
  );

  if (!state.user) {

    showStatus(
      'challenge-status',
      'error',
      'Please login first.'
    );

    navigate(
      'auth',
      true
    );

    return;
  }

  if (
    !guildIsApproved()
  ) {

    showStatus(
      'challenge-status',
      'error',
      'Only an admin-approved, non-banned guild can post challenges.'
    );

    navigate(
      'auth',
      true
    );

    return;
  }

  if (
    !postingWindowOpen()
  ) {

    showStatus(
      'challenge-status',
      'error',
      'Challenges can only be posted from 10:00 AM until before 11:00 PM Pakistan time.'
    );

    return;
  }

  const weapons =
    selectedValues(
      '#weapon-options input'
    );

  const skills =
    selectedValues(
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
      `${invalidWeapon} is not an allowed weapon.`
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
      `${invalidSkill} is not an allowed skill.`
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
    } =
      await db.rpc(
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

    const returned =
      Array.isArray(data)
        ? data[0]
        : data;

    showStatus(
      'challenge-status',
      'ok',
      'Challenge submitted successfully.'
    );

    event.target.reset();

    initTimePicker();

    await loadChallenges();

    if (returned) {

      await notifyWhatsApp({
        ...returned,

        guild_name:
          String(
            returned.guild_name_normalized ||
            state.guild
              ?.guild_name ||
            'UNKNOWN GUILD'
          ).toUpperCase(),

        challenge_time:
          returned.match_time ||
          null,

        contact:
          formatContact(
            returned.contact_normalized ||
            returned.contact_number ||
            state.guild
              ?.contact ||
            ''
          )
      });
    }

  } catch (error) {

    console.error(
      'Challenge submit failed:',
      error
    );

    showStatus(
      'challenge-status',
      'error',
      humanizeDbError(
        error
      )
    );

  } finally {

    setButtonBusy(
      'challenge-submit',
      false,
      'Confirm Challenge'
    );
  }
}

/* ============================================================
   RESULTS
   ============================================================ */

async function loadResults() {

  try {

    const {
      data,
      error
    } =
      await db
        .from(
          'challenge_results'
        )
        .select(`
          id,
          challenge_id,
          winner_guild,
          loser_guild,
          score,
          image_urls,
          status,
          created_at
        `)
        .eq(
          'status',
          'approved'
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
        .limit(100);

    if (error) {
      throw error;
    }

    state.results =
      data || [];

    renderResults();

    await updateStats();

  } catch (error) {

    console.error(
      'Result load failed:',
      error
    );

    if (
      $('result-list')
    ) {
      $('result-list')
        .innerHTML =
        `
          <div class="empty">
            Could not load results.
          </div>
        `;
    }
  }
}

function renderResults() {

  if (!$('result-list')) {
    return;
  }

  const html =
    state.results.length

      ? state.results
          .map(
            (result) => {

              const images =
                Array.isArray(
                  result.image_urls
                )
                  ? result
                      .image_urls
                      .slice(0, 2)
                  : [];

              return `
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
                    images.length
                      ? `
                          <div class="image-grid">

                            ${images
                              .map(
                                (url) =>
                                  `
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
                              .join('')}

                          </div>
                        `
                      : ''
                  }

                </div>
              `;
            }
          )
          .join('')

      : `
          <div class="empty">
            No approved results yet.
          </div>
        `;

  $('result-list')
    .innerHTML =
    html;
}

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
        (challenge) =>
          `
            <option
              value="${escapeHtml(
                challenge.id
              )}"
            >
              ${escapeHtml(
                challenge.guild_name
              )}
              —
              ${escapeHtml(
                formatTime(
                  challenge.challenge_time
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

async function uploadResultImages(
  files
) {

  const selected =
    [...files].filter(
      Boolean
    );

  if (
    selected.length > 2
  ) {
    throw new Error(
      'IMAGE_LIMIT: Maximum 2 pictures are allowed per result.'
    );
  }

  if (!selected.length) {
    return [];
  }

  if (!state.user) {
    throw new Error(
      'LOGIN_REQUIRED: Login required.'
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
        'Each image must be 5 MB or smaller.'
      );
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (
      !allowedTypes.includes(
        file.type
      )
    ) {
      throw new Error(
        'Only JPG, PNG and WEBP images are allowed.'
      );
    }

    const extension =
      String(
        file.name
          .split('.')
          .pop() ||
        'jpg'
      ).toLowerCase();

    const path =
      `results/${state.user.id}/` +
      `${crypto.randomUUID()}.` +
      `${extension}`;

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

    if (
      data?.publicUrl
    ) {
      urls.push(
        data.publicUrl
      );
    }
  }

  return urls;
}

async function handleResultSubmit(
  event
) {

  event.preventDefault();

  clearStatus(
    'result-status'
  );

  if (
    !guildIsApproved()
  ) {

    showStatus(
      'result-status',
      'error',
      'Only an admin-approved, non-banned guild can submit results.'
    );

    navigate(
      'auth',
      true
    );

    return;
  }

  const challengeId =
    $('result-challenge')
      ?.value ||
    '';

  const winner =
    $('winner-guild')
      ?.value
      ?.trim() ||
    '';

  const loser =
    $('loser-guild')
      ?.value
      ?.trim() ||
    '';

  const score =
    $('score')
      ?.value
      ?.trim() ||
    '';

  const files = [
    $('result-image-1')
      ?.files?.[0],

    $('result-image-2')
      ?.files?.[0]
  ].filter(Boolean);

  if (!challengeId) {

    showStatus(
      'result-status',
      'error',
      'Select an open challenge.'
    );

    return;
  }

  if (
    !winner ||
    !loser ||
    !score
  ) {

    showStatus(
      'result-status',
      'error',
      'Winner guild, loser guild and score are required.'
    );

    return;
  }

  if (
    normalizeGuild(
      winner
    ) ===
    normalizeGuild(
      loser
    )
  ) {

    showStatus(
      'result-status',
      'error',
      'Winner and loser guilds must be different.'
    );

    return;
  }

  setButtonBusy(
    'result-submit',
    true
  );

  try {

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
      'Result submitted. It will be published after admin approval.'
    );

    event.target.reset();

    await loadChallenges();

    await loadResults();

  } catch (error) {

    console.error(
      'Result submit failed:',
      error
    );

    showStatus(
      'result-status',
      'error',
      humanizeDbError(
        error
      )
    );

  } finally {

    setButtonBusy(
      'result-submit',
      false,
      'Submit Result for Approval'
    );
  }
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
      Array.isArray(data)
        ? data[0] || {}
        : data || {};

    if (
      $('stat-open')
    ) {
      $('stat-open')
        .textContent =
        String(
          stats.open_challenges ??
          state.challenges.filter(
            (challenge) =>
              challenge.status ===
              'open'
          ).length ??
          0
        );
    }

    if (
      $('stat-results')
    ) {
      $('stat-results')
        .textContent =
        String(
          stats.today_result_submissions ??
          0
        );
    }

    if (
      $('stat-approved-results')
    ) {
      $('stat-approved-results')
        .textContent =
        String(
          stats.today_approved_results ??
          0
        );
    }

    if (
      $('stat-guilds')
    ) {
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
   ADMIN AUTH
   Current admins table:
   id
   admin_name
   is_active
   created_at
   ============================================================ */

async function isCurrentUserAdmin() {

  const {
    data: {
      user
    }
  } =
    await db.auth.getUser();

  if (!user) {
    state.admin = null;
    return false;
  }

  const {
    data,
    error
  } =
    await db
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

    console.warn(
      'Admin check failed:',
      error
    );

    state.admin = null;

    return false;
  }

  state.admin =
    data || null;

  return !!data;
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
      ?.value
      ?.trim() ||
    '';

  const password =
    $('admin-password')
      ?.value ||
    '';

  if (
    !email ||
    !password
  ) {
    showStatus(
      'admin-login-status',
      'error',
      'Email and password are required.'
    );

    return;
  }

  try {

    const {
      error
    } =
      await db.auth
        .signInWithPassword({
          email,
          password
        });

    if (error) {
      throw error;
    }

    const isAdmin =
      await isCurrentUserAdmin();

    if (!isAdmin) {

      await db.auth.signOut();

      state.user = null;
      state.guild = null;

      throw new Error(
        'This Auth account is not linked as an active 7TH UNIVERSE admin.'
      );
    }

    await refreshGuildAuth();
    await restoreAdmin();

    showStatus(
      'admin-login-status',
      'ok',
      'Admin login successful.'
    );

  } catch (error) {

    console.error(
      'Admin login failed:',
      error
    );

    showStatus(
      'admin-login-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function handleAdminLogout() {

  try {
    await db.auth.signOut();
  } catch (error) {
    console.error(
      'Admin logout failed:',
      error
    );
  }

  state.user = null;
  state.guild = null;
  state.admin = null;

  $('admin-login-panel')
    ?.classList.remove(
      'hidden'
    );

  $('admin-dashboard')
    ?.classList.add(
      'hidden'
    );

  applyAuthUI();
}

async function restoreAdmin() {

  const isAdmin =
    await isCurrentUserAdmin();

  $('admin-login-panel')
    ?.classList.toggle(
      'hidden',
      isAdmin
    );

  $('admin-dashboard')
    ?.classList.toggle(
      'hidden',
      !isAdmin
    );

  if (!isAdmin) {
    return;
  }

  const {
    data: {
      user
    }
  } =
    await db.auth.getUser();

  if (
    $('admin-user-label')
  ) {
    $('admin-user-label')
      .textContent =
      user?.email ||
      '';
  }

  await refreshAdmin();
}

async function refreshAdmin() {

  const isAdmin =
    await isCurrentUserAdmin();

  if (!isAdmin) {
    return;
  }

  await Promise.all([
    loadGuilds(),
    loadBlocks(),
    loadAdminResults(),
    loadAdminChallenges()
  ]);
}

/* ============================================================
   ADMIN GUILDS
   ============================================================ */

async function handleGuildSave(
  event
) {

  event.preventDefault();

  clearStatus(
    'admin-status'
  );

  try {

    const guild =
      $('reg-guild-name')
        ?.value
        ?.trim() ||
      '';

    const contact =
      $('reg-contact')
        ?.value
        ?.trim() ||
      '';

    const status =
      $('reg-status')
        ?.value ||
      'approved';

    const banUntil =
      $('reg-ban-until')
        ?.value
        ? new Date(
            $('reg-ban-until')
              .value
          ).toISOString()
        : null;

    const reason =
      $('reg-ban-reason')
        ?.value
        ?.trim() ||
      null;

    if (
      !guild ||
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

    if (error) {
      throw error;
    }

    event.target.reset();

    if (
      $('reg-status')
    ) {
      $('reg-status')
        .value =
        'approved';
    }

    showStatus(
      'admin-status',
      'ok',
      'Guild saved.'
    );

    await loadGuilds();

  } catch (error) {

    console.error(
      'Guild admin save failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
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
        .select(`
          id,
          user_id,
          guild_name,
          contact,
          approval_status,
          is_banned,
          ban_until,
          ban_reason,
          created_at,
          updated_at
        `)
        .order(
          'guild_name',
          {
            ascending:
              true
          }
        );

    if (error) {
      throw error;
    }

    state.guilds =
      data || [];

    if (
      !$('guild-table')
    ) {
      return;
    }

    $('guild-table')
      .innerHTML =
      state.guilds.length

        ? state.guilds
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

                        : '—'
                    }
                  </td>

                  <td>

                    <button
                      class="btn btn-small btn-success js-guild-ban"
                      type="button"
                      data-id="${escapeHtml(
                        guild.id
                      )}"
                    >
                      Ban
                    </button>

                    <button
                      class="btn btn-small btn-danger js-guild-remove"
                      type="button"
                      data-id="${escapeHtml(
                        guild.id
                      )}"
                    >
                      Remove
                    </button>

                  </td>

                </tr>
              `
            )
            .join('')

        : `
            <tr>
              <td colspan="4">
                No guilds.
              </td>
            </tr>
          `;

  } catch (error) {

    console.error(
      'Guild list load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function quickGuildBan(
  id
) {

  const input =
    prompt(
      'Enter ban end as YYYY-MM-DD HH:MM (Pakistan time), or leave blank for permanent:',
      ''
    );

  if (input === null) {
    return;
  }

  try {

    let iso = null;

    if (
      input.trim()
    ) {

      const date =
        new Date(
          input
            .trim()
            .replace(
              ' ',
              'T'
            ) +
          '+05:00'
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        throw new Error(
          'Invalid ban date/time.'
        );
      }

      iso =
        date.toISOString();
    }

    const {
      error
    } =
      await db.rpc(
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

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      iso
        ? 'Temporary ban applied.'
        : 'Permanent ban applied.'
    );

    await loadGuilds();
    await refreshGuildAuth();

  } catch (error) {

    console.error(
      'Ban failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function removeGuild(
  id
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
            id
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Guild removed from registry. It can register again later.'
    );

    await loadGuilds();
    await refreshGuildAuth();

  } catch (error) {

    console.error(
      'Guild removal failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

/* ============================================================
   ADMIN BLOCKS
   ============================================================ */

async function handleBlock(
  event
) {

  event.preventDefault();

  clearStatus(
    'admin-status'
  );

  try {

    const guild =
      $('block-guild')
        ?.value
        ?.trim() ||
      null;

    const contact =
      $('block-number')
        ?.value
        ?.trim() ||
      null;

    const until =
      $('block-until')
        ?.value
        ? new Date(
            $('block-until')
              .value
          ).toISOString()
        : null;

    const reason =
      $('block-reason')
        ?.value
        ?.trim() ||
      'Rule violation';

    if (
      !guild &&
      !contact
    ) {
      throw new Error(
        'Enter a guild name or a contact number.'
      );
    }

    const {
      error
    } =
      await db.rpc(
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

    if (error) {
      throw error;
    }

    event.target.reset();

    if (
      $('block-reason')
    ) {
      $('block-reason')
        .value =
        'Rule violation';
    }

    showStatus(
      'admin-status',
      'ok',
      'Block created.'
    );

    await loadBlocks();

  } catch (error) {

    console.error(
      'Block failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
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
        .from(
          'blocks'
        )
        .select(`
          id,
          guild_name,
          contact,
          blocked_until,
          reason,
          created_at
        `)
        .order(
          'created_at',
          {
            ascending:
              false
          }
        );

    if (error) {
      throw error;
    }

    state.blocks =
      data || [];

    if (
      !$('block-table')
    ) {
      return;
    }

    $('block-table')
      .innerHTML =
      state.blocks.length

        ? state.blocks
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
                      '—'
                    )}
                  </td>

                  <td>

                    <button
                      class="btn btn-small btn-success js-unblock"
                      type="button"
                      data-id="${escapeHtml(
                        block.id
                      )}"
                    >
                      Unblock
                    </button>

                  </td>

                </tr>
              `
            )
            .join('')

        : `
            <tr>
              <td colspan="4">
                No blocks.
              </td>
            </tr>
          `;

  } catch (error) {

    console.error(
      'Block list load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function unblock(
  id
) {

  try {

    const {
      error
    } =
      await db.rpc(
        'admin_delete_block',
        {
          p_block_id:
            id
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

    console.error(
      'Unblock failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

/* ============================================================
   ADMIN RESULTS
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

    if (
      !$('admin-result-table')
    ) {
      return;
    }

    $('admin-result-table')
      .innerHTML =
      state.adminResults.length

        ? state.adminResults
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
                        ? result
                            .image_urls
                            .length
                        : 0
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
                              class="btn btn-small btn-success js-approve-result"
                              type="button"
                              data-id="${escapeHtml(
                                result.id
                              )}"
                            >
                              Approve
                            </button>

                            <button
                              class="btn btn-small btn-danger js-reject-result"
                              type="button"
                              data-id="${escapeHtml(
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
            .join('')

        : `
            <tr>
              <td colspan="6">
                No result submissions.
              </td>
            </tr>
          `;

  } catch (error) {

    console.error(
      'Admin result load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function approveResult(
  id
) {

  try {

    const {
      error
    } =
      await db.rpc(
        'admin_approve_result',
        {
          p_result_id:
            id
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

    console.error(
      'Result approval failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function rejectResult(
  id
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
            id,

          p_reason:
            reason.trim() ||
            'Rejected by admin'
        }
      );

    if (error) {
      throw error;
    }

    showStatus(
      'admin-status',
      'ok',
      'Result rejected. The challenge is open again.'
    );

    await loadAdminResults();
    await loadChallenges();

  } catch (error) {

    console.error(
      'Result rejection failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

/* ============================================================
   ADMIN CHALLENGES
   ============================================================ */

async function loadAdminChallenges() {

  try {

    const {
      data,
      error
    } =
      await db
        .from(
          'challenges'
        )
        .select(`
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
        `)
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
        .limit(200);

    if (error) {
      throw error;
    }

    const rows =
      (data || [])
        .map(
          mapChallengeRow
        );

    if (
      !$('admin-challenge-table')
    ) {
      return;
    }

    $('admin-challenge-table')
      .innerHTML =
      rows.length

        ? rows
            .map(
              (challenge) => `
                <tr>

                  <td>
                    ${escapeHtml(
                      challenge.guild_name
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      formatTime(
                        challenge.challenge_time
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
                        challenge
                          .active_skills ||
                        []
                      ).join(', ') ||
                      'None'
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      challenge.status
                    )}
                  </td>

                  <td>

                    ${
                      challenge.status !==
                        'completed' &&
                      challenge.status !==
                        'cancelled'

                        ? `
                            <button
                              class="btn btn-small btn-danger js-cancel-challenge"
                              type="button"
                              data-id="${escapeHtml(
                                challenge.id
                              )}"
                            >
                              Cancel
                            </button>
                          `

                        : '—'
                    }

                  </td>

                </tr>
              `
            )
            .join('')

        : `
            <tr>
              <td colspan="6">
                No challenges.
              </td>
            </tr>
          `;

  } catch (error) {

    console.error(
      'Admin challenge load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
    );
  }
}

async function cancelChallenge(
  id
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
            id
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

    console.error(
      'Challenge cancellation failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(
        error
      )
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
    ].includes(page);

  if (
    protectedPage &&
    !guildIsApproved() &&
    !force
  ) {
    page = 'auth';
  }

  document
    .querySelectorAll(
      '.page'
    )
    .forEach(
      (section) => {
        section.classList.remove(
          'active'
        );
      }
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

  if (
    page === 'home'
  ) {
    loadChallenges();
  }

  if (
    page === 'challenge'
  ) {
    updateChallengeIdentity();
    loadChallenges();
  }

  if (
    page === 'results'
  ) {
    loadChallenges();
    loadResults();
  }

  if (
    page === 'admin'
  ) {
    restoreAdmin();
  }

  if (
    page === 'auth'
  ) {
    refreshGuildAuth();
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* ============================================================
   EVENT WIRING
   ============================================================ */

function wire() {

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
              element.dataset
                .pageLink
            );
          }
        );
      }
    );

  $('nav-logout')
    ?.addEventListener(
      'click',
      handleGuildLogout
    );

  $('challenge-form')
    ?.addEventListener(
      'submit',
      handleChallengeSubmit
    );

  $('result-form')
    ?.addEventListener(
      'submit',
      handleResultSubmit
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

  $('admin-login-form')
    ?.addEventListener(
      'submit',
      handleAdminLogin
    );

  $('admin-logout')
    ?.addEventListener(
      'click',
      handleAdminLogout
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

  /*
    Event delegation for dynamically generated buttons.
  */

  document.addEventListener(
    'click',
    (event) => {

      const whatsappButton =
        event.target.closest(
          '.js-whatsapp'
        );

      if (whatsappButton) {

        openWhatsApp(
          whatsappButton.dataset.id
        );

        return;
      }

      const copyButton =
        event.target.closest(
          '.js-copy-number'
        );

      if (copyButton) {

        const challenge =
          state.challenges.find(
            (item) =>
              item.id ===
              copyButton.dataset.id
          );

        if (challenge) {
          copyContact(
            challenge.contact
          );
        }

        return;
      }

      const banButton =
        event.target.closest(
          '.js-guild-ban'
        );

      if (banButton) {

        quickGuildBan(
          banButton.dataset.id
        );

        return;
      }

      const removeButton =
        event.target.closest(
          '.js-guild-remove'
        );

      if (removeButton) {

        removeGuild(
          removeButton.dataset.id
        );

        return;
      }

      const unblockButton =
        event.target.closest(
          '.js-unblock'
        );

      if (unblockButton) {

        unblock(
          unblockButton.dataset.id
        );

        return;
      }

      const approveButton =
        event.target.closest(
          '.js-approve-result'
        );

      if (approveButton) {

        approveResult(
          approveButton.dataset.id
        );

        return;
      }

      const rejectButton =
        event.target.closest(
          '.js-reject-result'
        );

      if (rejectButton) {

        rejectResult(
          rejectButton.dataset.id
        );

        return;
      }

      const cancelButton =
        event.target.closest(
          '.js-cancel-challenge'
        );

      if (cancelButton) {

        cancelChallenge(
          cancelButton.dataset.id
        );
      }
    }
  );
}

/* ============================================================
   GLOBAL FUNCTIONS
   ============================================================ */

window.navigate =
  navigate;

window.openWhatsApp =
  openWhatsApp;

window.copyText =
  copyContact;

window.approveResult =
  approveResult;

window.rejectResult =
  rejectResult;

window.cancelChallenge =
  cancelChallenge;

window.quickGuildBan =
  quickGuildBan;

window.removeGuild =
  removeGuild;

window.unblock =
  unblock;

/* ============================================================
   BOOT
   ============================================================ */

(async function boot() {

  try {

    initTimePicker();

    wire();

    db.auth.onAuthStateChange(
      () => {

        setTimeout(
          () => {
            refreshGuildAuth();
          },
          0
        );
      }
    );

    await refreshGuildAuth();

    await Promise.all([
      loadChallenges(),
      loadResults(),
      updateStats()
    ]);

    if (state.user) {
      await restoreAdmin();
    } else {

      $('admin-login-panel')
        ?.classList.remove(
          'hidden'
        );

      $('admin-dashboard')
        ?.classList.add(
          'hidden'
        );
    }

  } catch (error) {

    console.error(
      'Boot failed:',
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
