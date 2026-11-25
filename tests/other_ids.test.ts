import { describe, expect, it } from "vitest";

import { with_typed_other_ids } from "../src/shared/other_ids.ts";
import { other_id_catalogs, typed_other_ids } from "../src/web/OtherIdFields.tsx";

describe("other ids typed by hand", () => {
  it("replaces the sources given, clears an emptied one and keeps the rest", () => {
    expect(with_typed_other_ids({ shelfdb: "7", gamedb: "x1" }, { shelfdb: " 8 ", gamedb: "", "": "1", other: 3 })).toEqual({ shelfdb: "8" });
    expect(with_typed_other_ids({ shelfdb: "7" }, undefined)).toEqual({ shelfdb: "7" });
    expect(with_typed_other_ids({ shelfdb: "7" }, ["x"])).toEqual({ shelfdb: "7" });
  });

  it("offers each catalogue that is on, then each id held from one that is off, and sends an emptied field as empty", () => {
    const catalogs = other_id_catalogs([{ source: "shelfdb", label: "ShelfDB" }], { zeta: "1", shelfdb: "7", alpha: "2" });
    expect(catalogs).toEqual([
      { source: "shelfdb", label: "ShelfDB" },
      { source: "alpha", label: "alpha" },
      { source: "zeta", label: "zeta" },
    ]);
    expect(typed_other_ids(catalogs, { shelfdb: "8", alpha: "2" })).toEqual({ shelfdb: "8", alpha: "2", zeta: "" });
  });
});
