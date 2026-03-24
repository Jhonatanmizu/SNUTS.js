import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectNonFunctionalStatement from "../../../src/common/detectors/nonFunctionalStatement";

describe("NonFunctionalStatement", () => {
  it("should detect empty block statements without comments", () => {
    const code = `
      it("empty body", () => {});
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectNonFunctionalStatement(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should not detect empty block statements with comments", () => {
    const code = `
      it("commented empty body", () => {
        /* pending implementation */
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectNonFunctionalStatement(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});
