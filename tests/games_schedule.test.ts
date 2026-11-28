import { afterEach, describe, expect, test, vi } from "vitest";

import { keep_reading_steam_categories } from "../src/shared/games/schedule.ts";
import type { MediaMethods } from "../src/shared/store.ts";

afterEach(() => vi.useRealTimers());

// ============================================================================
// Setup
// ============================================================================

function methods_updating(updated: number) {
  const import_steam_categories = vi.fn(() => ({ updated }));
  return { methods: () => ({ import_steam_categories }) as unknown as MediaMethods, import_steam_categories };
}

// ============================================================================
// Reading
// ============================================================================

describe("reading Steam's categories", () => {
  test("reads three minutes after start and then hourly, telling only of a change", () => {
    vi.useFakeTimers();
    const { methods, import_steam_categories } = methods_updating(1);
    const on_ran = vi.fn();

    const stop = keep_reading_steam_categories(methods, on_ran, () => "categories");
    vi.advanceTimersByTime(3 * 60 * 1000);
    vi.advanceTimersByTime(60 * 60 * 1000);
    stop();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(import_steam_categories).toHaveBeenCalledTimes(2);
    expect(on_ran).toHaveBeenCalledTimes(2);
  });

  test("skips an empty read, stays quiet when nothing changed and carries on after a failure", () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unchanged = methods_updating(0);
    const on_ran = vi.fn();
    const reads = ["", "categories"];
    let failing = true;

    const stop = keep_reading_steam_categories(unchanged.methods, on_ran, () => {
      if (failing) {
        failing = false;
        throw new Error("no Steam folder");
      }
      return reads.shift() ?? "";
    });
    vi.advanceTimersByTime(3 * 60 * 1000 + 3 * 60 * 60 * 1000);
    stop();

    expect(warn).toHaveBeenCalledOnce();
    expect(unchanged.import_steam_categories).toHaveBeenCalledOnce();
    expect(on_ran).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
