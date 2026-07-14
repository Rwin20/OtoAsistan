import { describe, expect, it } from "vitest";
import { normalizeQrImage, statusAfterQr, statusAfterWppStatus } from "../src/whatsapp/WppConnectAdapter.js";

describe("normalizeQrImage", () => {
  it("keeps an existing data URL unchanged", () => {
    const qr = "data:image/png;base64,AAAA";

    expect(normalizeQrImage(qr)).toBe(qr);
  });

  it("converts raw base64 into an image data URL", () => {
    expect(normalizeQrImage("AAAA BBBB")).toBe("data:image/png;base64,AAAABBBB");
  });

  it("keeps the QR visible when WPPConnect reports QR status after catchQR", () => {
    const withQr = statusAfterQr({ connected: false, detail: "not_started" }, "AAAA");

    expect(statusAfterWppStatus(withQr, "QR")).toEqual({
      connected: false,
      detail: "QR",
      qr: "data:image/png;base64,AAAA"
    });
  });

  it("clears the QR after the login succeeds", () => {
    const withQr = statusAfterQr({ connected: false, detail: "not_started" }, "AAAA");

    expect(statusAfterWppStatus(withQr, "isLogged")).toEqual({
      connected: true,
      detail: "isLogged"
    });
  });
});
