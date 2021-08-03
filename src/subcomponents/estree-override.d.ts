import "estree";

declare module "estree" {
    interface BaseNodeWithoutComments {
        type: string;
        loc?: SourceLocation | null | undefined;
        range?: [number, number] | undefined;
        _parent: Node;
    }
}
