(function mountSiteHeader() {
  const page = location.pathname.split("/").filter(Boolean).pop() || "index.html";
  const links = [
    ["index.html", "Signup"],
    ["videos.html", "Videos"],
    ["session.html", "Session"],
    ["discord.html", "Discord"],
    ["amba.html", "AMBA"],
    ["wg.html", "WG"],
    ["upload.html", "Uploads"],
    ["owlbear.html", "Owlbear"],
    ["questionnaire.html", "Questionnaire"],
    ["feedback.html", "Feedback"]
  ];

  document.querySelectorAll("header.site-header").forEach((node) => node.remove());

  const nav = links
    .map(([href, label]) => {
      const current = href === page ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}>${label}</a>`;
    })
    .join("") + `<a href="#privacy" id="navPrivacy">Privacy</a>`;

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="site-header-inner">
    <a class="brand" href="index.html">AMBA Adventure</a>
    <nav id="siteNav" aria-label="Main navigation">${nav}</nav>
    <div class="header-actions">
      <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="siteNav">Menu</button>
      <button class="admin-gate" id="openAdmin" type="button">+a</button>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to dark mode">
        <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M15.1 3.3a.8.8 0 0 1 1 .97 8.2 8.2 0 1 1-10.27 10.3.8.8 0 0 1 1.07-1 6.6 6.6 0 0 0 8.2-8.2.8.8 0 0 1 .97-1.07Z"/>
        </svg>
        <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0-5.2a.9.9 0 0 1 .9.9v1.6a.9.9 0 1 1-1.8 0V2.9A.9.9 0 0 1 12 2Zm0 16.4a.9.9 0 0 1 .9.9v1.6a.9.9 0 1 1-1.8 0v-1.6a.9.9 0 0 1 .9-.9Zm10-7.4a.9.9 0 0 1-.9.9h-1.6a.9.9 0 1 1 0-1.8h1.6a.9.9 0 0 1 .9.9ZM4.5 12a.9.9 0 0 1-.9.9H2a.9.9 0 1 1 0-1.8h1.6a.9.9 0 0 1 .9.9Zm14.4-6.9a.9.9 0 0 1 0 1.27l-1.13 1.13a.9.9 0 1 1-1.27-1.27L17.63 4a.9.9 0 0 1 1.27 0ZM6.5 16.63a.9.9 0 0 1 0 1.27l-1.13 1.13A.9.9 0 1 1 4.1 17.76l1.13-1.13a.9.9 0 0 1 1.27 0Zm11.13 1.27a.9.9 0 0 1-1.27 0l-1.13-1.13a.9.9 0 1 1 1.27-1.27l1.13 1.13a.9.9 0 0 1 0 1.27ZM6.5 5.1a.9.9 0 0 1 0 1.27L5.37 7.5A.9.9 0 1 1 4.1 6.23L5.23 5.1A.9.9 0 0 1 6.5 5.1Z"/>
        </svg>
      </button>
      <div class="account-menu">
        <button class="avatar-button" id="accountButton" type="button" aria-haspopup="menu" aria-expanded="false">
          <span id="accountInitials">?</span>
        </button>
        <div class="settings-menu" id="settingsMenu" role="menu" hidden>
          <p class="menu-identity">
            <span id="menuHandle">Not signed in</span>
            <small id="menuEmail">Log in by email</small>
          </p>
          <button type="button" id="menuLogin" role="menuitem">Log in</button>
          <button type="button" id="menuSettings" role="menuitem">Settings</button>
          <button type="button" id="menuTimezone" role="menuitem">Set time zone</button>
          <button type="button" id="menuProfile" role="menuitem">Profile</button>
          <button type="button" id="menuLogout" role="menuitem">Log out</button>
        </div>
      </div>
    </div>
    </div>
  `;
  document.body.prepend(header);

  const navToggle = header.querySelector("#navToggle");
  const siteNav = header.querySelector("#siteNav");
  function setNavOpen(open) {
    header.classList.toggle("nav-open", open);
    navToggle?.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("nav-drawer-open", open);
  }
  navToggle?.addEventListener("click", () => {
    setNavOpen(!header.classList.contains("nav-open"));
  });
  siteNav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNavOpen(false);
  });
  header.addEventListener("click", (event) => {
    if (event.target === header && header.classList.contains("nav-open")) setNavOpen(false);
  });

  const themeToggle = header.querySelector("#themeToggle");
  function syncThemeToggle() {
    const dark = document.documentElement.dataset.theme === "dark";
    themeToggle?.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }
  syncThemeToggle();
  themeToggle?.addEventListener("click", () => {
    window.toggleAmbaTheme?.();
    syncThemeToggle();
  });

  if (!document.querySelector("#privacyModal")) {
    document.body.insertAdjacentHTML("beforeend", `
    <dialog class="modal small-modal" id="privacyModal" aria-labelledby="privacyTitle">
      <button class="modal-close" id="closePrivacy" type="button" aria-label="Close privacy">x</button>
      <p class="eyebrow">Privacy</p>
      <h2 id="privacyTitle">We retain nothing</h2>
      <p class="modal-copy">This is a signup sheet, not a place that keeps your data. Email is only used to log you back in. Delete your profile in Settings and we wipe it: email, handle, votes, and the rest.</p>
    </dialog>`);
  }
  const privacyModal = document.querySelector("#privacyModal");
  function openPrivacy(event) {
    event?.preventDefault?.();
    setNavOpen(false);
    privacyModal?.showModal();
  }
  document.querySelector("#closePrivacy")?.addEventListener("click", () => privacyModal?.open && privacyModal.close());
  privacyModal?.addEventListener("click", (event) => {
    if (event.target === privacyModal) privacyModal.close();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest('a[href="#privacy"]')) return;
    openPrivacy(event);
  });

  let footer = document.querySelector("body > footer");
  if (!footer) {
    footer = document.createElement("footer");
    document.body.append(footer);
  }
  footer.innerHTML = `
    <p>A session signup sheet built to work with <a href="https://amba.unwhelm.online">AMBA</a>.</p>
    <p><a href="#privacy" id="footerPrivacy">Privacy</a>: we retain nothing.</p>
  `;
  if (location.hash === "#privacy") openPrivacy();

  if (document.querySelector("#loginModal")) return;

  const dialogs = document.createElement("div");
  dialogs.id = "shared-dialogs";
  dialogs.innerHTML = `
    <dialog class="modal" id="loginModal" aria-labelledby="loginTitle">
      <button class="modal-close" id="closeLogin" type="button" aria-label="Close login">x</button>
      <p class="eyebrow">Email login</p>
      <h2 id="loginTitle">Log in by email</h2>
      <p class="modal-copy">No password. Enter your email and we assign a handle, or restore the one already tied to that address. This site does not ask for AMBA, WG, Owlbear, Discord, or API-key credentials.</p>
      <form id="loginForm">
        <label>Email <input required type="email" name="email" autocomplete="email" placeholder="you@example.com"></label>
        <button class="button primary" type="submit">Get my handle</button>
        <p class="form-note" id="loginNote">Your public identity is the generated handle, not your email.</p>
      </form>
    </dialog>
    <dialog class="modal small-modal" id="profileModal" aria-labelledby="profileTitle">
      <button class="modal-close" id="closeProfile" type="button" aria-label="Close profile">x</button>
      <p class="eyebrow">Profile</p>
      <h2 id="profileTitle">Your session profile</h2>
      <dl class="profile-details">
        <dt>Handle</dt>
        <dd id="profileHandle">Not signed in</dd>
        <dt>Email</dt>
        <dd id="profileEmail">Not signed in</dd>
        <dt>Time zone</dt>
        <dd id="profileTimezone">Not set</dd>
        <dt>Discord user ID</dt>
        <dd id="profileDiscordUserId">Not set</dd>
        <dt>Reddit user ID</dt>
        <dd id="profileRedditUserId">Not set</dd>
      </dl>
      <p class="modal-copy">Your handle is used in the shared session sheet. Your email is private and used only to log back in.</p>
      <button class="button secondary" id="openTimezoneFromProfile" type="button">Set time zone</button>
      <form id="identityForm">
        <fieldset class="token-choice">
          <legend>Token color</legend>
          <input type="hidden" name="tokenColor" id="profileTokenColor" value="auto">
          <div class="token-swatch-row" role="radiogroup" aria-label="Token color">
            <button type="button" class="token-swatch-btn is-selected" data-token-value="auto" aria-checked="true" title="Auto">
              <span class="token-swatch token-swatch-auto"></span>
              Auto
            </button>
            <button type="button" class="token-swatch-btn" data-token-value="0" aria-checked="false" title="Teal"><span class="token-swatch" data-token="0"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="1" aria-checked="false" title="Rust"><span class="token-swatch" data-token="1"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="2" aria-checked="false" title="Blue"><span class="token-swatch" data-token="2"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="3" aria-checked="false" title="Plum"><span class="token-swatch" data-token="3"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="4" aria-checked="false" title="Olive"><span class="token-swatch" data-token="4"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="5" aria-checked="false" title="Slate"><span class="token-swatch" data-token="5"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="6" aria-checked="false" title="Wine"><span class="token-swatch" data-token="6"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="7" aria-checked="false" title="Brown"><span class="token-swatch" data-token="7"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="8" aria-checked="false" title="Indigo"><span class="token-swatch" data-token="8"></span></button>
            <button type="button" class="token-swatch-btn" data-token-value="9" aria-checked="false" title="Cyan"><span class="token-swatch" data-token="9"></span></button>
          </div>
        </fieldset>
        <p class="form-note">Picked colors stay yours. If two people pick the same fill, the first person on the page keeps it and the other gets the next free color.</p>
        <label>Discord handle <input name="discord" autocomplete="off" placeholder="Optional"></label>
        <label>Character status
          <select name="characterStatus">
            <option>I have two characters ready</option>
            <option>I have one character</option>
            <option>I am still making them</option>
            <option>I am not sure yet</option>
          </select>
        </label>
        <input type="hidden" id="generatedHandle" name="handle">
        <p class="form-actions">
          <button class="button primary" type="submit">Save profile</button>
          <button class="button secondary" id="closeProfileFooter" type="button">Close</button>
        </p>
      </form>
      <p class="form-note" id="profileNote"></p>
    </dialog>
    <dialog class="modal small-modal" id="settingsModal" aria-labelledby="settingsTitle">
      <button class="modal-close" id="closeSettings" type="button" aria-label="Close settings">x</button>
      <p class="eyebrow">Account</p>
      <h2 id="settingsTitle">Settings</h2>
      <nav class="settings-tabs" aria-label="Settings sections">
        <button type="button" class="settings-tab is-active" data-settings-tab="general" aria-current="page">General</button>
        <button type="button" class="settings-tab" data-settings-tab="comms">Comms</button>
        <button type="button" class="settings-tab" data-settings-tab="export">Export</button>
      </nav>
      <section class="settings-tab-panel" id="settingsPanelGeneral" data-settings-panel="general">
        <p class="modal-copy">Delete your profile if you want to leave AMBA Test. This cannot be undone.</p>
        <p class="form-note">All past data is deleted: your email, handle, and every other saved detail. Download a backup from Export first if you want to keep anything. If you rejoin later, you will get a different handle.</p>
        <p class="form-actions">
          <button class="button danger" id="deleteAccount" type="button">Delete profile</button>
        </p>
        <p class="form-note" id="settingsDeleteNote"></p>
      </section>
      <form id="settingsForm">
        <section class="settings-tab-panel" id="settingsPanelComms" data-settings-panel="comms" hidden>
          <p class="modal-copy">Email is from login and cannot be changed here. Optional Discord and Reddit IDs help us find you. Pick how you prefer to be reached.</p>
          <label>Email <input name="email" type="email" value="" readonly disabled autocomplete="off"></label>
          <label>Discord user ID <input name="discordUserId" inputmode="numeric" autocomplete="off" placeholder="17–19 digit ID"></label>
          <label>Reddit user ID <input name="redditUserId" autocomplete="off" placeholder="u/username or t2_…"></label>
          <fieldset class="comm-choice">
            <legend>Preferred contact</legend>
            <label><input type="radio" name="preferredComm" value="email"> Email</label>
            <label><input type="radio" name="preferredComm" value="discord"> Discord</label>
            <label><input type="radio" name="preferredComm" value="reddit"> Reddit</label>
          </fieldset>
          <label># of players desired
            <input name="desiredPlayers" type="number" min="1" max="12" step="1" value="4">
          </label>
          <p class="form-note">Used to mark a row Live, scheduled to play. It does not cap signups yet.</p>
          <button class="button primary" type="submit">Save settings</button>
        </section>
      </form>
      <section class="settings-tab-panel" id="settingsPanelExport" data-settings-panel="export" hidden>
        <p class="modal-copy">Download your AMBA Test node (profile, slots you added, and your yes/maybe/no choices). Import overwrites only your current choices, not other people.</p>
        <p class="form-actions">
          <button class="button primary" id="settingsDownloadExport" type="button">Download my JSON</button>
          <label class="button secondary">Import JSON
            <input id="settingsRestoreFile" type="file" accept="application/json,.json" hidden>
          </label>
        </p>
        <p class="form-note" id="settingsBackupNote"></p>
      </section>
    </dialog>
    <dialog class="modal small-modal" id="confirmDialog" aria-labelledby="confirmTitle">
      <p class="eyebrow">Confirm</p>
      <h2 id="confirmTitle">Overwrite?</h2>
      <p class="modal-copy" id="confirmCopy"></p>
      <p class="form-actions">
        <button class="button secondary" id="confirmCancel" type="button">Cancel</button>
        <button class="button primary" id="confirmOk" type="button">Overwrite</button>
      </p>
    </dialog>
    <dialog class="modal small-modal" id="timezoneModal" aria-labelledby="timezoneTitle">
      <button class="modal-close" id="closeTimezone" type="button" aria-label="Close time zone">x</button>
      <p class="eyebrow">Your clock</p>
      <h2 id="timezoneTitle">Set time zone</h2>
      <p class="modal-copy">Session times are shown in this zone.</p>
      <form id="timezoneForm">
        <label>Time zone
          <select required name="timezone" id="timezoneSelect">
            <option value="">Choose a time zone</option>
          </select>
        </label>
        <button class="button primary" type="submit">Save time zone</button>
      </form>
    </dialog>
    <dialog class="modal small-modal" id="adminModal" aria-labelledby="adminGateTitle">
      <button class="modal-close" id="closeAdmin" type="button" aria-label="Close admin">x</button>
      <div id="adminGate">
      <p class="eyebrow">Admin</p>
      <h2 id="adminGateTitle">Admin password</h2>
      <form id="adminForm">
        <label>Password <input required type="password" name="password" autocomplete="off"></label>
        <button class="button primary" type="submit">Open admin</button>
        <p class="form-note" id="adminNote"></p>
      </form>
      </div>
      <div id="adminAppHost" hidden></div>
    </dialog>
  `;
  document.body.append(dialogs);
})();

window.paintDiscordHostPicker = function paintDiscordHostPicker(select) {
  if (!select) return;
  let wrap = select.closest(".discord-host-picker");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "discord-host-picker";
    select.before(wrap);
    wrap.append(select);
  }
  let toggle = wrap.querySelector(".discord-host-picker-toggle");
  let menu = wrap.querySelector(".discord-host-picker-menu");
  function closePicker() {
    if (!menu || !toggle) return;
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    wrap.classList.remove("is-open");
  }
  function bannerOf(option) {
    return String(option?.dataset?.banner || "").trim();
  }
  function fillFace(el, option) {
    el.replaceChildren();
    const banner = bannerOf(option);
    if (banner) {
      const img = document.createElement("img");
      img.src = banner;
      img.alt = "";
      el.append(img);
    }
    const span = document.createElement("span");
    span.textContent = option?.textContent || "Not set";
    el.append(span);
  }
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "discord-host-picker-toggle";
    toggle.setAttribute("aria-haspopup", "listbox");
    toggle.setAttribute("aria-expanded", "false");
    wrap.append(toggle);
    menu = document.createElement("ul");
    menu.className = "discord-host-picker-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    wrap.append(menu);
    toggle.addEventListener("click", () => {
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      wrap.classList.toggle("is-open", open);
    });
    if (!window.__discordHostPickerDocBound) {
      window.__discordHostPickerDocBound = true;
      document.addEventListener("click", (event) => {
        document.querySelectorAll(".discord-host-picker.is-open").forEach((openWrap) => {
          if (!openWrap.contains(event.target)) {
            openWrap.classList.remove("is-open");
            const openMenu = openWrap.querySelector(".discord-host-picker-menu");
            const openToggle = openWrap.querySelector(".discord-host-picker-toggle");
            if (openMenu) openMenu.hidden = true;
            if (openToggle) openToggle.setAttribute("aria-expanded", "false");
          }
        });
      });
    }
    wrap.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePicker();
    });
  }
  const selected = select.selectedOptions[0] || select.options[0];
  fillFace(toggle, selected);
  toggle.setAttribute("aria-label", selected?.textContent || "Server");
  menu.replaceChildren();
  for (const option of select.options) {
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    if (option.value === select.value) item.setAttribute("aria-selected", "true");
    fillFace(item, option);
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closePicker();
    });
    menu.append(item);
  }
};
