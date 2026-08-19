module.exports = function adminSafeStrings({ types: t }) {
  const isNamedCall = (node, name) =>
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.property, { name });

  const safeString = (node) =>
    t.callExpression(t.identifier('String'), [
      t.logicalExpression('||', t.cloneNode(node, true), t.stringLiteral('')),
    ]);

  return {
    name: 'syncchat-admin-safe-strings',
    visitor: {
      CallExpression(path, state) {
        const filename = String(state?.filename || '').replace(/\\/g, '/');
        if (!filename.endsWith('/admin/app.jsx')) return;

        const { node } = path;
        if (
          !t.isMemberExpression(node.callee) ||
          node.callee.computed ||
          !t.isIdentifier(node.callee.property, { name: 'toLowerCase' })
        ) {
          return;
        }

        const receiver = node.callee.object;
        let nextReceiver = null;

        if (isNamedCall(receiver, 'trim')) {
          const trimBase = receiver.callee.object;
          nextReceiver = t.callExpression(
            t.memberExpression(safeString(trimBase), t.identifier('trim')),
            []
          );
        } else {
          nextReceiver = safeString(receiver);
        }

        path.replaceWith(
          t.callExpression(
            t.memberExpression(nextReceiver, t.identifier('toLowerCase')),
            node.arguments.map((arg) => t.cloneNode(arg, true))
          )
        );
        path.skip();
      },
    },
  };
};
