"use strict";

/* =========================================================
   7TH UNIVERSE — GVG
   ========================================================= */

const db = window.supabaseClient;

const DAILY_LIMIT = 10;

/* =========================================================
   HELPERS
   ========================================================= */

function findElement(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
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
  const inputs = document.querySelectorAll(
    'input[name="skills"]:checked,' +
    'input[name="activeSkills"]:checked,' +
    'input[name="active_skills"]:checked'
  );

  return Array.from(inputs)
    .map(input =>
      (
        input.value ||
        input.dataset.skill ||
        input.getAttribute("aria-label") ||
        ""
      ).trim()
    )
    .filter(Boolean);
}

function showMessage(message, type = "info") {
  const box = getMessageBox();

  if (!box) {
    console.log(message);
    return;
  }

  box.textContent = message;
  box.style.display = "block";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   SUPABASE
   ========================================================= */

function checkSupabase() {
  if (!db) {
    showMessage(
      "Supabase connection is not available.",
      "error"
    );
    return false;
  }

  return true;
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
      "Challenge form fields are missing.",
      "error"
    );
    return;
  }

  const guildName = guildInput.value.trim();
  const matchTime = timeInput.value.trim();
  const contact = contactInput.value.trim();
  const activeSkills = getSelectedSkills();

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

  const button = findElement([
    "#confirmChallenge",
    "#confirmBtn",
    "#submitChallenge",
    'button[type="submit"]'
  ]);

  if (button) {
    button.disabled = true;
    button.dataset.oldText = button.textContent;
    button.textContent = "Submitting...";
  }

  try {
    const { data, error } = await db.rpc(
      "submit_gvg_challenge",
      {
        p_guild_name: guildName,
        p_match_time: matchTime,
        p_active_skills: activeSkills,
        p_contact_number: contact
      }
    );

    if (error) {
      throw error;
    }

    showMessage(
      `Challenge submitted successfully. Code: ${
        data?.challenge_code || "7U"
      }`,
      "success"
    );

    guildInput.value = "";
    timeInput.value = "";
    contactInput.value = "";

    document
      .querySelectorAll(
        'input[name="skills"],' +
        'input[name="activeSkills"],' +
        'input[name="active_skills"]'
      )
      .forEach(input => {
        input.checked = false;
      });

    await loadChallenges();

  } catch (error) {
    console.error(error);

    showMessage(
      error?.message ||
      "Challenge could not be submitted.",
      "error"
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        button.dataset.oldText || "Confirm";
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
    console.warn("Challenge list not found.");
    return;
  }

  list.innerHTML = `
    <div class="loading">
      Loading challenges...
    </div>
  `;

  try {
    const { data, error } = await db
      .from("challenges")
      .select(`
        id,
        challenge_code,
        match_time,
        active_skills,
        contact_number,
        status,
        created_at,
        guilds!challenges_challenger_guild_id_fkey (
          guild_name
        )
      `)
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          No live challenges available.
        </div>
      `;
      return;
    }

    list.innerHTML = "";

    data.forEach(challenge => {
      const card = document.createElement("div");

      const guildName =
        challenge.guilds?.guild_name ||
        "Unknown Guild";

      const skills =
        Array.isArray(challenge.active_skills) &&
        challenge.active_skills.length
          ? challenge.active_skills.join(", ")
          : "None";

      card.className = "challenge-card";

      card.innerHTML = `
        <div class="challenge-card-header">
          <h3>${escapeHtml(guildName)}</h3>

          <span class="challenge-status">
            LIVE
          </span>
        </div>

        <div class="challenge-card-info">

          <p>
            <strong>Challenge:</strong>
            ${escapeHtml(challenge.challenge_code)}
          </p>

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
            ${escapeHtml(challenge.contact_number)}
          </p>

        </div>

        <a
          class="challenge-contact-btn"
          href="tel:${encodeURIComponent(
            challenge.contact_number
          )}"
        >
          CONTACT GUILD
        </a>
      `;

      list.appendChild(card);
    });

  } catch (error) {
    console.error(error);

    list.innerHTML = `
      <div class="empty-state">
        Challenges could not be loaded.
      </div>
    `;
  }
}

/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    console.log(
      "7TH UNIVERSE GvG started."
    );

    if (!checkSupabase()) {
      return;
    }

    const form = getChallengeForm();

    if (form) {
      form.addEventListener(
        "submit",
        submitChallenge
      );
    } else {
      console.warn(
        "Challenge form not found."
      );
    }

    await loadChallenges();
  }
);
