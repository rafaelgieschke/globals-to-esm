#!/usr/bin/env node

// Copyright 2019 Rafael Gieschke
// SPDX-License-Identifier: GPL-2.0-or-later

const {parse} = require("espree");
const {analyze} = require("escope");
const {Linter} = require("eslint");
const {readFile, writeFile} = require("fs").promises;
const {relative, dirname} = require("path");
const rewriteDeleteRule = require("./rewrite-delete.js");

const fromEntries = require("object.fromentries");

const args = process.argv.slice(2);

class Globals {
    constructor() {
        this.defines = new Map();
    }
    async analyze(fileName) {
        const parserOptions = {
            ecmaVersion: 2019,
            sourceType: "script",
        };
        let code = await readFile(fileName, "utf-8");
        code = this.fix(code, [rewriteDeleteRule], parserOptions);
        const ast = parse(code, parserOptions);
        const scope = analyze(ast, {ecmaVersion: parserOptions.ecmaVersion}).acquire(ast);
        const uses = new Set(scope.through.map(v => v.identifier.name));
        const defines = [...scope.variables, ...scope.implicit.variables]
            .map(v => v.name)
        const rewrittenCode = [
            ...scope.variables.map(v => `export {${v.name}};`),
            ...scope.implicit.variables.map(v => `export let ${v.name};`),
            code
        ].join("\n");
        return {code, defines, uses, rewrittenCode};
    }
    fix(code, rules = [], parserOptions = {}) {
        const linter = new Linter();
        rules.forEach((v, i) => (linter.defineRule(String(i), v)));
        return linter.verifyAndFix(code,
            {rules: fromEntries(rules.map((_, i) => [i, "error"])),
            parserOptions}).output;
    }
    async add(fileName) {
        for (const define of (await this.analyze(fileName)).defines) {
            this.defines.set(define, fileName);
        }
    }
    async rewrite(fileName) {
        const imports = [];
        const {uses, rewrittenCode} = await this.analyze(fileName);
        for (const use of uses) {
            if (this.defines.has(use) && this.defines.get(use) !== fileName) {
                imports.push(
                    `import {${use}} from "./${relative(dirname(fileName),
                        this.rewriteFileName(this.defines.get(use)))}"`);
            }
        }
        return [...imports, rewrittenCode].join("\n");
    }
    rewriteFileName(fileName) {
        return fileName.replace(/\.js$/, ".esm.js");
    }
}

(async () => {
    const globals = new Globals();
    for (const fileName of args) {
        await globals.add(fileName);
    }
    for (const fileName of args) {
        await writeFile(globals.rewriteFileName(fileName),
            await globals.rewrite(fileName));
    }
})();
