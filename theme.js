(function () {
  const KEY = "ambaTheme";

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function apply(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }

  apply(stored() || "dark");

  window.toggleAmbaTheme = function toggleAmbaTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
    apply(next);
    return next;
  };
})();
