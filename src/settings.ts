import { BundleMetadata } from "./subcomponents/Bundle";

const DEFAULT_CHUNK = "default";

const DEFAULT_OPTIONS: BundleMetadata["options"] = {
    distPath: "./dist",
    chunkFileNameSuffix: ".bundle.js",
    publicPathPrefix: "",
    chunkHttpRequestOptions: {},
    chunkNameMapping: {},
};

const METADATA_FILE_TEMPLATE = `// This auto-generated file defines some options used when "<PATH>" is debundled.
module.exports = <JSON>\n`;

export { DEFAULT_CHUNK, DEFAULT_OPTIONS, METADATA_FILE_TEMPLATE };
