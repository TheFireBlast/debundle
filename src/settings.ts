import { BundleMetadata } from "./subcomponents/Bundle";

export const DEFAULT_CHUNK = "default";

export const DEFAULT_OPTIONS: BundleMetadata["options"] = {
    outPath: "./out",
    chunkFileNameSuffix: ".bundle.js",
    publicPathPrefix: "",
    chunkHttpRequestOptions: {},
    chunkNameMapping: {},
};

export const METADATA_FILE_TEMPLATE = `// This auto-generated file defines some options used when "<PATH>" is debundled.
module.exports = <JSON>\n`;
