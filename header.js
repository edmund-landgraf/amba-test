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
    ["feedback.html", "Feedback"]
  ];

  document.querySelectorAll("header.site-header").forEach((node) => node.remove());

  const nav = links
    .map(([href, label]) => {
      const current = href === page ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}>${label}</a>`;
    })
    .join("");

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <a class="brand" href="index.html">AMBA Adventure</a>
    <nav aria-label="Main navigation">${nav}</nav>
    <div class="header-actions">
      <button class="admin-gate" id="openAdmin" type="button">+a</button>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Switch to dark mode">
        <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M15.1 3.3a.8.8 0 0 1 1 .97 8.2 8.2 0 1 1-10.27 10.3.8.8 0 0 1 1.07-1 6.6 6.6 0 0 0 8.2-8.2.8.8 0 0 1 .97-1.07Z"/>
        </svg>
        <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 7.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0-5.2a.9.9 0 0 1 .9.9v1.6a.9.9 0 1 1-1.8 0V2.9A.9.9 0 0 1 12 2Zm0 16.4a.9.9 0 0 1 .9.9v1.6a.9.9 0 1 1-1.8 0v-1.6a.9.9 0 0 1 .9-.9Zm10-7.4a.9.9 0 0 1-.9.9h-1.6a.9.9 0 1 1 0-1.8h1.6a.9.9 0 0 1 .9.9ZM4.5 12a.9.9 0 0 1-.9.9H2a.9.9 0 1 1 0-1.8h1.6a.9.9 0 0 1 .9.9Zm14.4-6.9a.9.9 0 0 1 0 1.27l-1.13 1.13a.9.9 0 1 1-1.27-1.27L17.63 4a.9.9 0 0 1 1.27 0ZM6.5 16.63a.9.9 0 0 1 0 1.27l-1.13 1.13A.9.9 0 1 1 4.1 17.76l1.13-1.13a.9.9 0 0 1 1.27 0Zm11.13 1.27a.9.9 0 0 1-1.27 0l-1.13-1.13a.9.9 0 1 1 1.27-1.27l1.13 1.13a.9.9 0 0 1 0 1.27ZM6.5 5.1a.9.9 0 0 1 0 1.27L5.37 7.5A.9.9 0 1 1 4.1 6.23L5.23 5.1A.9.9 0 0 1 6.5 5.1Z"/>
        </svg>
      </button>
      <menu class="account-menu">
        <button class="avatar-button" id="accountButton" type="button" aria-haspopup="menu" aria-expanded="false">
          <span id="accountInitials">?</span>
        </button>
        <menu class="settings-menu" id="settingsMenu" role="menu" hidden>
          <p class="menu-identity">
            <span id="menuHandle">Not signed in</span>
            <small id="menuEmail">Log in by email</small>
          </p>
          <button type="button" id="menuSettings" role="menuitem">Settings</button>
          <button type="button" id="menuTimezone" role="menuitem">Set time zone</button>
          <button type="button" id="menuProfile" role="menuitem">Profile</button>
          <button type="button" id="menuLogin" role="menuitem">Log in</button>
          <button type="button" id="menuLogout" role="menuitem">Log out</button>
        </menu>
      </menu>
    </div>
  `;
  document.body.prepend(header);

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
      </dl>
      <p class="modal-copy">Your handle is used in the shared session sheet. Your email is private and used only to log back in.</p>
      <button class="button secondary" id="openTimezoneFromProfile" type="button">Set time zone</button>
      <form id="identityForm">
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
        <button class="button primary" type="submit">Save profile</button>
      </form>
      <button class="button danger" id="deleteAccount" type="button">Delete account</button>
      <p class="form-note" id="profileNote">Deleting removes your profile, availability, and feedback.</p>
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
    <dialog class="modal small-modal" id="adminModal" aria-labelledby="adminTitle">
      <button class="modal-close" id="closeAdmin" type="button" aria-label="Close admin">x</button>
      <p class="eyebrow">Admin</p>
      <h2 id="adminTitle">Admin password</h2>
      <form id="adminForm">
        <label>Password <input required type="password" name="password" autocomplete="off"></label>
        <button class="button primary" type="submit">Open yes list</button>
        <p class="form-note" id="adminNote"></p>
      </form>
    </dialog>
  `;
  document.body.append(dialogs);
})();
