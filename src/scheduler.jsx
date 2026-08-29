import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { ZONE_IANA } from "../timezones.js";

ModuleRegistry.registerModules([AllCommunityModule]);

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
      {people.map((person) => (
        <span className={`grid-avatar${person.mine ? " mine" : ""}`} key={person.handle} title={person.handle}>
          {initials(person.handle)}
        </span>
      ))}
    </span>
  );
}

function TimeGrid() {
  const [email, setEmail] = useState("");
  const [userZone, setUserZone] = useState("");
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({ date: "", time: "19:00", lengthMinutes: "120" });

  const load = useCallback(async (nextEmail = email, nextZone = userZone) => {
    const state = await api(`/api/state${nextEmail ? `?email=${encodeURIComponent(nextEmail)}` : ""}`);
    const zone = nextZone || state.user?.timezone || "";
    setUserZone(zone);
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
        yes: people.filter((person) => person.status === "yes"),
        maybe: people.filter((person) => person.status === "maybe"),
        no: people.filter((person) => person.status === "no"),
        mine: people.find((person) => person.mine)?.status || ""
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
    return () => window.removeEventListener("amba-auth", onAuth);
  }, [load]);

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
      filter: true
    },
    {
      colId: "yes",
      headerName: "Yes",
      flex: 1,
      minWidth: 140,
      sortable: false,
      cellRenderer: (params) => <VoteCell people={params.data.yes} />
    },
    {
      colId: "maybe",
      headerName: "Maybe",
      flex: 1,
      minWidth: 140,
      sortable: false,
      cellRenderer: (params) => <VoteCell people={params.data.maybe} />
    },
    {
      colId: "no",
      headerName: "No",
      flex: 1,
      minWidth: 140,
      sortable: false,
      cellRenderer: (params) => <VoteCell people={params.data.no} />
    }
  ], []);

  return (
    <section className="scheduler">
      {email && !userZone ? (
        <p className="form-note">Set your time zone in Settings before you can use the grid. Times will show in your zone.</p>
      ) : null}
      {userZone ? <p className="form-note">Showing times in {userZone}.</p> : null}
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
      <div className="ag-theme-quartz scheduler-grid">
        <AgGridReact
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ resizable: true, autoHeight: false }}
          rowHeight={72}
          headerHeight={48}
          animateRows
          overlayNoRowsTemplate="Grid is empty. Add a row."
          getRowId={(params) => params.data.id}
          onCellClicked={(event) => {
            const status = event.column?.getColId();
            if (status !== "yes" && status !== "maybe" && status !== "no") return;
            vote(event.data.id, status, event.data.mine);
          }}
        />
      </div>
    </section>
  );
}

try {
  const mount = document.querySelector("#scheduler");
  if (mount) createRoot(mount).render(<TimeGrid />);
} catch (error) {
  console.error("Scheduler failed to start", error);
}
