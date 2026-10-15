 function normalizeChoiceLetter(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-e]/g, "");
}

function getCorrectAnswerText({ correctChoice, aChoice, bChoice, cChoice, dChoice, eChoice }) {
  const letter = normalizeChoiceLetter(correctChoice);

  switch (letter) {
    case "a":
      return aChoice || "";
    case "b":
      return bChoice || "";
    case "c":
      return cChoice || "";
    case "d":
      return dChoice || "";
    case "e":
      return eChoice || "";
    default:
      return "";
  }
}

function buildSesatsAIPrompt({
  questionStem,
  aChoice,
  bChoice,
  cChoice,
  dChoice,
  eChoice,
  correctChoice,
  critique,
}) {
  const correctAnswer = getCorrectAnswerText({
    correctChoice,
    aChoice,
    bChoice,
    cChoice,
    dChoice,
    eChoice,
  });

  return `
You are a cardiothoracic surgery board examiner.

This is a legacy multiple-choice question from SESATS IX, with content written around 2011 and potentially outdated. Your job is to evaluate both the keyed answer and the original critique against current ACC/AHA guidelines, STS guidance, and contemporary cardiothoracic surgical practice.

Question:
${questionStem || ""}

Answer choices (A–E):
A. ${aChoice || ""}
B. ${bChoice || ""}
C. ${cChoice || ""}
D. ${dChoice || ""}
E. ${eChoice || ""}

Keyed (legacy) correct answer: ${String(correctChoice || "").toUpperCase()}). ${correctAnswer}

Original critique:
${critique || ""}

Tasks:
1) Determine whether the keyed answer is still correct under current guidelines and current cardiothoracic surgical practice.
2) Evaluate whether the original critique is still current, partially outdated, or outdated.
3) Begin your response with exactly these two lines:
   VERDICT_ANSWER: STILL_CORRECT
   OR
   VERDICT_ANSWER: OUTDATED
   OR
   VERDICT_ANSWER: AMBIGUOUS

   VERDICT_CRITIQUE: CURRENT
   OR
   VERDICT_CRITIQUE: PARTIALLY_OUTDATED
   OR
   VERDICT_CRITIQUE: OUTDATED
4) Then provide these labeled sections in order:
   ANSWER ASSESSMENT:
   CRITIQUE ASSESSMENT:
   WHAT HAS CHANGED SINCE 2011:
5) In ANSWER ASSESSMENT:
   - If STILL_CORRECT: explain why it remains correct and briefly explain why each other option (A–E) is incorrect.
   - If OUTDATED: state the best current answer letter (A–E) and explain why the keyed answer is no longer correct; then briefly explain why the remaining options are incorrect.
   - If NONE of the listed options reflects current best practice, clearly state:
     NO_OPTION_CURRENTLY_CORRECT
     Then explain what the correct modern management would be and why none of the choices are appropriate.
   - If AMBIGUOUS: list the specific missing clinical data (1–3 items maximum) that would change the answer, and for each item state which letter (A–E) would become correct if that condition were met.
6) In CRITIQUE ASSESSMENT:
   - State whether the critique still holds up today.
   - Point out any statements that are no longer consistent with current guideline thresholds, preferred procedures, risk stratification, perioperative management, imaging, valve/CABG/aortic practice, or critical care standards.
   - Briefly identify which parts of the critique remain valid.
7) In WHAT HAS CHANGED SINCE 2011:
   - Briefly summarize the most important changes in evidence, guidelines, technology, or surgical practice since these questions were written.
   - Focus on practical board-relevant changes, not historical trivia.
8) Keep the explanation concise, structured, and board-style.

Constraints:
- Be guideline-anchored and conservative.
- Do not recommend intervention unless formal guideline criteria are met.
- Do not invent clinical data not provided.
- When referring to an answer choice, always use the letter A–E exactly as listed above.
- If the critique contains dated but harmless wording, say so rather than overstating the problem.
- If current practice varies by scenario, say exactly what clinical factor determines the difference.
`.trim();
}

module.exports = {
  buildSesatsAIPrompt,
  getCorrectAnswerText,
};