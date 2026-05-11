const fs = require("fs/promises");
const path = require("path");
const readline = require("readline/promises");
const { stdin: input, stdout: output } = require("process");
const { createEmptyTest, validateTest } = require("./schema");

const ROOT = path.resolve(__dirname, "../..");
const TESTS_DIR = path.join(ROOT, "tests");
const WORK_DIR = path.join(ROOT, "work");
const DRAFTS_DIR = path.join(WORK_DIR, "drafts");

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] || "help";
  const flags = new Map();
  for (let index = 1; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("--")) continue;
    const [key, rawValue] = current.slice(2).split("=");
    flags.set(key, typeof rawValue === "undefined" ? true : rawValue);
  }
  return { command, flags };
}

function parseNumberedFile(fileName) {
  const match = /^test_(\d+)\.json$/i.exec(fileName);
  return match ? Number(match[1]) : null;
}

async function ensureDirs() {
  await fs.mkdir(TESTS_DIR, { recursive: true });
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function listTests() {
  const entries = await fs.readdir(TESTS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /^test_\d+\.json$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => parseNumberedFile(left) - parseNumberedFile(right));

  if (!files.length) {
    console.log("No test files found.");
    return;
  }

  for (const file of files) {
    const test = await readJson(path.join(TESTS_DIR, file));
    const issues = validateTest(test);
    console.log(`${file}  ${test.title || ""}${issues.length ? `  [${issues.length} issue(s)]` : ""}`);
  }
}

async function promptIfMissing(rl, value, label) {
  if (value) return value;
  return rl.question(`${label}: `);
}

async function createDraft(flags) {
  await ensureDirs();
  const rl = readline.createInterface({ input, output });
  try {
    const title = await promptIfMissing(rl, flags.get("title"), "Title");
    const id = (flags.get("id") || `test_${Date.now()}`).toString();
    const examType = (flags.get("examType") || "general").toString();
    const test = createEmptyTest({ id, title, examType });
    const draftPath = path.join(DRAFTS_DIR, `${id}.json`);
    await writeJson(draftPath, test);
    console.log(`Created draft: ${path.relative(ROOT, draftPath)}`);
  } finally {
    rl.close();
  }
}

async function importJson(flags) {
  await ensureDirs();
  const source = flags.get("file");
  if (!source) throw new Error("Missing --file=<path>");

  const sourcePath = path.isAbsolute(source) ? source : path.join(ROOT, source);
  const test = await readJson(sourcePath);
  const issues = validateTest(test);
  if (issues.length) {
    console.error("Validation failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  const targetName = `${test.id}.json`;
  const targetPath = path.join(TESTS_DIR, targetName);
  await writeJson(targetPath, test);
  console.log(`Imported to ${path.relative(ROOT, targetPath)}`);
}

async function validateOne(flags) {
  const file = flags.get("file");
  if (!file) throw new Error("Missing --file=<path>");
  const filePath = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const test = await readJson(filePath);
  const issues = validateTest(test);
  if (!issues.length) {
    console.log("OK");
    return;
  }
  console.log(`Found ${issues.length} issue(s):`);
  for (const issue of issues) console.log(`- ${issue}`);
  process.exitCode = 1;
}

async function duplicateTest(flags) {
  await ensureDirs();
  const source = flags.get("from");
  if (!source) throw new Error("Missing --from=<test-file>");
  const sourcePath = path.isAbsolute(source) ? source : path.join(TESTS_DIR, source);
  const sourceTest = await readJson(sourcePath);
  const nextId = flags.get("id") || `test_${Date.now()}`;
  const copy = {
    ...sourceTest,
    id: nextId.toString(),
    title: flags.get("title") || `${sourceTest.title || sourceTest.id} copy`
  };
  const targetPath = path.join(DRAFTS_DIR, `${copy.id}.json`);
  await writeJson(targetPath, copy);
  console.log(`Duplicated draft: ${path.relative(ROOT, targetPath)}`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv);
  try {
    if (command === "list") return listTests();
    if (command === "new") return createDraft(flags);
    if (command === "duplicate") return duplicateTest(flags);
    if (command === "import") return importJson(flags);
    if (command === "validate") return validateOne(flags);

    console.log([
      "ExamForge local builder",
      "",
      "Commands:",
      "  node tools/builder/cli.js list",
      "  node tools/builder/cli.js new --title=\"Title\" --id=test_7 --examType=general",
      "  node tools/builder/cli.js duplicate --from=test_1.json --id=test_7",
      "  node tools/builder/cli.js import --file=work/drafts/test_7.json",
      "  node tools/builder/cli.js validate --file=tests/test_1.json"
    ].join("\n"));
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

main();
