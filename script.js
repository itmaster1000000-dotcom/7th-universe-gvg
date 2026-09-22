/*
  7TH UNIVERSE GVG
  Frontend for current index.html + current Supabase schema.

  IMPORTANT:
  1) ONLY use Supabase Project URL + publishable/anon key here.
  2) NEVER put a service_role / secret key in this file.
  3) Existing logged-in Auth users can register a guild.
*/

const SUPABASE_URL =
  'https://ypnpeiglbiycbexpeibb.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'PASTE_YOUR_SUPABASE_PROJECT_PUBLISHABLE_OR_ANON_KEY_HERE';

const WHATSAPP_NOTIFY_ENDPOINT = '';

const { createClient } = window.supabase;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const TZ = 'Asia/Karachi';

const WEAPONS = [
  'Desert',
  'M1887',
  'M1887X',
  'M1014',
  'Woodpecker'
];

const SKILLS = [
  'DJ Alok',
  'Tatsuya',
  'Koda'
];

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

const $ = (id) =>
  document.getElementById(id);

/* ============================================================
   GENERAL HELPERS
   ============================================================ */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeContact(raw) {
  let n = String(raw || '')
    .replace(/\D/g, '');

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

function displayGuildName(raw) {
  const value = String(raw || '').trim();

  if (!value) {
    return 'Unknown Guild';
  }

  return value.toUpperCase();
}

function waNumber(raw) {
  return normalizeContact(raw);
}

function formatTime(value) {
  if (!value) {
    return '--:--';
  }

  const parts =
    String(value).split(':');

  const hour24 =
    Number(parts[0] || 0);

  const minute =
    String(parts[1] || '00');

  const hour12 =
    hour24 % 12 || 12;

  const suffix =
    hour24 >= 12 ? 'PM' : 'AM';

  return `${hour12}:${minute} ${suffix}`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat(
      'en-PK',
      {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: TZ
      }
    ).format(new Date(value));
  } catch {
    return String(value);
  }
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
    message;
}

function clearStatus(id) {
  const el = $(id);

  if (!el) {
    return;
  }

  el.className = 'status';
  el.textContent = '';
}

function currentPakistanParts() {
  const formatter =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone: TZ,
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
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function postingWindowOpen() {
  const {
    hour,
    minute
  } = currentPakistanParts();

  const totalMinutes =
    hour * 60 + minute;

  return (
    totalMinutes >= 600 &&
    totalMinutes < 1380
  );
}

function selectedValues(selector) {
  return [
    ...document.querySelectorAll(
      `${selector}:checked`
    )
  ].map(
    (input) => input.value
  );
}

function setButtonBusy(
  id,
  busy,
  text
) {
  const button = $(id);

  if (!button) {
    return;
  }

  button.disabled = busy;

  if (busy) {
    button.dataset.oldText =
      button.textContent;

    button.innerHTML =
      '<span class="loader"></span>';
  } else {
    button.textContent =
      text ||
      button.dataset.oldText ||
      'Submit';
  }
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

  if (!hour || !minute || !ampm) {
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
      .padStart(
        2,
        '0'
      );

  ampm.value =
    now.hour >= 12
      ? 'PM'
      : 'AM';
}

function getTime24() {
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
   CHALLENGE DISPLAY
   ============================================================ */

function challengeMessage(challenge) {
  const weapons =
    Array.isArray(
      challenge.weapons
    ) &&
    challenge.weapons.length
      ? challenge.weapons.join(', ')
      : 'Not specified';

  const skills =
    Array.isArray(
      challenge.active_skills
    ) &&
    challenge.active_skills.length
      ? challenge.active_skills.join(', ')
      : 'None';

  return [
    '7TH UNIVERSE GVG',
    '',
    `Guild: ${
      challenge.guild_name ||
      'Unknown Guild'
    }`,
    `Time: ${
      formatTime(
        challenge.challenge_time
      )
    }`,
    `Weapons: ${weapons}`,
    `Active Skills: ${skills}`,
    `Contact: ${
      challenge.contact ||
      'Not available'
    }`
  ].join('\n');
}

function openWhatsApp(challenge) {
  const number =
    waNumber(
      challenge?.contact
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
      challengeMessage(challenge)
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
  if (!WHATSAPP_NOTIFY_ENDPOINT) {
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
          type: 'new_challenge',
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
    Array.isArray(
      challenge.weapons
    ) &&
    challenge.weapons.length
      ? challenge.weapons
          .map(
            (weapon) =>
              `<span class="pill">${escapeHtml(
                weapon
              )}</span>`
          )
          .join('')
      : `
          <span class="pill">
            Not specified
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
              `<span class="pill">${escapeHtml(
                skill
              )}</span>`
          )
          .join('')
      : `
          <span class="pill">
            None
          </span>
        `;

  const safeChallenge =
    JSON.stringify(
      challenge
    )
      .replace(
        /\\/g,
        '\\\\'
      )
      .replace(
        /'/g,
        '&#039;'
      );

  return `
    <div class="card">

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

      <div style="margin-top:10px">

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
            waNumber(
              challenge.contact
            )
          )}"
        >
          ${escapeHtml(
            challenge.contact
          )}
        </a>

        <button
          class="btn btn-small"
          onclick='openWhatsApp(
            ${safeChallenge}
          )'
        >
          WhatsApp
        </button>

        <button
          class="btn btn-small btn-primary"
          onclick='copyText(
            ${JSON.stringify(
              String(
                challenge.contact ||
                ''
              )
            )}
          )'
        >
          Copy Number
        </button>

      </div>

    </div>
  `;
}

function renderChallengeLists() {
  const searchA =
    $('challenge-search')
      ?.value
      ?.trim()
      .toLowerCase() ||
    '';

  const searchB =
    $('challenge-search-2')
      ?.value
      ?.trim()
      .toLowerCase() ||
    '';

  const search =
    searchA || searchB;

  const list =
    state.challenges.filter(
      (challenge) => {
        const name =
          String(
            challenge.guild_name ||
            ''
          ).toLowerCase();

        return (
          !search ||
          name.includes(search)
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

  if (
    $('home-challenge-list')
  ) {
    $('home-challenge-list')
      .innerHTML = html;
  }

  if (
    $('challenge-list')
  ) {
    $('challenge-list')
      .innerHTML = html;
  }
}

async function copyText(text) {
  const value =
    String(text || '');

  try {
    await navigator.clipboard
      .writeText(value);

    alert(
      'Contact number copied.'
    );
  } catch {
    alert(value);
  }
}

/* ============================================================
   CHALLENGE DATABASE MAPPING
   ============================================================ */

async function buildChallengeDisplayRows(
  rows
) {
  const sourceRows =
    Array.isArray(rows)
      ? rows
      : [];

  const guildIds =
    [
      ...new Set(
        sourceRows
          .map(
            (row) =>
              row.challenger_guild_id
          )
          .filter(Boolean)
      )
    ];

  const guildMap =
    new Map();

  if (guildIds.length) {
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
            guild_name,
            contact,
            approval_status,
            is_banned,
            ban_until
          `
        )
        .in(
          'id',
          guildIds
        );

    if (
      !error &&
      Array.isArray(data)
    ) {
      for (
        const guild of data
      ) {
        guildMap.set(
          guild.id,
          guild
        );
      }
    }
  }

  return sourceRows.map(
    (row) => {
      const registryGuild =
        row.challenger_guild_id
          ? guildMap.get(
              row.challenger_guild_id
            )
          : null;

      const fallbackName =
        row.guild_name_normalized
          ? displayGuildName(
              row.guild_name_normalized
            )
          : 'Unknown Guild';

      const fallbackContact =
        row.contact_number ||
        row.contact_normalized ||
        registryGuild?.contact ||
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

        contact_normalized:
          row.contact_normalized ||
          '',

        completed_at:
          row.completed_at ||
          null,

        /* UI aliases */

        guild_name:
          registryGuild?.guild_name ||
          fallbackName,

        challenge_time:
          row.match_time ||
          null,

        contact:
          registryGuild?.contact ||
          fallbackContact

      };
    }
  );
}

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
        .from(
          'challenges'
        )
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
            ascending:
              false
          }
        )
        .limit(100);

    if (error) {
      throw error;
    }

    state.challenges =
      await buildChallengeDisplayRows(
        data || []
      );

    renderChallengeLists();

    fillResultChallenges();

    updateStats();

  } catch (error) {

    console.error(
      'Challenge load failed:',
      error
    );

    state.challenges = [];

    if (
      $('challenge-list')
    ) {
      $('challenge-list')
        .innerHTML = `
          <div class="empty">
            Could not load challenges.
          </div>
        `;
    }

    if (
      $('home-challenge-list')
    ) {
      $('home-challenge-list')
        .innerHTML = `
          <div class="empty">
            Could not load challenges.
          </div>
        `;
    }
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
        .select(
          `
            id,
            challenge_id,
            winner_guild,
            loser_guild,
            score,
            image_urls,
            status,
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

    updateStats();

  } catch (error) {

    console.error(
      'Result load failed:',
      error
    );

    if (
      $('result-list')
    ) {
      $('result-list')
        .innerHTML = `
          <div class="empty">
            Could not load results.
          </div>
        `;
    }
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

  ${result.image_urls
    .slice(0, 2)
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
    .join('')}

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

if (
  $('result-list')
) {
  $('result-list')
    .innerHTML = html;
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
      data?.[0] || {};

    if (
      $('stat-open')
    ) {
      $('stat-open')
        .textContent =
        String(
          stats.open_challenges ??
          state.challenges.length ??
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
   GUILD STATUS
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
    (
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
    (
      guild.ban_until &&
      new Date(
        guild.ban_until
      ) > new Date()
    );

  if (banned) {

    return guild.ban_until

      ? `BANNED until ${
          formatDateTime(
            guild.ban_until
          )
        }.`

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

      password.placeholder =
        'Password not required when already logged in';

    }

  } else {

    email.readOnly =
      false;

    if (password) {

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

  if (
    $('nav-auth')
  ) {
    $('nav-auth')
      .classList.toggle(
        'hidden',
        !!state.user
      );
  }

  if (
    $('nav-logout')
  ) {
    $('nav-logout')
      .classList.toggle(
        'hidden',
        !state.user
      );
  }

  if (
    $('guild-account-card')
  ) {
    $('guild-account-card')
      .classList.toggle(
        'hidden',
        !state.user
      );
  }

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
            ''
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

/* ============================================================
   LOAD MY GUILD
   ============================================================ */

async function loadMyGuild() {

  state.guild = null;

  if (!state.user) {
    syncRegistrationForm();
    return null;
  }

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
          contact,
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

/* ============================================================
   REFRESH AUTH
   ============================================================ */

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
      ?.trim();

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

      syncRegistrationForm();

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
      error.message ||
        'Login failed.'
    );
  }
}

/* ============================================================
   GUILD REGISTRATION
   ============================================================ */

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
      ?.trim();

  const contact =
    $('guild-register-contact')
      ?.value
      ?.trim();

  const email =
    $('guild-register-email')
      ?.value
      ?.trim();

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

    /* --------------------------------------------------------
       ALREADY LOGGED IN
       -------------------------------------------------------- */

    if (state.user) {

      const loggedInEmail =
        String(
          state.user.email ||
          ''
        )
          .trim()
          .toLowerCase();

      if (
        loggedInEmail !==
        email.toLowerCase()
      ) {

        showStatus(
          'guild-auth-status',
          'error',
          'Registration email must match the currently logged-in account.'
        );

        return;
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

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Your guild is now PENDING admin approval.'
      );

      return;
    }

    /* --------------------------------------------------------
       NOT LOGGED IN:
       TRY LOGIN FIRST
       -------------------------------------------------------- */

    let existingLogin =
      null;

    try {

      existingLogin =
        await db.auth
          .signInWithPassword({
            email,
            password
          });

    } catch {

      existingLogin =
        null;
    }

    if (
      existingLogin &&
      !existingLogin.error
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

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Your guild is now PENDING admin approval.'
      );

      return;
    }

    /* --------------------------------------------------------
       NEW ACCOUNT
       -------------------------------------------------------- */

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

      const message =
        String(
          error.message ||
          ''
        );

      if (
        /already registered|already exists|user already|email.*exists/i.test(
          message
        )
      ) {

        throw new Error(
          'This email already has an account. Login first, then complete Guild Registration.'
        );
      }

      throw error;
    }

    if (data?.session) {

      await refreshGuildAuth();

      if (!state.guild) {

        const {
          data: guildData,
          error: guildError
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

        if (guildError) {
          throw guildError;
        }

        state.guild =
          Array.isArray(
            guildData
          )
            ? guildData[0]
            : guildData;

        await refreshGuildAuth();
      }

      showStatus(
        'guild-auth-status',
        'ok',
        'Guild registered successfully. Your guild is now PENDING admin approval.'
      );

      return;
    }

    showStatus(
      'guild-auth-status',
      'info',
      'Account created. Confirm your email, then login and complete Guild Registration.'
    );

  } catch (error) {

    console.error(
      'Guild registration failed:',
      error
    );

    showStatus(
      'guild-auth-status',
      'error',
      humanizeDbError(error)
    );
  }
}

/* ============================================================
   GUILD LOGOUT
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
   ADMIN AUTH
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
      .from(
        'admins'
      )
      .select(
        `
          id,
          admin_name,
          is_active,
          created_at
        `
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

async function restoreAdmin() {

  const isAdmin =
    await isCurrentUserAdmin();

  if (
    $('admin-login-panel')
  ) {

    $('admin-login-panel')
      .classList.toggle(
        'hidden',
        isAdmin
      );
  }

  if (
    $('admin-dashboard')
  ) {

    $('admin-dashboard')
      .classList.toggle(
        'hidden',
        !isAdmin
      );
  }

  if (isAdmin) {

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
      ?.trim();

  const password =
    $('admin-password')
      ?.value ||
    '';

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

      throw new Error(
        'This Auth account is not linked as an active 7TH UNIVERSE admin.'
      );
    }

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
      error.message ||
        'Admin login failed.'
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

  state.admin = null;
  state.user = null;
  state.guild = null;

  if (
    $('admin-login-panel')
  ) {

    $('admin-login-panel')
      .classList.remove(
        'hidden'
      );
  }

  if (
    $('admin-dashboard')
  ) {

    $('admin-dashboard')
      .classList.add(
        'hidden'
      );
  }

  if (
    $('guild-account-card')
  ) {

    $('guild-account-card')
      .classList.add(
        'hidden'
      );
  }
}

/* ============================================================
   ADMIN GUILD REGISTRY
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
        ?.trim();

    const contact =
      $('reg-contact')
        ?.value
        ?.trim();

    const status =
      $('reg-status')
        ?.value;

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
      humanizeDbError(error)
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
            contact,
            approval_status,
            is_banned,
            ban_until,
            ban_reason,
            created_at
          `
        )
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
      $('guild-table')
    ) {

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
                        class="btn btn-small btn-success"
                        onclick="quickGuildBan('${guild.id}')"
                      >
                        Ban
                      </button>

                      <button
                        class="btn btn-small btn-danger"
                        onclick="removeGuild('${guild.id}')"
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
    }

  } catch (error) {

    console.error(
      'Guild list load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      error.message ||
        'Guild load failed.'
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

      const parsed =
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

  } catch (error) {

    console.error(
      'Ban failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(error)
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

    if (
      state.guild?.id === id
    ) {

      state.guild =
        null;

      applyAuthUI();
    }

    await loadGuilds();

  } catch (error) {

    console.error(
      'Guild removal failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      humanizeDbError(error)
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
      humanizeDbError(error)
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
        .select(
          `
            id,
            guild_name,
            contact,
            blocked_until,
            reason,
            created_at
          `
        )
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
      $('block-table')
    ) {

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
                        class="btn btn-small btn-success"
                        onclick="unblock('${block.id}')"
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
    }

  } catch (error) {

    console.error(
      'Block list load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      error.message ||
        'Block load failed.'
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
      humanizeDbError(error)
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
      $('admin-result-table')
    ) {

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
                                class="btn btn-small btn-success"
                                onclick="approveResult('${result.id}')"
                              >
                                Approve
                              </button>

                              <button
                                class="btn btn-small btn-danger"
                                onclick="rejectResult('${result.id}')"
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
    }

  } catch (error) {

    console.error(
      'Admin result load failed:',
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
      humanizeDbError(error)
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
            reason
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
      humanizeDbError(error)
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
            ascending:
              false
          }
        )
        .limit(200);

    if (error) {
      throw error;
    }

    const rows =
      await buildChallengeDisplayRows(
        data || []
      );

    if (
      $('admin-challenge-table')
    ) {

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
                        'completed'

                          ? `
                              <button
                                class="btn btn-small btn-danger"
                                onclick="cancelChallenge('${challenge.id}')"
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
    }

  } catch (error) {

    console.error(
      'Admin challenge load failed:',
      error
    );

    showStatus(
      'admin-status',
      'error',
      error.message ||
        'Challenge load failed.'
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
      humanizeDbError(error)
    
    );
  }
}
  /* ============================================================
   REFRESH ADMIN
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
   CHALLENGE SUBMISSION
   ============================================================ */

async function handleChallengeSubmit(
  event
) {

  event.preventDefault();

  clearStatus(
    'challenge-status'
  );

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

  if (
    !guildIsApproved()
  ) {

    showStatus(
      'challenge-status',
      'error',
      'Only an admin-approved, non-banned guild account can post challenges.'
    );

    navigate(
      'auth',
      true
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

  if (
    !weapons.length
  ) {

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
        !WEAPONS.includes(
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
        !SKILLS.includes(
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
            getTime24(),

          p_weapons:
            weapons,

          p_active_skills:
            skills
        }
      );

    if (error) {
      throw error;
    }

    const challenge =
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

    const notifyChallenge =
      challenge
        ? {
            ...challenge,

            guild_name:
              state.guild
                ?.guild_name ||
              displayGuildName(
                challenge
                  .guild_name_normalized ||
                ''
              ),

            challenge_time:
              challenge.match_time ||
              null,

            contact:
              challenge.contact_number ||
              state.guild?.contact ||
              ''
          }

        : null;

    if (
      notifyChallenge
    ) {
      await notifyWhatsApp(
        notifyChallenge
      );
    }

  } catch (error) {

    console.error(
      'Challenge submit failed:',
      error
    );

    showStatus(
      'challenge-status',
      'error',
      humanizeDbError(error)
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
   RESULT IMAGE UPLOAD
   ============================================================ */

async function uploadResultImages(
  files
) {

  const selected =
    [...files].filter(Boolean);

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
      MAX_IMAGE_BYTES
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

    const uid =
      state.user?.id;

    if (!uid) {

      throw new Error(
        'LOGIN_REQUIRED: Please login to upload result pictures.'
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
      `results/${uid}/` +
      `${crypto.randomUUID()}.` +
      `${extension}`;

    const {
      error
    } =
      await db.storage
        .from(BUCKET)
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
        .from(BUCKET)
        .getPublicUrl(
          path
        );

    urls.push(
      data.publicUrl
    );
  }

  return urls;
}

/* ============================================================
   RESULT SUBMISSION
   ============================================================ */

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
      'Only an admin-approved, non-banned guild account can submit results.'
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
      ?.trim();

  const loser =
    $('loser-guild')
      ?.value
      ?.trim();

  const score =
    $('score')
      ?.value
      ?.trim();

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
    !loser
  ) {

    showStatus(
      'result-status',
      'error',
      'Winner guild and loser guild are required.'
    );

    return;
  }

  if (
    normalizeGuild(winner) ===
    normalizeGuild(loser)
  ) {

    showStatus(
      'result-status',
      'error',
      'Winner and loser guilds must be different.'
    );

    return;
  }

  if (!score) {

    showStatus(
      'result-status',
      'error',
      'Enter the result/score.'
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
      humanizeDbError(error)
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
   ERROR HANDLING
   ============================================================ */

function humanizeDbError(
  error
) {

  const message =
    String(
      error?.message ||
      error ||
      'Request failed.'
    );

  if (
    message.includes(
      'LOGIN_REQUIRED'
    )
  ) {
    return 'Please login to continue.';
  }

  if (
    message.includes(
      'ALREADY_REGISTERED'
    )
  ) {
    return (
      'This account already has a registered guild.'
    );
  }

  if (
    message.includes(
      'DUPLICATE_REGISTRATION'
    )
  ) {
    return (
      'This guild name or contact number is already registered.'
    );
  }

  if (
    message.includes(
      'INVALID_GUILD'
    )
  ) {
    return 'Invalid guild name.';
  }

  if (
    message.includes(
      'INVALID_CONTACT'
    )
  ) {
    return 'Invalid contact number.';
  }

  if (
    message.includes(
      'APPROVAL'
    )
  ) {
    return (
      'This guild is not approved yet.'
    );
  }

  if (
    message.includes(
      'BAN_ACTIVE'
    )
  ) {
    return (
      'This guild is currently banned.'
    );
  }

  if (
    message.includes(
      'BLOCKED'
    )
  ) {
    return (
      'This guild or contact number is currently blocked.'
    );
  }

  if (
    message.includes(
      'DAILY_CHALLENGE_LIMIT'
    )
  ) {
    return (
      'This guild has reached its 10-challenge daily limit.'
    );
  }

  if (
    message.includes(
      'COOLDOWN'
    )
  ) {
    return (
      'Please wait 15 minutes before posting another challenge.'
    );
  }

  if (
    message.includes(
      'TIME_WINDOW'
    )
  ) {
    return (
      'Challenge posting is open only from 10:00 AM to before 11:00 PM Pakistan time.'
    );
  }

  if (
    message.includes(
      'DAILY_RESULT_LIMIT'
    )
  ) {
    return (
      'This guild has reached the 5-result daily limit.'
    );
  }

  if (
    message.includes(
      'RESULT_EXISTS'
    )
  ) {
    return (
      'This challenge already has a result submission.'
    );
  }

  if (
    message.includes(
      'CHALLENGE_NOT_FOUND'
    )
  ) {
    return 'Challenge not found.';
  }

  if (
    message.includes(
      'GUILD_NOT_FOUND'
    )
  ) {
    return 'Guild not found.';
  }

  if (
    message.includes(
      'ADMIN_ONLY'
    )
  ) {
    return 'Admin access required.';
  }

  if (
    message.includes(
      'USER_ALREADY_EXISTS'
    )
  ) {
    return (
      'This email already has an account. Login first.'
    );
  }

  return message
    .replace(
      /^.*?P0001.*?:/s,
      ''
    )
    .trim() ||
    message;
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

  if (
    page === 'home'
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
}

/* ============================================================
   GLOBAL FUNCTIONS
   ============================================================ */

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

/* ============================================================
   BOOT
   ============================================================ */

(async function boot() {

  try {

    initTimePicker();

    wire();

    db.auth.onAuthStateChange(
      (_event, _session) => {

        setTimeout(
          () => {
            refreshGuildAuth();
          },
          0
        );
      }
    );

    await refreshGuildAuth();

    if (
      guildIsApproved()
    ) {

      await loadChallenges();

      await loadResults();
    }

    await updateStats();

    await restoreAdmin();

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

  
  
