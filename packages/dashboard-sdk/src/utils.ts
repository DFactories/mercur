import fs from "fs"
import { createRequire } from "module"
import path from "path"
import type { ParserOptions } from "@babel/parser"
import { traverse } from "./babel"
import { VALID_FILE_EXTENSIONS } from "./constants"

export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/")
}

/**
 * Recursively collect component/config files under a surface folder, skipping
 * declaration files, barrels (`index.*`), and underscore-prefixed helpers.
 */
export function crawlModuleFiles(dir: string): string[] {
    const files: string[] = []
    if (!fs.existsSync(dir)) return files

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...crawlModuleFiles(full))
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name)
            const base = path.basename(entry.name, ext)
            if (base.endsWith(".d")) continue
            if (base.startsWith("_") || base === "index") continue
            if (VALID_FILE_EXTENSIONS.includes(ext)) files.push(full)
        }
    }
    return files
}

export function getParserOptions(file: string): ParserOptions {
    const options: ParserOptions = {
        sourceType: "module",
        plugins: ["jsx"],
    }

    if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        options.plugins!.push("typescript")
    }

    return options
}

export function resolveExports(moduleExports: any) {
    if (
        "default" in moduleExports &&
        moduleExports.default &&
        "default" in moduleExports.default
    ) {
        return resolveExports(moduleExports.default)
    }
    return moduleExports
}

/**
 * Load a TypeScript (or JS) config file and return its exports.
 *
 * `createRequire`, NOT a bare `require`. This package is bundled by tsup to ESM
 * as well as CJS, and in the ESM output esbuild rewrites a bare `require(x)`
 * into a `__require` shim whose only behaviour outside CJS is to throw
 * `Dynamic require of "x" is not supported`. Every ESM consumer — which is
 * every Vite config, since `./vite` resolves through the `import` condition —
 * therefore hit that throw instead of loading anything, and the caller in
 * `plugin.ts` swallowed it into the "Could not load the Medusa config … base
 * '/' and no plugin extensions" warning. `createRequire` is an ordinary import
 * that survives both output formats, and `plugin.ts` already reaches for it a
 * few lines away for exactly this reason.
 *
 * Resolved FROM the config's own path, so its relative imports and its
 * `node_modules` lookups are answered from its own directory rather than from
 * wherever this package happens to be installed.
 *
 * `safeRegister` installs the esbuild TypeScript loader onto the CJS extension
 * table, which is process-global — so `createRequire` picks it up and a `.ts`
 * config loads. It is unregistered in a `finally`: a config that throws while
 * evaluating used to leave the loader hooked for the rest of the Vite process.
 */
export async function getFileExports(filePath: string): Promise<any> {
    const { unregister } = await safeRegister()

    try {
        const requireFrom = createRequire(filePath)
        return resolveExports(requireFrom(filePath))
    } finally {
        unregister()
    }
}

export const safeRegister = async () => {
    const { register } = await import("esbuild-register/dist/node")
    let res: { unregister: () => void }
    try {
        res = register({
            format: "cjs",
            loader: "ts",
        })
    } catch {
        res = {
            unregister: () => {},
        }
    }

    return res
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasDefaultExport(ast: any): boolean {
    let found = false

    traverse(ast, {
        ExportDefaultDeclaration() {
            found = true
        },
        AssignmentExpression(path: any) {
            if (
                path.node.left.type === "MemberExpression" &&
                path.node.left.object.type === "Identifier" &&
                path.node.left.object.name === "exports" &&
                path.node.left.property.type === "Identifier" &&
                path.node.left.property.name === "default"
            ) {
                found = true
            }
        },
        ExportNamedDeclaration(path: any) {
            const specifiers = path.node.specifiers
            if (
                specifiers?.some(
                    (s: any) =>
                        s.type === "ExportSpecifier" &&
                        s.exported.type === "Identifier" &&
                        s.exported.name === "default"
                )
            ) {
                found = true
            }
        },
    })

    return found
}
