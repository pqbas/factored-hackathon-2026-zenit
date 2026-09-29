// The evaluation writes conversations and burns LLM time: it only runs
// against a local back, never against prod.
export function assertLocalBase(base: string): void {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`--base is not a URL: ${base}`);
  }
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(
      `Refusing to run against ${url.hostname}: the evaluation only runs on localhost or 127.0.0.1.`,
    );
  }
}
