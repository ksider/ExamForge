const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TESTS_DIR = path.join(ROOT, "tests");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function parseTestNumber(fileName) {
  const match = /^test_(\d+)\.json$/i.exec(fileName);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

async function readTestFiles() {
  await fs.mkdir(TESTS_DIR, { recursive: true });
  const entries = await fs.readdir(TESTS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((a, b) => {
      const left = parseTestNumber(a.name);
      const right = parseTestNumber(b.name);
      if (left !== right) return left - right;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    })
    .map((entry) => entry.name);
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

async function handleTestsList(res) {
  const files = await readTestFiles();
  const tests = [];

  for (const fileName of files) {
    try {
      const raw = await fs.readFile(path.join(TESTS_DIR, fileName), "utf8");
      const test = JSON.parse(raw);
      tests.push(publicTestSummary(test, fileName));
    } catch (error) {
      tests.push({
        id: path.basename(fileName, ".json"),
        title: `${fileName} (invalid JSON)`,
        file: fileName,
        invalid: true,
        error: error.message,
        sections: []
      });
    }
  }

  sendJson(res, 200, { tests });
}

async function handleSingleTest(res, fileName) {
  if (!/^[a-zA-Z0-9_.-]+\.json$/.test(fileName)) {
    sendError(res, 400, "Invalid test file name");
    return;
  }

  const filePath = path.join(TESTS_DIR, fileName);
  const raw = await fs.readFile(filePath, "utf8");
  sendJson(res, 200, JSON.parse(raw));
}

async function serveStatic(req, res, pathname, method = "GET") {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(PUBLIC_DIR, `.${safePath}`);

  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    if (method === "HEAD") {
      res.end();
      return;
    }
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      if (!pathname.includes(".") || pathname.startsWith("/test/")) {
        const indexFile = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        if (method === "HEAD") {
          res.end();
          return;
        }
        res.end(indexFile);
        return;
      }
      sendError(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/tests") {
      await handleTestsList(res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/tests/")) {
      await handleSingleTest(res, decodeURIComponent(url.pathname.replace("/api/tests/", "")));
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendError(res, 405, "Method not allowed");
      return;
    }

    await serveStatic(req, res, url.pathname, req.method);
  } catch (error) {
    console.error(error);
    sendError(res, 500, "Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`ExamForge is running at http://localhost:${PORT}`);
});
