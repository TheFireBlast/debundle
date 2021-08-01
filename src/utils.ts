import acorn from "acorn";
import escodegen from "escodegen";
import type { Bundle } from "./subcomponents/Bundle";
import * as ESTree from "estree";

const cliHighlight = require("cli-highlight").highlight;
export function highlight(code: string) {
    cliHighlight(code, {
        language: "javascript",
        ignoreIllegals: true,
        theme: { "title.function": "red" },
    });
}

export class ExtendedError extends Error {
    context: any;
    constructor(name: string, message: string, ...args: any[] /*, context */) {
        let context = {};
        if (typeof args[args.length - 1] !== "string") {
            context = args.pop();
        }
        let description = args.join("\n");
        super([message, ...(description ? [`\nDetails: ${description}`] : []), `\nContext: ${JSON.stringify(context)}`].join("\n"));
        this.name = name;
        this.context = context;
    }
}

export function cloneAst(ast: ESTree.Node) {
    //@ts-ignore
    return acorn.parse("var a = " + escodegen.generate(ast), {}).body[0].declarations[0].init;
}

export function parseBundleModules(node: ESTree.Node, bundle: Bundle, isChunk = false) {
    if (node.type === "ObjectExpression") {
        // Object
        return node.properties.map((property) => {
            //@ts-ignore
            const key = typeof property.key.value !== "undefined" ? property.key.value : property.key.name;
            //@ts-ignore
            return [key, property.value];
        });
    } else if (node.type === "ArrayExpression") {
        // Array
        return node.elements.map((moduleAst, moduleId) => [moduleId, moduleAst]);
    } else {
        throw new ExtendedError(
            "BundleModuleParsingError",
            "Cannot locate modules within bundle - it is not an array or an object!",
            "The module bootstrapping function was found and parsed, but no array or object",
            "containing module closures was found. This probably means that the module being parsed",
            "is something a bit unusual, and in order to unpack this bundle, a manual path to the",
            'module array must be specified by adding a "moduleClosurePath" key to the "options" object',
            `in the ${bundle.metadataFilePath} file that was created. For more information, see [INSERT LINK HERE].`,
            { foo: true }
        );
    }
}
