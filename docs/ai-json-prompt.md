# Prompt for Converting PDF Exam Materials to LingTest JSON

Use this document when an AI assistant converts source PDF materials into a JSON file for the LingTest app.

## Goal

Convert one complete language exam variant from PDF into a single JSON file that matches the schema below. Save the output as `tests/test_<number>.json`, for example `tests/test_3.json`.

The app does not parse PDFs directly. The expected workflow is:

1. Read the PDF exam material.
2. Extract tasks, answer keys, audio references, section timing, prompts, options and writing word limits.
3. Produce valid JSON only.
4. Put the JSON file into the `tests/` folder.
5. Restart or refresh the app. The server will automatically list the new test.

## Supported Sections

- `listening`
- `reading`
- `writing`

Speaking is intentionally not included yet.

## Supported Question Types

- `multiple_choice`
- `gap_fill`
- `matching`
- `sentence_insert`
- `long_text`

Use `long_text` only for Writing tasks.

## Required JSON Shape

```json
{
  "id": "test_3",
  "title": "Language Test 3",
  "timer": {
    "listening_minutes": 35,
    "reading_minutes": 50,
    "writing_minutes": 45
  },
  "sections": [
    {
      "id": "listening",
      "title": "Listening",
      "audio": "/audio/test_3_listening.mp3",
      "parts": [
        {
          "id": "part_1",
          "title": "Part 1",
          "type": "multiple_choice",
          "instructions": "Choose the best answer.",
          "questions": [
            {
              "number": 1,
              "prompt": "Question text",
              "options": ["a", "b", "c"],
              "correct": "b"
            }
          ]
        },
        {
          "id": "part_2",
          "title": "Part 2",
          "type": "gap_fill",
          "instructions": "Write one word or number.",
          "questions": [
            {
              "number": 18,
              "prompt": "Best subject at school",
              "correct": ["Music"]
            }
          ]
        }
      ]
    },
    {
      "id": "reading",
      "title": "Reading",
      "parts": [
        {
          "id": "part_1",
          "title": "Multiple Choice",
          "type": "multiple_choice",
          "instructions": "Choose the correct answer.",
          "passage": "Optional reading text or shared stimulus for this part.",
          "questions": [
            {
              "number": 1,
              "prompt": "Question text",
              "options": ["Option A", "Option B", "Option C"],
              "correct": "Option B"
            }
          ]
        },
        {
          "id": "part_2",
          "title": "Matching",
          "type": "matching",
          "options": ["Text A", "Text B", "Text C"],
          "questions": [
            {
              "number": 2,
              "prompt": "This text mentions a free trial.",
              "correct": "Text A"
            }
          ]
        },
        {
          "id": "part_3",
          "title": "Sentence Insert",
          "type": "sentence_insert",
          "options": ["Sentence A", "Sentence B", "Sentence C"],
          "questions": [
            {
              "number": 3,
              "prompt": "Gap 1",
              "correct": "Sentence C"
            }
          ]
        }
      ]
    },
    {
      "id": "writing",
      "title": "Writing",
      "parts": [
        {
          "id": "part_1",
          "title": "Task 1",
          "type": "long_text",
          "min_words": 100,
          "max_words": 150,
          "prompt": "Write an email..."
        },
        {
          "id": "part_2",
          "title": "Task 2",
          "type": "long_text",
          "min_words": 150,
          "max_words": 200,
          "prompt": "Write an article..."
        }
      ]
    }
  ]
}
```

## Rules for AI Generation

- Output valid JSON only, without Markdown fences.
- Keep section ids exactly: `listening`, `reading`, `writing`.
- Use file names that match `test_<number>.json` so sorting works naturally.
- Use unique question numbers inside each section.
- For `multiple_choice`, include `options` and a single `correct` string that exactly matches one option.
- For `gap_fill`, use `correct` as an array when multiple spellings are acceptable.
- For drag-and-drop gap fill, add `part.options` and put numbered gaps like `(12)` in `part.passage`.
- For `matching` and `sentence_insert`, put shared answer choices in `part.options` unless a question needs its own `options`.
- For Reading parts with a shared text, put the full text in `part.passage`.
- For Writing, do not include `correct`.
- Use the real Writing word limits from the PDF. General papers commonly use `100-150` and `150-200`; Academic papers commonly use `150-200` and `about 250 words`, which should be represented as a practical range such as `220-280`.
- Preserve original task wording as closely as possible.
- If an audio file is known, set `audio` to `/audio/<file-name>.mp3`. If it is unknown, use an empty string.
- Escape quotation marks correctly.
- Do not include comments, trailing commas, or unsupported fields unless there is a clear reason.
