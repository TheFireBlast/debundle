import * as estraverse from "estraverse";
import { generate } from "./astring-jsx";
import type * as ESTree from "estree";
import type {} from "./estree-override";
import * as jsxKeys from "estraverse-fb/keys";
import type { JSXSpreadAttributeKind } from "ast-types/gen/kinds";

import { Module } from "./Module";
import { assertType } from "../utils";

export function isJsxCall(node: ESTree.Node): node is ESTree.SimpleCallExpression {
    return (
        node.type == "CallExpression" &&
        node.callee.type == "MemberExpression" &&
        node.callee.property.type == "Identifier" &&
        (node.callee.property.name == "jsx" || node.callee.property.name == "jsxs")
    );
}

// Probably not the best way to do it
var currentModule: Module = null;
export function setCurrentModule(value: Module) {
    currentModule = value;
}

export const JSXVisitor: estraverse.Visitor = {
    enter: function (node, parent) {
        if (isJsxCall(node)) {
            // console.log('Found JSX call "%s"', highlight(generate(node)));
            let args = node.arguments;
            var jsxElement = {
                type: "JSXElement",
                openingElement: {
                    type: "JSXOpeningElement",
                    name: {
                        type: "JSXIdentifier",
                        name: args[0].type == "Literal" ? args[0].value : generate(args[0]),
                    },
                    attributes: [],
                    selfClosing: true,
                },
                closingElement: null,
                children: [],
            };

            var attrNode: ESTree.Node;
            if (args[1].type == "CallExpression" && args[1].callee.type == "Identifier" && args[1].callee.name == "__assign") {
                let result = { type: "ObjectExpression", properties: [] } as ESTree.ObjectExpression;
                let _props = new Map();
                for (let obj of args[1].arguments) {
                    assertType(obj.type, ["ObjectExpression", "Identifier"], args[1], currentModule);
                    if (obj.type == "Identifier") {
                        jsxElement.openingElement.attributes.push({
                            type: "JSXSpreadAttribute",
                            argument: obj,
                        } as JSXSpreadAttributeKind);
                    }
                    if (obj.type == "ObjectExpression")
                        for (let obj_prop of obj.properties) {
                            assertType(obj_prop.type, "Property", obj);
                            assertType(obj_prop.key.type, ["Identifier", "Literal"], obj);
                            if (obj_prop.key.type == "Identifier") _props.set(obj_prop.key.name, obj_prop);
                            else _props.set(obj_prop.key.value, obj_prop);
                        }
                }
                for (let p of _props.values()) {
                    result.properties.push(p);
                }
                attrNode = result;
            } else attrNode = args[1];
            if (attrNode.type == "ObjectExpression") {
                estraverse.replace(attrNode, JSXVisitor);
                for (let p of attrNode.properties) {
                    if (p.type != "Property" || p.key.type != "Identifier") continue;
                    if (p.key.name == "children") {
                        if (p.value.type == "ArrayExpression") jsxElement.children = p.value.elements;
                        else {
                            if (p.value.type.startsWith("JSX")) {
                                jsxElement.children.push(p.value);
                            } else {
                                jsxElement.children.push({
                                    type: "JSXExpressionContainer",
                                    expression: p.value,
                                });
                            }
                        }
                        // //@ts-ignore
                        // if (p.value.type != "ArrayExpression") {
                        //     //@ts-ignore
                        //     p.value = {
                        //         type: "ArrayExpression",
                        //         elements: [p.value as any],
                        //         _parent: attrNode,
                        //     };
                        // }
                        // for (var child of p.value.elements) {
                        //     jsxElement.children.push(child);
                        // }
                        continue;
                    }
                    var attr = {
                        type: "JSXAttribute",
                        name: {
                            type: "JSXIdentifier",
                            name: p.key.name,
                        },
                        value: null,
                    };
                    if (p.value.type == "Literal" && (p.value.raw[0] == "'" || p.value.raw[0] == '"')) {
                        attr.value = p.value;
                    } else {
                        attr.value = {
                            type: "JSXExpressionContainer",
                            expression: p.value,
                        };
                    }
                    jsxElement.openingElement.attributes.push(attr);
                }
            }

            if (jsxElement.children.length > 0) {
                jsxElement.openingElement.selfClosing = false;
                jsxElement.closingElement = {
                    type: "JSXClosingElement",
                    name: {
                        type: "JSXIdentifier",
                        name: jsxElement.openingElement.name.name,
                    },
                };
            }

            // console.log("Transformed to %s", highlight(generate(jsxElement)));

            //@ts-ignore
            return jsxElement as ESTree.Node;
        }
    },
    keys: jsxKeys,
};
