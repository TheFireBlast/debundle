/* https://github.com/Qard/astring-jsx */

const astring = require("astring");

module.exports.JSXGenerator = Object.assign({}, astring.GENERATOR, {
    // <div></div>
    JSXElement: function JSXElement(node, state) {
        var output = state.output;
        output.write("<");
        this[node.openingElement.type](node.openingElement, state);
        if (node.closingElement) {
            output.write(">");
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                this[child.type](child, state);
            }
            output.write("</");
            this[node.closingElement.type](node.closingElement, state);
            output.write(">");
        } else {
            output.write(" />");
        }
    },
    // <div>
    JSXOpeningElement: function JSXOpeningElement(node, state) {
        var output = state.output;
        this[node.name.type](node.name, state);
        for (var i = 0; i < node.attributes.length; i++) {
            var attr = node.attributes[i];
            this[attr.type](attr, state);
        }
    },
    // </div>
    JSXClosingElement: function JSXOpeningElement(node, state) {
        var output = state.output;
        this[node.name.type](node.name, state);
    },
    // div
    JSXIdentifier: function JSXOpeningElement(node, state) {
        var output = state.output;
        output.write(node.name);
    },
    // Member.Expression
    JSXMemberExpression: function JSXMemberExpression(node, state) {
        var output = state.output;
        this[node.object.type](node.object, state);
        output.write(".");
        this[node.property.type](node.property, state);
    },
    // attr="something"
    JSXAttribute: function JSXAttribute(node, state) {
        var output = state.output;
        output.write(" ");
        this[node.name.type](node.name, state);
        output.write("=");
        this[node.value.type](node.value, state);
    },
    // namespaced:attr="something"
    JSXNamespacedName: function JSXNamespacedName(node, state) {
        var output = state.output;
        this[node.namespace.type](node.namespace, state);
        output.write(":");
        this[node.name.type](node.name, state);
    },
    // {expression}
    JSXExpressionContainer: function JSXExpressionContainer(node, state) {
        var output = state.output;
        output.write("{");
        this[node.expression.type](node.expression, state);
        output.write("}");
    },
});
