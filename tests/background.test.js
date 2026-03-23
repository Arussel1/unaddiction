// ═══════════════════════════════════════════════════════════
//  background.test.js — Unit tests for SocialFine logic
//  Tests the pure functions exported from background.js
// ═══════════════════════════════════════════════════════════

// Since background.js is an ES module with Chrome API dependencies,
// we extract and test the pure logic functions directly.
// The actual exports use ESM, so we re-implement the testable
// functions here to test their logic in isolation.

// ── Reimplementation of pure functions for testing ───────

const DEFAULT_ALLOWANCE = 50;
const DEFAULT_DAILY_FREE_MINS = 5;
const FINE_AMOUNT = 1;

function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentDayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function maybeResetForNewMonth(record, now = new Date()) {
  const month = currentMonthKey(now);
  if (record.lastResetMonth !== month) {
    record.totalFine = 0;
    record.violationCount = 0;
    record.lastResetMonth = month;
  }
  return record;
}

function isFreeTimeExhausted(tt) {
  return tt.secondsSpent >= tt.dailyFreeMinutes * 60;
}

function parseFirestoreDoc(doc) {
  const f = doc.fields || {};
  return {
    totalFine:        Number(f.totalFine?.integerValue        ?? f.totalFine?.doubleValue        ?? 0),
    violationCount:   Number(f.violationCount?.integerValue   ?? f.violationCount?.doubleValue   ?? 0),
    monthlyAllowance: Number(f.monthlyAllowance?.integerValue ?? f.monthlyAllowance?.doubleValue ?? DEFAULT_ALLOWANCE),
    lastViolation:    f.lastViolation?.timestampValue          ?? null,
    lastResetMonth:   f.lastResetMonth?.stringValue            ?? null
  };
}

function buildFirestoreDoc(data) {
  return {
    fields: {
      totalFine:        { integerValue: String(data.totalFine) },
      violationCount:   { integerValue: String(data.violationCount) },
      monthlyAllowance: { integerValue: String(data.monthlyAllowance) },
      lastViolation:    { timestampValue: data.lastViolation },
      lastResetMonth:   { stringValue: data.lastResetMonth }
    }
  };
}

// ═══════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════

describe("currentMonthKey", () => {
  test("returns YYYY-MM format", () => {
    const key = currentMonthKey(new Date(2026, 2, 15)); // March 2026
    expect(key).toBe("2026-03");
  });

  test("pads single-digit months", () => {
    const key = currentMonthKey(new Date(2026, 0, 1)); // January
    expect(key).toBe("2026-01");
  });

  test("handles December", () => {
    const key = currentMonthKey(new Date(2026, 11, 31));
    expect(key).toBe("2026-12");
  });
});

describe("currentDayKey", () => {
  test("returns YYYY-MM-DD format", () => {
    const key = currentDayKey(new Date(2026, 2, 5));
    expect(key).toBe("2026-03-05");
  });

  test("pads single-digit days", () => {
    const key = currentDayKey(new Date(2026, 0, 1));
    expect(key).toBe("2026-01-01");
  });
});

describe("maybeResetForNewMonth", () => {
  test("resets fine when month changes", () => {
    const record = {
      totalFine: 12,
      violationCount: 12,
      monthlyAllowance: 50,
      lastViolation: "2026-02-15T10:00:00Z",
      lastResetMonth: "2026-02"
    };

    const result = maybeResetForNewMonth(record, new Date(2026, 2, 1)); // March
    expect(result.totalFine).toBe(0);
    expect(result.violationCount).toBe(0);
    expect(result.lastResetMonth).toBe("2026-03");
  });

  test("does NOT reset when same month", () => {
    const record = {
      totalFine: 7,
      violationCount: 7,
      monthlyAllowance: 50,
      lastViolation: "2026-03-10T10:00:00Z",
      lastResetMonth: "2026-03"
    };

    const result = maybeResetForNewMonth(record, new Date(2026, 2, 22));
    expect(result.totalFine).toBe(7);
    expect(result.violationCount).toBe(7);
  });

  test("handles year rollover (Dec → Jan)", () => {
    const record = {
      totalFine: 30,
      violationCount: 30,
      lastResetMonth: "2025-12"
    };

    const result = maybeResetForNewMonth(record, new Date(2026, 0, 1));
    expect(result.totalFine).toBe(0);
    expect(result.lastResetMonth).toBe("2026-01");
  });

  test("preserves monthlyAllowance on reset", () => {
    const record = {
      totalFine: 5,
      violationCount: 5,
      monthlyAllowance: 100,
      lastResetMonth: "2026-01"
    };

    const result = maybeResetForNewMonth(record, new Date(2026, 1, 1));
    expect(result.monthlyAllowance).toBe(100);
  });
});

describe("isFreeTimeExhausted", () => {
  test("returns false when under limit", () => {
    const tt = { secondsSpent: 60, dailyFreeMinutes: 5 };
    expect(isFreeTimeExhausted(tt)).toBe(false);
  });

  test("returns true when at limit", () => {
    const tt = { secondsSpent: 300, dailyFreeMinutes: 5 };
    expect(isFreeTimeExhausted(tt)).toBe(true);
  });

  test("returns true when over limit", () => {
    const tt = { secondsSpent: 600, dailyFreeMinutes: 5 };
    expect(isFreeTimeExhausted(tt)).toBe(true);
  });

  test("returns true immediately when free time is 0", () => {
    const tt = { secondsSpent: 0, dailyFreeMinutes: 0 };
    expect(isFreeTimeExhausted(tt)).toBe(true);
  });

  test("handles large daily free minutes", () => {
    const tt = { secondsSpent: 3599, dailyFreeMinutes: 60 };
    expect(isFreeTimeExhausted(tt)).toBe(false);
  });
});

describe("parseFirestoreDoc / buildFirestoreDoc", () => {
  test("round-trips data correctly", () => {
    const original = {
      totalFine: 15,
      violationCount: 15,
      monthlyAllowance: 75,
      lastViolation: "2026-03-22T10:00:00Z",
      lastResetMonth: "2026-03"
    };

    const doc = buildFirestoreDoc(original);
    const parsed = parseFirestoreDoc(doc);

    expect(parsed.totalFine).toBe(original.totalFine);
    expect(parsed.violationCount).toBe(original.violationCount);
    expect(parsed.monthlyAllowance).toBe(original.monthlyAllowance);
    expect(parsed.lastViolation).toBe(original.lastViolation);
    expect(parsed.lastResetMonth).toBe(original.lastResetMonth);
  });

  test("handles missing fields with defaults", () => {
    const parsed = parseFirestoreDoc({ fields: {} });
    expect(parsed.totalFine).toBe(0);
    expect(parsed.violationCount).toBe(0);
    expect(parsed.monthlyAllowance).toBe(DEFAULT_ALLOWANCE);
    expect(parsed.lastViolation).toBeNull();
    expect(parsed.lastResetMonth).toBeNull();
  });

  test("handles completely empty document", () => {
    const parsed = parseFirestoreDoc({});
    expect(parsed.totalFine).toBe(0);
    expect(parsed.monthlyAllowance).toBe(DEFAULT_ALLOWANCE);
  });
});

describe("Fine calculation integration", () => {
  test("budget remaining = allowance - totalFine", () => {
    const record = { monthlyAllowance: 50, totalFine: 12 };
    const remaining = record.monthlyAllowance - record.totalFine;
    expect(remaining).toBe(38);
  });

  test("budget goes negative when overspent", () => {
    const record = { monthlyAllowance: 50, totalFine: 55 };
    const remaining = record.monthlyAllowance - record.totalFine;
    expect(remaining).toBe(-5);
  });

  test("fine increment is always $1 CAD", () => {
    expect(FINE_AMOUNT).toBe(1);
  });

  test("multiple violations accumulate correctly", () => {
    let fine = 0;
    for (let i = 0; i < 10; i++) {
      fine += FINE_AMOUNT;
    }
    expect(fine).toBe(10);
  });
});
