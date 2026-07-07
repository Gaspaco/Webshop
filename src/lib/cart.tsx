import {
  createContext,
  createEffect,
  createSignal,
  onMount,
  useContext,
  type ParentProps,
} from "solid-js";

export type CartItem = {
  id: string;
  name: string;
  image: string;
  priceCents: number;
  quantity: number;
};

type CartContextValue = {
  items: () => CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clear: () => void;
  count: () => number;
  subtotalCents: () => number;
};

const STORAGE_KEY = "tcghaven_cart";

function loadStored(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

const CartContext = createContext<CartContextValue>();

export function CartProvider(props: ParentProps) {
  // Always start empty so the server-rendered markup and the client's
  // first hydration pass match exactly. Stored items are loaded after
  // mount (client-only), then persisted back on every change.
  const [items, setItems] = createSignal<CartItem[]>([]);
  let hydrated = false;

  onMount(() => {
    setItems(loadStored());
    hydrated = true;
  });

  createEffect(() => {
    const current = items();
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  });

  const addItem: CartContextValue["addItem"] = (item, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i =>
          i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i,
        );
      }
      return [...prev, { ...item, quantity }];
    });
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const setQuantity = (id: string, quantity: number) => {
    setItems(prev => {
      if (quantity <= 0) return prev.filter(i => i.id !== id);
      return prev.map(i => (i.id === id ? { ...i, quantity } : i));
    });
  };

  const clear = () => setItems([]);

  const count = () => items().reduce((sum, i) => sum + i.quantity, 0);
  const subtotalCents = () =>
    items().reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

  const value: CartContextValue = {
    items,
    addItem,
    removeItem,
    setQuantity,
    clear,
    count,
    subtotalCents,
  };

  return (
    <CartContext.Provider value={value}>{props.children}</CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
