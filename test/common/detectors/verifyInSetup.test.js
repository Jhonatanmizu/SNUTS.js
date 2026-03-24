import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectVerifyInSetup from "../../../src/common/detectors/verifyInSetup";

describe("VerifyInSetup", () => {
  it("should detect assertion inside setup method", () => {
    const code = `
      describe("suite", () => {
        beforeEach(() => {
          expect(true).toBe(true);
        });

        it("runs", () => {
          expect(1).toBe(1);
        });
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectVerifyInSetup(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should not detect when setup has no assertions", () => {
    const code = `
      describe("suite", () => {
        beforeEach(() => {
          const payload = { id: 1 };
          JSON.stringify(payload);
        });

        it("runs", () => {
          expect(1).toBe(1);
        });
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectVerifyInSetup(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});