import { useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { Button } from './ui/button';
import { PanelLeft } from 'lucide-react';

export function SidebarToggle() {
  const { toggleSidebar } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-testid="sidebar-toggle-button"
          onClick={toggleSidebar}
          variant="ghost"
          aria-label="Mostrar u ocultar la barra lateral"
          className="size-8 rounded-[7px] p-0 text-muted-foreground"
        >
          <PanelLeft size={17} strokeWidth={1.8} />
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" className="hidden md:block">
        Barra lateral
      </TooltipContent>
    </Tooltip>
  );
}
