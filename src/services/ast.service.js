import traverse from "@babel/traverse";
import * as t from "@babel/types";
import parser from "@babel/parser";
import fs from "node:fs";

const defaultPlugins = [
  "classProperties",
  "dynamicImport",
  "decorators",
  "jsx",
  "partialApplication",
  "exportDefaultFrom",
  ["pipelineOperator", { proposal: "minimal" }],
  "@babel/plugin-proposal-do-expressions",
  "@babel/plugin-proposal-destructuring-private",
  "@babel/plugin-syntax-import-assertions",
  "importAttributes",
];

const configsTypescript = {
  sourceType: "module",
  plugins: ["typescript", ...defaultPlugins],
  errorRecovery: true,
};

const configsFlow = {
  sourceType: "module",
  plugins: ["flow", ...defaultPlugins],
  errorRecovery: true,
};

const jestSuiteAliases = ["describe"];
const jestTestAliases = ["it", "test"];

class AstService {
  traverseDefault =
    typeof traverse === "function" ? traverse : traverse.default;

  getTestInfo(ast) {
    let itCount = 0;
    let describeCount = 0;

    this.traverseDefault(ast, {
      CallExpression: ({ node }) => {
        if (node.callee.name === "describe") {
          describeCount++;
        }
        if (this.isTestCase(node) && /it|test/g.test(node.callee.name)) {
          itCount++;
        }
      },
    });

    return {
      itCount,
      describeCount,
    };
  }

  getDescribeCount(ast) {
    let describeCount = 0;
    this.traverseDefault(ast, {
      CallExpression: ({ node }) => {
        if (node.callee.name === "describe") {
          describeCount++;
        }
      },
    });
    return describeCount;
  }

  getItCount(ast) {
    let itCount = 0;
    this.traverseDefault(ast, {
      CallExpression: ({ node }) => {
        if (this.isTestCase(node) && /it|test/g.test(node.callee.name)) {
          itCount++;
        }
      },
    });
    return itCount;
  }

  getTestNodeAst(code) {
    const ast = this.parseCodeToAst(code);
    let testNode;
    this.traverseDefault(ast, {
      CallExpression(path) {
        if (jestSuiteAliases.includes(path.node.callee.name)) {
          path.traverse({
            CallExpression(describePath) {
              if (jestTestAliases.includes(describePath.node.callee.name)) {
                testNode = describePath;
              }
            },
          });
          // eslint-disable-next-line
        } else if (jestSuiteAliases.includes(path.node.callee.name)) {
          testNode = path;
        }
      },
    });
    return testNode;
  }
  parseCodeToAst(code) {
    try {
      return parser.parse(code, configsFlow);
    } catch (error) {
      console.error(error);
      return parser.parse(code, configsTypescript);
    }
  }
  parseFileToAst(file) {
    const code = fs.promises.readFile(file, "utf8");
    return code.then((content) => this.parseCodeToAst(content));
  }

  isSetupMethod(node) {
    const setupMethods = ["beforeEach", "beforeAll", "afterEach", "afterAll"];
    return (
      t.isIdentifier(node.callee) &&
      setupMethods.includes(node.callee.name) &&
      this.isFunction(node.arguments[0])
    );
  }

  isFunction(node) {
    return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);
  }

  isTestCase(node) {
    const testCaseCallee = ["it", "test"];
    return (
      t.isIdentifier(node.callee) &&
      testCaseCallee.includes(node.callee.name) &&
      t.isStringLiteral(node.arguments[0]) &&
      this.isFunction(node.arguments[1])
    );
  }

  isAssert(node) {
    const assertMethods = ["expect", "assert"];
    try {
      return (
        t.isExpressionStatement(node) &&
        t.isCallExpression(node?.expression) &&
        t.isMemberExpression(node?.expression.callee) &&
        assertMethods.includes(
          node?.expression.callee.name ||
            node?.expression?.callee?.object?.callee?.name
        )
      );
    } catch (error) {
      console.error(error);
      let { end, start } = node.loc;
      console.table(start.line, end.line);
      throw error;
    }
  }
  hasAssertion(ast) {
    let isValid = false;
    const checkIsAssert = this.isAssert;
    traverse(ast, {
      ExpressionStatement(path) {
        if (checkIsAssert(path.node)) {
          isValid = true;
        }
      },
    });
    return isValid;
  }

  hasManyComments(node, maxComments) {
    let commentCount = 0;
    // Traverse the function node to count comments
    t.traverse(node, {
      enter(path) {
        if (path.isComment()) {
          commentCount++;
          // Stop traversing if the number of comments exceeds the maximum
          if (commentCount > maxComments) {
            path.stop();
          }
        }
      },
    });

    return commentCount > maxComments;
  }
}

const astService = new AstService();

export default astService;
