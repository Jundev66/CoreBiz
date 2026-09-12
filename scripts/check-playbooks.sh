#!/usr/bin/env bash
#
# Every error key in the system must be DECLARED in the support catalogue.
#
# The assistant explains errors by reading `packages/contracts/src/support.ts`. The day
# someone adds an error variant to the domain and does not declare it, nothing visible
# happens: the panel has nothing to say about it and stays quiet. A silent gap on the one
# screen people turn to when they do not know what to do.
#
# Same argument as the test that requires an RLS policy on every table with `tenant_id`:
# what gets forgotten is never what fails loudly, it is what gets added without
# remembering the other half.
#
# Two passes, and the SECOND is the one that actually protects:
#
#   1. Forward — every catalogue key has a card in both languages and its link leads to a
#      screen that exists.
#   2. Backward — every key that appears in the code is in ONE of the catalogue lists.
#
# The first alone is not enough: a list can only check what it already knows exists.

set -euo pipefail

if [ ! -f 'packages/contracts/src/support.ts' ]; then
  echo 'ERROR: packages/contracts/src/support.ts does not exist'
  exit 1
fi

KINDS="$(mktemp)"
trap 'rm -f "$KINDS"' EXIT

# Keys as they appear in the code. Collected from every place where they are born: the
# domain and application RETURN them, `api-error.ts` maps them to HTTP status, the global
# filter invents them per status family, the web actions reject with them, and the UI
# translates them. Any of these can introduce a new one on its own.
#
# PascalCase only: a domain `kind` always is, so a lowercase key in the translation files
# is something else and is not counted as an error key.
{
  # `--exclude` rather than a trailing `grep -v`: `-h` has already dropped the file name,
  # so filtering by path afterwards filters nothing. With the `-v` after, this guardian
  # picked up keys invented in tests and demanded cards for them.
  grep -rhoE "kind: '[A-Z][A-Za-z]*'" packages/domain/src packages/application/src \
    --include='*.ts' --exclude='*.test.ts' | sed "s/kind: '//; s/'//"
  grep -oE "^  [A-Z][A-Za-z]*:" apps/api/src/http/api-error.ts | tr -d ' :'
  grep -oE "'[A-Z][A-Za-z]*'\]" apps/api/src/http/all-exceptions.filter.ts | tr -d "']"
  # And the ones the web invents. A Server Action can reject BEFORE calling the API
  # ("customer missing", "the document has no lines") and that key appears in none of the
  # places above.
  grep -rhoE "errorKind: '[A-Z][A-Za-z]*'" apps/web/src/actions --include='*.ts' | sed "s/errorKind: '//; s/'//"
  node -e '
    const es = require("./apps/web/messages/es.json");
    for (const ns of [es.errors, es.settings.errors, es.purchases.errors, es.auth.errors]) {
      for (const k of Object.keys(ns)) if (/^[A-Z]/.test(k)) console.log(k);
    }
  '
} | sort -u > "$KINDS"

KINDS="$KINDS" node scripts/check-playbooks.mjs
