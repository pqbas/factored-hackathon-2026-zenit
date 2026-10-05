import {
  Building2,
  FileText,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Smartphone,
  UserRoundX,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import useSWR from 'swr';

import { CustomerProfileCard } from '@/components/conversations/customer-profile-card';
import { HandoffCard } from '@/components/conversations/handoff-card';
import { Button } from '@/components/ui/button';
import { useLang } from '@/contexts/LangContext';
import {
  type BankCase,
  caseStatus,
  type CaseTone,
  channelKey,
  channelLabel,
  type ContextTab,
  customerContextUrl,
  fetchCustomerContext,
  firstTab,
  formatClaim,
  formatContextDate,
  profileFields,
  type Interaction,
  interactionTypeLabel,
  languageLabel,
  priorityLabel,
  sentimentLabel,
  type Transcript,
  transcriptFor,
  yesNo,
} from '@/lib/customer-context';
import type { AgentHandoff } from '@/lib/handoff-case';
import { cn } from '@/lib/utils';

const TONE: Record<CaseTone, string> = {
  open: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  closed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  other: 'bg-secondary text-muted-foreground',
};

const CHANNEL_ICON: Record<string, LucideIcon> = {
  phone: Phone,
  web: Globe,
  chat: MessageCircle,
  app: Smartphone,
  mobile: Smartphone,
  'mobile app': Smartphone,
  email: Mail,
  branch: Building2,
  video: Video,
};

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md bg-secondary px-2 font-medium text-[11px] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-muted-foreground text-sm">{children}</p>;
}

function CaseCard({ item }: { item: BankCase }) {
  const { t } = useLang();
  const status = caseStatus(item.status);
  const claim = formatClaim(item.claimedAmount, item.currency);
  const priority = priorityLabel(item.priority);
  const date = formatContextDate(item.date);
  return (
    <div data-testid="context-case" className="flex flex-col gap-1.5 rounded-xl bg-secondary/60 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {[item.type, priority && t.console.ctx.priority(priority.toLowerCase())].filter(Boolean).join(' · ')}
        </span>
        <Tag className={cn('ml-auto shrink-0 font-semibold', TONE[status.tone])}>{status.label}</Tag>
      </div>
      <span className="font-semibold text-sm">{item.category ?? item.type ?? t.console.ctx.caseFallback}</span>
      {(item.resolution || claim) && (
        <span className="whitespace-pre-wrap break-words text-muted-foreground text-xs leading-relaxed">
          {[claim && t.console.ctx.claimed(claim), item.resolution].filter(Boolean).join('. ')}
        </span>
      )}
      {date && <span className="text-[11px] text-muted-foreground">{t.console.ctx.openedOn(date)}</span>}
    </div>
  );
}

// A recorded field, label and value; nothing when the bank didn't record it.
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap gap-1">
        {values.map((value) => (
          <Tag key={value}>{value}</Tag>
        ))}
      </dd>
    </>
  );
}

// What the bank recorded about a call: language, intents and topics.
function TranscriptMeta({ item }: { item: Transcript }) {
  const { t } = useLang();
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-xs">
      <Field label={t.console.ctx.language} value={languageLabel(item.language)} />
      <Chips label={t.console.ctx.intents} values={item.intents} />
      <Chips label={t.console.ctx.topics} values={item.topics} />
    </dl>
  );
}

// Bank text is shown literally (already masked): no links or images.
function TranscriptText({ item }: { item: Transcript }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background px-3 py-2.5 text-xs leading-relaxed">
      {item.customerText && (
        <p className="whitespace-pre-wrap break-words">
          <span className="font-semibold">{t.console.ctx.customerSpeaker}</span>
          {item.customerText}
        </p>
      )}
      {item.agentText && (
        <p className="whitespace-pre-wrap break-words">
          <span className="font-semibold text-primary">{t.console.ctx.agentSpeaker}</span>
          {item.agentText}
        </p>
      )}
    </div>
  );
}

function InteractionRow({ item, transcript }: { item: Interaction; transcript: Transcript | null }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const type = interactionTypeLabel(item.interactionType);
  const channel = channelLabel(item.channel);
  const Icon = item.interactionType?.toLowerCase().includes('video')
    ? Video
    : item.interactionType?.toLowerCase().includes('call')
      ? Phone
      : (CHANNEL_ICON[channelKey(item.channel)] ?? MessageCircle);
  return (
    <div data-testid="context-interaction" className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 px-1 py-2.5">
      <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.8} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span data-testid="interaction-type" className="min-w-0 font-semibold text-[13px]">
            {type ?? t.console.ctx.interaction}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {formatContextDate(item.date)}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          <Field label={t.console.ctx.channel} value={channel} />
          <Field label={t.console.ctx.reason} value={item.reason} />
          <Field label={t.console.ctx.resolved} value={yesNo(item.resolved)} />
          <Field label={t.console.ctx.escalated} value={yesNo(item.escalated)} />
          <Field label={t.console.ctx.sentiment} value={sentimentLabel(item.sentiment)} />
        </dl>
        {transcript && (
          <>
            <button
              type="button"
              data-testid="interaction-transcript-toggle"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 self-start rounded-md py-0.5 font-medium text-primary text-xs hover:underline"
            >
              <FileText className="size-3.5" strokeWidth={1.9} />
              {open ? t.console.ctx.hideTranscript : t.console.ctx.showTranscript}
            </button>
            {open && (
              <div
                data-testid="interaction-transcript"
                className="flex flex-col gap-2 rounded-xl bg-secondary/60 px-3 py-2.5"
              >
                <TranscriptMeta item={transcript} />
                <TranscriptText item={transcript} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TranscriptCard({ item }: { item: Transcript }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const date = formatContextDate(item.date);
  return (
    <div data-testid="context-transcript" className="flex flex-col gap-2 rounded-xl bg-secondary/60 px-3.5 py-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-left"
      >
        <span className="font-semibold text-[13px]">
          {date ? t.console.ctx.transcriptOf(date) : t.console.ctx.transcript}
        </span>
        <span className="ml-auto shrink-0 text-primary text-xs">{open ? t.console.ctx.hideText : t.console.ctx.showText}</span>
      </button>
      <TranscriptMeta item={item} />
      {open ? (
        <TranscriptText item={item} />
      ) : (
        <p className="line-clamp-2 break-words text-muted-foreground text-xs leading-relaxed">
          {item.customerText ?? item.agentText}
        </p>
      )}
    </div>
  );
}

// The bank's history of the customer behind the open chat. Loaded apart from
// the chat: the warehouse can take a few seconds. Mount it with key={chatId}
// so each chat starts on its own first tab.
export function CustomerContextPanel({
  chatId,
  handoff = null,
}: {
  chatId: string;
  // The case David handed off in the active conversation: the panel's first
  // section, above the bank history.
  handoff?: AgentHandoff | null;
}) {
  const { t } = useLang();
  const { data, error, isLoading, mutate } = useSWR(customerContextUrl(chatId), fetchCustomerContext, {
    revalidateOnFocus: false,
  });
  // Until the advisor picks one, open the first tab with something in it.
  const [tab, setTab] = useState<ContextTab | null>(null);
  const current = tab ?? (data ? firstTab(data) : 'cases');

  let body: ReactNode;
  if (error) {
    body = (
      <div data-testid="context-error" className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">{t.console.ctx.bankNoAnswer}</p>
        <Button type="button" size="sm" variant="secondary" onClick={() => mutate()}>
          <RefreshCw className="size-3.5" />
          {t.console.ctx.retry}
        </Button>
      </div>
    );
  } else if (isLoading || data === undefined) {
    body = (
      <div data-testid="context-loading" className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t.console.ctx.consulting}
      </div>
    );
  } else if (data === null) {
    body = (
      <div data-testid="context-none" className="flex flex-col items-center gap-3 py-10 text-center">
        <UserRoundX className="size-5 text-muted-foreground" strokeWidth={1.8} />
        <p className="max-w-60 text-muted-foreground text-sm">
          {t.console.ctx.noBankCustomer}
        </p>
      </div>
    );
  }

  const tabs: { id: ContextTab; label: string; count: number }[] = data
    ? [
        { id: 'cases', label: t.console.ctx.tabCases, count: data.cases.length },
        { id: 'interactions', label: t.console.ctx.tabInteractions, count: data.interactions.length },
        { id: 'transcripts', label: t.console.ctx.tabTranscripts, count: data.transcripts.length },
      ]
    : [];

  if (data) {
    if (current === 'cases') {
      body = data.cases.length ? (
        data.cases.map((item, i) => <CaseCard key={`${item.date}-${i}`} item={item} />)
      ) : (
        <Empty>{t.console.ctx.noCases}</Empty>
      );
    } else if (current === 'interactions') {
      body = data.interactions.length ? (
        <div className="flex flex-col">
          {data.interactions.map((item, i) => (
            <InteractionRow
              key={`${item.interactionId ?? item.date}-${i}`}
              item={item}
              transcript={transcriptFor(data, item)}
            />
          ))}
        </div>
      ) : (
        <Empty>{t.console.ctx.noInteractions}</Empty>
      );
    } else {
      body = data.transcripts.length ? (
        data.transcripts.map((item, i) => <TranscriptCard key={`${item.date}-${i}`} item={item} />)
      ) : (
        <Empty>{t.console.ctx.noTranscripts}</Empty>
      );
    }
  }


  return (
    <aside
      data-testid="customer-context"
      aria-label={t.console.ctx.title}
      className="flex h-full w-[360px] shrink-0 flex-col border-border border-l bg-sidebar/40"
    >
      <div className="flex flex-col gap-2.5 border-border border-b px-4.5 pt-4.5 pb-3.5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-[15px]">{t.console.ctx.title}</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">{t.console.ctx.bankData}</span>
        </div>
      </div>
      {/* Everything below the title scrolls together: the case can be tall. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Who the customer is first, then the case David handed off. */}
        {data?.profile && profileFields(data.profile).length > 0 && (
          <div className="px-3.5 pt-3.5">
            <CustomerProfileCard profile={data.profile} />
          </div>
        )}
        {handoff && (
          <div className="px-3.5 pt-3.5">
            <HandoffCard handoff={handoff} />
          </div>
        )}
        {data && (
          <div
            role="tablist"
            aria-label={t.console.ctx.history}
            className="mx-3.5 mt-3.5 flex gap-0.5 rounded-[9px] bg-secondary p-0.5"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`context-tab-${tab.id}`}
                aria-selected={current === tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  'h-7 flex-1 rounded-[7px] font-medium text-xs transition-colors',
                  current === tab.id
                    ? 'bg-background text-foreground shadow-sm dark:bg-input'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label} <span className="opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2.5 px-3.5 pt-3.5 pb-4.5">{body}</div>
      </div>
    </aside>
  );
}
