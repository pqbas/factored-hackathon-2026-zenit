"""Train and export an experimental executable model matching existing Lakebase data.

Source tables are read only. The 2026 final-test labels remain sealed.
Hyperparameters are frozen from V5 C3; this is not a new precision claim.
"""
from __future__ import annotations

import base64
import hashlib
import json
import math
import tempfile
from pathlib import Path

SOURCE = "workspace.bank_gold.customer_transactions"
FIT_END = "2025-01-01"
SELECTION_END = "2025-04-01"
OPERATING_END = "2025-07-01"
VALIDATION_END = "2026-01-01"


def run(spark, mlflow, v4, v5, contract):
    import numpy as np
    import pandas as pd
    from catboost import CatBoostClassifier, Pool
    from pyspark.sql import functions as F

    version = int(spark.sql(f"DESCRIBE HISTORY {SOURCE}").select("version").first()[0])
    source = spark.read.option("versionAsOf", version).table(SOURCE)
    # Gold and its existing Lakebase mirror have no coordinates. The geometry
    # columns are used only to satisfy the shared builder and are never predictors.
    source = source.withColumn("latitude", F.lit(None).cast("double")).withColumn("longitude", F.lit(None).cast("double"))
    frame = v4.build_feature_frame(spark, source_frame=source).select(
        "transaction_id", "transaction_date", "label", *contract.NUMERIC, *contract.CATEGORICAL
    ).withColumn("period", F.when(F.col("transaction_date") < FIT_END, "fit")
        .when(F.col("transaction_date") < SELECTION_END, "selection")
        .when(F.col("transaction_date") < OPERATING_END, "operating_point").otherwise("validation"))
    counts = {r['period']:{'rows':int(r['rows']),'fraud':int(r['fraud'])}
        for r in frame.groupBy('period').agg(F.count('*').alias('rows'),F.sum('label').alias('fraud')).collect()}
    assert set(counts) == {'fit','selection','operating_point','validation'}
    sampled = frame.where(F.col('period') == 'fit').where(
        (F.col('label') == 1) | (F.pmod(F.xxhash64('transaction_id',F.lit(42)),F.lit(1_000_000)) < 100_000)
    ).orderBy('transaction_date','transaction_id')

    def collect_checked(df, expected):
        df = df.select('label',*contract.NUMERIC,*contract.CATEGORICAL)
        pilot = df.limit(256).toPandas()
        projected = pilot.memory_usage(deep=True).sum() / max(len(pilot),1) * expected * 3
        if projected > min(v5.available_memory_bytes() * 0.45, 2 * 1024**3):
            raise MemoryError('Bounded driver collection rejected')
        result = df.toPandas()
        assert len(result) == expected
        return result

    fit = collect_checked(sampled,sampled.count())
    medians = {}
    for name in contract.NUMERIC:
        value = pd.to_numeric(fit[name],errors='coerce').replace([np.inf,-np.inf],np.nan).median()
        medians[name] = float(value) if pd.notna(value) else 0.0

    def matrix(df):
        out = pd.DataFrame(index=df.index)
        for name in contract.NUMERIC:
            values = pd.to_numeric(df[name],errors='coerce').replace([np.inf,-np.inf],np.nan)
            out[name+'_missing'] = values.isna().astype(float)
            out[name] = values.fillna(medians[name]).astype(float)
        for name in contract.CATEGORICAL:
            out[name] = df[name].fillna('__missing__').astype(str).str.strip().replace('', '__missing__')
        out['has_prior_amount_support'] = (pd.to_numeric(df['customer_same_currency_tx_count_30d'],errors='coerce').fillna(0)>=5).astype(float)
        return out[contract.FEATURES]

    xfit = matrix(fit)
    # Check the shared runtime vector against the independently built training matrix.
    for i in range(min(32,len(fit))):
        actual = contract.vector(fit.iloc[i].to_dict(),medians)
        expected = xfit.iloc[i].tolist()
        assert all(a == b or isinstance(a,(int,float)) and isinstance(b,(int,float)) and math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-10) for a,b in zip(actual,expected))
    labels = fit['label'].to_numpy(dtype=int)
    assert int(labels.sum()) == counts['fit']['fraud']
    params = dict(iterations=33,depth=6,learning_rate=0.05,l2_leaf_reg=10,
        class_weights=[1,20],loss_function='Logloss',random_seed=42,
        thread_count=4,has_time=True,allow_writing_files=False,verbose=False)
    model = CatBoostClassifier(**params)
    model.fit(Pool(xfit,labels,cat_features=contract.CATEGORICAL,weight=np.where(labels==1,1.0,10.0)))
    probe = Pool(xfit.iloc[:8],cat_features=contract.CATEGORICAL)
    expected_probe = model.predict_proba(probe,thread_count=1)
    del fit, xfit
    import gc
    gc.collect()

    def scores_for(period):
        data = collect_checked(frame.where(F.col('period')==period),counts[period]['rows'])
        return data['label'].to_numpy(dtype=int),model.predict_proba(Pool(matrix(data),cat_features=contract.CATEGORICAL),thread_count=4)[:,1]

    op_y,op_scores = scores_for('operating_point')
    point = next(p['point'] for p in v5.operating_points(op_y,op_scores)['budgets'] if p['budget']==0.01)
    assert point is not None, 'No supported experimental threshold'
    threshold = point['threshold']
    operating_metrics = v5.prediction_metrics(op_y,op_scores,threshold)
    del op_y,op_scores
    gc.collect()
    val_y,val_scores = scores_for('validation')
    validation = v5.prediction_metrics(val_y,val_scores,threshold)
    del val_y,val_scores
    gc.collect()
    mlflow.set_experiment('/Shared/fraud-eda/phase7-executable-serving')
    with mlflow.start_run(run_name='V7_Gold_Lakebase_experimental_CatBoost') as run:
        mlflow.set_tags({'phase':'V7','promotion':'experimental_only','test_accessed':'false'})
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)/'model.cbm'
            model.save_model(str(target))
            saved = target.read_bytes()
            manifest = {
                'schema_version':1,'feature_version':contract.FEATURE_VERSION,'model_version':'v7_gold_lakebase_c3',
                'run_id':run.info.run_id,'source_table':SOURCE,'delta_version':version,
                'feature_names':contract.FEATURES,'numeric_features':contract.NUMERIC,'categorical_features':contract.CATEGORICAL,
                'medians':medians,'threshold':threshold,'score_type':'uncalibrated_model_output',
                'model_sha256':hashlib.sha256(saved).hexdigest(),'model_bytes':len(saved),
                'catboost_version':__import__('catboost').__version__,'parameters':params,
                'sampled_negative_probability':0.1,'inverse_inclusion_weights':True,
                'fit_end':FIT_END,'selection_end':SELECTION_END,'operating_end':OPERATING_END,'validation_end':VALIDATION_END,
                'split_counts':counts,'operating_metrics':operating_metrics,'validation_metrics':validation,
                'promotion_status':'EXPERIMENTAL_NOT_VALIDATED_FOR_AUTOMATIC_DECISIONS',
                'final_test_used':False,'source_tables_modified':False,'row_level_records_exported':False,
                'training_serving_vector_parity':'passed_on_32_fit_rows',
                'history_semantics':'same customer; event-time strictly before T; inclusive lower bounds; no processing-time reconstruction',
                'label_provenance':'unverified organizer labels; retrospective synthetic-data experiment',
            }
            # The native binary is saved and reloaded before being exported.
            reloaded = CatBoostClassifier()
            reloaded.load_model(str(target))
            assert reloaded.feature_names_ == contract.FEATURES
            error = float(np.max(np.abs(reloaded.predict_proba(probe,thread_count=1)-expected_probe)))
            assert error < 1e-12
            manifest['save_reload_prediction_max_abs_error'] = error
            mlflow.log_artifact(str(target),artifact_path='serving_model')
            mlflow.log_dict(manifest,'serving_model/manifest.json')
            mlflow.log_params({'iterations':33,'positive_class_weight':20,'feature_version':contract.FEATURE_VERSION})
            mlflow.log_metrics({'validation_precision':validation['precision'],'validation_recall':validation['recall'],
                'validation_average_precision':validation['average_precision'],'validation_roc_auc':validation['roc_auc']})
            return {'manifest':manifest,'model_base64':base64.b64encode(saved).decode()}
