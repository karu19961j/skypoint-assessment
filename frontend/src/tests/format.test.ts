import { describe, expect, it } from "vitest";

import {
  describeDeadline,
  formatCtc,
  formatCtcRange,
  formatExp,
  splitCsv,
  stageColor,
  stageLabel,
} from "@/lib/format";

describe("formatCtc", () => {
  it("uses LPA shorthand when amount >= one lakh", () => {
    expect(formatCtc(2_500_000)).toBe("25 LPA");
    expect(formatCtc(1_750_000)).toBe("17.5 LPA");
  });

  it("falls back to localised number under one lakh", () => {
    expect(formatCtc(50_000)).toBe("50,000");
  });

  it("renders a dash for zero or negative amounts", () => {
    expect(formatCtc(0)).toBe("—");
    expect(formatCtc(-1)).toBe("—");
  });
});

describe("formatCtcRange", () => {
  it("collapses identical bounds", () => {
    expect(formatCtcRange(2_000_000, 2_000_000)).toBe("20 LPA");
  });

  it("renders a range when bounds differ", () => {
    expect(formatCtcRange(1_500_000, 3_000_000)).toBe("15 LPA – 30 LPA");
  });

  it("indicates non-disclosed when both sides are zero", () => {
    expect(formatCtcRange(0, 0)).toBe("Not disclosed");
  });
});

describe("formatExp", () => {
  it("renders a single year correctly", () => {
    expect(formatExp(1, 1)).toBe("1 yr");
  });

  it("renders multi-year ranges", () => {
    expect(formatExp(3, 6)).toBe("3–6 yrs");
  });
});

describe("stage helpers", () => {
  it("provides a human label for each stage", () => {
    expect(stageLabel("applied")).toBe("Applied");
    expect(stageLabel("hired")).toBe("Hired");
  });

  it("produces a Tailwind class for the stage swatch", () => {
    expect(stageColor("rejected")).toContain("rose");
    expect(stageColor("hired")).toContain("emerald");
  });
});

describe("splitCsv", () => {
  it("trims, lowercases, and drops empty tokens", () => {
    expect(splitCsv("Python, FastAPI , , postgres")).toEqual([
      "python",
      "fastapi",
      "postgres",
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(splitCsv("")).toEqual([]);
  });
});

describe("describeDeadline", () => {
  const today = new Date("2026-05-21T12:00:00Z");

  it("flags the deadline as rolling when null", () => {
    expect(describeDeadline(null, today).status).toBe("rolling");
  });

  it("flags today as 'today'", () => {
    expect(describeDeadline("2026-05-21", today)).toMatchObject({
      status: "today",
      daysLeft: 0,
    });
  });

  it("classifies the next 1-3 days as closing-soon", () => {
    expect(describeDeadline("2026-05-23", today).status).toBe("closing-soon");
    expect(describeDeadline("2026-05-24", today).status).toBe("closing-soon");
  });

  it("classifies longer windows as open", () => {
    expect(describeDeadline("2026-06-04", today).status).toBe("open");
  });

  it("flags past dates as closed", () => {
    expect(describeDeadline("2026-05-20", today).status).toBe("closed");
  });
});
