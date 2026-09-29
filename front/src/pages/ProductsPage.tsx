import { Loader2, RefreshCw, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';

import { DemoCustomerSelector } from '@/components/demo-customer-selector';
import { ProductDetail } from '@/components/products/product-detail';
import { ProductList } from '@/components/products/product-list';
import { ProductOverview } from '@/components/products/product-overview';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDemoCustomers } from '@/hooks/use-demo-customers';
import {
  getLastCustomerToken,
  pickDefaultToken,
  setActiveCustomerToken,
  setLastCustomerToken,
} from '@/lib/demo-customer-storage';
import {
  fetchProducts,
  productId,
  productName,
  ProductsRequestError,
} from '@/lib/products';

function Notice({
  icon,
  title,
  text,
  action,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground text-sm">{text}</p>
      </div>
      {action}
    </div>
  );
}

export default function ProductsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Same persisted open/closed state as the other sections' sidebars.
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';

  // The customer is the demo customer picked in the chat's selector.
  const { customers, isLoading: loadingCustomers } = useDemoCustomers();
  const [picked, setPicked] = useState<string | null>(null);
  const token = picked ?? pickDefaultToken(customers, getLastCustomerToken());

  const { data, error, isLoading, mutate } = useSWR(
    token ? ['products', token] : null,
    ([, t]: [string, string]) => fetchProducts(t),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const products = data?.products ?? [];
  const selected = products.find((p) => productId(p) === selectedId) ?? null;
  const errorKind = error instanceof ProductsRequestError ? error.kind : error ? 'failed' : null;

  function changeCustomer(next: string) {
    setPicked(next);
    setLastCustomerToken(next);
    setActiveCustomerToken(next);
    setSelectedId(null);
  }

  let content: React.ReactNode;
  if (!token && !loadingCustomers) {
    content = (
      <Notice
        testId="products-no-customer"
        icon={<UserRoundX className="size-5" />}
        title="No hay un cliente demo"
        text="Elige un cliente demo en el chat para ver sus productos."
      />
    );
  } else if (errorKind === 'expired' || errorKind === 'invalid') {
    content = (
      <Notice
        testId="products-session-error"
        icon={<UserRoundX className="size-5" />}
        title={errorKind === 'expired' ? 'La sesión de este cliente venció' : 'Cliente no válido'}
        text="Elige otro cliente demo arriba para ver sus productos."
      />
    );
  } else if (errorKind === 'failed') {
    content = (
      <Notice
        testId="products-error"
        icon={<RefreshCw className="size-5" />}
        title="No pudimos traer tus productos"
        text="El banco no respondió. Vuelve a intentarlo en unos segundos."
        action={
          <Button type="button" variant="secondary" onClick={() => mutate()}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (isLoading || !data) {
    // The warehouse can take 10–40 s on its first request after auto-stop.
    content = (
      <Notice
        testId="products-loading"
        icon={<Loader2 className="size-5 animate-spin" />}
        title="Consultando tus productos"
        text="Traemos los datos del banco; la primera consulta puede tardar unos segundos."
      />
    );
  } else if (selected) {
    content = (
      <div className="flex-1 overflow-y-auto">
        <ProductDetail key={selectedId} product={selected} transactions={data.transactions} />
      </div>
    );
  } else {
    content = (
      <div className="flex-1 overflow-y-auto">
        <ProductOverview
          customer={data.customer}
          products={data.products}
          transactions={data.transactions}
        />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <ProductList products={products} selectedId={selectedId} onSelect={setSelectedId} />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <header className="grid h-13 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
          <SidebarToggle />
          <span className="font-semibold text-[13px]">
            {selected ? productName(selected) : 'Resumen'}
          </span>
          <div className="flex justify-end">
            <TooltipProvider>
              <DemoCustomerSelector
                customers={customers}
                token={token}
                onChange={changeCustomer}
                isLocked={false}
              />
            </TooltipProvider>
          </div>
        </header>
        {content}
      </SidebarInset>
    </SidebarProvider>
  );
}
