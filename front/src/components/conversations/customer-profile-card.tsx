import { type CustomerProfile, profileFields } from '@/lib/customer-context';

// "Datos del cliente": the customer's main data as the bank has it, as a
// record like the handed-off case's. Nothing when the bank sent none.
export function CustomerProfileCard({ profile }: { profile: CustomerProfile | null }) {
  const fields = profileFields(profile);
  if (fields.length === 0) return null;
  return (
    <section
      data-testid="customer-profile"
      className="flex flex-col gap-2.5 rounded-xl border border-border bg-card/60 px-3.5 py-3"
    >
      <h3 className="font-semibold text-[13px]">Datos del cliente</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs">
        {fields.map((field) => (
          <div key={field.key} className="contents">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd data-testid={`profile-${field.key}`} className="flex min-w-0 flex-col">
              {field.values.map((value) =>
                // A long email breaks after the @, never mid-word.
                field.key === 'email' && value.includes('@') ? (
                  <span key={value}>
                    {value.slice(0, value.indexOf('@') + 1)}
                    <wbr />
                    {value.slice(value.indexOf('@') + 1)}
                  </span>
                ) : (
                  <span key={value}>{value}</span>
                ),
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
