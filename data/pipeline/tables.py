"""Single source of truth for the LATAM Bank dataset schema (Factored Datathon 2026).

Transcribed from "LATAM Bank Complete Data Dictionary" v1.0.0. Used by:
  - data/generate_dummy_data.py  (column order + types for the dummy CSVs)
  - data/pipeline/*               (typed casting and dedup in the silver layer)

Each column spec is "name TYPE [NN] [PK]". Types are Spark SQL types:
VARCHAR/TEXT/TIME -> STRING, INTEGER -> INT.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Column:
    name: str
    type: str
    not_null: bool
    pk: bool


@dataclass(frozen=True)
class Table:
    name: str
    kind: str  # dimension | fact | reference
    columns: tuple[Column, ...]
    # Column used to keep the latest version when deduplicating by PK.
    order_by: str | None = None

    @property
    def pk(self) -> list[str]:
        return [c.name for c in self.columns if c.pk]

    @property
    def column_names(self) -> list[str]:
        return [c.name for c in self.columns]


def _table(name: str, kind: str, spec: str, order_by: str | None = None) -> Table:
    cols = []
    for line in spec.strip().splitlines():
        parts = line.split()
        cols.append(Column(parts[0], parts[1], "NN" in parts[2:] or "PK" in parts[2:], "PK" in parts[2:]))
    return Table(name, kind, tuple(cols), order_by)


TABLES: dict[str, Table] = {t.name: t for t in [
    # ------------------------------------------------------------------ dimensions
    _table("customers", "dimension", """
        customer_id STRING PK
        document_number STRING NN
        document_type STRING NN
        first_name STRING NN
        last_name STRING NN
        date_of_birth DATE NN
        gender STRING
        email STRING
        mobile_phone STRING
        landline_phone STRING
        address STRING
        city STRING NN
        state STRING NN
        country STRING NN
        postal_code STRING
        detected_accent STRING
        segment STRING NN
        credit_score INT
        estimated_monthly_income DECIMAL(12,2)
        occupation STRING
        marital_status STRING
        education_level STRING
        registration_date TIMESTAMP NN
        registration_branch_id STRING NN
        customer_status STRING NN
        last_updated TIMESTAMP NN
        accepts_marketing BOOLEAN NN
    """, order_by="last_updated"),
    _table("products", "dimension", """
        product_id STRING PK
        customer_id STRING NN
        product_type STRING NN
        product_number STRING NN
        currency STRING NN
        current_balance DECIMAL(15,2) NN
        credit_limit DECIMAL(15,2)
        interest_rate DECIMAL(5,2)
        opening_date DATE NN
        expiration_date DATE
        opening_branch_id STRING NN
        product_status STRING NN
        opening_channel STRING NN
        has_linked_app BOOLEAN NN
        days_past_due INT
        last_transaction_date TIMESTAMP
        last_updated TIMESTAMP NN
    """, order_by="last_updated"),
    _table("branches", "dimension", """
        branch_id STRING PK
        branch_code STRING NN
        branch_name STRING NN
        branch_type STRING NN
        address STRING NN
        city STRING NN
        state STRING NN
        country STRING NN
        postal_code STRING
        geographic_zone STRING NN
        phone STRING NN
        email STRING
        opening_time STRING NN
        closing_time STRING NN
        has_atms BOOLEAN NN
        atm_count INT
        has_teller_windows BOOLEAN NN
        teller_window_count INT
        latitude DECIMAL(10,7)
        longitude DECIMAL(10,7)
        branch_opening_date DATE NN
        branch_status STRING NN
    """),
    _table("service_agents", "dimension", """
        agent_id STRING PK
        employee_code STRING NN
        first_name STRING NN
        last_name STRING NN
        email STRING NN
        phone STRING
        native_accent STRING NN
        country_of_origin STRING NN
        assigned_branch_id STRING
        agent_type STRING NN
        experience_level STRING NN
        languages STRING NN
        specialty STRING
        hire_date DATE NN
        avg_csat DECIMAL(3,2)
        total_monthly_interactions INT
        agent_status STRING NN
        work_shift STRING NN
    """),
    _table("marketing_campaigns", "dimension", """
        campaign_id STRING PK
        campaign_name STRING NN
        description STRING
        campaign_type STRING NN
        campaign_objective STRING NN
        promoted_product STRING
        target_segment STRING
        target_country STRING
        start_date DATE NN
        end_date DATE NN
        budget DECIMAL(12,2)
        campaign_status STRING NN
        expected_conversion_rate DECIMAL(5,2)
    """),
    # ------------------------------------------------------------------ facts
    _table("transactions", "fact", """
        transaction_id STRING PK
        transaction_date TIMESTAMP NN
        process_date DATE NN
        product_id STRING NN
        customer_id STRING NN
        transaction_type STRING NN
        transaction_category STRING
        amount DECIMAL(15,2) NN
        currency STRING NN
        amount_usd DECIMAL(15,2)
        channel STRING NN
        branch_id STRING
        merchant_name STRING
        merchant_category STRING
        transaction_country STRING NN
        transaction_city STRING
        transaction_status STRING NN
        response_code STRING
        is_fraud BOOLEAN NN
        fraud_score DECIMAL(5,2)
        latitude DECIMAL(10,7)
        longitude DECIMAL(10,7)
    """, order_by="process_date"),
    _table("call_center_interactions", "fact", """
        interaction_id STRING PK
        interaction_date TIMESTAMP NN
        process_date DATE NN
        customer_id STRING NN
        agent_id STRING
        interaction_type STRING NN
        channel STRING NN
        contact_reason STRING NN
        reason_category STRING NN
        duration_seconds INT
        wait_time_seconds INT
        was_resolved BOOLEAN
        requires_followup BOOLEAN NN
        detected_sentiment STRING
        sentiment_score DECIMAL(3,2)
        customer_detected_accent STRING
        agent_used_accent STRING
        was_escalated BOOLEAN NN
        mentioned_products STRING
        has_transcript BOOLEAN NN
        has_recording BOOLEAN NN
    """, order_by="process_date"),
    _table("call_transcripts", "fact", """
        transcript_id STRING PK
        interaction_id STRING NN
        process_date DATE NN
        customer_id STRING NN
        agent_id STRING NN
        full_text STRING NN
        customer_text STRING
        agent_text STRING
        detected_language STRING NN
        detected_accent STRING
        accent_confidence DECIMAL(3,2)
        detected_keywords STRING
        mentioned_entities STRING
        detected_intents STRING
        main_topics STRING
        transcription_model STRING NN
        audio_quality STRING
        duration_seconds INT NN
    """, order_by="process_date"),
    _table("satisfaction_surveys", "fact", """
        survey_id STRING PK
        survey_date TIMESTAMP NN
        process_date DATE NN
        interaction_id STRING
        customer_id STRING NN
        agent_id STRING
        survey_type STRING NN
        send_channel STRING NN
        main_score INT NN
        nps_category STRING
        question_1_text STRING
        question_1_response INT
        question_2_text STRING
        question_2_response INT
        question_3_text STRING
        question_3_response INT
        open_comments STRING
        comment_sentiment STRING
        response_time_hours DECIMAL(8,2)
        campaign_response_rate DECIMAL(5,2)
    """, order_by="process_date"),
    _table("digital_events", "fact", """
        event_id STRING PK
        event_date TIMESTAMP NN
        process_date DATE NN
        customer_id STRING
        session_id STRING NN
        event_type STRING NN
        event_category STRING NN
        channel STRING NN
        platform STRING
        browser STRING
        app_version STRING
        page_url STRING
        page_title STRING
        action STRING
        element_id STRING
        product_id STRING
        event_value DECIMAL(15,2)
        duration_seconds INT
        ip_address STRING
        ip_country STRING
        ip_city STRING
        is_mobile BOOLEAN NN
        referrer STRING
        utm_source STRING
        utm_medium STRING
        utm_campaign STRING
    """, order_by="process_date"),
    _table("complaints", "fact", """
        complaint_id STRING PK
        creation_date TIMESTAMP NN
        process_date DATE NN
        customer_id STRING NN
        case_type STRING NN
        category STRING NN
        subcategory STRING
        reception_channel STRING NN
        affected_product_id STRING
        related_branch_id STRING
        origin_interaction_id STRING
        description STRING NN
        claimed_amount DECIMAL(15,2)
        currency STRING
        priority STRING NN
        status STRING NN
        assigned_agent_id STRING
        assignment_date TIMESTAMP
        first_response_date TIMESTAMP
        resolution_date TIMESTAMP
        closing_date TIMESTAMP
        sla_breached BOOLEAN NN
        resolution_days INT
        resolution STRING
        compensation_granted DECIMAL(15,2)
        resolution_satisfaction INT
        is_repeat_complainer BOOLEAN NN
    """, order_by="process_date"),
    _table("campaign_sends", "fact", """
        send_id STRING PK
        send_date TIMESTAMP NN
        process_date DATE NN
        campaign_id STRING NN
        customer_id STRING NN
        send_channel STRING NN
        template_used STRING
        subject STRING
        send_status STRING NN
        was_delivered BOOLEAN NN
        was_opened BOOLEAN
        open_date TIMESTAMP
        was_clicked BOOLEAN
        click_date TIMESTAMP
        click_count INT
        had_conversion BOOLEAN NN
        conversion_date TIMESTAMP
        conversion_value DECIMAL(15,2)
        open_device STRING
        open_country STRING
        failure_reason STRING
        send_cost DECIMAL(10,4)
    """, order_by="process_date"),
    # ------------------------------------------------------------------ reference
    _table("daily_exchange_rates", "reference", """
        date DATE PK
        source_currency STRING PK
        target_currency STRING PK
        exchange_rate DECIMAL(12,6) NN
        buy_rate DECIMAL(12,6)
        sell_rate DECIMAL(12,6)
        source STRING
    """),
]}


# (child_table, child_column, parent_table, parent_column), from the dictionary's FK section.
FOREIGN_KEYS: list[tuple[str, str, str, str]] = [
    ("products", "customer_id", "customers", "customer_id"),
    ("transactions", "customer_id", "customers", "customer_id"),
    ("call_center_interactions", "customer_id", "customers", "customer_id"),
    ("call_transcripts", "customer_id", "customers", "customer_id"),
    ("satisfaction_surveys", "customer_id", "customers", "customer_id"),
    ("digital_events", "customer_id", "customers", "customer_id"),
    ("complaints", "customer_id", "customers", "customer_id"),
    ("campaign_sends", "customer_id", "customers", "customer_id"),
    ("customers", "registration_branch_id", "branches", "branch_id"),
    ("products", "opening_branch_id", "branches", "branch_id"),
    ("service_agents", "assigned_branch_id", "branches", "branch_id"),
    ("transactions", "branch_id", "branches", "branch_id"),
    ("complaints", "related_branch_id", "branches", "branch_id"),
    ("call_center_interactions", "agent_id", "service_agents", "agent_id"),
    ("call_transcripts", "agent_id", "service_agents", "agent_id"),
    ("satisfaction_surveys", "agent_id", "service_agents", "agent_id"),
    ("complaints", "assigned_agent_id", "service_agents", "agent_id"),
    ("transactions", "product_id", "products", "product_id"),
    ("digital_events", "product_id", "products", "product_id"),
    ("complaints", "affected_product_id", "products", "product_id"),
    ("campaign_sends", "campaign_id", "marketing_campaigns", "campaign_id"),
    ("call_transcripts", "interaction_id", "call_center_interactions", "interaction_id"),
    ("satisfaction_surveys", "interaction_id", "call_center_interactions", "interaction_id"),
    ("complaints", "origin_interaction_id", "call_center_interactions", "interaction_id"),
]
