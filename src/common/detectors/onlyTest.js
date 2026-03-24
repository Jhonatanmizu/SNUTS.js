import traverse from "@babel/traverse";
const traverseDefault =
  typeof traverse === "function" ? traverse : traverse.default;
const isOnlyTest = (node) =>
  /^(it|test|describe)$/.test(node.callee?.object?.name || "") &&
  node.callee?.property?.name === "only";

const detectOnlyTest = (ast) => {
  const results = [];
  traverseDefault(ast, {
    CallExpression: (path) => {
      const node = path.node;
      if (isOnlyTest(node)) {
        results.push({
          startLine: node.loc.start.line,
          endLine: node.loc.end.line,
        });
      }
    },
  });
  return results;
};
export default detectOnlyTest;
