import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkLinkReachable,
  isPublicAddress,
  isSafeLinkTarget,
  LINK_CHECK_MAX_REDIRECTS,
  parseProofCheckOutput,
} from "@/lib/proof-check";

const PUBLIC = "93.184.216.34";
const resolvePublic = async () => [PUBLIC];

afterEach(() => vi.unstubAllGlobals());

describe("isPublicAddress", () => {
  it("refuses loopback, private, link-local and reserved addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "not-an-ip",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("allows public addresses", () => {
    expect(isPublicAddress(PUBLIC)).toBe(true);
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("isSafeLinkTarget", () => {
  it("refuses other schemes, credentials, ports and local names", async () => {
    for (const url of [
      "ftp://example.com/",
      "file:///etc/passwd",
      "http://user:pass@example.com/",
      "http://example.com:8080/",
      "http://localhost/",
      "http://app.localhost/",
      "http://printer.local/",
      "http://127.0.0.1/",
      "http://0x7f.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
      "nonsense",
    ]) {
      expect(await isSafeLinkTarget(url, resolvePublic), url).toBe(false);
    }
  });

  it("checks every resolved address", async () => {
    expect(await isSafeLinkTarget("https://example.com/", resolvePublic)).toBe(true);
    expect(await isSafeLinkTarget("https://example.com/", async () => [PUBLIC, "10.0.0.1"])).toBe(
      false,
    );
    expect(await isSafeLinkTarget("https://example.com/", async () => [])).toBe(false);
    expect(
      await isSafeLinkTarget("https://example.com/", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).toBe(false);
  });
});

describe("checkLinkReachable", () => {
  it("passes on a 2xx HEAD without reading the body", async () => {
    const fetchMock = vi.fn(async () => new Response("secret", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkLinkReachable("https://example.com/x", resolvePublic)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://example.com/x",
      { method: "HEAD", redirect: "manual" },
    ]);
  });

  it("falls back to GET when HEAD fails", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === "HEAD" ? new Response(null, { status: 405 }) : new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkLinkReachable("https://example.com/", resolvePublic)).toBe(true);
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["HEAD", "GET"]);
  });

  it("fails on errors, 4xx/5xx and network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await checkLinkReachable("https://example.com/", resolvePublic)).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await checkLinkReachable("https://example.com/", resolvePublic)).toBe(false);
  });

  it("never requests an unsafe link", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkLinkReachable("http://127.0.0.1/admin", resolvePublic)).toBe(false);
    expect(await checkLinkReachable("https://example.com/", async () => ["192.168.0.10"])).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows a few safe redirects and refuses a redirect to a private address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "https://example.com/a"
          ? new Response(null, { status: 301, headers: { location: "/b" } })
          : new Response("ok"),
      ),
    );
    expect(await checkLinkReachable("https://example.com/a", resolvePublic)).toBe(true);

    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkLinkReachable("https://example.com/a", resolvePublic)).toBe(false);
    expect(fetchMock.mock.calls.map((call) => (call as unknown[])[0])).not.toContain(
      "http://169.254.169.254/latest/meta-data",
    );
  });

  it("gives up after too many redirects", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "/again" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await checkLinkReachable("https://example.com/", resolvePublic)).toBe(false);
    // HEAD and GET per hop.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2 * (LINK_CHECK_MAX_REDIRECTS + 1));
  });
});

describe("parseProofCheckOutput", () => {
  it("reads a score 0–5 and a reason", () => {
    expect(parseProofCheckOutput('{"score": 4, "reason": " Fits  canva "}')).toEqual({
      score: 4,
      reason: "Fits canva",
    });
    expect(parseProofCheckOutput('```json\n{"score": "3.4"}\n```')).toEqual({
      score: 3,
      reason: "",
    });
  });

  it("rejects missing or out-of-range scores", () => {
    expect(parseProofCheckOutput('{"score": 7}')).toBeNull();
    expect(parseProofCheckOutput('{"score": -1}')).toBeNull();
    expect(parseProofCheckOutput('{"reason": "x"}')).toBeNull();
    expect(parseProofCheckOutput('{"score": null}')).toBeNull();
    expect(parseProofCheckOutput("not json")).toBeNull();
  });
});
