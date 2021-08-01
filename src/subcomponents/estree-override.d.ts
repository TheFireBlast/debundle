import "estree";

declare module "estree" {
    interface BaseNodeWithoutComments {
        // Every leaf interface that extends BaseNode must specify a type property.
        // The type property should be a string literal. For example, Identifier
        // has: `type: "Identifier"`
        type: string;
        loc?: SourceLocation | null | undefined;
        range?: [number, number] | undefined;
        _parent: Node;
    }
}
