import type { Quiz, SavedQuiz } from "../../shared/quiz-schema.ts";

export type Draft = Pick<Quiz, "title" | "description" | "settings" | "questions">;

export function toDraft({ title, description, settings, questions }: Quiz): Draft {
  return { title, description, settings, questions };
}

/** Each attempt captures what it sends. A successful response only replaces that exact draft. */
export async function saveQuizDraft(
  current: () => Draft,
  revision: string,
  persist: (draft: Draft, revision?: string) => Promise<SavedQuiz>,
  confirmOverwrite: () => boolean,
) {
  let submitted = current();
  let saved: SavedQuiz;
  try {
    saved = await persist(submitted, revision);
  } catch (error) {
    if ((error as { status?: number }).status !== 409) throw error;
    if (!confirmOverwrite()) return null;
    submitted = current();
    saved = await persist(submitted);
  }
  const latest = current();
  return { saved, draft: latest === submitted ? toDraft(saved) : latest, allSaved: latest === submitted };
}
