import { sql, type SQL } from 'drizzle-orm';

export interface FraudAggregateRow {
  day: string;
  type: string;
  scoreBin: number;
  scored: boolean;
  alert: boolean;
  closed: boolean;
  total: number;
}

/** A single bounded, read-only query. No facts, identifiers or row-level data leave the DB. */
export function fraudDashboardQuery({
  from,
  to,
  tz,
}: { from: string; to: string; tz: string }): SQL {
  return sql`
    with complaints as (
      select
        to_char(("createdAt" at time zone 'UTC') at time zone ${tz}, 'YYYY-MM-DD') as day,
        case when facts #>> '{verified_data,complaint_type}' in
          ('not_recognized', 'duplicate_charge', 'different_amount')
          then facts #>> '{verified_data,complaint_type}' else 'other' end as type,
        facts -> 'fraud_assessment' as assessment,
        "resolvedAt" is not null as closed
      from ai_chatbot."Handoff"
      where reason = 'complaint'
        and "createdAt" >= (${from}::date::timestamp at time zone ${tz}) at time zone 'UTC'
        and "createdAt" < ((${to}::date + interval '1 day') at time zone ${tz}) at time zone 'UTC'
    ), parsed as (
      select *, case when jsonb_typeof(assessment -> 'risk_score') = 'number'
        then (assessment ->> 'risk_score')::numeric else null end as score
      from complaints
    ), classified as (
      select *, coalesce(
        assessment ->> 'scope' = 'transaction_inference'
        and assessment ->> 'score_status' = 'experimental_prediction'
        and assessment ->> 'score_type' = 'uncalibrated_model_output'
        and assessment -> 'automatic_decisions_enabled' = 'false'::jsonb
        and assessment -> 'review_required' = 'true'::jsonb
        and jsonb_typeof(assessment -> 'fraud_prediction') = 'boolean'
        and score between 0 and 1, false) as scored
      from parsed
    )
    select day, type, closed, scored,
      (scored and coalesce(assessment -> 'fraud_prediction' = 'true'::jsonb, false)) as alert,
      case when scored then least(9, floor(score * 10)::int) else -1 end as "scoreBin",
      count(*)::int as total
    from classified
    group by day, type, closed, scored, alert, "scoreBin"
    order by day, type, "scoreBin"
  `;
}
