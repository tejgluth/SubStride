import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseStored, wrapStored } from "../src/schemas";

describe("stored schema envelopes", () => {
  it("reads legacy un-enveloped blobs instead of treating them as version mismatches", () => {
    const raw = JSON.stringify({ id: "legacy-profile", displayName: "Runner" });
    const parsed = parseStored(raw, z.object({ id: z.string(), displayName: z.string() }));

    expect(parsed.status).toBe("ok");
    expect(parsed.value?.id).toBe("legacy-profile");
  });

  it("rejects explicit incompatible envelopes", () => {
    const raw = JSON.stringify(wrapStored({ id: "old" }, 0));
    expect(parseStored(raw).status).toBe("version_mismatch");
  });
});
