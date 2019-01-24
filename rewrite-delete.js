// Copyright 2019 Rafael Gieschke
// SPDX-License-Identifier: GPL-2.0-or-later

/**
 * @fileoverview Rule to rewrite delete to Reflect.delete
 */
"use strict";

module.exports = {
    meta: {
        fixable: true,
    },
    create(context) {
        return {
            UnaryExpression(node) {
                if (node.operator === "delete" && node.argument.type !== "Identifier") {
                    context.report({
                        message: "Use Reflect.delete.",
                        node,
                        *fix(fixer) {
                            yield fixer.insertTextBefore(node, "Reflect.deleteProperty(Object(");
                            yield fixer.insertTextAfter(node, ")");
                            yield fixer.removeRange([node.start, node.start + node.operator.length]);
                            yield fixer.replaceTextRange([node.argument.object.end, node.argument.property.start], "), ");
                            yield fixer.removeRange([node.argument.property.end, node.argument.end]);
                        },
                    });
                } else if (node.operator === "delete") {
                    const scopeManager = context.getSourceCode().scopeManager;
                    let scope;
                    for (let curNode = node; curNode && !scope; curNode = curNode.parent) {
                        scope = scopeManager.acquire(curNode, true);
                    }
                    if (scope.set.has(node.argument.name)) {
                        // Trying to delete a variable.
                        context.report({
                            message: "Do not use delete on variables.",
                            node,
                            *fix(fixer) {
                                yield fixer.replaceTextRange([node.start, node.end], "true");
                            }
                        });
                    } else {
                        context.report({
                            message: `Use delete globalThis.${node.argument.name}`,
                            node,
                            *fix(fixer) {
                                yield fixer.insertTextBefore(node.argument, "globalThis.");
                            }
                        });
                    }
                }
            }
        };
    },
};
