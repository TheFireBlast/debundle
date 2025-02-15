import fs from "fs";
import path from "path";

import * as acorn from "acorn";
import * as estraverse from "estraverse";
// import escodegen from "escodegen";
import { generate } from "./astring-jsx";
import * as ESTree from "estree";
import type {} from "./estree-override";

import { parseBundleModules, highlight } from "../utils";
import { DEFAULT_CHUNK, DEFAULT_OPTIONS, METADATA_FILE_TEMPLATE } from "../settings";

import { WebpackBootstrap, WebpackBootstrapNotFoundError } from "./WebpackBootstrap";
import { Chunk } from "./Chunk";
import { Module } from "./Module";

export interface DebundleHooks {
    preParse?(bundle: Bundle): void;
    postParse?(bundle: Bundle): void;
}

export interface BundleMetadata {
    version: number;
    options: {
        [index: string]: any;
        outPath?: string;
        chunkFileNameSuffix?: string;
        publicPathPrefix?: string;
        chunkHttpRequestOptions?: any;
        chunkNameMapping?: { [x: string]: string };
    };
    hooks?: DebundleHooks;
}

export class Bundle {
    path: string;
    metadataFilePath: string;
    metadataFileContents: any;
    chunks: Map<string, Chunk>;
    logIndentLevel: number;
    ast!: ESTree.Program;
    webpackBootstrap: WebpackBootstrap;
    moduleTree!: unknown[];

    outPath!: string;
    chunkFileNameSuffix!: string;
    publicPathPrefix!: string;
    chunkHttpRequestOptions!: unknown;
    chunkNameMapping!: { [x: string]: string };

    _options: BundleMetadata["options"];
    _hooks: DebundleHooks;
    _metadataFileExistedAtStartOfProgram!: boolean;
    fileName!: string;

    /**ID for the JSX runtime module */
    jsx?: number;
    constructor(p: string) {
        this.path = p;
        if (!path.isAbsolute(this.path)) {
            // Convert `this.path` to be absolute if it is not.
            const cwd = path.resolve();
            this.path = path.join(cwd, this.path);
        }

        var parsedPath = path.parse(this.path);
        this.metadataFilePath = path.join(path.dirname(this.path), parsedPath.name + ".debundle" + parsedPath.ext);
        this.metadataFileContents = {};

        this.chunks = new Map();
        this.logIndentLevel = 0;

        this._options = DEFAULT_OPTIONS;
        // Add a getter / setter on the main bundle object for these options.
        for (const key in DEFAULT_OPTIONS) {
            Object.defineProperty(this, key, {
                get: () => this._options[key],
                set: (value) => {
                    this._options[key] = value;
                    this.writeMetadataFile();
                },
            });
        }
        this._hooks = {};
        this.readMetadataFile();
    }

    logIndent() {
        this.logIndentLevel += 1;
    }
    logDedent() {
        this.logIndentLevel -= 1;
    }
    log = (...args: any[]) => {
        let indent = "";
        for (let i = 0; i < this.logIndentLevel; i += 1) {
            indent += "  ";
        }
        console.log(`[LOG]${indent}`, ...args);
    };

    get [Symbol.toStringTag]() {
        return `bundle ${this.path}: ${this.chunks.size} chunks, ${Object.keys(this.modules).length} modules`;
    }

    parse() {
        const bundleContents = fs.readFileSync(this.path).toString();
        this.log(`Read bundle ${this.path} (${bundleContents.length} bytes)`);

        // HOOK: PreParse
        if (this._hooks.preParse) {
            this._hooks.preParse(this);
        }

        //@ts-ignore
        this.ast = acorn.parse(bundleContents, { ecmaVersion: 2020 });

        // Add `_parent` property to every node, so that the parent can be
        // determined in later code.
        estraverse.traverse(this.ast, {
            fallback: "iteration",
            enter: function (node, parent) {
                node._parent = parent;
            },
        });

        this._findWebpackBootstrap();

        // Get a path to the location within the bundle where the module list occurs.
        // Should return a list of `FunctionExpression` ast nodes.
        const webpackBootstrapParent = this.webpackBootstrap.ast._parent as ESTree.CallExpression;
        const bundleModules = parseBundleModules(webpackBootstrapParent.arguments[0], this);
        this.log(`Found ${Object.keys(bundleModules).length} modules in main bundle`);
        this.addChunk(DEFAULT_CHUNK, bundleModules);

        this.moduleTree = this._calculateModuleTree();

        this.writeMetadataFile();

        // HOOK: PostParse
        if (this._hooks.postParse) {
            this._hooks.postParse(this);
        }

        return this;
    }

    async writeAll() {
        this.log(`Writing all modules to ${this.outPath}...`);
        const promises: Promise<void>[] = [];
        for (const [key, value] of this.modules) {
            promises.push(value.write());
        }
        await Promise.all(promises);
        this.log(`Finished writing all modules to ${this.outPath}: wrote ${this.modules.size} files.`);
    }

    get modules(): Map<number, Module> {
        return new Map(Array.from(this.chunks).flatMap(([id, chunk]) => Array.from(chunk.modules)));
    }
    get _modulesKeys(): number[] {
        return Array.from(this.modules).map(([key, value]) => key);
    }
    get _modulesValues(): Module[] {
        return Array.from(this.modules).map(([key, value]) => value);
    }

    // Given anything that could be specified in a `require` call, return the module
    getModule(arg: number): Module {
        // First, try by module id, then by path
        return this.modules.get(arg)! /* || this.modules.find((m) => m.path === arg)*/ || null;
    }

    getChunk(chunkId: string) {
        const chunkById = this.chunks.get(chunkId);
        if (chunkById) {
            return chunkById;
        }

        for (const [chunkId, chunk] of this.chunks) {
            if (chunk.fileName === chunkId) {
                return chunk;
            }

            // "main.xyx.js" => "main"
            const name = path.basename(this.fileName, path.extname(this.fileName)).split(".")[0];
            if (name === chunkId) {
                return chunk;
            }
        }

        return null;
    }
    get defaultChunk() {
        return this.getChunk(DEFAULT_CHUNK);
    }
    addChunk(fileName: string, bundleModules?: any) {
        const chunk = new Chunk(this, fileName, bundleModules);
        chunk.ids.forEach((id) => {
            this.chunks.set(id, chunk);
        });
        return chunk;
    }

    // Get all modules that are at the top level of the bundle (probably just one, but could be
    // multiple in theory)
    get entrypointModule() {
        return this.modules.get(this.webpackBootstrap.entrypointModuleId);
    }

    // Find the ast that makes up the webpack bootstrap section of the bundle
    _findWebpackBootstrap() {
        if (this.webpackBootstrap) {
            return this.webpackBootstrap;
        }
        const log = this.log;

        let webpackBootstrap!: ESTree.FunctionExpression, webpackBoostrapModuleCallNode;

        log(`Looking for webpackBootstrap in bundle...`);
        estraverse.traverse(this.ast.body as any, {
            fallback: "iteration",
            enter: function (node, parent) {
                // Looking for this line, which invokes each module closure:
                // > modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
                function findRequireFunction() {
                    let moduleCallNode = null;

                    estraverse.traverse(node, {
                        fallback: "iteration",
                        enter: function (n) {
                            const isModuleCallNode =
                                n.type === "CallExpression" &&
                                n.callee.type === "MemberExpression" &&
                                n.callee.property.type === "Identifier" &&
                                n.callee.property.name === "call" &&
                                n.callee.object.type === "MemberExpression" &&
                                n.arguments.length === 4;

                            if (isModuleCallNode) {
                                moduleCallNode = n;
                                this.break();
                            }
                        },
                    });

                    return moduleCallNode;
                }

                const requireFunction = findRequireFunction();

                const isWebpackBootstrap =
                    node &&
                    node.type &&
                    node.type == "FunctionExpression" && //node.type == "FunctionDeclaration" ||
                    node.params.length === 1 &&
                    node.body.type.startsWith("Block") &&
                    requireFunction;

                if (isWebpackBootstrap) {
                    log(`Found webpackBootstrap!`);
                    webpackBootstrap = node as ESTree.FunctionExpression;
                    log(`webpackBootstrap module call expression: ${highlight(generate(requireFunction))}`);
                    webpackBoostrapModuleCallNode = requireFunction;
                    this.break();
                }
            },
        });

        if (!webpackBootstrap) {
            throw new WebpackBootstrapNotFoundError(
                [
                    `Unable to locate webpackBootstrap, part of a webpack bundle that orchestrates the module system.`,
                    `This is a hard requirement to be able to debundle, since it contains a bunch of metadata required`,
                    `for later in the process.`,
                    ``,
                    `To continue, you'll need to locate the path to the 'FunctionExpression' that contains webpackBootstrap,`,
                    `and put this in the metadata file generated alongside your bundle (${this.metadataFilePath})`,
                    "",
                    `Take a look at the documentation online for more information.`,
                ].join("\n")
            );
        }

        this.webpackBootstrap = new WebpackBootstrap(webpackBootstrap, webpackBoostrapModuleCallNode);
        return this.webpackBootstrap;
    }

    moduleClosureParamMetadata() {
        return this.webpackBootstrap.moduleClosureParamMetadata();
    }

    //TODO: add types
    _calculateModuleTree() {
        // Create an object mapping the module id to an object containing the module id, the parent
        // modules, and the vhild modules.
        const tree = Object.fromEntries(
            this._modulesValues.map((module) => [
                module.id,
                {
                    id: module.id,
                    _dependencyIds: module._dependencyModuleIds,
                    parents: [],
                    children: [],
                    bare: false,
                },
            ])
        );

        // Loop through each element in the object, populating all the children and parents.
        Object.values(tree).forEach((item) => {
            //@ts-ignore
            item.children = item._dependencyIds
                .filter((a: { moduleId: any }) => a.moduleId !== null)
                .flatMap(({ moduleId }) => {
                    if (!tree[moduleId]) {
                        //@ts-ignore
                        tree[moduleId] = { parents: [], children: [], bare: true };
                    }
                    const m = tree[moduleId];
                    //@ts-ignore
                    m.parents.push(item);
                    return [m];
                });
            //@ts-ignore
            delete item._dependencyIds;
        });

        return Object.values(tree);
    }

    serialize() {
        return {
            version: 1,
            // Only include options that were changed from the default
            options: Object.fromEntries(Object.entries(this._options).filter(([key, value]) => DEFAULT_OPTIONS[key] !== value)),
        };
    }

    writeMetadataFile(opts = { force: false }) {
        const shouldWrite = !this._metadataFileExistedAtStartOfProgram || opts.force;

        if (shouldWrite) {
            fs.writeFileSync(
                this.metadataFilePath,
                METADATA_FILE_TEMPLATE.replace("<JSON>", JSON.stringify(this.serialize(), null, 2)).replace("<PATH>", this.path)
            );
        }
    }

    readMetadataFile() {
        let file!: BundleMetadata;
        this._metadataFileExistedAtStartOfProgram = true;
        try {
            file = require(this.metadataFilePath);
        } catch (e) {
            this._metadataFileExistedAtStartOfProgram = false;
        }

        if (!this._metadataFileExistedAtStartOfProgram) {
            this.writeMetadataFile();
            return;
        }

        if (typeof file !== "object") {
            throw new Error(`Malformed metadata file - module.exports is expected to be an object, not ${typeof file}!`);
        }

        const { version, options, hooks } = file;

        if (version !== 1) {
            throw new Error(
                `Malformed metadata file - metadata file is version ${version}, but this program only knows how to read version 1`
            );
        }

        // Load all options as fields on the bundle
        for (const key in options) {
            this._options[key] = options[key] || this._options[key];
        }

        this._hooks = hooks || {};
    }
}
