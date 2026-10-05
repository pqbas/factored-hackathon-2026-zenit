import { Clock3, Database, Loader2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import type { AnalyticsSource } from '../../../back/packages/utils/src/retention';

export function AnalyticsSourcePanel({
  source,
  fallback = false,
}: { source?: AnalyticsSource; fallback?: boolean }) {
  const { lang } = useLang();
  const pt = lang === 'pt';
  if (!source) return null;
  return (
    <section
      aria-label={
        pt
          ? 'Origem e atualização dos dados'
          : 'Fuente y actualización de datos'
      }
      className="rounded-xl border border-border/70 bg-card/30 px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-2 font-medium">
          <Database className="size-4 text-primary" />
          Databricks SQL
        </span>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Clock3 className="size-4" />
          {source.updatedAt
            ? `${pt ? 'Consultado' : 'Consultado'}: ${new Date(source.updatedAt).toLocaleString(pt ? 'pt-BR' : 'es-PE')}`
            : pt
              ? 'Aguardando a primeira consulta'
              : 'Esperando la primera consulta'}
        </span>
        {source.updating && (
          <span
            role="status"
            className="inline-flex items-center gap-2 text-primary"
          >
            <Loader2 className="size-4 animate-spin" />
            {pt
              ? 'Atualizando em segundo plano'
              : 'Actualizando en segundo plano'}
          </span>
        )}
        {source.status === 'stale' && (
          <span className="text-tint-amber-fg">
            {pt ? 'Último resultado disponível' : 'Último resultado disponible'}
          </span>
        )}
      </div>
      {fallback && !source.lastRefreshFailed && (
        <p className="mt-2 text-muted-foreground">
          {pt
            ? 'Mostrando a evidência histórica enquanto a consulta é preparada.'
            : 'Se muestra la evidencia histórica mientras se prepara la consulta.'}
        </p>
      )}
      {(source.lastRefreshFailed || source.status === 'unavailable') && (
        <p role="status" className="mt-2 leading-relaxed text-tint-amber-fg">
          {pt
            ? 'A consulta não pôde ser atualizada. Verifique a conexão ou as permissões do serviço.'
            : 'No se pudo actualizar la consulta. Revisa la conexión o los permisos del servicio.'}{' '}
          {fallback
            ? pt
              ? 'Mostrando a evidência histórica identificada abaixo.'
              : 'Se muestra la evidencia histórica identificada abajo.'
            : source.statementId
              ? pt
                ? 'O último resultado válido foi conservado.'
                : 'Se conservó el último resultado válido.'
              : ''}
        </p>
      )}
      <details className="mt-2 text-muted-foreground">
        <summary className="w-fit cursor-pointer py-2">
          {pt
            ? 'Fonte e política de atualização'
            : 'Fuente y política de actualización'}
        </summary>
        <div className="space-y-2 border-t border-border pt-3">
          <p>
            {pt
              ? 'Cache compartilhado por serviço'
              : 'Caché compartida por servicio'}{' '}
            · {source.cacheSeconds / 60} min ·{' '}
            {pt ? 'Somente leitura' : 'Solo lectura'}
          </p>
          {source.tables.map((table) => (
            <p key={table} className="break-all font-mono">
              {table}
            </p>
          ))}
          {source.statementId && (
            <p className="break-all font-mono">
              Statement: {source.statementId}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
