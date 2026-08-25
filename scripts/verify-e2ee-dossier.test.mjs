import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyDossier } from "./verify-e2ee-dossier.mjs";

const revision = "62f719fc321e4da87aefac5bd69487311747a66e";
const dependencyPins = {
  "@tiptap/core": "3.30.1",
  "@tiptap/extension-collaboration": "3.30.1",
  "@tiptap/extension-collaboration-caret": "3.30.1",
  "@tiptap/extension-color": "3.30.1",
  "@tiptap/extension-highlight": "3.30.1",
  "@tiptap/extension-link": "3.30.1",
  "@tiptap/extension-text-style": "3.30.1",
  "@tiptap/extension-underline": "3.30.1",
  "@tiptap/starter-kit": "3.30.1",
  "@tiptap/vue-3": "3.30.1",
  "@tiptap/y-tiptap": "3.0.8",
  "cbor-x": "1.6.0",
  "libsodium-wrappers-sumo": "0.7.15",
  "ws": "8.21.3",
  "y-protocols": "1.0.7",
  "yjs": "13.6.32",
};

test("accepts a revision-pinned dossier with complete invariants, links, and dependency pins", async () => {
  const root = await fixtureRoot();

  const result = await verifyDossier({ root, revision });

  assert.deepEqual(result.errors, []);
  assert.equal(result.invariantCount, 6);
  assert.equal(result.dependencyCount, 16);
});

test("reports missing links, mutable source links, incomplete invariants, and dependency drift together", async () => {
  const root = await fixtureRoot({ broken: true });

  const result = await verifyDossier({ root, revision });

  assert.match(result.errors.join("\n"), /missing local link target/);
  assert.match(result.errors.join("\n"), /source review link is not pinned/);
  assert.match(result.errors.join("\n"), /expected six security invariants/);
  assert.match(result.errors.join("\n"), /dependency pin mismatch/);
  assert.match(result.errors.join("\n"), /must explicitly disclaim an independent audit/);
});

test("checks local links in supporting security-review documents", async () => {
  const root = await fixtureRoot({ brokenSupport: true });

  const result = await verifyDossier({ root, revision });

  assert.match(result.errors.join("\n"), /guide\.md: missing local link target/);
});

async function fixtureRoot({ broken = false, brokenSupport = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "elderflow-dossier-"));
  await mkdir(path.join(root, "docs/security"), { recursive: true });
  await mkdir(path.join(root, "backend/src"), { recursive: true });
  await writeFile(path.join(root, "backend/src/example.ts"), "export {};\n");
  await writeFile(path.join(root, "pnpm-lock.yaml"), [
    "lockfileVersion: '9.0'",
    "packages:",
    ...Object.entries(dependencyPins).map(([dependency, version]) => `  ${dependency}@${version}:`),
    "",
  ].join("\n"));

  const invariants = Array.from({ length: broken ? 5 : 6 }, (_, index) => (
    `- [x] INV-${index + 1}: owner and reproducible evidence`
  )).join("\n");
  const sourceLink = broken
    ? "https://github.com/FeG-Dillenburg/elderflow/blob/main/backend/src/example.ts"
    : `https://github.com/FeG-Dillenburg/elderflow/blob/${revision}/backend/src/example.ts`;
  const localLink = broken ? "./missing.md" : "../security/guide.md";
  const disclaimer = broken ? "Independent security audit." : "This is an internal security review, not an independent security audit.";

  await writeFile(path.join(root, "docs/security/e2ee-security-review.md"), [
    "# Review",
    `Reviewed revision: \`${revision}\``,
    disclaimer,
    `See [guide](${localLink}).`,
    `Source: [example](${sourceLink}).`,
    "## Six-invariant release checklist",
    invariants,
    "",
  ].join("\n"));
  await writeFile(
    path.join(root, "docs/security/guide.md"),
    brokenSupport ? "# Guide\n\n[missing](./support-missing.md)\n" : "# Guide\n",
  );

  const dependencyRows = Object.entries(dependencyPins).map(([dependency, version]) => {
    const recordedVersion = broken && dependency === "cbor-x" ? "1.5.0" : version;
    return `| ${dependency} | ${recordedVersion} | MIT | npm | purpose | pinned | browser/server | measured |`;
  });
  await writeFile(path.join(root, "docs/security/e2ee-dependency-review.md"), [
    "# Dependencies",
    ...dependencyRows,
    "",
  ].join("\n"));

  return root;
}
