export const TIMEZONES = [
  { id: "UTC-12", label: "UTC-12 Baker Island", iana: "Etc/GMT+12" },
  { id: "Samoa", label: "UTC-11 Samoa", iana: "Pacific/Pago_Pago" },
  { id: "Hawaii", label: "UTC-10 Hawaii", iana: "Pacific/Honolulu" },
  { id: "Marquesas", label: "UTC-9:30 Marquesas", iana: "Pacific/Marquesas" },
  { id: "Alaska", label: "UTC-9 Alaska", iana: "America/Anchorage" },
  { id: "Pacific", label: "UTC-8 Pacific", iana: "America/Los_Angeles" },
  { id: "Mountain", label: "UTC-7 Mountain", iana: "America/Denver" },
  { id: "Central", label: "UTC-6 Central", iana: "America/Chicago" },
  { id: "Eastern", label: "UTC-5 Eastern", iana: "America/New_York" },
  { id: "Atlantic", label: "UTC-4 Atlantic", iana: "America/Halifax" },
  { id: "Newfoundland", label: "UTC-3:30 Newfoundland", iana: "America/St_Johns" },
  { id: "Brasilia", label: "UTC-3 Brasilia", iana: "America/Sao_Paulo" },
  { id: "UTC-2", label: "UTC-2 South Georgia", iana: "Atlantic/South_Georgia" },
  { id: "Azores", label: "UTC-1 Azores", iana: "Atlantic/Azores" },
  { id: "UTC", label: "UTC+0 UTC", iana: "UTC" },
  { id: "London", label: "UTC+0 London", iana: "Europe/London" },
  { id: "Berlin", label: "UTC+1 Berlin", iana: "Europe/Berlin" },
  { id: "Athens", label: "UTC+2 Athens", iana: "Europe/Athens" },
  { id: "Moscow", label: "UTC+3 Moscow", iana: "Europe/Moscow" },
  { id: "Tehran", label: "UTC+3:30 Tehran", iana: "Asia/Tehran" },
  { id: "Dubai", label: "UTC+4 Dubai", iana: "Asia/Dubai" },
  { id: "Kabul", label: "UTC+4:30 Kabul", iana: "Asia/Kabul" },
  { id: "Pakistan", label: "UTC+5 Pakistan", iana: "Asia/Karachi" },
  { id: "India", label: "UTC+5:30 India", iana: "Asia/Kolkata" },
  { id: "Nepal", label: "UTC+5:45 Nepal", iana: "Asia/Kathmandu" },
  { id: "Bangladesh", label: "UTC+6 Bangladesh", iana: "Asia/Dhaka" },
  { id: "Yangon", label: "UTC+6:30 Yangon", iana: "Asia/Yangon" },
  { id: "Bangkok", label: "UTC+7 Bangkok", iana: "Asia/Bangkok" },
  { id: "Singapore", label: "UTC+8 Singapore", iana: "Asia/Singapore" },
  { id: "Eucla", label: "UTC+8:45 Eucla", iana: "Australia/Eucla" },
  { id: "Tokyo", label: "UTC+9 Tokyo", iana: "Asia/Tokyo" },
  { id: "Adelaide", label: "UTC+9:30 Adelaide", iana: "Australia/Adelaide" },
  { id: "Sydney", label: "UTC+10 Sydney", iana: "Australia/Sydney" },
  { id: "LordHowe", label: "UTC+10:30 Lord Howe", iana: "Australia/Lord_Howe" },
  { id: "Magadan", label: "UTC+11 Magadan", iana: "Asia/Magadan" },
  { id: "Auckland", label: "UTC+12 Auckland", iana: "Pacific/Auckland" },
  { id: "Chatham", label: "UTC+12:45 Chatham", iana: "Pacific/Chatham" },
  { id: "Tonga", label: "UTC+13 Tonga", iana: "Pacific/Tongatapu" },
  { id: "LineIslands", label: "UTC+14 Line Islands", iana: "Pacific/Kiritimati" }
];

const aliases = {
  GMT: "UTC",
  "UTC+1": "Europe/Berlin",
  "UTC+2": "Europe/Athens",
  "UTC+8": "Asia/Singapore",
  "UTC+9": "Asia/Tokyo",
  "UTC+10": "Australia/Sydney",
  "UTC+12": "Pacific/Auckland"
};

export const ZONE_IANA = {
  ...Object.fromEntries(TIMEZONES.map((zone) => [zone.id, zone.iana])),
  ...aliases
};

export function timezoneLabel(id) {
  return TIMEZONES.find((zone) => zone.id === id)?.label || id || "Not set";
}
