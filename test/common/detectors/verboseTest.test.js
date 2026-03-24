import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectVerboseStatement from "../../../src/common/detectors/verboseTest";

describe("VerboseTest", () => {
  it("should detect a test block with too many statements", () => {
    const lines = Array.from({ length: 14 }, (_, i) => `const v${i} = ${i};`).join(
      "\\n"
    );
    const code = `
      it("verbose test", () => {
        ${lines}
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectVerboseStatement(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should not detect when block has few statements", () => {
    const code = `
      it("short test", () => {
        const one = 1;
        const two = 2;
        expect(one + two).toBe(3);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectVerboseStatement(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});
