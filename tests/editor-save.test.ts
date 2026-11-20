import { expect, test } from "bun:test";
import { saveQuizDraft } from "../src/client/admin/save-quiz-draft.ts";
import { sampleQuiz } from "./helpers.ts";

test("confirmed overwrite uses the latest draft and keeps edits made during the retry", async () => {
  let current = { ...sampleQuiz(), title: "First edit" };
  const result = await saveQuizDraft(() => current, "opened", async (draft, revision) => {
    if (revision) {
      expect(draft.title).toBe("First edit");
      current = { ...current, title: "Second edit" };
      throw Object.assign(new Error("changed"), { status: 409 });
    }
    expect(draft.title).toBe("Second edit");
    current = { ...current, title: "Third edit" };
    return { ...sampleQuiz(), ...draft, revision: "new" };
  }, () => true);
  expect(result?.saved.title).toBe("Second edit");
  expect(result?.draft.title).toBe("Third edit");
});
