"use strict";

/* =========================================================
   7TH UNIVERSE — GVG
   ========================================================= */

const db = window.supabaseClient;


/* =========================================================
   HELPERS
   ========================================================= */

function findElement(selectors) {

  for (const selector of selectors) {

    const el =
      document.querySelector(selector);

    if (el) return el;
  }

  return null;
}


function getSelectedSkills() {

  const inputs =
    document.querySelectorAll(
      'input[name="skills"]:checked'
    );

  return Array.from(inputs)
    .map(input =>
      (input.value || "").trim()
    )
    .filter(Boolean);
}


function getSelectedWeapons() {

  const inputs =
    document.querySelectorAll(
      'input[name="weapons"]:checked'
    );

  return Array.from(inputs)
    .map(input =>
      (input.value || "").trim()
    )
    .filter(Boolean);
}


function showMessage(
  element,
  message,
  type = "info"
) {

  if (!element) return;

  element.textContent = message;

  element.style.display = "block";

  element.className =
    "message " + type;
}


function hideMessage(element) {

  if (!element) return;

  element.textContent = "";

  element.style.display = "none";
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
   REGISTRATION
   ========================================================= */

async function registerGuild(event) {

  event.preventDefault();


  const form =
    document.getElementById(
      "registrationForm"
    );

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


  if (!guildName) {

    showMessage(
      message,
      "Please enter Guild Name.",
      "error"
    );

    return;
  }


  if (!leaderName) {

    showMessage(
      message,
      "Please enter Leader Name.",
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


  if (!db) {

    showMessage(
      message,
      "Supabase is not connected.",
      "error"
    );

    return;
  }


  if (button) {

    button.disabled = true;

    button.textContent =
      "REGISTERING...";
  }


  try {

    /* Make sure user has an auth session */

    let {
      data: sessionData
    } = await db.auth.getSession();


    if (!sessionData.session) {

      const {
        data,
        error
      } =
        await db.auth.signInAnonymously();

      if (error) {
        throw error;
      }

      sessionData = data;
    }


    const {
      data,
      error
    } = await db.rpc(
      "register_guild_leader",
      {
        p_guild_name:
          guildName,

        p_leader_name:
          leaderName,

        p_contact_number:
          contact
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


    const challengeGuild =
      document.getElementById(
        "guildName"
      );

    const challengeContact =
      document.getElementById(
        "contact"
      );


    if (challengeGuild) {
      challengeGuild.value =
        guildName;
    }

    if (challengeContact) {
      challengeContact.value =
        contact;
    }


    showMessage(
      message,
      data?.message ||
      "Registration submitted successfully. Waiting for Admin approval.",
      "success"
    );


    form.reset();


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

      button.textContent =
        "REGISTER GUILD";

    }

  }

}


/* =========================================================
   CHALLENGE SUBMISSION
   ========================================================= */

async function submitChallenge(event) {

  event.preventDefault();


  const message =
    document.getElementById(
      "formMessage"
    );


  hideMessage(message);


  if (!db) {

    showMessage(
      message,
      "Supabase is not connected.",
      "error"
    );

    return;
  }


  const guildInput =
    document.getElementById(
      "guildName"
    );

  const timeInput =
    document.getElementById(
      "matchTime"
    );

  const contactInput =
    document.getElementById(
      "contact"
    );


  const guildName =
    guildInput?.value.trim();

  const matchTime =
    timeInput?.value.trim();

  const contact =
    contactInput?.value.trim();


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

    button.textContent =
      "SUBMITTING...";

  }


  try {

    let {
      data: sessionData
    } = await db.auth.getSession();


    if (!sessionData.session) {

      const {
        error
      } =
        await db.auth.signInAnonymously();

      if (error) {
        throw error;
      }
    }


    const {
      data,
      error
    } = await db.rpc(
      "submit_gvg_challenge",
      {
        p_guild_name:
          guildName,

        p_match_time:
          matchTime,

        p_active_skills:
          activeSkills,

        p_weapons:
          weapons,

        p_contact_number:
          contact
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


    guildInput.value = "";
    timeInput.value = "";
    contactInput.value = "";


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
      "Challenge submission error:",
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

      button.textContent =
        "CONFIRM CHALLENGE";

    }

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


  if (!list || !db) return;


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

      const card =
        document.createElement(
          "div"
        );


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

      `;


      list.appendChild(card);

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


    /* Restore previously entered guild/contact */

    const savedGuild =
      localStorage.getItem(
        "7u_guild_name"
      );

    const savedContact =
      localStorage.getItem(
        "7u_contact"
      );


    if (savedGuild) {

      const input =
        document.getElementById(
          "guildName"
        );

      if (input) {
        input.value =
          savedGuild;
      }

    }


    if (savedContact) {

      const input =
        document.getElementById(
          "contact"
        );

      if (input) {
        input.value =
          savedContact;
      }

    }


    await loadChallenges();


    setInterval(
      loadChallenges,
      15000
    );

  }
);
