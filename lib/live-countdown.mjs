export function pickNextLiveStart(rows, nowMs) {
  const live = (rows || [])
    .filter((row) => row && row.scheduledToPlay && row.startIso)
    .map((row) => ({ start: Date.parse(row.startIso) }))
    .filter((row) => Number.isFinite(row.start));
  if (!live.length) return null;

  live.sort((a, b) => Math.abs(a.start - nowMs) - Math.abs(b.start - nowMs));
  if (live[0].start >= nowMs) return live[0].start;

  const upcoming = live.filter((row) => row.start >= nowMs).sort((a, b) => a.start - b.start);
  return upcoming[0] ? upcoming[0].start : null;
}

function unit(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function countdownParts(msRemaining) {
  const total = Math.max(0, Math.floor(Number(msRemaining) / 1000));
  return [
    unit(Math.floor(total / 86400), "day"),
    unit(Math.floor((total % 86400) / 3600), "hour"),
    unit(Math.floor((total % 3600) / 60), "minute"),
    unit(total % 60, "second")
  ];
}

export function formatCountdown(msRemaining) {
  return countdownParts(msRemaining).join(", ");
}
