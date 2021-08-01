#!/usr/bin/env node
import { Bundle } from "./subcomponents/Bundle";
import { Chunk } from "./subcomponents/Chunk";
import { Module } from "./subcomponents/Module";
import { WebpackBootstrap } from "./subcomponents/WebpackBootstrap";

module.exports = Bundle;
module.exports.Bundle = Bundle;
module.exports.Chunk = Chunk;
module.exports.Module = Module;
module.exports.WebpackBootstrap = WebpackBootstrap;

// The rest of the program only runs if the script was executed directly.
if (require.main !== module) {
    //@ts-ignore
    return;
}

import program from "commander";

let bundlePath;
program
    .version(require("../package.json").version)
    .option("--verbose", "output extra debugging information")
    .arguments("<bundle>")
    .action((b) => {
        bundlePath = b;
    });

program.parse(process.argv);

if (!bundlePath) {
    console.error("Error: the path to a javascript bundle is required.");
    console.error("ie: debundle ./path/to/javascript/bundle.js");
    process.exit(1);
}

const bundle = new Bundle(bundlePath);
bundle.parse();
bundle.writeAll();
