import * as acorn from "acorn";
import { generate } from "./subcomponents/astring-jsx";
import * as ESTree from "estree";
import * as cliHighlight from "cli-highlight";

import type { Bundle } from "./subcomponents/Bundle";
import type { Module } from "./subcomponents/Module";

export function highlight(code: string, language = "javascript") {
    return cliHighlight.highlight(code, {
        language,
        ignoreIllegals: true,
        theme: { function: () => "red" },
    });
}

export class ExtendedError extends Error {
    constructor(name: string, message: string, description?: string, context?: { node?: ESTree.Node; module?: Module }) {
        super([message, ...(description ? [`\nDetails: ${description}`] : []), `\nContext: ${JSON.stringify(context)}`].join("\n"));
        this.name = name;
        this.message = message;
        if (context?.module) this.message += ` (@${context.module.path} | id:${context.module.id})`;
        if (context?.node) this.message += `\n${highlight(generate(context.node)).replace(/^/g, "  ")}`;
    }
}

export function cloneAst(ast: ESTree.Node) {
    //TODO: optimize
    return (acorn.parse("var a = " + generate(ast), { ecmaVersion: 2020 }) as any).body[0].declarations[0].init;
}

export function parseBundleModules(node: ESTree.Node, bundle: Bundle, isChunk = false): [number | string, ESTree.Node][] {
    if (node.type === "ObjectExpression") {
        return node.properties.map((property: ESTree.Property) => [property.key["value"] ?? property.key["name"], property.value]);
    } else if (node.type === "ArrayExpression") {
        return node.elements.map((moduleAst, moduleId) => [moduleId, moduleAst]);
    } else {
        throw new ExtendedError(
            "BundleModuleParsingError",
            `Cannot locate modules within bundle - it is not an array or an object!
The module bootstrapping function was found and parsed, but no array or object\
containing module closures was found. This probably means that the module being parsed\
is something a bit unusual, and in order to unpack this bundle, a manual path to the\
module array must be specified by adding a "moduleClosurePath" key to the "options" object\
in the "${bundle.metadataFilePath}" file that was created` //. For more information, see [INSERT LINK HERE].`,
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
        throw new ExtendedError("TypeAssertionError", `Expected ${oxford(expected, "or", "nothing")}, got ${type} instead`, null, {
            node: print,
            module,
        });
    }
}
