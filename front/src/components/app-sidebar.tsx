import { useNavigate } from 'react-router-dom';

import { SidebarHistory } from '@/components/sidebar-history';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { SquarePen } from 'lucide-react';
import type { ClientSession } from '@chat-template/auth';
import { useLang } from '@/contexts/LangContext';

export function AppSidebar({
  user,
}: {
  user: ClientSession['user'] | undefined;
}) {
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const { t } = useLang();

  return (
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex h-9 flex-row items-center justify-between pl-2">
            <span className="font-semibold text-[15px] tracking-tight">
              {t.conversations}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  aria-label={t.newChat}
                  className="size-8 rounded-[7px] p-0 text-muted-foreground"
                  onClick={() => {
                    setOpenMobile(false);
                    navigate('/');
                  }}
                >
                  <SquarePen className="size-[17px]" strokeWidth={1.8} />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end" className="hidden md:block">
                Nueva conversación
              </TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarHistory user={user} />
      </SidebarContent>
    </Sidebar>
  );
}
