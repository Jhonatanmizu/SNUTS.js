import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectOnlyTest from "../../../src/common/detectors/onlyTest";

describe("OnlyTest", () => {
  it("should detect it.only and describe.only", () => {
    const code = `
      describe.only("suite", () => {
        it.only("single", () => {
          expect(1).toBe(1);
        });
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectOnlyTest(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(2);
  });

  it("should not detect when only modifier is not used", () => {
    const code = `
      describe("suite", () => {
        it("single", () => {
          expect(1).toBe(1);
        });
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectOnlyTest(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });

  it("should not detect only on non-test object names", () => {
    const code = `
      contest.only("helper", () => {
        expect(1).toBe(1);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectOnlyTest(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});
