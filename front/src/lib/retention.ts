import type { RetentionResponse } from '../../../back/packages/utils/src/retention';
export type {
  RetentionResponse,
  RetentionData,
  RetentionCustomer,
  RetentionBand,
  AnalyticsSource,
} from '../../../back/packages/utils/src/retention';

export async function fetchRetention(url: string): Promise<RetentionResponse> {
  const response = await fetch(url, {
    credentials: 'include',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Retention request failed (${response.status})`);
  const body = await response.json();
  if (
    body?.source?.provider !== 'databricks_sql' ||
    !['fresh', 'stale', 'loading', 'unavailable'].includes(body?.source?.status)
  )
    throw new Error('Invalid retention response');
  if (
    body.data !== null &&
    (!Array.isArray(body.data?.customers) ||
      !Array.isArray(body.data?.bands) ||
      !Number.isSafeInteger(body.data?.eligibleCustomers))
  )
    throw new Error('Invalid retention cohort');
  return body;
}

export function retentionCopy(pt: boolean) {
  return pt
    ? {
        title: 'Retenção de clientes',
        subtitle: 'Sinais observados para priorizar o acompanhamento humano.',
        rules: 'Regras explicáveis · sem modelo de churn',
        eligible: 'Clientes ativos elegíveis',
        high: 'Alta prioridade',
        medium: 'Prioridade média',
        watch: 'Acompanhar',
        none: 'Sem sinais',
        dataset: 'clientes no dataset',
        review: 'Solicitações para revisão; não são saídas confirmadas.',
        bands: 'Prioridade de acompanhamento',
        signalsTitle: 'O que merece atenção',
        countries: 'Distribuição por país',
        shortlist: 'Clientes para revisar',
        bounded:
          'Lista limitada: até 15 clientes por país e prioridade. Referências pseudonimizadas, sem dados de contato.',
        country: 'País',
        all: 'Todos',
        priority: 'Prioridade',
        customer: 'Cliente',
        segment: 'Segmento',
        reasons: 'Sinais observados',
        details: 'Detalhes',
        empty: 'Nenhum cliente nessa seleção.',
        loading: 'Preparando a consulta de retenção em segundo plano…',
        error: 'Não foi possível carregar a retenção.',
        retry: 'Tentar novamente',
        refresh: 'Atualizar',
        ruleNote:
          'Alta: cancelamento não resolvido ou sinais em 3 famílias. Média: 2 famílias. Acompanhar: 1 família. Atividade, atendimento e satisfação contam uma vez cada.',
        asOf: 'Data de referência do dataset',
        dateNote:
          'A inatividade usa esta data, não a data de hoje. Estados e produtos são snapshots atuais, não histórico de churn confirmado.',
        unknown: 'Clientes sem histórico de atividade',
        activity: 'Atividade em 30 dias',
        prior: '30 dias anteriores',
        days: 'Dias desde a última transação',
        cases: 'Casos abertos',
        csat: 'CSAT observado',
        answers: 'respostas',
        action:
          'Revisar os motivos e o histórico antes de contatar ou decidir uma ação. Este módulo não envia campanhas nem cancela produtos.',
        ruleLabels: {
          inactive: 'Sem transações há 60+ dias',
          declining: 'Atividade caiu pelo menos 50%',
          unresolved: 'Reclamo aberto',
          repeated: 'Reclamos repetidos em 90 dias',
          low_csat: 'CSAT baixo (≤2)',
          negative_sentiment: 'Sentimento negativo recorrente',
          cancellation: 'Cancelamento não resolvido',
        },
      }
    : {
        title: 'Retención de clientes',
        subtitle: 'Señales observadas para priorizar el seguimiento humano.',
        rules: 'Reglas explicables · sin modelo de churn',
        eligible: 'Clientes activos elegibles',
        high: 'Alta prioridad',
        medium: 'Prioridad media',
        watch: 'Seguimiento',
        none: 'Sin señales',
        dataset: 'clientes en el dataset',
        review: 'Casos para revisar; no son abandonos confirmados.',
        bands: 'Prioridad de seguimiento',
        signalsTitle: 'Qué merece atención',
        countries: 'Distribución por país',
        shortlist: 'Clientes para revisar',
        bounded:
          'Lista acotada: hasta 15 clientes por país y prioridad. Referencias seudonimizadas, sin datos de contacto.',
        country: 'País',
        all: 'Todos',
        priority: 'Prioridad',
        customer: 'Cliente',
        segment: 'Segmento',
        reasons: 'Señales observadas',
        details: 'Detalles',
        empty: 'No hay clientes en esta selección.',
        loading: 'Preparando la consulta de retención en segundo plano…',
        error: 'No pudimos cargar retención.',
        retry: 'Reintentar',
        refresh: 'Actualizar',
        ruleNote:
          'Alta: cancelación sin resolver o señales en 3 familias. Media: 2 familias. Seguimiento: 1 familia. Actividad, atención y satisfacción cuentan una vez cada una.',
        asOf: 'Fecha de referencia del dataset',
        dateNote:
          'La inactividad usa esta fecha, no la de hoy. Estados y productos son snapshots actuales, no un historial de abandono confirmado.',
        unknown: 'Clientes sin historial de actividad',
        activity: 'Actividad en 30 días',
        prior: '30 días anteriores',
        days: 'Días desde la última transacción',
        cases: 'Casos abiertos',
        csat: 'CSAT observado',
        answers: 'respuestas',
        action:
          'Revisa los motivos y el historial antes de contactar o decidir una acción. Este módulo no envía campañas ni cancela productos.',
        ruleLabels: {
          inactive: 'Sin transacciones hace 60+ días',
          declining: 'Actividad bajó al menos 50%',
          unresolved: 'Reclamo abierto',
          repeated: 'Reclamos repetidos en 90 días',
          low_csat: 'CSAT bajo (≤2)',
          negative_sentiment: 'Sentimiento negativo recurrente',
          cancellation: 'Cancelación sin resolver',
        },
      };
}
