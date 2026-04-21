# ExamForge

ExamForge is a lightweight web app for LanguageCert exam preparation. Tests are stored as JSON files, audio is served from the local filesystem, and new variants appear automatically when a new `test_<number>.json` file is added.

The app is built with plain Node.js, `server.js`, vanilla JavaScript and pure CSS.

ExamForge is an independent preparation tool. It is not affiliated with, endorsed by, or operated by languagecert.org.

## Features

- Automatic test discovery from `tests/`
- Browser routes for the test list, each test section, and results
- Test selection screen
- Timer modes:
  - exam mode: countdown with blocking/checking on timeout
  - practice mode: count-up timer
- Timer scope:
  - per section
  - whole test
- Sections:
  - Listening
  - Reading
  - Writing
- Listening and Reading auto-checking from JSON answer keys
- Writing text areas with word counters and word limit status
- Progress saved in `localStorage`
- Completed attempts saved locally in `localStorage`
- Final result screen
- Audio per test/section
- PDF-to-JSON workflow supported through a fixed schema and AI prompt

## Run

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

No build step is required.

## Routes

ExamForge uses browser routes, so sections can be opened directly or bookmarked:

```text
/                                      Test list
/test/test_1.json/section/listening    Listening section
/test/test_1.json/section/reading      Reading section
/test/test_1.json/section/writing      Writing section
/test/test_1.json/results              Result screen
```

The Node server falls back to `index.html` for `/test/...` routes, so direct page refresh works.

## Local Data

ExamForge stores data locally in the browser:

```text
examforge:progress:<test_id>   Current answers and checked sections
examforge:results              Recent completed attempts
```

The start screen shows the latest local results.

In practice mode, the timer pauses when the page is hidden, when the user switches away, or when the page is closed/reloaded. When the user returns to the same routed section, the practice timer resumes from the locally saved elapsed time. Exam mode keeps using elapsed real time.

## Project Structure

```text
server.js                  Node.js static/API server
public/
  index.html               App shell
  app.js                   Frontend logic
  styles.css               Pure CSS UI
  audio/                   Listening audio files
tests/
  test_1.json              Test variant 1
  test_2.json              Test variant 2
  test_3.json              Test variant 3
  test_4.json              Test variant 4
  test_5.json              Test variant 5
  test_6.json              Test variant 6
docs/
  ai-json-prompt.md        Prompt and schema for converting PDFs to JSON
PDF TEMP/                  Source PDF/audio materials, kept untouched
work/pdf-extract/          Working copies and extracted text
```

## Adding a New Test

1. Create a JSON file in `tests/`.
2. Name it using this pattern:

```text
test_<number>.json
```

Examples:

```text
test_4.json
test_5.json
```

3. Put any audio file in `public/audio/`.
4. Reference the audio from the JSON:

```json
"audio": "/audio/test_4_listening.mp3"
```

5. Refresh the app. The server will detect the new test automatically.

## PDF Workflow

ExamForge does not parse PDF files inside the app at runtime.

Expected workflow:

1. Put source PDFs and audio in a source folder.
2. Extract or read the PDF contents.
3. Convert the exam into the fixed JSON structure.
4. Save the JSON in `tests/`.
5. Copy audio into `public/audio/`.
6. Refresh the app.

Use [docs/ai-json-prompt.md](docs/ai-json-prompt.md) as the prompt/schema for AI-assisted PDF to JSON conversion.

## Supported Question Types

```text
multiple_choice
gap_fill
matching
sentence_insert
long_text
```

### Reading UX

Reading parts render differently depending on the task type:

- `multiple_choice`: normal radio selection
- compact cloze multiple choice: text on the left, answer cards on the right
- `sentence_insert`: drag sentences into inline gaps
- `matching`: questions on the left, draggable text labels/cards on the right
- long reading text: two-column layout with text and sticky questions

## JSON Notes

Each test JSON should include:

- `id`
- `title`
- `timer`
- `sections`
- answer keys for Listening and Reading
- writing word limits
- audio path for Listening

Writing tasks use `long_text` and are not automatically checked.

## Current Test Set

- `test_1.json`: LanguageCert General Practice Paper 1
- `test_2.json`: LanguageCert General Practice Paper 1 - Variant 2
- `test_3.json`: LanguageCert General Test 3
- `test_4.json`: LanguageCert Academic Practice Paper 1
- `test_5.json`: LanguageCert Academic Practice Paper 1 - Variant 2
- `test_6.json`: LanguageCert Academic Test 3

Each current test contains:

- Listening: 30 questions
- Reading: 30 questions
- Writing: 2 tasks

## Development Checks

Useful quick checks:

```bash
node --check server.js
node --check public/app.js
node -e "const fs=require('fs'); for (const f of fs.readdirSync('tests')) JSON.parse(fs.readFileSync('tests/'+f,'utf8')); console.log('json ok')"
```

## Notes

Source files in `PDF TEMP/` should be treated as originals. Use working copies in `work/pdf-extract/` when extracting text or preparing new JSON files.
