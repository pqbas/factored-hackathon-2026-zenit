# Validation: fraud risk model

Status: verification requirements, not results of executed tests.

## Documentation

- [x] Required models and challengers distinguished.
- [x] Data, feature, score, and tracking contracts defined.
- [x] Temporal selection, threshold, and conditions preventing promotion specified.

## Data and causality

- [x] Source and compute access demonstrated with a minimal execution.
- [x] Delta versions and quality report saved.
- [x] Unique keys and no transaction_id overlap across partitions.
- [x] Valid labels and both classes in partitions; counts and exclusions published.
- [ ] A fixture with future and same-timestamp events proves they do not enter historical windows.
- [ ] Mixed-currency fixtures do not produce mixed-currency sums.
- [ ] One-to-many joins do not multiply final dataset rows.
- [ ] First transactions and missing history are distinguished from zero activity.
- [x] Missing values, unknown categories, and invalid dates have explicit handling.
- [ ] Adding test rows does not change preprocessing parameters fitted on train.
- [x] A feature allowlist prevents labels, fraud_score, final states, and personal IDs from entering the model.

## Models and evaluation

- [ ] B0/B1/M1/M2 run on the same partitions.
- [ ] Convergence, weights, seeds, and sampling are logged.
- [ ] A tied-score fixture verifies budget handling and distinguishes top-k from fixed thresholds.
- [ ] A fixture without positive predictions produces neither misleading metrics nor hidden errors.
- [ ] Threshold chosen without test; configuration frozen before final evaluation.
- [ ] Validation/test preserve original prevalence.
- [ ] Report includes AP, recall, precision, confusion matrix, review rate, subgroups, intervals, and denominators.
- [ ] Constant-model results demonstrate that high accuracy is insufficient.
- [ ] A model without improvement is rejected for promotion; the negative result is retained.
- [ ] Repeating the same data/configuration version reproduces results within a documented tolerance.
- [ ] Memory, time, and measurable cost recorded; serverless compatibility is not claimed without a test.

## Registration and consumption (later phase)

- [ ] Artifact includes preprocessing and input/output signature.
- [ ] Predictions from the loaded artifact match training predictions on a fixture.
- [ ] Valid scores are in [0,1]; errors produce unavailable and NULL.
- [ ] Repeated scoring does not duplicate the composite key.
- [ ] Model/feature/run versions and training_cutoff are stored in the output.
- [ ] Evaluated out-of-sample scores are distinguished from backfills on training data.
- [ ] Policy applies the agreed fallback for missing scores, without default approval.

## Definition of Done

**MVP experiment:** verified data and causality, reproducible B0/B1/M1/M2, evaluation and limitations published in MLflow, and an explicit utility decision. A positive result and deployment are not required.

**Model ready for consumption:** in addition to a favorable MVP, registration/scoring/contract and policy are validated. Do not check an item merely because code exists without execution evidence.
