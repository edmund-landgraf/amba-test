import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { renderMarkdown } from "./markdown.js";
import { ZONE_IANA } from "../timezones.js";
import {
  assignTokenColors,
  collectPageHandles,
  collectTokenPreferences,
  overflowTokenStyle,
  tokenIndexFor
} from "../lib/token-colors.mjs";

function api(url, options = {}) {
  return fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then((response) => {
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  });
}

const TIME_STEPS = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, "0");
  const minutes = String((index % 4) * 15).padStart(2, "0");
  return `${hours}:${minutes}`;
});

function ianaFor(label) {
  if (ZONE_IANA[label]) return ZONE_IANA[label];
  try {
    Intl.DateTimeFormat(undefined, { timeZone: label });
    return label;
  } catch {
    return "UTC";
  }
}

function tzOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - date.getTime();
}

function wallTimeToUtc(dateStr, timeStr, zoneLabel) {
  const timeZone = ianaFor(zoneLabel);
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const [hour, minute] = String(timeStr || "00:00").split(":").map(Number);
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const offset = tzOffsetMs(new Date(utc), timeZone);
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utc);
}

function formatForUser(date, zoneLabel) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ianaFor(zoneLabel),
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function initials(handle) {
  const parts = String(handle || "").split(/[^a-z0-9]+/i).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function isPhoneLayout() {
  return typeof document !== "undefined" && document.documentElement.dataset.layout === "phone";
}

function avatarClass(person) {
  return `grid-avatar${person.mine ? " mine" : ""}${String(person.note || "").trim() ? " has-note" : ""}`;
}

function tokenAvatarProps(tokenMap, handle) {
  const index = tokenIndexFor(tokenMap, handle);
  const extra = overflowTokenStyle(index);
  return {
    "data-token": String(index),
    style: extra || undefined
  };
}

function stopTokenMenu(event, row, person, onTokenMenu) {
  event.preventDefault();
  event.stopPropagation();
  onTokenMenu?.(event, row, person);
}

function VoteCell({ people, tokenMap, row, onTokenMenu }) {
  return (
    <span className="vote-cell">
      {(people || []).map((person) => (
        <span
          className={avatarClass(person)}
          key={person.handle}
          title={person.handle || ""}
          {...tokenAvatarProps(tokenMap, person.handle)}
          onContextMenu={(event) => stopTokenMenu(event, row, person, onTokenMenu)}
        >
          {initials(person.handle)}
        </span>
      ))}
    </span>
  );
}

function SessionLabel({ slot, statusLabel }) {
  return (
    <span className="session-cell">
      <span className="session-when">{slot}</span>
      {statusLabel ? <span className="session-status">{statusLabel}</span> : null}
    </span>
  );
}

function menuPoint(event) {
  return {
    x: Math.min(event.clientX, window.innerWidth - 220),
    y: Math.min(event.clientY, window.innerHeight - 280)
  };
}

function rowMenuFromEvent(event, row) {
  return {
    kind: "row",
    ...menuPoint(event),
    row,
    timeId: row.id,
    createdByMe: row.createdByMe,
    signupsDisabled: row.signupsDisabled,
    mineNote: row.mineNote || "",
    date: row.date,
    time: row.time,
    lengthMinutes: row.lengthMinutes
  };
}

function tokenMenuFromEvent(event, row, person) {
  return {
    kind: "token",
    ...menuPoint(event),
    row,
    timeId: row.id,
    person,
    mineNote: row.mineNote || ""
  };
}

const VOTE_COLS = ["yes", "maybe", "no"];

function statusFromPoint(event, fallback) {
  const row = event.currentTarget.closest("tr");
  const cells = row ? [...row.querySelectorAll("td[data-vote]")] : [];
  if (!cells.length) return fallback;
  for (const cell of cells) {
    const box = cell.getBoundingClientRect();
    if (event.clientX >= box.left && event.clientX < box.right) return cell.dataset.vote;
  }
  const first = cells[0].getBoundingClientRect();
  const last = cells[cells.length - 1].getBoundingClientRect();
  if (event.clientX < first.left) return cells[0].dataset.vote;
  if (event.clientX >= last.right) return cells[cells.length - 1].dataset.vote;
  return fallback;
}

function GlanceVoteCell({ people, status, row, onActivate, tokenMap, selfHandle, onTokenMenu }) {
  const holdTimer = useRef(null);
  const lastTap = useRef(0);
  const armed = useRef(false);
  const moved = useRef(false);
  const startX = useRef(0);
  const mine = (people || []).find((person) => person.mine);
  const ghost = !row.mine && status === "maybe";

  function clearHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function startPress(event) {
    if (row.signupsDisabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    moved.current = false;
    armed.current = false;
    startX.current = event.clientX;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    clearHold();
    holdTimer.current = setTimeout(() => {
      armed.current = true;
      holdTimer.current = null;
    }, 400);
  }

  function movePress(event) {
    if (Math.abs(event.clientX - startX.current) > 12) moved.current = true;
  }

  function endPress(event) {
    const held = armed.current;
    armed.current = false;
    clearHold();
    if (held) {
      lastTap.current = 0;
      onActivate(moved.current ? statusFromPoint(event, status) : status);
      return;
    }
    if (moved.current) return;
    const now = Date.now();
    if (now - lastTap.current < 450) {
      lastTap.current = 0;
      onActivate(status);
      return;
    }
    lastTap.current = now;
  }

  return (
    <td
      data-vote={status}
      className={`glance-vote-cell${row.mine === status ? " is-mine" : ""}`}
    >
      <button
        type="button"
        className="glance-vote"
        disabled={row.signupsDisabled}
        aria-label={row.signupsDisabled
          ? `${status}. Signups are closed for this row.`
          : `${status}. Press and hold or double-tap to set. Drag left or right while holding.`}
        onPointerDown={startPress}
        onPointerMove={movePress}
        onPointerUp={endPress}
        onPointerCancel={() => {
          armed.current = false;
          clearHold();
        }}
      >
        {(people || []).filter((person) => !person.mine).map((person) => (
          <span
            className={avatarClass(person)}
            key={person.handle}
            title={person.handle || ""}
            {...tokenAvatarProps(tokenMap, person.handle)}
            onContextMenu={(event) => stopTokenMenu(event, row, person, onTokenMenu)}
          >
            {initials(person.handle)}
          </span>
        ))}
        {mine ? (
          <span
            className={avatarClass(mine)}
            title={mine.handle || ""}
            {...tokenAvatarProps(tokenMap, mine.handle)}
            onContextMenu={(event) => stopTokenMenu(event, row, mine, onTokenMenu)}
          >
            {initials(mine.handle)}
          </span>
        ) : ghost ? (
          <span
            className="grid-avatar mine is-ghost"
            title={selfHandle || "Your vote"}
            {...tokenAvatarProps(tokenMap, selfHandle)}
            onContextMenu={(event) => stopTokenMenu(event, row, {
              handle: selfHandle || "You",
              mine: true,
              note: row.mineNote || ""
            }, onTokenMenu)}
          >
            You
          </span>
        ) : null}
      </button>
    </td>
  );
}

function calStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventWindow(row) {
  if (!row?.startIso) return null;
  const start = new Date(row.startIso);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + (Number(row.lengthMinutes) || 120) * 60 * 1000);
  return { start, end };
}

function slotIsPast(row) {
  const start = eventWindow(row)?.start;
  return Boolean(start && start.getTime() <= Date.now());
}

const WANDERERS_GUIDE_NEW_UI_URL = "https://wgui.wandersguide.site/";

function eventTitle(row) {
  return row.sessionTitle || "AMBA session";
}

function signupSiteUrl() {
  if (typeof window === "undefined") return "https://amba-test.unwhelm.online/";
  return `${window.location.origin}/`;
}

function eventDetails(row) {
  return [
    row.slot,
    row.playerHookText,
    row.syndicationUrl ? `Player packet: ${row.syndicationUrl}` : "",
    `Signup: ${signupSiteUrl()}`,
    row.discordInvite ? `Discord: ${row.discordInvite}` : "",
    `Wanderer's Guide (new UI): ${WANDERERS_GUIDE_NEW_UI_URL}`
  ].filter(Boolean).join("\n\n");
}

function openGoogleCalendar(row) {
  const range = eventWindow(row);
  if (!range) return;
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", eventTitle(row));
  url.searchParams.set("dates", `${calStamp(range.start)}/${calStamp(range.end)}`);
  url.searchParams.set("details", eventDetails(row));
  globalThis.open(url.toString(), "_blank", "noopener,noreferrer");
}

function downloadIcal(row) {
  const range = eventWindow(row);
  if (!range) return;
  const stamp = calStamp(new Date());
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AMBA//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${row.id}@amba-test`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${calStamp(range.start)}`,
    `DTEND:${calStamp(range.end)}`,
    `SUMMARY:${eventTitle(row).replace(/\n/g, " ")}`,
    `DESCRIPTION:${eventDetails(row).replace(/\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = "amba-session.ics";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function TimeGrid() {
  const [email, setEmail] = useState(() => localStorage.getItem("ambaEmail") || sessionStorage.getItem("ambaEmail") || "");
  const [userZone, setUserZone] = useState("");
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ date: "", time: "19:00", lengthMinutes: "120" });
  const [menu, setMenu] = useState(null);
  const [summaryUrl, setSummaryUrl] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookText, setHookText] = useState("");
  const [setupSource, setSetupSource] = useState("connect");
  const [readingLinks, setReadingLinks] = useState([]);
  const [edit, setEdit] = useState(null);
  const [reschedule, setReschedule] = useState(null);
  const [noteDraft, setNoteDraft] = useState(null);
  const [toast, setToast] = useState("");
  const [tokenMap, setTokenMap] = useState(() => Object.create(null));
  const [selfHandle, setSelfHandle] = useState("");
  const lastNoteRef = useRef("");
  const phoneLayout = isPhoneLayout();
  const [narrowHook, setNarrowHook] = useState(() =>
    phoneLayout
    || (typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches)
  );
  const [hookExpanded, setHookExpanded] = useState(() =>
    !phoneLayout && (typeof window === "undefined" || !window.matchMedia("(max-width: 860px)").matches)
  );
  const toastTimer = useRef(null);

  function showToast(message) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }

  const load = useCallback(async (nextEmail = email, nextZone = userZone) => {
    const state = await api(`/api/state${nextEmail ? `?email=${encodeURIComponent(nextEmail)}` : ""}`);
    const zone = nextZone || state.user?.timezone || "";
    setUserZone(zone);
    const sessionTitle = state.session?.title || "AMBA session";
    const nextSummary = state.session?.syndicationUrl || "";
    const nextHook = state.session?.playerHookUrl || "";
    const playerHookText = state.session?.playerHookText || "";
    const discordInvite = String(state.session?.discordHost?.inviteLink || "").trim();
    setSummaryUrl(nextSummary);
    setHookUrl(nextHook);
    setHookText(playerHookText);
    setSetupSource(state.session?.setupSource === "manual" ? "manual" : "connect");
    setReadingLinks(Array.isArray(state.session?.readingLinks) ? state.session.readingLinks : []);
    const maxPartyPcs = (() => {
      const max = Number(state.session?.maxPartyPcs);
      return Number.isFinite(max) && max > 0 ? Math.min(16, Math.round(max)) : 8;
    })();
    const pcs = (state.pcs || []).slice(0, maxPartyPcs);
    const handles = collectPageHandles({
      times: state.session?.times,
      pcs,
      selfHandle: state.user?.handle
    });
    const nextMap = assignTokenColors(handles, collectTokenPreferences({
      times: state.session?.times,
      pcs,
      selfHandle: state.user?.handle,
      selfTokenColor: state.user?.tokenColor
    }));
    setSelfHandle(state.user?.handle || "");
    setTokenMap(nextMap);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("amba-token-map", { detail: nextMap }));
    }
    const nextRows = (state.session?.times || []).map((time) => {
      const people = time.participants || [];
      const instant = time.date && time.time
        ? wallTimeToUtc(time.date, time.time, time.timezone || "Pacific")
        : null;
      const slot = zone && instant
        ? [formatForUser(instant, zone), time.lengthMinutes ? `${time.lengthMinutes} min` : ""].filter(Boolean).join(" · ")
        : "Set your time zone to see this session";
      const statusLabel = time.signupsDisabled
        ? "Not enough players"
        : time.scheduledToPlay
          ? "Live, scheduled to play"
          : "";
      return {
        id: time.id,
        slot,
        statusLabel,
        sessionTitle,
        playerHookText,
        discordInvite,
        syndicationUrl: nextSummary,
        playerHookUrl: nextHook,
        startIso: instant ? instant.toISOString() : "",
        date: time.date || "",
        time: time.time || "19:00",
        timezone: time.timezone || "Pacific",
        lengthMinutes: time.lengthMinutes || 120,
        yes: people.filter((person) => person.status === "yes"),
        maybe: people.filter((person) => person.status === "maybe"),
        no: people.filter((person) => person.status === "no"),
        mine: people.find((person) => person.mine)?.status || "",
        mineNote: time.mineNote || people.find((person) => person.mine)?.note || "",
        createdByMe: Boolean(time.createdByMe),
        signupsDisabled: Boolean(time.signupsDisabled),
        scheduledToPlay: Boolean(time.scheduledToPlay)
      };
    }).sort((a, b) => (a.startIso || "").localeCompare(b.startIso || ""));
    const latestMine = nextRows.findLast
      ? nextRows.findLast((row) => String(row.mineNote || "").trim())
      : [...nextRows].reverse().find((row) => String(row.mineNote || "").trim());
    if (latestMine) lastNoteRef.current = String(latestMine.mineNote).trim();
    setRows(nextRows);
  }, [email, userZone]);

  useEffect(() => {
    load();
    const onAuth = (event) => {
      const nextEmail = event.detail?.email || "";
      const nextZone = event.detail?.timezone || "";
      setEmail(nextEmail);
      setUserZone(nextZone);
      load(nextEmail, nextZone);
    };
    window.addEventListener("amba-auth", onAuth);
    const onKey = (event) => {
      if (event.key === "Escape") {
        setMenu(null);
        setEdit(null);
        setReschedule(null);
        setNoteDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    const poll = window.setInterval(() => load(email, userZone), 60 * 1000);
    return () => {
      window.removeEventListener("amba-auth", onAuth);
      window.removeEventListener("keydown", onKey);
      window.clearInterval(poll);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load, email, userZone]);

  useEffect(() => {
    if (phoneLayout) {
      setNarrowHook(true);
      return undefined;
    }
    const media = window.matchMedia("(max-width: 860px)");
    function sync(event) {
      const matches = event.matches;
      setNarrowHook(matches);
      setHookExpanded(!matches);
    }
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [phoneLayout]);

  useEffect(() => {
    if (!menu) return undefined;
    function close(event) {
      if (event?.button && event.button !== 0) return;
      if (event?.target?.closest?.(".grid-context-menu")) return;
      setMenu(null);
    }
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function requireReady() {
    if (!email) {
      window.dispatchEvent(new CustomEvent("amba-need-login"));
      return false;
    }
    if (!userZone) {
      window.dispatchEvent(new CustomEvent("amba-need-timezone"));
      return false;
    }
    return true;
  }

  function rowLocked(timeId) {
    return Boolean(rows.find((row) => row.id === timeId)?.signupsDisabled);
  }

  async function vote(timeId, status, current) {
    if (!requireReady()) return;
    if (rowLocked(timeId)) {
      showToast("Signups closed for this row");
      return;
    }
    const next = current === status ? "leave" : status;
    await api("/api/slot", { method: "POST", body: { email, timeId, status: next } });
    await load(email, userZone);
  }

  function applyMine(row, status) {
    const minePerson = [...row.yes, ...row.maybe, ...row.no].find((person) => person.mine)
      || { handle: "You", mine: true, note: row.mineNote || "" };
    minePerson.note = row.mineNote || minePerson.note || "";
    const strip = (list) => list.filter((person) => !person.mine);
    return {
      ...row,
      mine: status,
      yes: status === "yes" ? [...strip(row.yes), minePerson] : strip(row.yes),
      maybe: status === "maybe" ? [...strip(row.maybe), minePerson] : strip(row.maybe),
      no: status === "no" ? [...strip(row.no), minePerson] : strip(row.no)
    };
  }

  async function setSlot(timeId, status) {
    if (!requireReady()) return;
    if (rowLocked(timeId)) {
      showToast("Signups closed for this row");
      return;
    }
    await api("/api/slot", { method: "POST", body: { email, timeId, status } });
    await load(email, userZone);
  }

  function slideVote(row, status) {
    if (!requireReady()) return;
    if (row.signupsDisabled) {
      showToast("Signups closed for this row");
      return;
    }
    if (row.mine === status) return;
    setRows((current) => current.map((item) => (item.id === row.id ? applyMine(item, status) : item)));
    setSlot(row.id, status);
  }

  async function deleteRow(timeId, createdByMe) {
    if (!requireReady()) return;
    if (!createdByMe) return;
    await api("/api/times", { method: "DELETE", body: { email, timeId } });
    setMenu(null);
    await load(email, userZone);
  }

  function lastEditText(row, person) {
    const here = String(person?.note || row?.mineNote || "").trim();
    if (here) return here;
    const fromRows = [...rows].reverse().find((item) => String(item.mineNote || "").trim());
    return String(fromRows?.mineNote || lastNoteRef.current || "").trim();
  }

  function openViewNote(person) {
    setMenu(null);
    setNoteDraft({
      mode: "view",
      handle: person?.handle || "Player",
      text: String(person?.note || "").trim()
    });
  }

  function openNote(row, person) {
    if (!requireReady()) return;
    const timeId = row?.timeId || row?.id;
    if (!timeId) return;
    setMenu(null);
    setNoteDraft({
      mode: "edit",
      timeId,
      handle: person?.handle || selfHandle || "You",
      text: lastEditText(row, person)
    });
  }

  async function saveNote(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!noteDraft) return;
    if (!requireReady()) return;
    const voteNote = String(noteDraft.text || "").trim();
    lastNoteRef.current = voteNote;
    setNoteDraft(null);
    showToast(voteNote ? "note saved" : "note cleared");
    await api("/api/slot", { method: "POST", body: { email, timeId: noteDraft.timeId, voteNote } });
    await load(email, userZone);
  }

  function openEdit(row) {
    if (!requireReady()) return;
    if (!row.createdByMe) return;
    setMenu(null);
    setEdit({
      timeId: row.timeId || row.id,
      date: row.date,
      time: TIME_STEPS.includes(row.time) ? row.time : "19:00",
      lengthMinutes: ["60", "90", "120", "180"].includes(String(row.lengthMinutes)) ? String(row.lengthMinutes) : "120"
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!edit) return;
    if (!requireReady()) return;
    const payload = {
      email,
      timeId: edit.timeId,
      date: edit.date,
      time: edit.time,
      lengthMinutes: Number(edit.lengthMinutes)
    };
    setEdit(null);
    showToast("saved");
    await api("/api/times/update", { method: "POST", body: payload });
    await load(email, userZone);
  }

  function markRowClosed(timeId) {
    setRows((current) => current.map((item) => {
      if (item.id !== timeId) return item;
      return {
        ...item,
        signupsDisabled: true,
        scheduledToPlay: false,
        statusLabel: "Not enough players"
      };
    }));
  }

  function markRowOpen(timeId) {
    setRows((current) => current.map((item) => {
      if (item.id !== timeId) return item;
      return {
        ...item,
        signupsDisabled: false,
        statusLabel: item.scheduledToPlay ? "Live, scheduled to play" : ""
      };
    }));
  }

  const openTokenMenu = useCallback((event, row, person) => {
    if (!row || !person) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu(tokenMenuFromEvent(event, row, person));
  }, []);

  const openRowMenu = useCallback((event, row) => {
    if (!row) return;
    if (event?.target?.closest?.(".grid-avatar")) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu(rowMenuFromEvent(event, row));
  }, []);

  async function closeSignups(row) {
    if (!requireReady()) return;
    const timeId = row?.timeId || row?.id;
    if (!timeId) return;
    setMenu(null);
    markRowClosed(timeId);
    try {
      await api("/api/times/update", {
        method: "POST",
        body: {
          email,
          timeId,
          date: row.date,
          time: row.time,
          lengthMinutes: Number(row.lengthMinutes) || 120,
          signupsDisabled: true
        }
      });
      showToast("Signups closed for this row");
      await load(email, userZone);
    } catch (error) {
      showToast(error.message || "Could not close signups");
      await load(email, userZone);
    }
  }

  async function openSignups(row) {
    if (!requireReady()) return;
    if (slotIsPast(row)) {
      setMenu(null);
      showToast("Cannot reopen a slot in the past");
      return;
    }
    const timeId = row?.timeId || row?.id;
    if (!timeId) return;
    setMenu(null);
    markRowOpen(timeId);
    try {
      await api("/api/times/update", {
        method: "POST",
        body: {
          email,
          timeId,
          date: row.date,
          time: row.time,
          lengthMinutes: Number(row.lengthMinutes) || 120,
          signupsDisabled: false
        }
      });
      showToast("Slot opened back up");
      await load(email, userZone);
    } catch (error) {
      showToast(error.message || "Could not reopen signups");
      await load(email, userZone);
    }
  }

  function openReschedule(row) {
    if (!requireReady()) return;
    if (!row?.signupsDisabled) return;
    setMenu(null);
    setReschedule({
      timeId: row.timeId || row.id,
      date: row.date,
      time: TIME_STEPS.includes(row.time) ? row.time : "19:00",
      lengthMinutes: ["60", "90", "120", "180"].includes(String(row.lengthMinutes)) ? String(row.lengthMinutes) : "120"
    });
  }

  async function saveReschedule(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!reschedule) return;
    if (!requireReady()) return;
    const row = rows.find((item) => item.id === reschedule.timeId);
    const nextStart = wallTimeToUtc(reschedule.date, reschedule.time, row?.timezone || "Pacific");
    if (nextStart && nextStart.getTime() <= Date.now()) {
      showToast("Cannot reopen a slot in the past");
      return;
    }
    const payload = {
      email,
      timeId: reschedule.timeId,
      date: reschedule.date,
      time: reschedule.time,
      lengthMinutes: Number(reschedule.lengthMinutes),
      convertYesToMaybe: true,
      signupsDisabled: false
    };
    setReschedule(null);
    showToast("rescheduled");
    await api("/api/times/update", { method: "POST", body: payload });
    await load(email, userZone);
  }

  async function addRow(event) {
    event.preventDefault();
    if (!requireReady()) return;
    try {
      await api("/api/times", {
        method: "POST",
        body: {
          email,
          date: draft.date,
          time: draft.time,
          timezone: userZone,
          lengthMinutes: Number(draft.lengthMinutes)
        }
      });
      setDraft({ date: "", time: "19:00", lengthMinutes: "120" });
      await load(email, userZone);
    } catch (error) {
      showToast(error.message || "Could not add row");
    }
  }

  const columnDefs = useMemo(() => [
    {
      field: "slot",
      headerName: "Session",
      pinned: "left",
      minWidth: 420,
      flex: 1.4,
      sortable: true,
      filter: true,
      wrapText: true,
      autoHeight: true,
      valueGetter: (params) => [params.data?.slot, params.data?.statusLabel].filter(Boolean).join(" · "),
      cellRenderer: (params) => (
        <span
          className="session-cell-hit"
          onContextMenu={(event) => openRowMenu(event, params.data)}
        >
          <SessionLabel slot={params.data?.slot} statusLabel={params.data?.statusLabel} />
        </span>
      ),
      comparator: (_a, _b, nodeA, nodeB) => {
        const a = nodeA?.data?.startIso || "";
        const b = nodeB?.data?.startIso || "";
        return a.localeCompare(b);
      }
    },
    {
      colId: "yes",
      headerName: "Yes",
      field: "yes",
      flex: 1,
      minWidth: 140,
      sortable: true,
      comparator: (a, b) => (a?.length || 0) - (b?.length || 0),
      cellRenderer: (params) => (
        <VoteCell
          people={params.data?.yes}
          tokenMap={tokenMap}
          row={params.data}
          onTokenMenu={openTokenMenu}
        />
      )
    },
    {
      colId: "maybe",
      headerName: "Maybe",
      field: "maybe",
      flex: 1,
      minWidth: 140,
      sortable: true,
      comparator: (a, b) => (a?.length || 0) - (b?.length || 0),
      cellRenderer: (params) => (
        <VoteCell
          people={params.data?.maybe}
          tokenMap={tokenMap}
          row={params.data}
          onTokenMenu={openTokenMenu}
        />
      )
    },
    {
      colId: "no",
      headerName: "No",
      field: "no",
      flex: 1,
      minWidth: 140,
      sortable: true,
      comparator: (a, b) => (a?.length || 0) - (b?.length || 0),
      cellRenderer: (params) => (
        <VoteCell
          people={params.data?.no}
          tokenMap={tokenMap}
          row={params.data}
          onTokenMenu={openTokenMenu}
        />
      )
    }
  ], [openRowMenu, openTokenMenu, tokenMap]);

  const statusMount = typeof document !== "undefined" ? document.querySelector("#schedule-status") : null;
  const hookMount = typeof document !== "undefined" ? document.querySelector("#player-hook") : null;
  const hookBand = typeof document !== "undefined" ? document.querySelector("#player-hook-band") : null;
  const readingMount = typeof document !== "undefined" ? document.querySelector("#reading-grid") : null;
  const readingBand = typeof document !== "undefined" ? document.querySelector("#reading-band") : null;

  useEffect(() => {
    if (!hookBand) return;
    const show = setupSource === "manual" ? Boolean(hookText.trim()) : Boolean(hookUrl);
    hookBand.hidden = !show;
  }, [hookUrl, hookText, setupSource, hookBand]);

  useEffect(() => {
    if (!readingBand) return;
    const showPack = setupSource !== "manual" && Boolean(summaryUrl);
    readingBand.hidden = !(showPack || readingLinks.length);
  }, [summaryUrl, readingLinks, setupSource, readingBand]);

  const zoneNote = email && !userZone
    ? "Set your time zone in Settings before you can mark times. Times will show in your zone."
    : userZone
      ? `Showing times in ${userZone}.`
      : "";

  const statusGrid = (
    <div className="status-table-wrap">
      <table className="status-table">
        <thead>
          <tr>
            <th></th>
            <th>Yes</th>
            <th>Maybe</th>
            <th>No</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr
              key={row.id}
              className={row.signupsDisabled ? "is-signups-disabled" : row.scheduledToPlay ? "is-scheduled-live" : ""}
            >
              <th
                scope="row"
                onContextMenu={(event) => openRowMenu(event, row)}
              >
                <SessionLabel slot={row.slot} statusLabel={row.statusLabel} />
              </th>
              {phoneLayout ? VOTE_COLS.map((status) => (
                <GlanceVoteCell
                  key={status}
                  people={row[status]}
                  status={status}
                  row={row}
                  tokenMap={tokenMap}
                  selfHandle={selfHandle}
                  onTokenMenu={openTokenMenu}
                  onActivate={(next) => slideVote(row, next)}
                />
              )) : (
                <>
                  <td><VoteCell people={row.yes} tokenMap={tokenMap} row={row} onTokenMenu={openTokenMenu} /></td>
                  <td><VoteCell people={row.maybe} tokenMap={tokenMap} row={row} onTokenMenu={openTokenMenu} /></td>
                  <td><VoteCell people={row.no} tokenMap={tokenMap} row={row} onTokenMenu={openTokenMenu} /></td>
                </>
              )}
            </tr>
          )) : (
            <tr>
              <td colSpan={4} className="status-table-empty">No session rows yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const manualPitch = setupSource === "manual" && hookText.trim();
  const hookBlock = manualPitch ? (
      <div className={`player-hook-wrap${narrowHook && !hookExpanded ? "" : " is-expanded"}`}>
        {narrowHook ? (
          <button
            className="player-hook-toggle"
            type="button"
            onClick={() => setHookExpanded((open) => !open)}
          >
            {hookExpanded ? "Show less" : "Read the player hook"}
          </button>
        ) : null}
        <div
          className="player-hook player-hook-md"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(hookText) }}
          onClick={(event) => {
            const link = event.target.closest("a[href]");
            if (!link) return;
            event.preventDefault();
            window.open(link.href, "_blank", "noopener,noreferrer");
          }}
        />
      </div>
  ) : hookUrl ? (
      <div className={`player-hook-wrap${narrowHook && !hookExpanded ? "" : " is-expanded"}`}>
        {narrowHook ? (
          <button
            className="player-hook-toggle"
            type="button"
            onClick={() => setHookExpanded((open) => !open)}
          >
            {hookExpanded ? "Show less" : "Read the player hook"}
          </button>
        ) : null}
        <div className="player-hook">
          <iframe
            title="AMBA player hook"
            src={`/api/player-hook?u=${encodeURIComponent(hookUrl)}`}
            referrerPolicy="no-referrer"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      </div>
  ) : null;

  function readingHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  }

  const showPack = setupSource !== "manual" && Boolean(summaryUrl);
  const readingBlock = (showPack || readingLinks.length) ? (
    <>
      {showPack ? (
        <a className="reading-card is-syndication is-pack" href={summaryUrl} target="_blank" rel="noopener noreferrer">
          <span className="reading-card-cover is-empty" aria-hidden="true" />
          <span className="reading-card-body">
            <span className="reading-card-kicker">AMBA</span>
            <strong className="reading-card-title">Player Pack</strong>
            <span className="reading-card-excerpt">The living player syndication for this adventure.</span>
            <span className="reading-card-host">{readingHost(summaryUrl)}</span>
          </span>
        </a>
      ) : null}
      {readingLinks.map((link) => (
        <a
          key={link.id || link.url}
          className={`reading-card${link.kind === "syndication" ? " is-syndication" : ""}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.image ? (
            <img className="reading-card-cover" src={link.image} alt="" />
          ) : (
            <span className="reading-card-cover is-empty" aria-hidden="true" />
          )}
          <span className="reading-card-body">
            <span className="reading-card-kicker">{link.kind === "syndication" ? "AMBA" : (link.siteName || readingHost(link.url) || "Web")}</span>
            <strong className="reading-card-title">{link.title || readingHost(link.url)}</strong>
            {link.description ? <span className="reading-card-excerpt">{link.description}</span> : null}
            <span className="reading-card-host">{readingHost(link.url)}</span>
          </span>
        </a>
      ))}
    </>
  ) : null;

  return (
    <section className="scheduler">
      {zoneNote ? <p className="form-note">{zoneNote}</p> : null}
      {statusMount ? createPortal(statusGrid, statusMount) : statusGrid}
      {hookMount && hookBlock ? createPortal(hookBlock, hookMount) : hookBlock}
      {readingMount && readingBlock ? createPortal(readingBlock, readingMount) : readingBlock}
      <form id="mark-times" className="add-row" onSubmit={addRow}>
        <label>Date <input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
        <label>Time
          <select required value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })}>
            {TIME_STEPS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>Session length
          <select required value={draft.lengthMinutes} onChange={(event) => setDraft({ ...draft, lengthMinutes: event.target.value })}>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
            <option value="120">120 minutes</option>
            <option value="180">180 minutes</option>
          </select>
        </label>
        <button className="button primary" type="submit">Add row</button>
      </form>
      {phoneLayout ? null : (
      <div className="ag-theme-quartz scheduler-grid" onContextMenu={(event) => event.preventDefault()}>
        <AgGridReact
          theme="legacy"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: true, sortable: true, autoHeight: false }}
          sortingOrder={["asc", "desc"]}
          rowHeight={72}
          headerHeight={48}
          animateRows
          overlayNoRowsTemplate="Grid is empty. Add a row."
          getRowId={(params) => params.data.id}
          getRowClass={(params) => {
            if (params.data?.signupsDisabled) return "scheduler-row-disabled";
            if (params.data?.scheduledToPlay) return "scheduler-row-live";
            return "";
          }}
          onCellClicked={(event) => {
            if (event.event?.button && event.event.button !== 0) return;
            setMenu(null);
            const status = event.column?.getColId();
            if (status !== "yes" && status !== "maybe" && status !== "no") return;
            if (event.data?.signupsDisabled) {
              showToast("Signups closed for this row");
              return;
            }
            vote(event.data.id, status, event.data.mine);
          }}
          onCellContextMenu={(event) => {
            const native = event.event || event;
            if (native?.target?.closest?.(".grid-avatar")) return;
            if (!event.data) return;
            openRowMenu(native, event.data);
          }}
        />
      </div>
      )}
      {menu ? createPortal(
        <div
          className="grid-context-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setMenu(null);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
        <div
          className="grid-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
            {menu.kind === "token" ? (
              menu.person?.mine ? (
                <button
                  type="button"
                  onClick={() => openNote(menu.row || menu, menu.person)}
                >
                  Edit note
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openViewNote(menu.person)}
                >
                  View note
                </button>
              )
            ) : (
              <>
            <button
              type="button"
              disabled={!menu.row?.startIso}
              onClick={() => {
                openGoogleCalendar(menu.row);
                setMenu(null);
              }}
            >
              Save to Google Calendar
            </button>
            <button
              type="button"
              disabled={!menu.row?.startIso}
              onClick={() => {
                downloadIcal(menu.row);
                setMenu(null);
              }}
            >
              Save to iCal
            </button>
            <button
              type="button"
              disabled={!menu.createdByMe}
              title={menu.createdByMe ? "Edit this session row" : "You can only edit rows you created"}
              onClick={() => openEdit(menu.row || menu)}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={!menu.createdByMe}
              title={menu.createdByMe ? "Delete this session row" : "You can only delete rows you created"}
              onClick={() => deleteRow(menu.timeId, menu.createdByMe)}
            >
              Delete row
            </button>
            {(menu.row?.signupsDisabled || menu.signupsDisabled) ? (
              <>
                {!slotIsPast(menu.row) ? (
                <button
                  type="button"
                  title="Undo: reopen this slot"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    openSignups(menu.row);
                  }}
                >
                  Open slot back up
                </button>
                ) : null}
                <button
                  type="button"
                  title="Pick a new time. Yes votes become Maybe."
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    openReschedule(menu.row);
                  }}
                >
                  Reschedule
                </button>
              </>
            ) : (
              <button
                type="button"
                title="Close signups for this row only"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeSignups(menu.row);
                }}
              >
                Not Enough Players
              </button>
            )}
              </>
            )}
        </div>
        </div>,
        document.body
      ) : null}
      {edit ? createPortal(
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEdit(null); }}>
          <div className="modal small-modal" role="dialog" aria-labelledby="editRowTitle" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close edit" onClick={() => setEdit(null)}>x</button>
            <h2 id="editRowTitle">Edit row</h2>
            <p className="modal-copy">Update the date, time, and session length.</p>
            <form className="edit-row" onSubmit={saveEdit}>
              <label>Date <input required type="date" value={edit.date} onChange={(event) => setEdit({ ...edit, date: event.target.value })} /></label>
              <label>Time
                <select required value={edit.time} onChange={(event) => setEdit({ ...edit, time: event.target.value })}>
                  {TIME_STEPS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>Session length
                <select required value={edit.lengthMinutes} onChange={(event) => setEdit({ ...edit, lengthMinutes: event.target.value })}>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                  <option value="180">180 minutes</option>
                </select>
              </label>
              <button className="button primary" type="button" onClick={saveEdit}>Save</button>
            </form>
          </div>
        </div>,
        document.body
      ) : null}
      {reschedule ? createPortal(
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReschedule(null); }}>
          <div className="modal small-modal" role="dialog" aria-labelledby="rescheduleRowTitle" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close reschedule" onClick={() => setReschedule(null)}>x</button>
            <h2 id="rescheduleRowTitle">Reschedule</h2>
            <p className="modal-copy">Pick a new date and time. Everyone who said Yes on this row moves to Maybe, and signups reopen.</p>
            <form className="edit-row" onSubmit={saveReschedule}>
              <label>Date <input required type="date" value={reschedule.date} onChange={(event) => setReschedule({ ...reschedule, date: event.target.value })} /></label>
              <label>Time
                <select required value={reschedule.time} onChange={(event) => setReschedule({ ...reschedule, time: event.target.value })}>
                  {TIME_STEPS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>Session length
                <select required value={reschedule.lengthMinutes} onChange={(event) => setReschedule({ ...reschedule, lengthMinutes: event.target.value })}>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                  <option value="120">120 minutes</option>
                  <option value="180">180 minutes</option>
                </select>
              </label>
              <button className="button primary" type="submit">Reschedule</button>
            </form>
          </div>
        </div>,
        document.body
      ) : null}
      {noteDraft ? createPortal(
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoteDraft(null); }}>
          <div className="modal small-modal" role="dialog" aria-labelledby="rowNoteTitle" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label="Close note" onClick={() => setNoteDraft(null)}>x</button>
            {noteDraft.mode === "view" ? (
              <>
                <h2 id="rowNoteTitle">{noteDraft.handle}</h2>
                <p className="modal-copy">{noteDraft.text || "No note."}</p>
              </>
            ) : (
              <>
                <h2 id="rowNoteTitle">Edit note</h2>
                <p className="modal-copy">One note per row. Hover still shows the handle. Others can right-click your token to view this.</p>
                <form className="edit-row" onSubmit={saveNote}>
                  <label>Note
                    <textarea
                      autoFocus
                      rows={4}
                      maxLength={280}
                      value={noteDraft.text}
                      onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })}
                    />
                  </label>
                  <button className="button primary" type="submit">Save note</button>
                </form>
              </>
            )}
          </div>
        </div>,
        document.body
      ) : null}
      {toast ? createPortal(<p className="save-toast" role="status">{toast}</p>, document.body) : null}
    </section>
  );
}

try {
  ModuleRegistry.registerModules([AllCommunityModule]);
  const mount = document.querySelector("#scheduler");
  if (mount) createRoot(mount).render(<TimeGrid />);
} catch (error) {
  console.error("Scheduler failed to start", error);
}
