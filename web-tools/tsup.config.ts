import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: {
		entry: "src/index.ts",
	},
	splitting: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	minify: true,
	target: "esnext",
	platform: "browser",
	external: [],
	tsconfig: "./tsconfig.json",
});
