import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { ZONE_IANA } from "../timezones.js";

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

function VoteCell({ people }) {
  return (
    <span className="vote-cell">
      {(people || []).map((person) => (
        <span className={`grid-avatar${person.mine ? " mine" : ""}`} key={person.handle} title={person.handle}>
          {initials(person.handle)}
        </span>
      ))}
    </span>
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

function eventTitle(row) {
  return row.sessionTitle || "AMBA session";
}

function eventDetails(row) {
  return [row.slot, "An AMBA Adventure"].filter(Boolean).join("\n");
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
  const [email, setEmail] = useState(() => sessionStorage.getItem("ambaEmail") || "");
  const [userZone, setUserZone] = useState("");
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ date: "", time: "19:00", lengthMinutes: "120" });
  const [menu, setMenu] = useState(null);
  const [summaryUrl, setSummaryUrl] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [edit, setEdit] = useState(null);
  const [toast, setToast] = useState("");
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
    setSummaryUrl(nextSummary);
    setHookUrl(nextHook);
    setRows((state.session?.times || []).map((time) => {
      const people = time.participants || [];
      const instant = time.date && time.time
        ? wallTimeToUtc(time.date, time.time, time.timezone || "Pacific")
        : null;
      const slot = zone && instant
        ? [formatForUser(instant, zone), time.lengthMinutes ? `${time.lengthMinutes} min` : ""].filter(Boolean).join(" · ")
        : "Set your time zone to see this session";
      return {
        id: time.id,
        slot,
        sessionTitle,
        startIso: instant ? instant.toISOString() : "",
        date: time.date || "",
        time: time.time || "19:00",
        lengthMinutes: time.lengthMinutes || 120,
        yes: people.filter((person) => person.status === "yes"),
        maybe: people.filter((person) => person.status === "maybe"),
        no: people.filter((person) => person.status === "no"),
        mine: people.find((person) => person.mine)?.status || "",
        createdByMe: Boolean(time.createdByMe)
      };
    }));
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("amba-auth", onAuth);
      window.removeEventListener("keydown", onKey);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!menu) return undefined;
    function close() {
      setMenu(null);
    }
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    const timer = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", close);
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

  async function vote(timeId, status, current) {
    if (!requireReady()) return;
    const next = current === status ? "leave" : status;
    await api("/api/slot", { method: "POST", body: { email, timeId, status: next } });
    await load(email, userZone);
  }

  async function deleteRow(timeId, createdByMe) {
    if (!requireReady()) return;
    if (!createdByMe) return;
    await api("/api/times", { method: "DELETE", body: { email, timeId } });
    setMenu(null);
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

  async function addRow(event) {
    event.preventDefault();
    if (!requireReady()) return;
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
      cellRenderer: (params) => <VoteCell people={params.data?.yes} />
    },
    {
      colId: "maybe",
      headerName: "Maybe",
      field: "maybe",
      flex: 1,
      minWidth: 140,
      sortable: true,
      comparator: (a, b) => (a?.length || 0) - (b?.length || 0),
      cellRenderer: (params) => <VoteCell people={params.data?.maybe} />
    },
    {
      colId: "no",
      headerName: "No",
      field: "no",
      flex: 1,
      minWidth: 140,
      sortable: true,
      comparator: (a, b) => (a?.length || 0) - (b?.length || 0),
      cellRenderer: (params) => <VoteCell people={params.data?.no} />
    }
  ], []);

  return (
    <section className="scheduler">
      {email && !userZone ? (
        <p className="form-note">Set your time zone in Settings before you can use the grid. Times will show in your zone.</p>
      ) : null}
      {userZone ? <p className="form-note">Showing times in {userZone}.</p> : null}
      {summaryUrl || hookUrl ? (
        <div className="adventure-summary">
          <div className="session-link-row">
            {summaryUrl ? (
              <a className="adventure-summary-link" href={summaryUrl} target="_blank" rel="noopener noreferrer">
                Adventure Summary
              </a>
            ) : null}
            {hookUrl ? (
              <a className="adventure-summary-link" href={hookUrl} target="_blank" rel="noopener noreferrer">
                AMBA player hook
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {hookUrl ? (
        <div className="player-hook">
          <iframe
            title="AMBA player hook"
            src={hookUrl}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      ) : null}
      <form className="add-row" onSubmit={addRow}>
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
          onCellClicked={(event) => {
            setMenu(null);
            const status = event.column?.getColId();
            if (status !== "yes" && status !== "maybe" && status !== "no") return;
            vote(event.data.id, status, event.data.mine);
          }}
          onCellContextMenu={(event) => {
            event.event?.preventDefault();
            event.event?.stopPropagation();
            if (!event.data) return;
            const x = Math.min(event.event.clientX, window.innerWidth - 220);
            const y = Math.min(event.event.clientY, window.innerHeight - 180);
            setMenu({
              x,
              y,
              row: event.data,
              timeId: event.data.id,
              createdByMe: event.data.createdByMe,
              date: event.data.date,
              time: event.data.time,
              lengthMinutes: event.data.lengthMinutes
            });
          }}
        />
      </div>
      {menu ? (
        <div className="grid-context-backdrop" onClick={() => setMenu(null)}>
          <menu
            className="grid-context-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
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
              onClick={() => openEdit(menu)}
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
          </menu>
        </div>
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
