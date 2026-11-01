import { describe, expect, test } from "bun:test";
import { splitMath, visibleLength } from "../src/shared/math-text.ts";

describe("splitMath", () => {
  test("plain text is one piece", () => {
    expect(splitMath("What is 2 + 2?")).toEqual(["What is 2 + 2?"]);
  });

  test("finds inline maths", () => {
    expect(splitMath("Use $v_{fy} = v_{iy} + gt$ here")).toEqual(["Use ", { math: "v_{fy} = v_{iy} + gt" }, " here"]);
    expect(splitMath("$a$ and $b$")).toEqual([{ math: "a" }, " and ", { math: "b" }]);
  });

  test("leaves prices and lone dollars alone", () => {
    expect(splitMath("It costs $5 and $10.")).toEqual(["It costs $5 and $10."]);
    expect(splitMath("Pay $ 3")).toEqual(["Pay $ 3"]);
  });

  test("\\$ is a literal dollar, also inside maths", () => {
    expect(splitMath("\\$5 or $x$")).toEqual(["$5 or ", { math: "x" }]);
    expect(splitMath("$\\$5$")).toEqual([{ math: "\\$5" }]);
  });
});

test("visibleLength ignores TeX commands and braces", () => {
  expect(visibleLength("abc")).toBe(3);
  expect(visibleLength("$\\sqrt{a^2 + b^2}$")).toBe(5); // a2+b2
});
