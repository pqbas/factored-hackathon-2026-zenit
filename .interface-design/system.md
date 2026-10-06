# Zenit admin interface patterns

This records the existing application style used by the fraud dashboard. It is
not a replacement theme for the rest of the product.

- Intent: a bank administrator compares activity, evidence and prediction
  coverage before opening a case for human review. Keep data provenance and
  event cohorts visible.
- Palette: existing graphite background/sidebar/card tokens in dark mode and
  existing neutral light surfaces. Primary blue means activity or navigation.
  Amber means experimental evidence, missing data or an integrity question;
  red identifies missed positives in the evaluation view. Colors always have
  accompanying text or values.
- Depth: subtle token-based borders and surface opacity. Rounded-xl panels;
  no decorative gradients or dramatic shadows.
- Typography: the existing SF/system stack for labels and body text; system
  monospace and tabular numbers for measured values. Body and labels use
  text-sm or larger. Chart data is also available in readable tables.
- Spacing: four-pixel base. Panel padding is 16px on mobile, 20px above small
  breakpoints; sections use 20px gaps. Interactive controls are at least 44px
  tall. The application rail remains unchanged.
- Hierarchy: header and evidence status, three view buttons, period/cohort,
  measured values, analytical panels, insights, expandable provenance.
- Signature: pair rates with their observed numerator/denominator; explicitly
  distinguish data labels, experimental index values and human case closure.
  Sources, versions and dates must accompany historical evidence.
- Responsive behavior: mobile-first single columns, two columns at suitable
  project breakpoints, four-stat layouts only when space permits. Chart/table
  overflow stays within the panel, never the whole page.
- States: pending, failed request, retry, available empty results and absent
  operational storage must remain distinct. Undefined ratios render as a dash.

## Shared analytics and retention

- Reuse the fraud panel/stat primitives and existing admin rail for retention.
- Put provenance and background-refresh state below the page header. Distinguish
  successful query time from the dataset reference date; never advance the
  success timestamp after a failed refresh.
- Retention bands mean follow-up priority from explainable rules, not calibrated
  churn probability. Show the reasons and observation counts with each reference.
- Filter bounded shortlists locally; use expandable rows instead of exporting
  full histories. Empty selections, cold caches and unavailable reports are
  different states. No result means no fabricated zero KPIs.
