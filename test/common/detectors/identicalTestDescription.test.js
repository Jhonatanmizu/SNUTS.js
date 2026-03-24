import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectIdenticalTestDescription from "../../../src/common/detectors/identicalTestDescription";

describe("IdenticalTestDescription", () => {
  it("should detect duplicated test descriptions", () => {
    const code = `
      describe("suite", () => {
        it("same description", () => {
          expect(1).toBe(1);
        });

        test("same description", () => {
          expect(2).toBe(2);
        });
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectIdenticalTestDescription(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should not detect when descriptions are unique", () => {
    const code = `
      describe("suite", () => {
        it("first test", () => {
          expect(1).toBe(1);
        });

        test("second test", () => {
          expect(2).toBe(2);
        });
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectIdenticalTestDescription(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});
