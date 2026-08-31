const KEY = 'fxbook.timezone.v2';

const CITIES: Record<number, string> = {
  [-12]: 'Baker Island',
  [-11]: 'Pago Pago',
  [-10]: 'Honolulu',
  [-9]: 'Anchorage',
  [-8]: 'Los Angeles',
  [-7]: 'Denver',
  [-6]: 'Chicago',
  [-5]: 'New York',
  [-4]: 'Halifax',
  [-3]: 'Sao Paulo',
  [-2]: 'Noronha',
  [-1]: 'Azores',
  0: 'London',
  1: 'Paris',
  2: 'Johannesburg',
  3: 'Moscow',
  4: 'Dubai',
  5: 'Karachi',
  6: 'Dhaka',
  7: 'Bangkok',
  8: 'Singapore',
  9: 'Tokyo',
  10: 'Sydney',
  11: 'Noumea',
  12: 'Auckland',
  13: 'Tongatapu',
  14: 'Kiritimati',
};

export const DESK_TIMEZONES = Array.from({ length: 27 }, (_, i) => {
  const hours = i - 12;
  const label = offsetLabel(hours);
  const city = CITIES[hours];
  return { hours, label, city, menu: `${label}  ${city}`, iana: offsetIana(hours) };
});

export type DeskTimezoneOffset = (typeof DESK_TIMEZONES)[number]['hours'];

export const DEFAULT_TIMEZONE_OFFSET: DeskTimezoneOffset = -7;
export const DEFAULT_TIMEZONE_IANA = offsetIana(DEFAULT_TIMEZONE_OFFSET);
export const DEFAULT_TIMEZONE_LABEL = offsetLabel(DEFAULT_TIMEZONE_OFFSET);

export function offsetLabel(hours: number): string {
  if (hours === 0) return 'UTC';
  return hours > 0 ? `UTC+${hours}` : `UTC${hours}`;
}

export function offsetIana(hours: number): string {
  if (hours === 0) return 'UTC';
  const inverted = -hours;
  return inverted > 0 ? `Etc/GMT+${inverted}` : `Etc/GMT${inverted}`;
}

export function isDeskTimezone(value: number): value is DeskTimezoneOffset {
  return Number.isInteger(value) && value >= -12 && value <= 14;
}

export function timezoneIana(hours: DeskTimezoneOffset): string {
  return offsetIana(hours);
}

export function timezoneLabel(hours: DeskTimezoneOffset): string {
  return offsetLabel(hours);
}

export function loadDeskTimezone(): DeskTimezoneOffset {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return DEFAULT_TIMEZONE_OFFSET;
    const hours = Number(raw);
    if (isDeskTimezone(hours)) return hours;
  } catch {
    /* private mode */
  }
  return DEFAULT_TIMEZONE_OFFSET;
}

export function saveDeskTimezone(hours: DeskTimezoneOffset): void {
  try {
    localStorage.setItem(KEY, String(hours));
  } catch {
    /* private mode */
  }
}
