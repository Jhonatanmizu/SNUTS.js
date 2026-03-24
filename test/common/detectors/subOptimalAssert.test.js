import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectSubOptimalAssert from "../../../src/common/detectors/subOptimalAssert";

describe("SubOptimalAssert", () => {
  it("should detect expect(...).toBe(undefined)", () => {
    const code = `
      it("undefined assert", () => {
        expect(result).toBe(undefined);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSubOptimalAssert(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should detect expect(length).toBe(...) usage", () => {
    const code = `
      it("length assert", () => {
        expect(items.length).toBe(3);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSubOptimalAssert(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should detect binary expression passed to expect", () => {
    const code = `
      it("binary expect", () => {
        expect(value === 10);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSubOptimalAssert(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should not detect optimized assertions", () => {
    const code = `
      it("good asserts", () => {
        expect(result).toBeDefined();
        expect(items).toHaveLength(3);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectSubOptimalAssert(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});
