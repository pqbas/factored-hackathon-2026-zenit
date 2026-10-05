# Packaged fraud experiment evidence

The existing agent image copies `configs/`, so these small JSON files make the
recorded V5/V6 aggregate evidence available in AWS without copying `ml/`, customer
records, credentials, fitted preprocessing or training datasets into the image.

Each file identifies the original report and its SHA-256 hash. Regenerate from
the repository root with `python ml/package_fraud_evidence.py`; verify with
`python ml/package_fraud_evidence.py --check`.

The tool prefers the full local reports when they exist, otherwise these packaged
reports. An explicit `FRAUD_REPORT_DIR` takes precedence and never falls back when
its files are missing or invalid. Every report still passes runtime validation.

These files are evaluation evidence, not model binaries. They cannot enable
inference: `risk_score` and `fraud_prediction` stay null, automatic decisions stay
disabled, and verified complaints still require human review.
