import { motion } from 'framer-motion';

import { useSession } from '@/contexts/SessionContext';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName(value: string | undefined): string | null {
  if (!value) return null;
  const base = value.includes('@') ? value.split('@')[0] : value;
  const name = base.split(/[\s._-]+/)[0];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

export const Greeting = () => {
  const { session } = useSession();
  const name = firstName(
    session?.user?.name ||
      session?.user?.preferredUsername ||
      session?.user?.email,
  );
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div
      key="overview"
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 px-6 pt-[18vh] text-center"
    >
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.3 }}
        className="font-semibold text-3xl tracking-tight md:text-[42px]"
      >
        {name ? `${greeting}, ${name}` : greeting}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ delay: 0.4 }}
        className="text-base text-muted-foreground md:text-[17px]"
      >
        ¿En qué te puedo ayudar hoy?
      </motion.p>
    </div>
  );
};
