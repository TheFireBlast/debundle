#!/usr/bin/env node
import { Bundle } from "./subcomponents/Bundle";
import { Command } from "commander";

var bundlePath!: string;
var program = new Command();
global.debundleOptions = program
    .name("debundle")
    .version(require("../package.json").version, "-v, --version")
    .option("-V, --verbose", "output extra debugging information") //TODO
    .arguments("<bundle>")
    .action((b) => {
        bundlePath = b;
    })
    .parse(process.argv)
    .opts();

if (bundlePath) {
    const bundle = new Bundle(bundlePath);
    bundle.parse();
    bundle.writeAll();
} else {
    console.error("Error: the path to a javascript bundle is required.");
    console.error("ie: debundle ./path/to/javascript/bundle.js");
    process.exit(1);
}
