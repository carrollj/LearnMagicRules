import { parseRules } from "./parser/core.js";

async function main(): Promise<void> {
  await parseRules();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
