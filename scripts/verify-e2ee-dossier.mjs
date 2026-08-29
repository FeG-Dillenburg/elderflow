import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOSSIER_PATH = "docs/security/e2ee-security-review.md";
const DEPENDENCY_PATH = "docs/security/e2ee-dependency-review.md";
const REQUIRED_DEPENDENCIES = [
  "@tiptap/core",
  "@tiptap/extension-collaboration",
  "@tiptap/extension-collaboration-caret",
  "@tiptap/extension-color",
  "@tiptap/extension-highlight",
  "@tiptap/extension-link",
  "@tiptap/extension-text-style",
  "@tiptap/extension-underline",
  "@tiptap/starter-kit",
  "@tiptap/vue-3",
  "@tiptap/y-tiptap",
  "cbor-x",
  "libsodium-wrappers-sumo",
  "ws",
  "y-protocols",
  "yjs",
];

export async function verifyDossier({ root, revision } = {}) {
  const repositoryRoot = root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const errors = [];
  const dossier = await readFile(path.join(repositoryRoot, DOSSIER_PATH), "utf8");
  const recordedRevision = dossier.match(/Reviewed revision:\s*`([0-9a-f]{40})`/)?.[1];
  const expectedRevision = revision ?? recordedRevision;

  if (!recordedRevision) {
    errors.push("dossier does not record a full 40-character reviewed revision");
  } else if (expectedRevision && recordedRevision !== expectedRevision) {
    errors.push(`reviewed revision mismatch: expected ${expectedRevision}, found ${recordedRevision}`);
  }

  if (!/internal security review[\s\S]{0,80}not an independent security audit/i.test(dossier)) {
    errors.push("dossier must explicitly disclaim an independent audit");
  }

  const invariants = [...dossier.matchAll(/^- \[x\] INV-\d+:\s+.+$/gm)];
  if (invariants.length !== 6) {
    errors.push(`expected six security invariants, found ${invariants.length}`);
  }

  const dossierLinks = markdownLinks(dossier);
  const linkedMarkdownDocuments = [];
  for (const link of dossierLinks) {
    if (/^(?:https?:\/\/|#|mailto:)/.test(link)) continue;
    const target = decodeURIComponent(link.split("#", 1)[0]);
    if (!target.endsWith(".md")) continue;
    const documentPath = path.resolve(
      path.dirname(path.join(repositoryRoot, DOSSIER_PATH)),
      target,
    );
    if (path.dirname(documentPath) !== path.dirname(path.join(repositoryRoot, DOSSIER_PATH))) {
      continue;
    }
    try {
      linkedMarkdownDocuments.push({
        path: documentPath,
        text: await readFile(documentPath, "utf8"),
      });
    } catch {
      // The dossier-link check below reports the missing target once.
    }
  }

  await verifyLinks({
    documentPath: path.join(repositoryRoot, DOSSIER_PATH),
    errors,
    expectedRevision,
    links: dossierLinks,
    repositoryRoot,
  });
  for (const document of linkedMarkdownDocuments) {
    await verifyLinks({
      documentPath: document.path,
      errors,
      expectedRevision,
      links: markdownLinks(document.text),
      repositoryRoot,
    });
  }

  const dependencyReview = await readFile(path.join(repositoryRoot, DEPENDENCY_PATH), "utf8");
  const lockfile = await readFile(path.join(repositoryRoot, "pnpm-lock.yaml"), "utf8");
  let dependencyCount = 0;

  for (const dependency of REQUIRED_DEPENDENCIES) {
    const row = dependencyReview
      .split("\n")
      .find((line) => line.startsWith(`| ${dependency} |`));
    if (!row) {
      errors.push(`dependency review is missing ${dependency}`);
      continue;
    }

    dependencyCount += 1;
    const version = row.split("|")[2]?.trim();
    const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`${escapedDependency}@${escapedVersion}(?:\\W|$)`).test(lockfile)) {
      errors.push(`dependency pin mismatch for ${dependency}: ${version} is absent from pnpm-lock.yaml`);
    }
  }

  return {
    dependencyCount,
    errors,
    invariantCount: invariants.length,
    revision: recordedRevision,
  };
}

function markdownLinks(contents) {
  return [...contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
}

async function verifyLinks({
  documentPath,
  errors,
  expectedRevision,
  links,
  repositoryRoot,
}) {
  const label = path.relative(repositoryRoot, documentPath);
  for (const link of links) {
    if (link.startsWith("#") || link.startsWith("mailto:")) continue;
    if (/^https?:\/\//.test(link)) {
      if (link.includes("github.com/FeG-Dillenburg/elderflow/blob/")
        && expectedRevision
        && !link.includes(`/blob/${expectedRevision}/`)) {
        errors.push(`${label}: source review link is not pinned to ${expectedRevision}: ${link}`);
      }
      continue;
    }

    const target = decodeURIComponent(link.split("#", 1)[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(documentPath), target);
    try {
      await access(resolved);
    } catch {
      errors.push(`${label}: missing local link target: ${link}`);
    }
  }
}

async function main() {
  const result = await verifyDossier();
  if (result.errors.length > 0) {
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `E2EE dossier verified at ${result.revision}: ${result.invariantCount} invariants, ${result.dependencyCount} dependency pins.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
