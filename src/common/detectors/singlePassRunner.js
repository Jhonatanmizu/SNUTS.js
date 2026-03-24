import traverse from "@babel/traverse";
import * as t from "@babel/types";
import astService from "../../services/ast.service.js";

const traverseDefault =
  typeof traverse === "function" ? traverse : traverse.default;

const SUPPORTED_DETECTOR_NAMES = new Set([
  "detectAnonymousTest",
  "detectSensitiveEquality",
  "detectCommentsOnlyTest",
  "detectGeneralFixture",
  "detectTestWithoutDescription",
  "detectTranscriptingTest",
  "detectOvercommentedTest",
  "detectIdenticalTestDescription",
  "detectComplexSnapshots",
  "detectConditionalTestLogic",
  "detectNonFunctionalStatement",
  "detectOnlyTest",
  "detectSubOptimalAssert",
  "detectVerboseStatement",
  "detectVerifyInSetup",
]);

const jestMatchers = new Set([
  "toEqual",
  "toStrictEqual",
  "toBe",
  "toMatchObject",
]);

const jasmineMatchers = new Set(["toEqual", "toBe", "toMatch"]);
const MAX_LINES_IN_SNAPSHOT = 50;

const hasManyOfTwoWords = (text = "") => {
  const result = text.split(" ");
  return result.length > 2;
};

const isCommentsOnly = (body) => {
  return body.every((statement) => {
    if (t.isExpressionStatement(statement) && !statement.expression) {
      return true;
    }
    if (t.isBlockStatement(statement) && statement.body.length === 0) {
      return true;
    }
    return false;
  });
};

const hasConsoleMethod = (node, methodName) => {
  return (
    t.isExpressionStatement(node) &&
    t.isCallExpression(node.expression) &&
    t.isMemberExpression(node.expression.callee) &&
    t.isIdentifier(node.expression.callee.object, { name: "console" }) &&
    t.isIdentifier(node.expression.callee.property, { name: methodName })
  );
};

const isToStringMemberExpression = (node) => {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, { name: "toString" })
  );
};

const isExpectNotBeAssertion = ({ callee }) =>
  callee?.object?.object?.callee?.name === "expect" &&
  callee?.object?.property?.name === "not";

const isExpectToBeAssertion = ({ callee }) =>
  callee?.object?.callee?.name === "expect" &&
  callee?.property?.name === "toBe";

const isUndefinedLike = (node) => {
  const containArgs = node.arguments.length === 1;
  if (containArgs) {
    const isUsingVoid =
      node.arguments[0].type === "UnaryExpression" &&
      node.arguments?.[0]?.operator === "void";
    const isArgumentUndefined = /(undefined|null)+/.test(
      node.arguments?.[0]?.name || ""
    );
    const isNullLiteral = node?.arguments[0]?.type === "NullLiteral";
    return isUsingVoid || isArgumentUndefined || isNullLiteral;
  }
  return false;
};

const isUsingDotLength = ({ callee }) =>
  callee.object.arguments.length === 1 &&
  callee.object.arguments[0]?.property?.name === "length";

const isArgBinaryExpression = (node) =>
  node.arguments.length === 1 && t.isBinaryExpression(node.arguments[0]);

const isComplexSnapshot = ({ loc } = { loc: {} }) =>
  loc?.end?.line - loc?.start?.line > MAX_LINES_IN_SNAPSHOT;

const isExternalSnapshot = ({ expression }) =>
  expression.type === "AssignmentExpression" &&
  expression.left.type === "MemberExpression" &&
  expression.left.property.type === "TemplateLiteral";

const isInlineSnapshot = ({ expression }) =>
  expression?.callee?.property?.name === "toMatchInlineSnapshot";

const buildResultBuckets = () => {
  return {
    detectAnonymousTest: [],
    detectSensitiveEquality: [],
    detectCommentsOnlyTest: [],
    detectGeneralFixture: [],
    detectTestWithoutDescription: [],
    detectTranscriptingTest: [],
    detectOvercommentedTest: [],
    detectIdenticalTestDescription: [],
    detectComplexSnapshots: [],
    detectConditionalTestLogic: [],
    detectNonFunctionalStatement: [],
    detectOnlyTest: [],
    detectSubOptimalAssert: [],
    detectVerboseStatement: [],
    detectVerifyInSetup: [],
  };
};

const getLocation = (loc) => ({
  startLine: loc.start.line,
  endLine: loc.end.line,
});

const collectSetupVariables = (setupBody, setupVariables) => {
  if (!t.isBlockStatement(setupBody)) {
    return;
  }

  setupBody.body.forEach((statement) => {
    if (
      t.isExpressionStatement(statement) &&
      t.isAssignmentExpression(statement.expression)
    ) {
      const { left } = statement.expression;
      if (t.isIdentifier(left)) {
        setupVariables.set(left.name, {
          startLine: statement.loc.start.line,
          endLine: statement.loc.end.line,
        });
      }
    }
  });
};

const collectUsedSetupVariables = (testBody, setupVariables, usedVariables) => {
  if (!t.isBlockStatement(testBody)) {
    return;
  }

  traverseDefault(testBody, {
    noScope: true,
    Identifier(innerPath) {
      if (setupVariables.has(innerPath.node.name)) {
        usedVariables.add(innerPath.node.name);
      }
    },
  });
};

const countComments = (node) => {
  const commentsSet = new Set();

  traverseDefault(node, {
    noScope: true,
    enter(path) {
      if (path.node.leadingComments) {
        path.node.leadingComments.forEach((comment) => {
          commentsSet.add(comment.value.trim());
        });
      }
      if (path.node.trailingComments) {
        path.node.trailingComments.forEach((comment) => {
          commentsSet.add(comment.value.trim());
        });
      }
      if (path.node.innerComments) {
        path.node.innerComments.forEach((comment) => {
          commentsSet.add(comment.value.trim());
        });
      }
    },
  });

  return commentsSet.size;
};

const hasManyComments = (node, threshold) => {
  return countComments(node) > threshold;
};

const runSinglePassDetectors = (ast) => {
  const results = buildResultBuckets();
  const testDescriptions = new Set();
  const setupVariables = new Map();
  const usedVariables = new Set();

  traverseDefault(ast, {
    IfStatement: ({ node }) => {
      results.detectConditionalTestLogic.push(getLocation(node.loc));
    },
    BlockStatement(path) {
      const { loc } = path.node;
      if (path.node.body.length > 13) {
        results.detectVerboseStatement.push(getLocation(loc));
      }

      if (path.node.body.length === 0) {
        const isMissingComment = !(
          path.node.leadingComments ||
          path.node.trailingComments ||
          path.node.innerComments
        );
        if (isMissingComment) {
          results.detectNonFunctionalStatement.push(getLocation(loc));
        }
      }
    },
    ExpressionStatement: ({ node }) => {
      if (isExternalSnapshot(node)) {
        if (isComplexSnapshot(node?.expression?.right?.quasis?.[0])) {
          results.detectComplexSnapshots.push(getLocation(node.loc));
        }
      } else if (isInlineSnapshot(node)) {
        if (isComplexSnapshot(node.expression.arguments[0]?.quasis?.[0])) {
          results.detectComplexSnapshots.push(getLocation(node.loc));
        }
      }
    },
    BinaryExpression: ({ node }) => {
      if (
        isToStringMemberExpression(node.left) ||
        isToStringMemberExpression(node.right)
      ) {
        results.detectSensitiveEquality.push(getLocation(node.loc));
      }
    },
    CallExpression(path) {
      const node = path.node;
      const { arguments: args, loc, callee } = node;

      if (
        /^(it|test|describe)$/.test(node.callee?.object?.name || "") &&
        node.callee?.property?.name === "only"
      ) {
        results.detectOnlyTest.push(getLocation(loc));
      }

      if (astService.isSetupMethod(node)) {
        if (node.arguments[0]?.body?.body?.some(astService.isAssert)) {
          results.detectVerifyInSetup.push(getLocation(loc));
        }
      }

      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        (jestMatchers.has(callee.property.name) ||
          jasmineMatchers.has(callee.property.name)) &&
        args.length > 0 &&
        isToStringMemberExpression(args[0])
      ) {
        results.detectSensitiveEquality.push(getLocation(loc));
      }

      if (
        t.isIdentifier(callee, { name: "beforeAll" }) ||
        t.isIdentifier(callee, { name: "beforeEach" })
      ) {
        if (args.length >= 1 && astService.isFunction(args[0])) {
          collectSetupVariables(args[0].body, setupVariables);
        }
      }

      if (
        t.isMemberExpression(node.callee) &&
        /CallExpression|MemberExpression/.test(node.callee.object.type) &&
        t.isIdentifier(node.callee.property)
      ) {
        if (isExpectToBeAssertion(node)) {
          const isUndefined = isUndefinedLike(node);
          const isDotLength = isUsingDotLength(node);
          if (isUndefined || isDotLength) {
            results.detectSubOptimalAssert.push(getLocation(node.loc));
          }
        } else if (isExpectNotBeAssertion(node)) {
          if (isUndefinedLike(node)) {
            results.detectSubOptimalAssert.push(getLocation(node.loc));
          }
        }
      } else if (node.callee.name === "expect" && isArgBinaryExpression(node)) {
        results.detectSubOptimalAssert.push(getLocation(node.loc));
      }

      if (args.length >= 2 && astService.isTestCase(node)) {
        if (
          astService.isFunction(args[1]) &&
          t.isStringLiteral(args[0]) &&
          !hasManyOfTwoWords(args[0].value)
        ) {
          results.detectAnonymousTest.push(getLocation(loc));
        }

        const testBody = args[1]?.body;
        if (t.isBlockStatement(testBody) && isCommentsOnly(testBody.body)) {
          results.detectCommentsOnlyTest.push(getLocation(loc));
        }

        const isAnyTypeOfFunction = astService.isFunction(args[1]);
        if (
          isAnyTypeOfFunction &&
          t.isStringLiteral(args[0]) &&
          args[0].value.trim() === ""
        ) {
          results.detectTestWithoutDescription.push(getLocation(loc));
        }

        if (t.isFunction(args[1])) {
          const body = args[1].body.body;
          for (const statement of body) {
            if (
              hasConsoleMethod(statement, "log") ||
              hasConsoleMethod(statement, "error") ||
              hasConsoleMethod(statement, "warn") ||
              hasConsoleMethod(statement, "info")
            ) {
              results.detectTranscriptingTest.push(getLocation(loc));
              break;
            }
          }
        }

        if (astService.isFunction(args[1]) && hasManyComments(args[1], 5)) {
          results.detectOvercommentedTest.push(getLocation(loc));
        }

        collectUsedSetupVariables(args[1]?.body, setupVariables, usedVariables);

        if (/it|test/.test(node.callee.name)) {
          if (testDescriptions.has(node.arguments[0].value)) {
            results.detectIdenticalTestDescription.push(getLocation(loc));
          } else {
            testDescriptions.add(node.arguments[0].value);
          }
        }
      }
    },
  });

  setupVariables.forEach((value, variable) => {
    if (!usedVariables.has(variable)) {
      results.detectGeneralFixture.push(value);
    }
  });

  return results;
};

const getSinglePassDetectorResult = (singlePassResults, detectorName) => {
  return singlePassResults[detectorName];
};

const supportsSinglePass = (detectorName) => {
  return SUPPORTED_DETECTOR_NAMES.has(detectorName);
};

export {
  getSinglePassDetectorResult,
  runSinglePassDetectors,
  supportsSinglePass,
};
