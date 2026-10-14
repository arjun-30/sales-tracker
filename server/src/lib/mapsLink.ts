// Turns what an admin pastes for a store's location into coordinates: a
// Google Maps link (long or maps.app.goo.gl short link), "13.0827, 80.2707",
// or the degrees form Google shows for a dropped pin (13°04'57.7"N 80°16'14.5"E).

export interface LatLng {
  lat: number;
  lng: number;
}

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

function fromDms(text: string): LatLng | null {
  const part = String.raw`(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([NSEW])`;
  const m = text.match(new RegExp(`${part}[\\s,]+${part}`, "i"));
  if (!m) return null;
  const toDeg = (d: string, mi: string, s: string, h: string) => {
    const v = Number(d) + Number(mi) / 60 + Number(s) / 3600;
    return /[SW]/i.test(h) ? -v : v;
  };
  return valid(toDeg(m[1], m[2], m[3], m[4]), toDeg(m[5], m[6], m[7], m[8]));
}

// Coordinates in text or a full URL, without any network lookups.
export function coordsFromText(input: string): LatLng | null {
  let text = input.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // keep as typed
  }
  text = text.replace(/\+/g, " ");

  const patterns: RegExp[] = [
    // The place's own pin. Preferred over @lat,lng, which is the map view's centre.
    new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
    new RegExp(String.raw`[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?\s*${NUM}\s*,\s*${NUM}`),
    new RegExp(String.raw`/maps/(?:search|place|dir)/(?:[^/]*/)?\s*${NUM}\s*,\s*${NUM}`),
    new RegExp(String.raw`@${NUM},${NUM}`),
    new RegExp(String.raw`^${NUM}\s*,\s*${NUM}$`),
    new RegExp(String.raw`^${NUM}\s+${NUM}$`),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const found = valid(Number(m[1]), Number(m[2]));
      if (found) return found;
    }
  }
  return fromDms(text);
}

// Only Google's own hosts are fetched, so pasting a link can't make the server
// call an arbitrary address.
const GOOGLE_HOSTS = /^(?:maps\.app\.goo\.gl|goo\.gl|g\.co|(?:www\.|maps\.)?google\.(?:com|co\.in))$/i;

export function isGoogleMapsUrl(url: URL): boolean {
  return url.protocol === "https:" && GOOGLE_HOSTS.test(url.hostname);
}

export class LocationNotFoundError extends Error {}

// Short links (maps.app.goo.gl/…) carry no coordinates; following their
// redirects to the full Google Maps URL usually does.
export async function resolveLocation(input: string, fetchImpl: typeof fetch = fetch): Promise<LatLng> {
  const direct = coordsFromText(input);
  if (direct) return direct;

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new LocationNotFoundError(
      "Paste a Google Maps link, or coordinates like 13.0827, 80.2707"
    );
  }
  if (!isGoogleMapsUrl(url)) {
    throw new LocationNotFoundError("Only Google Maps links are supported");
  }

  for (let hop = 0; hop < 5; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (RoaluxSales)" },
      });
    } catch {
      throw new LocationNotFoundError("Couldn't open that link. Check the internet connection and try again.");
    } finally {
      clearTimeout(timer);
    }
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) break;

    let next = new URL(location, url);
    // A consent page wraps the real address in ?continue=.
    const wrapped = next.searchParams.get("continue");
    if (/consent\./i.test(next.hostname) && wrapped) next = new URL(wrapped);
    const found = coordsFromText(next.toString());
    if (found) return found;
    if (!isGoogleMapsUrl(next)) break;
    url = next;
  }
  throw new LocationNotFoundError(
    "That link has no map position in it. In Google Maps, tap the store's pin, copy the coordinates and paste them here, or click the map to place it."
  );
}
