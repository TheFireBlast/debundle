/* Generator from https://github.com/Qard/astring-jsx */

import * as astring from "astring";
import type { JSXNodes, AllNodes } from "./JSXTypes";

export type JSXOnlyGeneratorType = {
    [T in JSXNodes["type"]]: (node: JSXNodes & { type: T }, state: astring.State) => void;
};
export type JSXGeneratorType = {
    [T in AllNodes["type"]]: (node: AllNodes & { type: T }, state: astring.State) => void;
};

export const JSXGenerator: JSXGeneratorType = Object.assign({}, astring.GENERATOR, <JSXOnlyGeneratorType>{
    // <div></div>
    JSXElement: function JSXElement(node, state) {
        state.write("<");
        this[node.openingElement.type](node.openingElement, state);
        if (node.closingElement) {
            state.write(">");
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                this[child.type](child, state);
            }
            state.write("</");
            this[node.closingElement.type](node.closingElement, state);
            state.write(">");
        } else {
            state.write(" />");
        }
    },
    // <div>
    JSXOpeningElement: function JSXOpeningElement(node, state) {
        this[node.name.type](node.name, state);
        for (var i = 0; i < node.attributes.length; i++) {
            var attr = node.attributes[i];
            this[attr.type](attr, state);
        }
    },
    // </div>
    JSXClosingElement: function JSXOpeningElement(node, state) {
        this[node.name.type](node.name, state);
    },
    // div
    JSXIdentifier: function JSXOpeningElement(node, state) {
        state.write(node.name);
    },
    // Member.Expression
    JSXMemberExpression: function JSXMemberExpression(node, state) {
        this[node.object.type](node.object, state);
        state.write(".");
        this[node.property.type](node.property, state);
    },
    // attr="something"
    JSXAttribute: function JSXAttribute(node, state) {
        state.write(" ");
        this[node.name.type](node.name, state);
        state.write("=");
        this[node.value.type](node.value, state);
    },
    // {...attrList}
    JSXSpreadAttribute: function JSXSpreadAttribute(node, state) {
        state.write(" {...");
        this[node.argument.type](node.argument, state);
        state.write("}");
    },
    // namespaced:attr="something"
    JSXNamespacedName: function JSXNamespacedName(node, state) {
        this[node.namespace.type](node.namespace, state);
        state.write(":");
        this[node.name.type](node.name, state);
    },
    // {expression}
    JSXExpressionContainer: function JSXExpressionContainer(node, state) {
        state.write("{");
        this[node.expression.type](node.expression, state);
        state.write("}");
    },
});

export function generate(node: astring.Node, options?: astring.Options<null>) {
    return astring.generate(
        node,
        Object.assign({}, options, {
            generator: JSXGenerator,
        })
    );
}
