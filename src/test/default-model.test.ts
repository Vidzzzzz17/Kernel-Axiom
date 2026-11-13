import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "@/lib/kernel/db";
import { PROVIDER_PRESETS, friendlyMessage, resolveBase } from "@/lib/kernel/modelClient";

describe("Default model", () => {
  it("starts on the free open-source model with no key needed", () => {
    expect(DEFAULT_SETTINGS.provider).toBe("opensource");
    expect(PROVIDER_PRESETS.opensource.needsKey).toBe(false);
    expect(DEFAULT_SETTINGS.baseUrl).toBe(PROVIDER_PRESETS.opensource.baseUrl);
    expect(DEFAULT_SETTINGS.model).toBe(PROVIDER_PRESETS.opensource.model);
  });

  it("sends the open-source base URL through the app's own bridge, not the public host", () => {
    expect(resolveBase(PROVIDER_PRESETS.opensource.baseUrl)).toBe("/api/opensource");
  });

  it("explains the open-source rate limit without mentioning workspace credits", () => {
    const msg = friendlyMessage("opensource", 402, "Provider error 402: FREE_LIMIT");
    expect(msg).toContain("rate limited");
    expect(msg).not.toContain("credits");
  });

  it("keeps the credit message for the built-in provider", () => {
    expect(friendlyMessage("kernel", 402, "Provider error 402")).toContain("credits");
  });
});

describe("Second free model", () => {
  it("offers a free Gemma model through OpenRouter", () => {
    expect(PROVIDER_PRESETS.openrouterfree.model.endsWith(":free")).toBe(true);
  });
});
