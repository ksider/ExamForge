const ALLOWED_SECTION_IDS = ["listening", "reading", "writing"];
const ALLOWED_PART_TYPES = ["multiple_choice", "gap_fill", "matching", "sentence_insert", "long_text"];

function createEmptyTest({ id, title, examType = "general" }) {
  return {
    id,
    title,
    examType,
    timer: {
      listening_minutes: 35,
      reading_minutes: 50,
      writing_minutes: 45
    },
    sections: [
      {
        id: "listening",
        title: "Listening",
        audio: "",
        parts: []
      },
      {
        id: "reading",
        title: "Reading",
        parts: []
      },
      {
        id: "writing",
        title: "Writing",
        parts: []
      }
    ]
  };
}

function normalizeQuestionNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validateTest(test) {
  const errors = [];
  if (!test || typeof test !== "object" || Array.isArray(test)) {
    return ["Test must be an object."];
  }

  if (!test.id || typeof test.id !== "string") errors.push("Missing string field: id");
  if (!test.title || typeof test.title !== "string") errors.push("Missing string field: title");
  if (!test.timer || typeof test.timer !== "object") errors.push("Missing object field: timer");
  if (!Array.isArray(test.sections)) errors.push("Missing array field: sections");

  const sections = Array.isArray(test.sections) ? test.sections : [];
  const sectionIds = new Set();

  for (const section of sections) {
    if (!section || typeof section !== "object") {
      errors.push("Each section must be an object.");
      continue;
    }

    if (!ALLOWED_SECTION_IDS.includes(section.id)) {
      errors.push(`Unsupported section id: ${section.id}`);
    }
    if (sectionIds.has(section.id)) {
      errors.push(`Duplicate section id: ${section.id}`);
    }
    sectionIds.add(section.id);

    if (!section.title || typeof section.title !== "string") {
      errors.push(`Section ${section.id}: missing title`);
    }
    if (!Array.isArray(section.parts)) {
      errors.push(`Section ${section.id}: parts must be an array`);
      continue;
    }

    const partIds = new Set();
    for (const part of section.parts) {
      if (!part || typeof part !== "object") {
        errors.push(`Section ${section.id}: each part must be an object`);
        continue;
      }

      if (!part.id || typeof part.id !== "string") errors.push(`Section ${section.id}: part missing id`);
      if (partIds.has(part.id)) errors.push(`Section ${section.id}: duplicate part id ${part.id}`);
      partIds.add(part.id);

      if (!ALLOWED_PART_TYPES.includes(part.type)) {
        errors.push(`Section ${section.id}: unsupported part type ${part.type}`);
      }

      if (part.type === "long_text") {
        if (!Number.isFinite(Number(part.min_words)) || !Number.isFinite(Number(part.max_words))) {
          errors.push(`Section ${section.id}, part ${part.id}: writing tasks need min_words and max_words`);
        }
        continue;
      }

      const questions = Array.isArray(part.questions) ? part.questions : [];
      if (!questions.length) {
        errors.push(`Section ${section.id}, part ${part.id}: questions array is required`);
      }

      const numbers = new Set();
      for (const question of questions) {
        if (!question || typeof question !== "object") {
          errors.push(`Section ${section.id}, part ${part.id}: each question must be an object`);
          continue;
        }
        const number = normalizeQuestionNumber(question.number);
        if (!number) errors.push(`Section ${section.id}, part ${part.id}: invalid question number`);
        if (number && numbers.has(number)) errors.push(`Section ${section.id}, part ${part.id}: duplicate question number ${number}`);
        if (number) numbers.add(number);
        if (!question.prompt || typeof question.prompt !== "string") {
          errors.push(`Section ${section.id}, part ${part.id}, question ${question.number}: missing prompt`);
        }

        if (part.type === "multiple_choice") {
          if (!Array.isArray(question.options) || question.options.length < 2) {
            errors.push(`Section ${section.id}, part ${part.id}, question ${question.number}: multiple_choice needs options`);
          }
          if (typeof question.correct !== "string") {
            errors.push(`Section ${section.id}, part ${part.id}, question ${question.number}: multiple_choice needs string correct`);
          }
        } else {
          if (typeof question.correct === "undefined") {
            errors.push(`Section ${section.id}, part ${part.id}, question ${question.number}: missing correct answer`);
          }
        }
      }

      if (part.type === "matching" || part.type === "sentence_insert") {
        if (!Array.isArray(part.options) || !part.options.length) {
          errors.push(`Section ${section.id}, part ${part.id}: shared options are required`);
        }
      }
    }
  }

  return errors;
}

module.exports = {
  ALLOWED_PART_TYPES,
  ALLOWED_SECTION_IDS,
  createEmptyTest,
  validateTest
};
