import { LayoutGrid } from 'lucide-react';

import { ProductIcon } from '@/components/products/product-icon';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  formatMoney,
  groupProducts,
  maskNumber,
  productLabel,
} from '@/lib/products';
import type { MockProduct } from '@/mocks/products';

export function ProductList({
  products,
  selectedId,
  onSelect,
}: {
  products: MockProduct[];
  selectedId: string | null;
  onSelect: (productId: string | null) => void;
}) {
  const { setOpenMobile } = useSidebar();

  function select(productId: string | null) {
    onSelect(productId);
    setOpenMobile(false);
  }

  return (
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <span className="flex h-9 items-center pl-2 font-semibold text-[15px] tracking-tight">
          Mis productos
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selectedId === null}
                  data-testid="product-row-summary"
                  onClick={() => select(null)}
                  className="h-auto rounded-lg px-2.5 py-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-muted-foreground">
                    <LayoutGrid className="size-[17px]" strokeWidth={1.8} />
                  </span>
                  <span className="text-[13px]">Resumen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groupProducts(products).map((group) => (
          <SidebarGroup key={group.id} className="pt-0">
            <div className="px-2 pb-1 font-semibold text-[11px] text-muted-foreground">
              {group.label}
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.products.map((product) => (
                  <SidebarMenuItem key={product.productId}>
                    <SidebarMenuButton
                      isActive={product.productId === selectedId}
                      data-testid={`product-row-${product.productId}`}
                      onClick={() => select(product.productId)}
                      className="h-auto rounded-lg px-2.5 py-2"
                    >
                      <ProductIcon type={product.productType} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px]">
                          {productLabel(product.productType)}
                        </span>
                        <span className="flex items-baseline justify-between gap-2 font-normal text-xs">
                          <span className="text-muted-foreground">
                            {maskNumber(product.productNumber)}
                          </span>
                          <span className="tabular-nums">
                            {formatMoney(product.currentBalance, product.currency)}
                          </span>
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
