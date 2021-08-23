import * as estraverse from "estraverse";
import { generate } from "./astring-jsx";
import type * as ESTree from "estree";
import type {} from "./estree-override";
import * as jsxKeys from "estraverse-fb/keys";
import type { JSXAttribute, JSXExpressionContainer, JSXSpreadAttribute } from "./JSXTypes";

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

// Transforms plain JS back into JSX
// Example:
// JSX.jsxs(MyComponent, Object.assign({}, mySpreadAttr, {myNumProp: 123, myStrProp: "abc"}, {children: ["Hello world", JSX.jsx("div", {}, void 0)]}, void 0)
// <MyComponent {...mySpreadAttr} myNumProp={123} myStrProp="abc">Hello world<div></div></MyComponent>
//TODO: rename to JSXTransform
export const JSXVisitor: estraverse.Visitor = {
    enter: function (node, parent) {
        if (isJsxCall(node)) {
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
                _parent: parent,
            };

            // ObjectExpression containing the JSXElement's attributes
            var attrNode: ESTree.Node;
            //TODO: support Object.assign for ES6+
            // If the node is an `Object.assign` call, then the objects are merged
            if (args[1].type == "CallExpression" && args[1].callee.type == "Identifier" && args[1].callee.name == "__assign") {
                let result = { type: "ObjectExpression", properties: [] } as ESTree.ObjectExpression;
                let _props: Map<string, ESTree.Property> = new Map();
                for (let obj of args[1].arguments) {
                    assertType(obj.type, ["ObjectExpression", "Identifier"], args[1], currentModule);
                    // If one the objects is an Identifier, then it's transformed into a JSXSpreadAttribute ({...abc})
                    if (obj.type == "Identifier") {
                        jsxElement.openingElement.attributes.push({
                            type: "JSXSpreadAttribute",
                            argument: obj,
                        } as JSXSpreadAttribute);
                    } else if (obj.type == "ObjectExpression") {
                        for (let obj_prop of obj.properties) {
                            assertType(obj_prop.type, "Property", obj);
                            assertType(obj_prop.key.type, ["Identifier", "Literal"], obj);
                            if (obj_prop.key.type == "Identifier") _props.set(obj_prop.key.name, obj_prop);
                            else _props.set(obj_prop.key.value as string, obj_prop);
                        }
                    }
                }
                for (let p of _props.values()) result.properties.push(p);
                attrNode = result;
            } else attrNode = args[1];
            if (attrNode.type == "ObjectExpression") {
                estraverse.replace(attrNode, JSXVisitor);
                for (let p of attrNode.properties) {
                    if (p.type != "Property" || p.key.type != "Identifier") continue;
                    if (p.key.name == "children") {
                        let children = (p.value.type == "ArrayExpression" ? p.value.elements : [p.value]) as ESTree.Expression[];
                        for (let el of children) {
                            if (el.type.startsWith("JSX")) {
                                jsxElement.children.push(el);
                            } else {
                                jsxElement.children.push({
                                    type: "JSXExpressionContainer",
                                    expression: el,
                                });
                            }
                        }
                        continue;
                    }
                    var attr = {
                        type: "JSXAttribute",
                        name: {
                            type: "JSXIdentifier",
                            name: p.key.name,
                        },
                        value: null,
                    } as JSXAttribute;
                    if (p.value.type == "Literal" && (p.value.raw[0] == "'" || p.value.raw[0] == '"')) {
                        attr.value = p.value;
                    } else {
                        attr.value = {
                            type: "JSXExpressionContainer",
                            expression: p.value,
                        } as JSXExpressionContainer;
                    }
                    jsxElement.openingElement.attributes.push(attr);
                }
            }

            if (jsxElement.children.length > 0) {
                // There's no way to know if the original JSX was `<App></App>` or `<App/>`,
                // so we only set `selfClosing` to false when there is at least one child.
                jsxElement.openingElement.selfClosing = false;
                jsxElement.closingElement = {
                    type: "JSXClosingElement",
                    name: {
                        type: "JSXIdentifier",
                        name: jsxElement.openingElement.name.name,
                    },
                };
            }

            return jsxElement as ESTree.Node;
        }
    },
    keys: jsxKeys,
};
