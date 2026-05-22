import { useEffect, useState } from 'react';

/** Forces a re-render every `ms` so relative time labels (countdowns) stay live. */
export function useTicker(ms = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
