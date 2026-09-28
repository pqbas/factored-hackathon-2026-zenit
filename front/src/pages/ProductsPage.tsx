import { useState } from 'react';

import { ProductDetail } from '@/components/products/product-detail';
import { ProductList } from '@/components/products/product-list';
import { ProductOverview } from '@/components/products/product-overview';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { maskNumber, productLabel } from '@/lib/products';
import {
  MOCK_CUSTOMER,
  MOCK_PRODUCTS,
  MOCK_TRANSACTIONS,
} from '@/mocks/products';

export default function ProductsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Same persisted open/closed state as the other sections' sidebars.
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';

  const selected =
    MOCK_PRODUCTS.find((product) => product.productId === selectedId) ?? null;

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <ProductList
        products={MOCK_PRODUCTS}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <header className="grid h-13 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
          <SidebarToggle />
          <span className="font-semibold text-[13px]">
            {selected
              ? `${productLabel(selected.productType)} ${maskNumber(selected.productNumber)}`
              : 'Resumen'}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <ProductDetail
              key={selected.productId}
              product={selected}
              transactions={MOCK_TRANSACTIONS}
            />
          ) : (
            <ProductOverview
              customer={MOCK_CUSTOMER}
              products={MOCK_PRODUCTS}
              transactions={MOCK_TRANSACTIONS}
            />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
