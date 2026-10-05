import { LayoutGrid } from 'lucide-react';

import { useLang } from '@/contexts/LangContext';
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
  type Product,
  productId,
  productKind,
} from '@/lib/products';

export function ProductList({
  products,
  selectedId,
  onSelect,
}: {
  products: Product[];
  selectedId: string | null;
  onSelect: (productId: string | null) => void;
}) {
  const { t } = useLang();
  const { setOpenMobile } = useSidebar();

  function select(id: string | null) {
    onSelect(id);
    setOpenMobile(false);
  }

  return (
    <Sidebar variant="inset" className="md:left-16">
      <SidebarHeader>
        <span className="flex h-9 items-center pl-2 font-semibold text-[15px] tracking-tight">
          {t.nav.products}
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
                  <span className="text-[13px]">{t.products.summary}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groupProducts(products).map((group) => (
          <SidebarGroup key={group.kind} className="pt-0">
            <div className="px-2 pb-1 font-semibold text-[11px] text-muted-foreground">
              {group.label}
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.products.map((product) => {
                  const id = productId(product);
                  return (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton
                        isActive={id === selectedId}
                        data-testid={`product-row-${product.last4}`}
                        onClick={() => select(id)}
                        className="h-auto rounded-lg px-2.5 py-2"
                      >
                        <ProductIcon kind={productKind(product)} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px]">{product.productType}</span>
                          <span className="flex items-baseline justify-between gap-2 font-normal text-xs">
                            <span className="text-muted-foreground">•• {product.last4}</span>
                            <span className="tabular-nums">
                              {formatMoney(product.currentBalance, product.currency)}
                            </span>
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
