import { Bundle } from "./subcomponents/Bundle";
import program from "commander";

let bundlePath!: string;
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
