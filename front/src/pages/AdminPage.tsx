import { Database, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

import { AdminChatList } from '@/components/admin/admin-chat-list';
import { AdminChatView } from '@/components/admin/admin-chat-view';
import { NoAccess } from '@/components/require-section';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  type AdminChatPage,
  AdminForbiddenError,
  adminChatsKey,
  adminFetch,
  type ChatOwner,
} from '@/lib/admin';
import { convertToUIMessages } from '@/lib/utils';
import type { DBMessage } from '@chat-template/db';

function Placeholder({
  icon: Icon,
  title,
  text,
  testId,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground"
    >
      <Icon className="size-10" strokeWidth={1.4} />
      <p className="text-foreground">{title}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export default function AdminPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';

  const { data: pages, error, size, setSize, isValidating } = useSWRInfinite<
    AdminChatPage | null
  >(adminChatsKey(userId), adminFetch, { revalidateOnFocus: false });
  const { data: owners } = useSWR<{ users: ChatOwner[] } | null>(
    '/api/admin/users',
    adminFetch,
    { revalidateOnFocus: false },
  );
  const { data: messagesFromDb } = useSWR<DBMessage[] | null>(
    selectedId ? `/api/admin/chats/${selectedId}/messages` : null,
    adminFetch,
    { revalidateOnFocus: false },
  );

  if (error instanceof AdminForbiddenError) return <NoAccess />;

  const noDatabase = pages?.[0] === null;
  const chats = (pages ?? []).flatMap((page) => page?.chats ?? []);
  const hasMore = pages?.at(-1)?.hasMore ?? false;
  const selected = chats.find((chat) => chat.id === selectedId) ?? null;

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <AdminChatList
        chats={chats}
        users={owners?.users ?? []}
        userId={userId}
        onUserChange={(next) => {
          setUserId(next);
          setSelectedId(null);
        }}
        selectedId={selectedId}
        onSelect={setSelectedId}
        hasMore={hasMore}
        isLoadingMore={isValidating && (pages?.length ?? 0) < size}
        onLoadMore={() => setSize(size + 1)}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <div className="px-2 py-1.5">
          <SidebarToggle />
        </div>
        {noDatabase ? (
          <Placeholder
            icon={Database}
            testId="admin-no-database"
            title="No hay base de datos"
            text="El back corre sin base de datos, así que no guarda conversaciones."
          />
        ) : selected ? (
          <AdminChatView
            key={selected.id}
            chat={selected}
            messages={convertToUIMessages(messagesFromDb ?? [])}
          />
        ) : (
          <Placeholder
            icon={ShieldCheck}
            title="Elige una conversación"
            text="Puedes leer cualquier conversación, sin modificarla."
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
