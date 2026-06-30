import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Suspense } from "solid-js";
import Navbar from "~/components/layout/Navbar";
import { CartProvider } from "~/lib/cart";
import "./app.scss";

export default function App() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <Router
          root={props => (
            <MetaProvider>
              <Title>My Little TCG Haven</Title>
              <Navbar />
              <Suspense>{props.children}</Suspense>
            </MetaProvider>
          )}
        >
          <FileRoutes />
        </Router>
      </CartProvider>
    </QueryClientProvider>
  );
}
