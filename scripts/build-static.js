const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const TESTS_DIR = path.join(ROOT, "tests");
const STATIC_DIR = path.join(ROOT, "static");
const STATIC_TESTS_DIR = path.join(STATIC_DIR, "tests");

function parseTestNumber(fileName) {
  const match = /^test_(\d+)\.json$/i.exec(fileName);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function publicTestSummary(test, fileName) {
  return {
    id: test.id || path.basename(fileName, ".json"),
    title: test.title || fileName,
    file: fileName,
    timer: test.timer || {},
    sections: Array.isArray(test.sections)
      ? test.sections.map((section) => ({
          id: section.id,
          title: section.title || section.id,
          partsCount: Array.isArray(section.parts) ? section.parts.length : 0
        }))
      : []
  };
}

async function readTestFiles() {
  const entries = await fs.readdir(TESTS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^test_\d+\.json$/i.test(entry.name))
    .sort((a, b) => {
      const left = parseTestNumber(a.name);
      const right = parseTestNumber(b.name);
      if (left !== right) return left - right;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    })
    .map((entry) => entry.name);
}

async function copyTestFiles(files) {
  const tests = [];
  const testData = {};

  await fs.mkdir(STATIC_TESTS_DIR, { recursive: true });

  for (const fileName of files) {
    const sourcePath = path.join(TESTS_DIR, fileName);
    const targetPath = path.join(STATIC_TESTS_DIR, fileName);
    const raw = await fs.readFile(sourcePath, "utf8");
    const test = JSON.parse(raw);

    await fs.writeFile(targetPath, `${JSON.stringify(test, null, 2)}\n`);
    testData[fileName] = test;
    tests.push(publicTestSummary(test, fileName));
  }

  return { tests, testData };
}

async function makeStaticIndexPortable(staticData) {
  const indexPath = path.join(STATIC_DIR, "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const payload = JSON.stringify(staticData).replace(/</g, "\\u003c");
  const staticDataScript = `<script>window.EXAMFORGE_STATIC_DATA = ${payload};</script>\n    `;

  await fs.writeFile(
    indexPath,
    html
      .replace('href="/styles.css"', 'href="./styles.css"')
      .replace('<script src="/app.js" defer></script>', `${staticDataScript}<script src="./app.js" defer></script>`)
      .replace('src="/app.js"', 'src="./app.js"')
  );
}

async function main() {
  await fs.rm(STATIC_DIR, { recursive: true, force: true });
  await fs.mkdir(STATIC_DIR, { recursive: true });
  await fs.cp(PUBLIC_DIR, STATIC_DIR, { recursive: true });

  const files = await readTestFiles();
  const { tests, testData } = await copyTestFiles(files);
  await fs.writeFile(
    path.join(STATIC_TESTS_DIR, "manifest.json"),
    `${JSON.stringify({ tests }, null, 2)}\n`
  );
  await makeStaticIndexPortable({ manifest: { tests }, tests: testData });

  console.log(`Static build ready: ${path.relative(ROOT, STATIC_DIR)}`);
  console.log(`Packed ${tests.length} test variant(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
