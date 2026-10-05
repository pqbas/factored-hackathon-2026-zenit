// List prices behind the estimated cost in /api/advisor/metrics and the
// evaluation report. Databricks bills per DBU and can't attribute it to one
// conversation, so this is an estimate from public list prices, not the bill.
//
// Sources, consulted 2026-09-29:
// - DBU rates: https://www.databricks.com/product/pricing/foundation-model-serving
//   lists "Qwen 3 80B Instruct" (standard pay per token) at 2.143 DBU per 1M
//   input tokens and 17.143 DBU per 1M output tokens;
//   https://docs.databricks.com/aws/en/dev-tools/databricks-apps/compute-size
//   gives 0.5 DBU/hour for a Medium app (the default size).
// - USD per DBU: the workspace's current list prices in
//   system.billing.list_prices. Serving is SKU
//   PREMIUM_SERVERLESS_REAL_TIME_INFERENCE_US_WEST_OREGON at 0.07 USD/DBU,
//   Apps is PREMIUM_ALL_PURPOSE_SERVERLESS_COMPUTE_US_WEST_OREGON at 0.75
//   USD/DBU. The workspace's real billing matches 0.5 DBU/hour per App.
const SERVING_USD_PER_DBU = 0.07;
const APPS_USD_PER_DBU = 0.75;

export const PRICING = {
  endpoint: 'databricks-qwen3-next-80b-a3b-instruct',
  inputUsdPerMillion: 2.143 * SERVING_USD_PER_DBU,
  outputUsdPerMillion: 17.143 * SERVING_USD_PER_DBU,
  appUsdPerHour: 0.5 * APPS_USD_PER_DBU,
  sources: [
    'https://www.databricks.com/product/pricing/foundation-model-serving',
    'https://docs.databricks.com/aws/en/dev-tools/databricks-apps/compute-size',
    'system.billing.list_prices: PREMIUM_SERVERLESS_REAL_TIME_INFERENCE_US_WEST_OREGON, PREMIUM_ALL_PURPOSE_SERVERLESS_COMPUTE_US_WEST_OREGON',
  ],
  consultedAt: '2026-09-29',
} as const;

export const PRICING_ASSUMPTIONS =
  `Estimate from list prices consulted ${PRICING.consultedAt}: ` +
  `${PRICING.endpoint} at ${PRICING.inputUsdPerMillion.toFixed(3)} USD per 1M input tokens ` +
  `and ${PRICING.outputUsdPerMillion.toFixed(3)} USD per 1M output tokens (DBU rates from the ` +
  `Databricks pricing page, at ${SERVING_USD_PER_DBU} USD/DBU from system.billing.list_prices, ` +
  `SKU PREMIUM_SERVERLESS_REAL_TIME_INFERENCE_US_WEST_OREGON), plus the App (Medium, ` +
  `0.5 DBU/hour at ${APPS_USD_PER_DBU} USD/DBU, SKU PREMIUM_ALL_PURPOSE_SERVERLESS_COMPUTE_US_WEST_OREGON) ` +
  `prorated by the turn's duration. It does not include the Jev classifier, the warehouse ` +
  `or the database. Databricks billing can't be attributed per conversation.`;

// Cost of some turns' tokens plus the App's share of their combined duration.
// null when there are no tokens: unknown, never zero.
export function estimateCostUsd({
  inputTokens,
  outputTokens,
  durationMs,
}: {
  inputTokens: number | null | undefined;
  outputTokens: number | null | undefined;
  durationMs: number;
}): number | null {
  if (inputTokens == null || outputTokens == null) return null;
  return (
    (inputTokens * PRICING.inputUsdPerMillion +
      outputTokens * PRICING.outputUsdPerMillion) /
      1_000_000 +
    (durationMs / 3_600_000) * PRICING.appUsdPerHour
  );
}
