# 15. Observabilidad: sin tracing en la App

La App de producción no genera trazas de MLflow. En local, el tracing sigue encendido.

## Por qué

El export de trazas de MLflow sube cada traza a un storage de Databricks (`*.storage.cloud.databricks.com`) al que la App no tiene salida. En prod cada export fallaba con "Connection refused" y reintentaba en segundo plano: no frenaba los turnos, pero ocupaba hilos y ninguna traza llegaba al experimento.

## Decisión

- La App arranca con `AGENT_TRACING=off` (`app.yaml`): no activa el autolog de LangChain, no fija el experimento y llama a `mlflow.tracing.disable()`, así que no intenta subir trazas.
- Sin tracing tampoco se registra el `LoggedModel` del commit al arrancar.
- En local el valor por defecto es `on`: autolog con el experimento fijado una sola vez (`pin_mlflow_experiment`, [spec](../spec/30-09-26-mlflow-experiment-once/)).
- El usuario eligió esto en vez de buscar otra ubicación para las trazas (por ejemplo, tablas de Unity Catalog), para no complicar el hackathon.

## Pendiente

La observabilidad de producción queda para después. Se evaluará Langfuse o LangSmith, que tienen free tier, sobre todo si la App migra a AWS.
