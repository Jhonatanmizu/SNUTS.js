import { describe, expect, it } from "vitest";
import astService from "../../../src/services/ast.service";
import detectComplexSnapshots from "../../../src/common/detectors/complexSnapshot";

describe("ComplexSnapshot", () => {
  it("should detect complex inline snapshot in test file", () => {
    const snapshot = Array.from({ length: 52 }, (_, i) => `line-${i + 1}`).join(
      "\n"
    );
    const code = `
      it("should match snapshot", () => {
        expect({ id: 1 }).toMatchInlineSnapshot(\`${snapshot}\`);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectComplexSnapshots(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should detect complex external snapshot in additional files", () => {
    const snapshot = Array.from({ length: 55 }, (_, i) => `item-${i + 1}`).join(
      "\n"
    );
    const testAst = astService.parseCodeToAst(`it("test", () => expect(1).toBe(1));`);
    const snapshotAst = astService.parseCodeToAst(`
      exports[\`sample test 1\`] = \`${snapshot}\`;
    `);

    const result = detectComplexSnapshots(testAst, [snapshotAst]);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
  });

  it("should not detect snapshot when inline snapshot is short", () => {
    const snapshot = Array.from({ length: 5 }, (_, i) => `line-${i + 1}`).join(
      "\n"
    );
    const code = `
      it("should match snapshot", () => {
        expect({ id: 1 }).toMatchInlineSnapshot(\`${snapshot}\`);
      });
    `;

    const ast = astService.parseCodeToAst(code);
    const result = detectComplexSnapshots(ast);

    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);
  });
});