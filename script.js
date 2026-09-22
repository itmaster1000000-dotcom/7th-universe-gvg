"use strict";

const db = window.supabaseClient;


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function getSelectedSkills() {
  return Array.from(
    document.querySelectorAll(
      'input[name="skills"]:checked'
    )
  )
    .map(input => input.value.trim())
    .filter(Boolean);
}


function getSelectedWeapons() {
  return Array.from(
    document.querySelectorAll(
      'input[name="weapons"]:checked'
    )
  )
    .map(input => input.value.trim())
    .filter(Boolean);
}


function showMessage(element, message, type = "info") {
  if (!element) return;

  element.textContent = message;
  element.style.display = "block";
  element.className = "message " + type;
}


function hideMessage(element) {
  if (!element) return;

  element.textContent = "";
  element.style.display = "none";
}


async function ensureSession() {

  const {
    data: sessionData
  } = await db.auth.getSession();

  if (!sessionData.session) {

    const {
      error
    } = await db.auth.signInAnonymously();

    if (error) {
      throw error;
    }
  }
}


/* =========================================================
   REGISTER GUILD + LEADER
   ========================================================= */

async function registerGuild(event) {

  event.preventDefault();

  const message =
    document.getElementById(
      "registrationMessage"
    );

  const button =
    document.getElementById(
      "registerButton"
    );

  hideMessage(message);

  const guildName =
    document.getElementById(
      "registerGuildName"
    )?.value.trim();

  const leaderName =
    document.getElementById(
      "leaderName"
    )?.value.trim();

  const contact =
    document.getElementById(
      "registerContact"
    )?.value.trim();

  if (!guildName ||
      !leaderName ||
      !contact) {

    showMessage(
      message,
      "Please complete all registration fields.",
      "error"
    );

    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "REGISTERING...";
  }

  try {

    await ensureSession();

    const {
      data,
      error
    } = await db.rpc(
      "register_guild_leader",
      {
        p_guild_name: guildName,
        p_leader_name: leaderName,
        p_contact_number: contact
      }
    );

    if (error) {
      throw error;
    }

    localStorage.setItem(
      "7u_guild_name",
      guildName
    );

    localStorage.setItem(
      "7u_contact",
      contact
    );

    const guildInput =
      document.getElementById(
        "guildName"
      );

    const contactInput =
      document.getElementById(
        "contact"
      );

    if (guildInput) {
      guildInput.value = guildName;
    }

    if (contactInput) {
      contactInput.value = contact;
    }

    showMessage(
      message,
      data?.message ||
        "Registration submitted. Waiting for Admin approval.",
      "success"
    );

    document
      .getElementById(
        "registrationForm"
      )
      .reset();

  } catch (error) {

    console.error(
      "Registration error:",
      error
    );

    showMessage(
      message,
      error?.message ||
        "Registration failed.",
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "REGISTER GUILD";
    }
  }
}


/* =========================================================
   SUBMIT CHALLENGE
   ========================================================= */

async function submitChallenge(event) {

  event.preventDefault();

  const message =
    document.getElementById(
      "formMessage"
    );

  hideMessage(message);

  const guildName =
    document.getElementById(
      "guildName"
    )?.value.trim();

  const matchTime =
    document.getElementById(
      "matchTime"
    )?.value.trim();

  const contact =
    document.getElementById(
      "contact"
    )?.value.trim();

  const activeSkills =
    getSelectedSkills();

  const weapons =
    getSelectedWeapons();

  if (!guildName) {
    showMessage(
      message,
      "Please enter Guild Name.",
      "error"
    );
    return;
  }

  if (!matchTime) {
    showMessage(
      message,
      "Please select Match Time.",
      "error"
    );
    return;
  }

  if (!weapons.length) {
    showMessage(
      message,
      "Please select at least one weapon.",
      "error"
    );
    return;
  }

  if (!contact) {
    showMessage(
      message,
      "Please enter Contact Number.",
      "error"
    );
    return;
  }

  const button =
    document.getElementById(
      "confirmChallenge"
    );

  if (button) {
    button.disabled = true;
    button.textContent = "SUBMITTING...";
  }

  try {

    await ensureSession();

    const {
      data,
      error
    } = await db.rpc(
      "submit_gvg_challenge",
      {
        p_guild_name: guildName,
        p_match_time: matchTime,
        p_active_skills: activeSkills,
        p_weapons: weapons,
        p_contact_number: contact
      }
    );

    if (error) {
      throw error;
    }

    showMessage(
      message,
      `Challenge submitted successfully. Code: ${
        data?.challenge_code || "7U"
      }`,
      "success"
    );

    document.getElementById(
      "guildName"
    ).value = "";

    document.getElementById(
      "matchTime"
    ).value = "";

    document.getElementById(
      "contact"
    ).value = "";

    document
      .querySelectorAll(
        'input[name="skills"]'
      )
      .forEach(input => {
        input.checked = false;
      });

    document
      .querySelectorAll(
        'input[name="weapons"]'
      )
      .forEach(input => {
        input.checked = false;
      });

    await loadChallenges();

  } catch (error) {

    console.error(
      "Challenge error:",
      error
    );

    showMessage(
      message,
      error?.message ||
        "Challenge could not be submitted.",
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "CONFIRM CHALLENGE";
    }
  }
}


/* =========================================================
   ACCEPT CHALLENGE
   ========================================================= */

async function acceptChallenge(challengeId) {

  if (!challengeId) {
    return;
  }

  try {

    await ensureSession();

    const {
      data,
      error
    } = await db.rpc(
      "accept_gvg_challenge_v2",
      {
        p_challenge_id: challengeId
      }
    );

    if (error) {
      throw error;
    }

    alert(
      data?.message ||
        "Challenge accepted successfully."
    );

    await loadChallenges();

  } catch (error) {

    console.error(
      "Accept challenge error:",
      error
    );

    alert(
      error?.message ||
        "Challenge could not be accepted."
    );
  }
}


/* =========================================================
   LIVE CHALLENGES
   ========================================================= */

async function loadChallenges() {

  const list =
    document.getElementById(
      "challengeList"
    );

  if (!list || !db) {
    return;
  }

  list.innerHTML = `
    <div class="loading">
      Loading challenges...
    </div>
  `;

  try {

    const {
      data,
      error
    } = await db.rpc(
      "get_live_gvg_challenges"
    );

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

      const skills =
        Array.isArray(
          challenge.active_skills
        ) &&
        challenge.active_skills.length
          ? challenge.active_skills.join(", ")
          : "None";

      const weapons =
        Array.isArray(
          challenge.weapons
        ) &&
        challenge.weapons.length
          ? challenge.weapons.join(", ")
          : "None";

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "challenge-card";

      card.innerHTML = `

        <div class="challenge-card-header">

          <h3>
            ${escapeHtml(
              challenge.guild_name
            )}
          </h3>

          <span class="challenge-status">
            LIVE
          </span>

        </div>

        <div class="challenge-card-info">

          <p>
            <strong>Challenge:</strong>
            ${escapeHtml(
              challenge.challenge_code
            )}
          </p>

          <p>
            <strong>Time:</strong>
            ${escapeHtml(
              challenge.match_time
            )}
          </p>

          <p>
            <strong>Active Skills:</strong>
            ${escapeHtml(skills)}
          </p>

          <p>
            <strong>Weapons:</strong>
            ${escapeHtml(weapons)}
          </p>

          <p>
            <strong>Contact:</strong>
            ${escapeHtml(
              challenge.contact_number
            )}
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

        <button
          type="button"
          class="accept-challenge-btn"
          data-challenge-id="${escapeHtml(
            challenge.id
          )}"
        >
          ACCEPT CHALLENGE
        </button>

      `;

      list.appendChild(card);
    });


    /* Add click events */

    list
      .querySelectorAll(
        ".accept-challenge-btn"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            const challengeId =
              button.dataset.challengeId;

            button.disabled = true;

            button.textContent =
              "ACCEPTING...";

            await acceptChallenge(
              challengeId
            );

            button.disabled = false;

            button.textContent =
              "ACCEPT CHALLENGE";

          }
        );

      });


  } catch (error) {

    console.error(
      "Challenge loading error:",
      error
    );

    list.innerHTML = `
      <div class="empty-state">
        Challenges could not be loaded.
      </div>
    `;
  }
}


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

async function loginAdmin(event) {

  event.preventDefault();

  const email =
    document.getElementById(
      "adminEmail"
    )?.value.trim();

  const password =
    document.getElementById(
      "adminPassword"
    )?.value;

  const message =
    document.getElementById(
      "adminLoginMessage"
    );

  const button =
    document.getElementById(
      "adminLoginButton"
    );

  hideMessage(message);

  if (!email || !password) {

    showMessage(
      message,
      "Enter admin email and password.",
      "error"
    );

    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "LOGGING IN...";
  }

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

    await checkAdmin();

  } catch (error) {

    console.error(
      "Admin login error:",
      error
    );

    showMessage(
      message,
      error?.message ||
        "Admin login failed.",
      "error"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "LOGIN";
    }
  }
}


/* =========================================================
   CHECK ADMIN
   ========================================================= */

async function checkAdmin() {

  try {

    const {
      data,
      error
    } =
      await db.rpc(
        "get_admin_status"
      );

    if (error) {
      throw error;
    }

    if (data?.is_admin === true) {

      document.getElementById(
        "adminLoginSection"
      ).style.display = "none";

      document.getElementById(
        "adminPanel"
      ).style.display = "block";

      document.getElementById(
        "showAdminLogin"
      ).style.display = "none";

      document.getElementById(
        "adminName"
      ).textContent =
        data.admin_name ||
        "7TH UNIVERSE ADMIN";

      await loadPendingRegistrations();
    }

  } catch (error) {

    console.error(
      "Admin check error:",
      error
    );
  }
}


/* =========================================================
   PENDING REGISTRATIONS
   ========================================================= */

async function loadPendingRegistrations() {

  const box =
    document.getElementById(
      "pendingRegistrations"
    );

  if (!box) {
    return;
  }

  box.innerHTML = `
    <div class="loading">
      Loading...
    </div>
  `;

  try {

    const {
      data,
      error
    } =
      await db.rpc(
        "get_pending_registrations"
      );

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {

      box.innerHTML = `
        <div class="empty-state">
          No pending registrations.
        </div>
      `;

      return;
    }

    box.innerHTML = "";

    data.forEach(item => {

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "pending-card";

      card.innerHTML = `

        <h3>
          ${escapeHtml(
            item.guild_name
          )}
        </h3>

        <p>
          <strong>Leader:</strong>
          ${escapeHtml(
            item.leader_name
          )}
        </p>

        <p>
          <strong>Contact:</strong>
          ${escapeHtml(
            item.phone || "-"
          )}
        </p>

        <p>
          <strong>Status:</strong>
          ${escapeHtml(
            item.approval_status
          )}
        </p>

        <div class="admin-actions">

          <button
            class="approve-btn"
            data-leader-id="${escapeHtml(
              item.leader_id
            )}"
            data-status="approved"
          >
            APPROVE
          </button>

          <button
            class="reject-btn"
            data-leader-id="${escapeHtml(
              item.leader_id
            )}"
            data-status="rejected"
          >
            REJECT
          </button>

        </div>
      `;

      box.appendChild(card);
    });

    box
      .querySelectorAll(
        "[data-leader-id]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            await updateLeaderStatus(
              button.dataset.leaderId,
              button.dataset.status
            );

          }
        );

      });

  } catch (error) {

    console.error(
      "Pending registrations error:",
      error
    );

    box.innerHTML = `
      <div class="empty-state">
        Could not load registrations.
      </div>
    `;
  }
}


/* =========================================================
   UPDATE LEADER STATUS
   ========================================================= */

async function updateLeaderStatus(
  leaderId,
  status
) {

  const message =
    document.getElementById(
      "adminPanelMessage"
    );

  hideMessage(message);

  try {

    const {
      data,
      error
    } =
      await db.rpc(
        "set_leader_approval",
        {
          p_leader_id: leaderId,
          p_status: status
        }
      );

    if (error) {
      throw error;
    }

    showMessage(
      message,
      data?.message ||
        `Leader ${status} successfully.`,
      "success"
    );

    await loadPendingRegistrations();

  } catch (error) {

    console.error(error);

    showMessage(
      message,
      error?.message ||
        "Could not update leader.",
      "error"
    );
  }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logoutAdmin() {

  try {

    await db.auth.signOut();

    document.getElementById(
      "adminPanel"
    ).style.display = "none";

    document.getElementById(
      "showAdminLogin"
    ).style.display = "block";

    document.getElementById(
      "adminLoginSection"
    ).style.display = "none";

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );
  }
}


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    const registrationForm =
      document.getElementById(
        "registrationForm"
      );

    const challengeForm =
      document.getElementById(
        "challengeForm"
      );

    const adminLoginForm =
      document.getElementById(
        "adminLoginForm"
      );


    if (registrationForm) {

      registrationForm.addEventListener(
        "submit",
        registerGuild
      );

    }


    if (challengeForm) {

      challengeForm.addEventListener(
        "submit",
        submitChallenge
      );

    }


    if (adminLoginForm) {

      adminLoginForm.addEventListener(
        "submit",
        loginAdmin
      );

    }


    document
      .getElementById(
        "showAdminLogin"
      )
      ?.addEventListener(
        "click",
        () => {

          document.getElementById(
            "adminLoginSection"
          ).style.display = "block";

        }
      );


    document
      .getElementById(
        "adminLogout"
      )
      ?.addEventListener(
        "click",
        logoutAdmin
      );


    await loadChallenges();

    await checkAdmin();

  }
);
