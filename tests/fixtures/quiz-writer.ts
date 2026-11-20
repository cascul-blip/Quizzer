import { ConflictError, QuizStore } from "../../src/server/quiz/store.ts";

const [dir, id, action, value] = process.argv.slice(2);
const store = new QuizStore(dir!);
console.log("ready");
await Bun.stdin.text(); // The parent releases the writers together.
try {
  switch (action) {
    case "append":
      for (let n = 0; n < 12; n++) {
        await store.addQuestion(id!, { type: "true_false", text: `${value} ${n}`, correct: [0] });
      }
      break;
    case "replace":
      await store.replace(id!, { title: String(process.pid) }, { revision: value! });
      break;
    case "delete":
      await store.delete(id!);
      break;
    default:
      throw new Error(`Unknown action ${action}`);
  }
} catch (error) {
  if (!(error instanceof ConflictError)) throw error;
  process.exitCode = 3;
}
