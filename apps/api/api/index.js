'use strict';

/*
 * Vercel's entry point for the API.
 *
 * Plain CommonJS JavaScript ON PURPOSE. A `.ts` file here would be compiled by Vercel's own
 * toolchain, which emits no decorator metadata and does not run `tsc-alias`: the monorepo
 * packages are raw TypeScript and the `require('@corebiz/...')` calls would point nowhere.
 * This file only loads what `pnpm build` already produced with `tsc` — the same artifact
 * the CI `api` job starts and checks.
 */
module.exports = require('../dist/apps/api/src/serverless.js').handler;
