import { describe, expect, it } from "vitest";
import { coordsFromText, LocationNotFoundError, resolveLocation } from "../src/lib/mapsLink";

describe("coordsFromText", () => {
  it.each([
    ["13.0827, 80.2707", { lat: 13.0827, lng: 80.2707 }],
    ["13.0827 80.2707", { lat: 13.0827, lng: 80.2707 }],
    ["https://maps.google.com/?q=13.0827,80.2707", { lat: 13.0827, lng: 80.2707 }],
    ["https://www.google.com/maps/search/?api=1&query=13.0827%2C80.2707", { lat: 13.0827, lng: 80.2707 }],
    ["https://www.google.com/maps/search/13.0827,+80.2707?entry=tts", { lat: 13.0827, lng: 80.2707 }],
    // The pin (!3d/!4d) wins over the map view's centre (@…).
    [
      "https://www.google.com/maps/place/Sri+Paints/@13.1,80.1,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.0827!4d80.2707",
      { lat: 13.0827, lng: 80.2707 },
    ],
    ["https://www.google.com/maps/@13.0827,80.2707,15z", { lat: 13.0827, lng: 80.2707 }],
    [`13°04'57.7"N 80°16'14.5"E`, { lat: 13.082694, lng: 80.270694 }],
  ])("%s", (input, expected) => {
    const got = coordsFromText(input)!;
    expect(got.lat).toBeCloseTo(expected.lat, 5);
    expect(got.lng).toBeCloseTo(expected.lng, 5);
  });

  it("finds nothing in text without a position", () => {
    expect(coordsFromText("Sri Murugan Paints, Anna Nagar")).toBeNull();
    expect(coordsFromText("https://maps.app.goo.gl/AbCdEf")).toBeNull();
    expect(coordsFromText("0, 0")).toBeNull();
  });
});

describe("resolveLocation", () => {
  const redirectTo = (location: string) =>
    (async () => new Response(null, { status: 302, headers: { location } })) as unknown as typeof fetch;

  it("follows a short link's redirect to the full Google Maps URL", async () => {
    const fetchImpl = redirectTo("https://www.google.com/maps/place/X/data=!3d9.9252!4d78.1198");
    await expect(resolveLocation("https://maps.app.goo.gl/AbCdEf", fetchImpl)).resolves.toEqual({
      lat: 9.9252,
      lng: 78.1198,
    });
  });

  it("never fetches anything but Google", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(null);
    }) as unknown as typeof fetch;
    await expect(resolveLocation("https://evil.example/maps", fetchImpl)).rejects.toBeInstanceOf(LocationNotFoundError);
    await expect(resolveLocation("http://maps.app.goo.gl/x", fetchImpl)).rejects.toBeInstanceOf(LocationNotFoundError);
    expect(called).toBe(false);
  });

  it("stops at a redirect off Google", async () => {
    const fetchImpl = redirectTo("https://evil.example/elsewhere");
    await expect(resolveLocation("https://maps.app.goo.gl/AbCdEf", fetchImpl)).rejects.toBeInstanceOf(
      LocationNotFoundError
    );
  });
});
