import { MetaProvider, Title } from "@solidjs/meta";
import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Suspense, type ParentProps } from "solid-js";
import Footer from "~/components/layout/Footer";
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
          root={props => <AppShell>{props.children}</AppShell>}
        >
          <FileRoutes />
        </Router>
      </CartProvider>
    </QueryClientProvider>
  );
}

function AppShell(props: ParentProps) {
  const location = useLocation();
  const isAuthRoute = () =>
    ["/login", "/signup", "/reset-password"].includes(location.pathname);

  return (
    <MetaProvider>
      <Title>My Little TCG Haven</Title>
      <Navbar />
      <Suspense>{props.children}</Suspense>
      {!isAuthRoute() && <Footer />}
    </MetaProvider>
  );
}
