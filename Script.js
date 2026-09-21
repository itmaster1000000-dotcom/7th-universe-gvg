/* =========================================================
   7TH UNIVERSE — GvG WEBSITE
   Main JavaScript
   ========================================================= */

"use strict";

/* =========================================================
   SUPABASE
   ========================================================= */

const db =
  window.supabaseClient ||
  (window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  window.supabase
    ? window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      )
    : null);

/* =========================================================
   BASIC SETTINGS
   ========================================================= */

const DAILY_LIMIT = 10;
const GUILD_COOLDOWN_MINUTES = 15;
const TIME_ZONE = "Asia/Karachi";

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

function findElement(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function getGuildInput() {
  return findElement([
    "#guildName",
    "#guild-name",
    "#guild_name",
    'input[name="guildName"]',
    'input[name="guild_name"]'
  ]);
}

function getTimeInput() {
  return findElement([
    "#matchTime",
    "#time",
    "#match-time",
    'input[name="time"]',
    'input[name="matchTime"]',
    'input[name="match_time"]'
  ]);
}

function getContactInput() {
  return findElement([
    "#contact",
    "#contactNumber",
    "#contact-number",
    'input[name="contact"]',
    'input[name="contactNumber"]',
    'input[name="contact_number"]'
  ]);
}

function getChallengeForm() {
  return findElement([
    "#challengeForm",
    "#gvgChallengeForm",
    "[data-challenge-form]"
  ]);
}

function getChallengeList() {
  return findElement([
    "#challengeList",
    "#challengesList",
    "#gvgChallengeList",
    "[data-challenge-list]"
  ]);
}

function getMessageBox() {
  return findElement([
    "#formMessage",
    "#message",
    "#statusMessage",
    "[data-form-message]"
  ]);
}

function getSelectedSkills() {
  const checked = document.querySelectorAll(
    'input[name="skills"]:checked, input[name="activeSkills"]:checked, input[name="active_skills"]:checked'
  );

  return Array.from(checked).map((input) => {
    return (
      input.value ||
      input.dataset.skill ||
      input.getAttribute("aria-label") ||
      ""
    ).trim();
  }).filter(Boolean);
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeContact(value) {
  return cleanText(value).replace(/[^\d+]/g, "");
}

function normalizeGuild(value) {
  return cleanText(value).replace(/\s+/g, " ");
}

function showMessage(message, type = "info") {
  const box = getMessageBox();

  if (!box) {
    console.log(`[${type}] ${message}`);
    return;
  }

  box.textContent = message;
  box.style.display = "block";

  box.dataset.type = type;
  box.classList.remove("success", "error", "info");
  box.classList.add(type);
}

function hideMessage() {
  const box = getMessageBox();
  if (box) {
    box.textContent = "";
    box.style.display = "none";
  }
}

function formatTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleString("en-PK", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getPakistanDayRange() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const day = `${values.year}-${values.month}-${values.day}`;

  const start = new Date(`${day}T00:00:00+05:00`);
  const end = new Date(`${day}T23:59:59.999+05:00`);

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

/* =========================================================
   SUPABASE CHECK
   ========================================================= */

function checkSupabase() {
  if (!db) {
    showMessage(
      "Supabase connection is not available. Check your Supabase configuration.",
      "error"
    );

    console.error(
      "Supabase client not found. Expected window.supabaseClient."
    );

    return false;
  }

  return true;
}

/* =========================================================
   BLOCK CHECK
   ========================================================= */

async function checkBlocked(guildName, contact) {
  if (!checkSupabase()) return true;

  const cleanGuild = normalizeGuild(guildName);
  const cleanContact = normalizeContact(contact);

  try {
    /* Check guild name */
    const guildResult = await db
      .from("blocked_guilds")
      .select("id,guild_name,contact,blocked_until")
      .eq("guild_name", cleanGuild)
      .limit(1);

    if (guildResult.error) {
      throw guildResult.error;
    }

    /* Check contact number */
    const contactResult = await db
      .from("blocked_guilds")
      .select("id,guild_name,contact,blocked_until")
      .eq("contact", cleanContact)
      .limit(1);

    if (contactResult.error) {
      throw contactResult.error;
    }

    const records = [
      ...(guildResult.data || []),
      ...(contactResult.data || [])
    ];

    const now = Date.now();

    for (const record of records) {
      if (!record.blocked_until) continue;

      const blockedUntil = new Date(record.blocked_until).getTime();

      if (blockedUntil > now) {
        showMessage(
          `This guild/account is blocked until ${formatTime(
            record.blocked_until
          )}.`,
          "error"
        );

        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Block check error:", error);

    /*
      We do not automatically allow submission when the
      block system cannot be checked.
    */
    showMessage(
      "Block status could not be checked. Please try again.",
      "error"
    );

    return true;
  }
}

/* =========================================================
   DAILY LIMIT CHECK
   ========================================================= */

async function getTodayChallengeCount() {
  if (!checkSupabase()) return DAILY_LIMIT;

  const { start, end } = getPakistanDayRange();

  const result = await db
    .from("challenges")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lte("created_at", end);

  if (result.error) {
    console.error("Daily count error:", result.error);
    throw result.error;
  }

  return result.count || 0;
}

/* =========================================================
   GUILD 15 MINUTE COOLDOWN
   ========================================================= */

async function checkGuildCooldown(guildName) {
  const cleanGuild = normalizeGuild(guildName);

  const result = await db
    .from("challenges")
    .select("id,guild_name,created_at")
    .eq("guild_name", cleanGuild)
    .order("created_at", { ascending: false })
    .limit(1);

  if (result.error) {
    console.error("Cooldown check error:", result.error);
    throw result.error;
  }

  const latest = result.data?.[0];

  if (!latest) {
    return {
      blocked: false,
      remainingMinutes: 0
    };
  }

  const createdAt = new Date(latest.created_at).getTime();
  const now = Date.now();

  const elapsed = now - createdAt;
  const cooldown = GUILD_COOLDOWN_MINUTES * 60 * 1000;

  if (elapsed < cooldown) {
    const remainingMs = cooldown - elapsed;
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    return {
      blocked: true,
      remainingMinutes
    };
  }

  return {
    blocked: false,
    remainingMinutes: 0
  };
}

/* =========================================================
   SUBMIT CHALLENGE
   ========================================================= */

async function submitChallenge(event) {
  event.preventDefault();

  hideMessage();

  if (!checkSupabase()) return;

  const guildInput = getGuildInput();
  const timeInput = getTimeInput();
  const contactInput = getContactInput();

  if (!guildInput || !timeInput || !contactInput) {
    showMessage(
      "Some form fields could not be found. Check the HTML field IDs.",
      "error"
    );
    return;
  }

  const guildName = normalizeGuild(guildInput.value);
  const matchTime = cleanText(timeInput.value);
  const contact = normalizeContact(contactInput.value);
  const activeSkills = getSelectedSkills();

  /* =======================================================
     VALIDATION
     ======================================================= */

  if (!guildName) {
    showMessage("Please enter Guild Name.", "error");
    guildInput.focus();
    return;
  }

  if (!matchTime) {
    showMessage("Please select Match Time.", "error");
    timeInput.focus();
    return;
  }

  if (!contact) {
    showMessage("Please enter Contact Number.", "error");
    contactInput.focus();
    return;
  }

  /*
    Active skills can be:
    NONE
    ONE
    ALL
  */

  if (activeSkills.length > 3) {
    showMessage("Maximum 3 active skills can be selected.", "error");
    return;
  }

  /* =======================================================
     BLOCK CHECK
     ======================================================= */

  const isBlocked = await checkBlocked(guildName, contact);

  if (isBlocked) {
    return;
  }

  /* =======================================================
     DAILY 10 CHALLENGES
     ======================================================= */

  try {
    const todayCount = await getTodayChallengeCount();

    if (todayCount >= DAILY_LIMIT) {
      showMessage(
        "Today's 10 challenge limit has already been reached.",
        "error"
      );
      return;
    }
  } catch (error) {
    showMessage(
      "Daily challenge limit could not be checked.",
      "error"
    );
    return;
  }

  /* =======================================================
     15 MINUTE GUILD COOLDOWN
     ======================================================= */

  try {
    const cooldown = await checkGuildCooldown(guildName);

    if (cooldown.blocked) {
      showMessage(
        `${guildName} must wait ${cooldown.remainingMinutes} minute(s) before giving another challenge.`,
        "error"
      );
      return;
    }
  } catch (error) {
    showMessage(
      "Guild cooldown could not be checked.",
      "error"
    );
    return;
  }

  /* =======================================================
     SUBMIT TO SUPABASE
     ======================================================= */

  const submitButton = findElement([
    "#confirmChallenge",
    "#confirmBtn",
    "#submitChallenge",
    'button[type="submit"]'
  ]);

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.dataset.oldText = submitButton.textContent;
    submitButton.textContent = "Submitting...";
  }

  try {
    const payload = {
      guild_name: guildName,
      match_time: matchTime,
      active_skills: activeSkills,
      contact: contact
    };

    const result = await db
      .from("challenges")
      .insert([payload])
      .select()
      .single();

    if (result.error) {
      throw result.error;
    }

    showMessage(
      "Challenge submitted successfully.",
      "success"
    );

    /* Clear form */
    if (guildInput) guildInput.value = "";
    if (timeInput) timeInput.value = "";
    if (contactInput) contactInput.value = "";

    document
      .querySelectorAll(
        'input[name="skills"], input[name="activeSkills"], input[name="active_skills"]'
      )
      .forEach((input) => {
        input.checked = false;
      });

    /* Refresh challenge list */
    await loadChallenges();

  } catch (error) {
    console.error("Challenge submission error:", error);

    showMessage(
      error.message || "Challenge could not be submitted.",
      "error"
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        submitButton.dataset.oldText || "Confirm";
    }
  }
}

/* =========================================================
   LOAD CHALLENGES
   ========================================================= */

async function loadChallenges() {
  if (!checkSupabase()) return;

  const list = getChallengeList();

  if (!list) {
    console.warn(
      "Challenge list container not found."
    );
    return;
  }

  list.innerHTML = `
    <div class="loading">
      Loading challenges...
    </div>
  `;

  try {
    const result = await db
      .from("challenges")
      .select(
        "id,guild_name,match_time,active_skills,contact,created_at,status"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (result.error) {
      throw result.error;
    }

    const challenges = result.data || [];

    if (challenges.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          No challenges available.
        </div>
      `;
      return;
    }

    list.innerHTML = "";

    challenges.forEach((challenge) => {
      const card = document.createElement("div");

      card.className = "challenge-card";

      const skills =
        Array.isArray(challenge.active_skills) &&
        challenge.active_skills.length
          ? challenge.active_skills.join(", ")
          : "None";

      card.innerHTML = `
        <div class="challenge-card-header">
          <h3>${escapeHtml(challenge.guild_name)}</h3>
          <span class="challenge-status">
            ${escapeHtml(challenge.status || "OPEN")}
          </span>
        </div>

        <div class="challenge-card-info">
          <p>
            <strong>Time:</strong>
            ${escapeHtml(challenge.match_time)}
          </p>

          <p>
            <strong>Active Skills:</strong>
            ${escapeHtml(skills)}
          </p>

          <p>
            <strong>Contact:</strong>
            ${escapeHtml(challenge.contact)}
          </p>

          <p>
            <strong>Posted:</strong>
            ${escapeHtml(formatTime(challenge.created_at))}
          </p>
        </div>

        <a
          class="challenge-contact-btn"
          href="tel:${encodeURIComponent(challenge.contact)}"
        >
          CONTACT GUILD
        </a>
      `;

      list.appendChild(card);
    });

  } catch (error) {
    console.error("Load challenges error:", error);

    list.innerHTML = `
      <div class="empty-state">
        Challenges could not be loaded.
      </div>
    `;
  }
}

/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   FORM EVENTS
   ========================================================= */

function initializeChallengeForm() {
  const form = getChallengeForm();

  if (!form) {
    console.warn(
      "Challenge form not found."
    );
    return;
  }

  form.addEventListener("submit", submitChallenge);
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  console.log("7TH UNIVERSE GvG system starting...");

  if (!checkSupabase()) {
    return;
  }

  initializeChallengeForm();

  await loadChallenges();

  console.log(
    "7TH UNIVERSE GvG system initialized successfully."
  );
});
