// Builds a calendar file (.ics) for the release time, with alarms at 10 min, 5 min and release time.
const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
export function buildIcs(releaseAt, now = Date.now()) {
  const alarm = m => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:TTD tickets release ' + (m ? 'in ' + m + ' min' : 'now'),
                      'TRIGGER:' + (m ? '-PT' + m + 'M' : 'PT0S'), 'END:VALARM'];
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tirumala Darshan Helper//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:release-' + releaseAt + '@tirumala-darshan-helper', 'DTSTAMP:' + z(now), 'DTSTART:' + z(releaseAt), 'DTEND:' + z(releaseAt + 30 * 60000),
    'SUMMARY:TTD Special Entry Darshan tickets release', 'DESCRIPTION:Log in to the official TTD site and be ready.',
    ...alarm(10), ...alarm(5), ...alarm(0), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
