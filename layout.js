(function detectAmbaLayout() {
  const params = new URLSearchParams(location.search);
  const forced = params.get("layout");
  const ua = navigator.userAgent || "";
  function isPhone() {
    if (/iPhone|iPod/i.test(ua)) return true;
    if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
    return false;
  }
  let layout = "desktop";
  if (forced === "phone" || forced === "desktop") layout = forced;
  else if (isPhone()) layout = "phone";
  document.documentElement.dataset.layout = layout;
})();
