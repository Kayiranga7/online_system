import { useEffect, useState } from 'react';

// Returns `value` after it has stayed unchanged for `delay` ms. Use it to
// debounce search inputs so the API is not queried on every keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
