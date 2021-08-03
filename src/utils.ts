import * as acorn from "acorn";
import { generate } from "./subcomponents/astring-jsx";
import * as ESTree from "estree";
import * as cliHighlight from "cli-highlight";

import type { Bundle } from "./subcomponents/Bundle";
import { Module } from "./subcomponents/Module";

export function highlight(code: string, language = "javascript") {
    return cliHighlight.highlight(code, {
        language,
        ignoreIllegals: true,
        theme: { function: () => "red" },
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
    //TODO: optimize
    return (acorn.parse("var a = " + generate(ast), { ecmaVersion: 2020 }) as any).body[0].declarations[0].init;
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

export function oxford(arr: string[], conjunction: string = "and", ifempty: string = "") {
    let l = arr.length;
    if (!l) return ifempty;
    if (l < 2) return arr[0];
    if (l < 3) return arr.join(` ${conjunction} `);
    arr = arr.slice();
    arr[l - 1] = `${conjunction} ${arr[l - 1]}`;
    return arr.join(", ");
}

export function assertType<T extends string>(type: string, expected: T | T[], print?: ESTree.Node, module?: Module): asserts type is T {
    expected = [expected].flat(3) as T[];
    if (!expected.includes(type as T)) {
        var info = ''
        if (print) info = `${highlight(generate(print)).replace(/^/g,'  ')}`;
        if (module) info = `at ${module.path} (${module.id})\n${info}`;
        throw new ExtendedError(`Expected ${oxford(expected, "or", "nothing")}, got ${type} instead`,info);
    }
}
