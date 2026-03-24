import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectSensitiveEquality from "../../../src/common/detectors/sensitiveEquality";

describe("SensitiveEquality", () => {
  it("should detect equality matcher with toString argument", () => {
    const code = `
      it("uses toString in matcher", () => {
        expect(userId).toEqual(otherId.toString());
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSensitiveEquality(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should detect binary expression using toString", () => {
    const code = `
      it("compares with toString", () => {
        const isEqual = value.toString() === "1";
        expect(isEqual).toBe(true);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSensitiveEquality(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should not detect equality when toString is not used", () => {
    const code = `
      it("safe equality", () => {
        expect(userId).toEqual(otherId);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSensitiveEquality(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});
