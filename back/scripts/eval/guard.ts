// The evaluation writes conversations and burns LLM time: it runs against a
// local back, and against a deployed Databricks App only with --allow-prod
// (an explicit decision: its conversations go to that App's database).
export function assertLocalBase(base: string, allowProd = false): void {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`--base is not a URL: ${base}`);
  }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  if (
    allowProd &&
    url.protocol === 'https:' &&
    (url.hostname.endsWith('.databricksapps.com') ||
      url.hostname.endsWith('.awsapprunner.com'))
  ) {
    return;
  }
  throw new Error(
    `Refusing to run against ${url.hostname}: the evaluation only runs on localhost or 127.0.0.1 (or a Databricks App or App Runner service with --allow-prod).`,
  );
}
