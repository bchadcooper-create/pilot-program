// Builds a realistic four-day Envoy-style pairing as a MobileCCI .ics,
// anchored to "now" so the bot is always mid-trip on day 2: woke up in a
// layover this morning, two legs this afternoon, overnight tonight, two
// more duty days, then home and a duty-free block. Same shape as the real
// exports the parser was hardened against: "FLT nnnn" summaries, a
// "Time: ... - ..." DESCRIPTION in local time, DTSTART/DTEND in UTC, a
// "Layover in XXX" event covering each overnight.
//
// Also exported: the plain event list, so a test can assert what the app
// should conclude from it (legs today, tonight's layover, trip day).

function pad(n) { return String(n).padStart(2, '0'); }
function localStamp(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
}
function utcStamp(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
}
function at(dayOffset, hh, mm, now) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset); d.setHours(hh, mm, 0, 0);
  return d;
}

function buildTrip(now = new Date()) {
  // Day -1 (yesterday) report, four days, home on day +2 evening.
  const ev = [];
  const flight = (n, from, to, s, e) => ev.push({ type: 'flight', summary: 'FLT ' + n, from, to, start: s, end: e });
  const layover = (ap, s, e) => ev.push({ type: 'layover', summary: 'Layover in ' + ap, from: '', to: '', start: s, end: e });

  // Day 1 (yesterday): PHX -> LAX -> EUG, overnight EUG
  flight(3712, 'PHX', 'LAX', at(-1, 6, 10, now), at(-1, 7, 35, now));
  flight(3901, 'LAX', 'EUG', at(-1, 9, 5, now), at(-1, 11, 40, now));
  layover('EUG', at(-1, 11, 40, now), at(0, 12, 45, now));
  // Day 2 (today): EUG -> SFO -> SEA, overnight SEA
  flight(3747, 'EUG', 'SFO', at(0, 13, 45, now), at(0, 15, 20, now));
  flight(3902, 'SFO', 'SEA', at(0, 16, 30, now), at(0, 18, 50, now));
  layover('SEA', at(0, 18, 50, now), at(1, 9, 30, now));
  // Day 3: SEA -> SLC -> DEN, overnight DEN (short)
  flight(3815, 'SEA', 'SLC', at(1, 10, 30, now), at(1, 13, 25, now));
  flight(3816, 'SLC', 'DEN', at(1, 14, 20, now), at(1, 15, 50, now));
  layover('DEN', at(1, 15, 50, now), at(2, 5, 15, now));
  // Day 4: DEN -> PHX, home
  flight(3650, 'DEN', 'PHX', at(2, 6, 15, now), at(2, 8, 10, now));
  // Days off
  ev.push({ type: 'dutyfree', summary: 'Duty Free Period', from: '', to: '', start: at(2, 8, 10, now), at: null, end: at(6, 23, 59, now) });
  return ev;
}

function toICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FCF e2e//MobileCCI-shaped fixture//EN'];
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:e2e-' + i + '-' + e.start.getTime());
    lines.push('SUMMARY:' + e.summary + (e.from ? ' ' + e.from + '-' + e.to : ''));
    lines.push('DESCRIPTION:Time: ' + localStamp(e.start) + ' - ' + localStamp(e.end) + (e.from ? '\\nStations: ' + e.from + '->' + e.to : ''));
    lines.push('DTSTART:' + utcStamp(e.start));
    lines.push('DTEND:' + utcStamp(e.end));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { buildTrip, toICS };
