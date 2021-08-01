import fs from "fs";
import path from "path";

import * as escope from "escope";
import estraverse from "estraverse";
import escodegen from "escodegen";
import chalk from "chalk";
import mkdirp from "mkdirp";
import acorn from "acorn";
import * as ESTree from "estree";
import type {} from "./estree-override";

import { cloneAst, highlight } from "../utils";
import { DEFAULT_CHUNK } from "../settings";
import { Bundle } from "./Bundle";
import { Chunk } from "./Chunk";

// Thrown when a require function is encountered with multiple arguments
export class RequireFunctionHasMultipleArgumentsError extends Error {}

export class Module {
    chunk: Chunk;
    bundle: Bundle;
    id: number;
    ast: ESTree.FunctionExpression;
    mappings: Set<[path: string, name: string]>;
    _packageName: string;
    metadataFileConfig: any;
    _defaultPath: string;
    path: string;
    comment: string;
    scopeManager: any;
    _dependencyModuleIds: ReturnType<Module["_findAllRequireFunctionCalls"]>;

    importName: string;
    importPath: string;
    constructor(chunk: Chunk, moduleId: number, ast: ESTree.FunctionExpression) {
        this.chunk = chunk;
        this.bundle = this.chunk.bundle;

        this.id = moduleId;
        this.ast = ast;
        this.mappings = new Set();

        this._packageName = null;

        this.metadataFileConfig = (this.bundle.metadataFileContents.modules || []).find((i) => i.id === this.id) || {};

        this._defaultPath = `${chunk.ids.join("-")}-${this.id}.js`.replace(new RegExp(path.sep == "\\" ? "\\\\" : path.sep, "g"), "-");
        this.path = this.metadataFileConfig.path || this._defaultPath;
        this.comment = null;

        this.scopeManager = escope.analyze(this.ast, null);

        // Find all referenced to `require(...)` in the module, and figure out which modules are being
        // required
        this._dependencyModuleIds = this._findAllRequireFunctionCalls();

        const dependencyModuleIdsRaw = this._dependencyModuleIds.filter((i) => i.moduleId).map((i) => i.moduleId);
        this.bundle.log(
            [
                `Discovered module ${moduleId} `,
                `(chunk ${highlight(JSON.stringify(chunk.ids))}`,
                `${
                    (dependencyModuleIdsRaw.length > 0 ? ", depends on " : "") +
                    dependencyModuleIdsRaw
                        .slice(0, 3)
                        .map((i) => chalk.green(i))
                        .join(", ") +
                    (dependencyModuleIdsRaw.length > 3 ? `, and ${dependencyModuleIdsRaw.length - 3} more` : "")
                })`,
            ].join("")
        );
        this.bundle.logIndent();

        // If any modules were found to be in additional chunks that were not previously known about,
        // add them.
        this._dependencyModuleIds
            .filter((i) => i.type === "REQUIRE_ENSURE")
            .filter(({ chunkId }) => !(chunkId === DEFAULT_CHUNK || this.chunk.ids.includes(chunkId) || this.bundle.getChunk(chunkId)))
            .forEach(({ chunkId, moduleId }) => {
                this.bundle.log(`Module ${this.id} depends on chunk ${chunkId}, parsing new chunk...`);

                const chunkFileName = this.bundle.chunkNameMapping[chunkId] || `${chunkId}${this.bundle.chunkFileNameSuffix}`;
                this.bundle.addChunk(chunkFileName);
            });

        this.bundle.logDedent();
        if (this.path.includes(path.sep)) {
        }
    }

    get absolutePath() {
        return path.join(this.bundle.distPath, this.path);
    }

    // Get a reference to require, module, or exports defined in the module closure
    _getModuleClosureVariable(varname) {
        const index = this.bundle.moduleClosureParamMetadata().paramIndexes.indexOf(varname);
        const node = this.ast.params[index] as ESTree.Identifier;
        if (!node) {
            return null;
        }

        return this.scopeManager.scopes[0].variables.find((v) => v.name === node.name);
    }
    get requireVariable() {
        return this._getModuleClosureVariable("require");
    }
    get moduleVariable() {
        return this._getModuleClosureVariable("module");
    }
    get exportsVariable() {
        return this._getModuleClosureVariable("exports");
    }

    get dependencies() {
        return new Map(
            this._dependencyModuleIds.filter((a) => a.moduleId !== null).map(({ moduleId }) => [moduleId, this.bundle.getModule(moduleId)])
        );
    }

    code(opts = { renameVariables: true, removeClosure: true }) {
        const originalAst = cloneAst(this.ast);

        if (opts.renameVariables) {
            var getVariable = (declarator: ESTree.VariableDeclarator) => {
                var scope = this.scopeManager.acquire(declarator);
                if (!scope) {
                    var body: any = declarator;
                    while (!body.type.includes("Function")) {
                        body = body._parent;
                    }
                    scope = this.scopeManager.acquire(body);
                }
                return scope && scope.variables.find((v) => v.name === (declarator.id as ESTree.Identifier).name);
            };
            var renameDeclarator = (declarator: ESTree.VariableDeclarator, name: string) => {
                if (declarator.id.type != "Identifier" || declarator.id.name == name) return;
                var variable = getVariable(declarator);
                if (variable) return this.renameVariable(variable, name);
                console.error("Failed to rename %s to %s (%d)", declarator.id.name, name, this.path);
            };

            // Remap variable names
            for (let mapping of this.mappings) {
                let dec: any = this.ast.body;
                let varpath = mapping[0].split(".").map((n) => (isNaN(+n) ? n : +n));
                for (let n of varpath) dec = dec[n];
                renameDeclarator(dec, mapping[1]);
            }

            if (this.requireVariable) {
                // Rename import utils
                let importUtilsDeclaration = this.ast.body.body[1];
                if (importUtilsDeclaration && importUtilsDeclaration.type == "VariableDeclaration") {
                    for (let dec of importUtilsDeclaration.declarations) {
                        if (
                            dec.init &&
                            dec.init.type == "LogicalExpression" &&
                            dec.init.left.type == "LogicalExpression" &&
                            dec.init.left.left.type == "ThisExpression" &&
                            dec.init.left.right.type == "MemberExpression" &&
                            dec.init.left.right.property.type == "Identifier"
                        ) {
                            renameDeclarator(dec, dec.init.left.right.property.name);
                        }
                    }
                }
                // Adjust all require calls to contain the path to the module that is desired
                this._findAllRequireFunctionCalls().forEach((call) => {
                    const requiredModule = this.bundle.modules.get(call.moduleId);
                    if (!requiredModule) return;

                    const requiredModulePath = requiredModule.absolutePath;

                    // Rename import variables
                    let debug = false;
                    if (requiredModule.importName) {
                        let node = call.ast._parent._parent;
                        if (node.type == "AssignmentExpression") {
                            if (node.left.type == "MemberExpression") {
                                // assignment.left.object.name = requiredModule.importName;
                                // var variable = this.scopeManager.scopes[0].variables.find(v => v.name === assignment.left.object.name)
                                // console.log(assignment.left.object.name, variable)
                                // this.renameVariable(variable, 'requiredModule.importName');
                            } else if (debug) console.log("assignment.left =", node.left);
                        } else if (node.type == "VariableDeclarator") {
                            // assignment.id.name = requiredModule.importName;
                            renameDeclarator(node, requiredModule.importName);
                        } else if (node.type == "CallExpression") {
                            // assignment.id.name = requiredModule.importName;
                            if (node._parent.type == "VariableDeclarator") {
                                renameDeclarator(node._parent, requiredModule.importName);
                                // if(this.id ==646)console.log('CallExpression',node)
                            } else if (debug) console.log("CallExpression =", node);
                        } else if (debug) console.log("assignment =", node);
                    }

                    // JSX Transform
                    //TODO: support React.createElement
                    //TODO: rename file extension to .jsx
                    //TODO: third argument
                    if (this.id == 646 && requiredModule.id === this.bundle.jsx) {
                        let node = call.ast._parent._parent;
                        if (node.type == "VariableDeclarator") {
                            var v = getVariable(node);
                            var traversed = new Set();
                            function isJsxCall(node) {
                                return (
                                    node.type == "CallExpression" &&
                                    node.callee.type == "MemberExpression" &&
                                    node.callee.property.type == "Identifier" &&
                                    node.callee.property.name == "jsx"
                                );
                            }
                            //TODO: use estraverse
                            function jsxTraverse(jsxcall, getstr = false) {
                                traversed.add(jsxcall);
                                // console.log(ref._parent._parent);
                                let args = jsxcall.arguments;
                                let name = "";
                                if (args[0].type == "Literal") {
                                    name = args[0].value;
                                } else {
                                    name = escodegen.generate(args[0]);
                                }
                                let children;
                                let props = [];
                                if (
                                    args[1].type == "CallExpression" &&
                                    args[1].callee.type == "Identifier" &&
                                    args[1].callee.name == "__assign"
                                ) {
                                    let result = { type: "ObjectExpression", properties: [] };
                                    let _props = new Map();
                                    for (let obj of args[1].arguments) {
                                        for (let obj_prop of obj.properties) {
                                            if (isJsxCall(obj_prop.value)) jsxTraverse(obj_prop.value);
                                            _props.set(obj_prop.key.name, obj_prop);
                                        }
                                    }
                                    for (let p of _props.values()) {
                                        result.properties.push(p);
                                    }
                                    args[1] = result; //TODO: improve
                                }
                                if (args[1].type == "ObjectExpression") {
                                    let childrenProp = args[1].properties.find((p) => p.key.name == "children");
                                    if (childrenProp && childrenProp.value.type == "CallExpression") {
                                        children = jsxTraverse(childrenProp.value, true);
                                    }

                                    for (let p of args[1].properties) {
                                        if (p.key.name == "children") continue;
                                        //TODO: use estraverse
                                        if (isJsxCall(p.value)) {
                                            props.push(p.key.name + "={" + jsxTraverse(p.value, true) + "}");
                                        } else props.push(p.key.name + "=" + escodegen.generate(p.value));
                                        // console.log('prop: %s', p.key.name)
                                    }
                                }
                                let str;
                                if (children) str = `<${name} ${props.join(" ")}>\n${children.replace(/^/g, "   ")}\n</${name}>`;
                                else str = `<${name} ${props.join(" ")}/>`;
                                if (getstr) return str;
                                let replacement = {
                                    type: "Identifier",
                                    name: str,
                                    _parent: jsxcall._parent,
                                };
                                return replacement;
                            }
                            for (let ref of v.references) {
                                ref = ref.identifier;
                                if (
                                    ref._parent &&
                                    ref._parent.type == "MemberExpression" &&
                                    ref._parent.property.type == "Identifier" &&
                                    ref._parent.property.name == "jsx" &&
                                    ref._parent._parent.type == "CallExpression"
                                ) {
                                    let call = ref._parent._parent;
                                    if (traversed.has(call)) continue;
                                    ref._parent._parent.type = "Identifier";
                                    ref._parent._parent.name = jsxTraverse(call, true);
                                    console.log("traversed", ref._parent._parent);
                                }
                            }
                            // console.log(v.references[1].identifier);
                            // process.exit();
                        }
                    }

                    // Determine the require path that must be used to access the module requested from
                    // the current module.
                    call.ast.value = "./" + path.relative(path.dirname(this.absolutePath), requiredModulePath).replace(/\\/g, "/");
                    if (call.ast.value.startsWith("./node_modules")) {
                        call.ast.value =
                            requiredModule.importPath || call.ast.value.replace("./node_modules/", "").replace(/(\/index)?\.js$/, "");
                    }
                });

                // Rename __webpack_require__ (or minified name) to require
                this.renameVariable(this.requireVariable, "require");
            }

            const moduleVariable = this.moduleVariable;
            if (moduleVariable) {
                // Update the minified value of `module.exports` to be `module.exports`
                // ie, `f.P` (from one random bundle, as an example) => `module.exports`
                moduleVariable.references.forEach((ref) => {
                    const n = ref.identifier._parent;
                    if (n.type !== "MemberExpression") {
                        return;
                    }

                    const moduleExportsKey = this.bundle.moduleClosureParamMetadata().moduleExportsKey;
                    if (n.property.name !== moduleExportsKey) {
                        return;
                    }

                    n.property.name = "exports";
                });

                // Rename the module closure variable to module (the bundle may be minified and this may not be
                // the case already)
                this.renameVariable(moduleVariable, "module");
            }

            const exportsVariable = this.exportsVariable;
            if (exportsVariable) {
                // Rename the exports closure variable to module (the bundle may be minified and this may not
                // be the case already)
                this.renameVariable(this.exportsVariable, "exports");
            }
        }

        const newAst = this.ast;
        this.ast = originalAst;

        let code;
        if (opts.removeClosure) {
            code = newAst.body.body.map((e) => escodegen.generate(e)).join("\n");
        } else {
            code = escodegen.generate(newAst);
        }

        // Add comment to beginning of code, if it is defined.
        if (this.comment) {
            return `/*\n${this.comment}\n*/\n${code}`;
        } else {
            return code;
        }
    }

    // Rename a variable in the module to be a different name
    renameVariable(variable, newName) {
        variable.name = newName;

        // Rename all instances of the variabl
        variable.identifiers.forEach((ident) => {
            ident.name = newName;
        });

        // Rename all other references of the variable, too
        variable.references.forEach((reference) => {
            reference.identifier.name = newName;
        });
        return this;
    }

    // Returns an array of objects of {type, chunkId, moduleId, ast}, retreived by parting the AST and
    // determining all the times that the `require` or `require.ensure` functions were invoked.
    _findAllRequireFunctionCalls(): {
        type: "REQUIRE_FUNCTION" | "REQUIRE_ENSURE" | "REQUIRE_T";
        chunkId: string;
        moduleId: number;
        ast: ESTree.Literal;
    }[] {
        const requireFunctionVariable = this.requireVariable;

        // If no require function is defined in the module, then it cannot have any dependencies
        if (!requireFunctionVariable) {
            return [];
        }

        return requireFunctionVariable.references
            .map((reference) => {
                const requireCallExpression = reference.identifier._parent;

                // __webpack_require__(4)
                const isRequireCall =
                    requireCallExpression.type === "CallExpression" &&
                    requireCallExpression.callee.type === "Identifier" &&
                    requireCallExpression.callee.name === reference.identifier.name;
                if (isRequireCall) {
                    const requireArguments = requireCallExpression.arguments;

                    if (requireArguments.length > 1) {
                        throw new RequireFunctionHasMultipleArgumentsError(
                            `The require function found at ${reference.identifier.start}-${
                                reference.identifier.end
                            } had more than one argument - it had ${requireArguments.length} (${requireArguments
                                .map((arg) => arg.raw)
                                .join(", ")})`
                        );
                    }

                    return {
                        type: "REQUIRE_FUNCTION",
                        chunkId: null,
                        moduleId: requireArguments[0].value,
                        ast: requireArguments[0],
                    };
                }

                // __webpack_require__.e(0)
                const isRequireEnsureCall =
                    requireCallExpression._parent.type === "CallExpression" &&
                    requireCallExpression._parent.callee.type === "MemberExpression" &&
                    requireCallExpression._parent.callee.object.type === "Identifier" &&
                    requireCallExpression._parent.callee.object.name === reference.identifier.name &&
                    requireCallExpression._parent.callee.property.name === "e" &&
                    requireCallExpression._parent.arguments &&
                    requireCallExpression._parent.arguments[0].type === "Literal";
                // // Assert Module ID is in the right location
                // .then(__webpack_require__.bind(null, 4))
                // requireCallExpression.type === 'MemberExpression' &&
                // requireCallExpression.property.name === 'bind' &&
                // requireCallExpression.property.name === 'bind' &&
                // requireCallExpression._parent.type === 'CallExpression' &&
                // requireCallExpression._parent.arguments.length === 2 &&
                // requireCallExpression._parent.arguments[1].type === 'Literal' &&

                if (isRequireEnsureCall) {
                    const chunkId = requireCallExpression._parent.arguments[0].value;
                    return {
                        type: "REQUIRE_ENSURE",
                        chunkId,
                        moduleId: null,
                        ast: requireCallExpression._parent,
                    };
                }

                // __webpack_require__.t.bind(null, 0)
                const isRequireTCall =
                    requireCallExpression._parent._parent.type === "CallExpression" &&
                    requireCallExpression._parent._parent.callee.type === "MemberExpression" &&
                    requireCallExpression._parent._parent.callee.property.name === "bind" &&
                    requireCallExpression._parent._parent.callee.object.type === "MemberExpression" &&
                    requireCallExpression._parent._parent.callee.object.object.type === "Identifier" &&
                    requireCallExpression._parent._parent.callee.object.object.name === reference.identifier.name &&
                    requireCallExpression._parent._parent.callee.object.property.type === "Identifier" &&
                    requireCallExpression._parent._parent.callee.object.property.name === "t" &&
                    requireCallExpression._parent._parent.arguments &&
                    requireCallExpression._parent._parent.arguments[1].type === "Literal";

                if (isRequireTCall) {
                    const moduleId = requireCallExpression._parent._parent.arguments[1].value;
                    return {
                        type: "REQUIRE_T",
                        chunkId: null,
                        moduleId,
                        ast: requireCallExpression._parent._parent._parent,
                    };
                }

                return null;
            })
            .filter((i) => i !== null);
    }

    get _absolutePath() {
        return path.join("/", path.normalize(this.path));
    }

    resolve(p) {
        if (!this.path) {
            throw new Error("In order to use module.resolve, please first define module.path.");
        }

        function addExtension(p) {
            if (!p.endsWith(".js")) {
                return `${p}.js`;
            } else {
                return p;
            }
        }

        if (p.startsWith("/")) {
            // Absolute path, like `/tmp/myfile.js`
            return addExtension(p);
        } else if (p.startsWith("./") || p.startsWith("../")) {
            // Relative path, like `./foo.js`
            const moduleDirName = path.dirname(this._absolutePath);
            return `.${addExtension(path.join(moduleDirName, p))}`;
        } else {
            // Node module
            let [moduleName, ...path] = p.split("/");
            if (path.length === 0) {
                path = ["index.js"];
            }
            const modulePath = `./node_modules/${moduleName}/${path}`;
            return modulePath;
        }
    }

    async write(opts = undefined) {
        let filePath = this.absolutePath;

        await mkdirp(path.dirname(filePath));

        await fs.promises.writeFile(filePath, this.code(opts));
    }

    // When called, rename this module's path to be `node_modules/packageName`, and
    // then move all dependant packages inside this package, too.
    get packageName() {
        return this._packageName;
    }
    set packageName(packageName) {
        this._packageName = packageName;
        function recursivelyApplyPathPrefix(mod) {
            mod.path = `node_modules/${packageName}/${mod.path}`;

            for (const [id, dependant] of mod.dependencies) {
                recursivelyApplyPathPrefix(dependant);
            }
        }

        recursivelyApplyPathPrefix(this);

        this.path = `node_modules/${packageName}/index.js`;
    }
}

module.exports = Module;
