/* Typings from https://github.com/facebook/jsx/blob/master/AST.md */

import type { BaseExpression, Property, SpreadElement, Node, BaseNode, Expression, Pattern, Literal } from "estree";

export interface JSXElement extends BaseExpression {
    type: "JSXElement";
    openingElement: JSXOpeningElement;
    children: (JSXText | JSXExpressionContainer /*| JSXSpreadChild*/ | JSXElement /*| JSXFragment*/)[];
    closingElement: JSXClosingElement | null;
}
export interface JSXBoundaryElement extends BaseNode {
    name: JSXIdentifier | JSXMemberExpression | JSXNamespacedName;
}
export interface JSXOpeningElement extends JSXBoundaryElement {
    type: "JSXOpeningElement";
    attributes: Array<JSXAttribute>; // | JSXSpreadAttribute >
    selfClosing: boolean;
}
export interface JSXClosingElement extends JSXBoundaryElement {
    type: "JSXClosingElement";
}
export interface JSXIdentifier extends BaseNode {
    type: "JSXIdentifier";
    name: string;
}
export interface JSXMemberExpression extends BaseExpression {
    type: "JSXMemberExpression";
    object: JSXMemberExpression | JSXIdentifier;
    property: JSXIdentifier;
}
export interface JSXAttribute extends BaseNode {
    type: "JSXAttribute";
    name: JSXIdentifier | JSXNamespacedName;
    value: Literal | JSXExpressionContainer | JSXElement | /*JSXFragment | */ null;
}
// export interface JSXSpreadAttribute extends Omit<SpreadElement, 'type'> {
//     type: "JSXSpreadAttribute";
// }
export interface JSXText extends BaseNode {
    type: "JSXText";
    value: string;
    raw: string;
}
export interface JSXNamespacedName extends BaseExpression {
    type: "JSXNamespacedName";
    namespace: JSXIdentifier;
    name: JSXIdentifier;
}
// export interface JSXEmptyExpression extends BaseNode {
//     type: "JSXEmptyExpression";
// }
export interface JSXExpressionContainer extends BaseNode {
    type: "JSXExpressionContainer";
    expression: Expression; // | JSXEmptyExpression;
}
// export interface JSXSpreadChild extends BaseNode {
//     type: "JSXSpreadChild";
//     expression: Expression;
// }

export type JSXNodes =
    | JSXElement
    | JSXOpeningElement
    | JSXClosingElement
    | JSXIdentifier
    | JSXMemberExpression
    | JSXAttribute
    | JSXNamespacedName
    | JSXExpressionContainer;
export type AllNodes = Node | JSXNodes;
