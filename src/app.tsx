import { MetaProvider, Title } from "@solidjs/meta";
import { Router, useIsRouting, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { Show, Suspense, type ParentProps } from "solid-js";
import { CheckoutFooter, CheckoutHeader } from "~/components/layout/CheckoutChrome";
import Footer from "~/components/layout/Footer";
import Navbar from "~/components/layout/Navbar";
import RouteSkeleton, { type SkeletonVariant } from "~/components/layout/RouteSkeleton";
import RouteMotion from "~/components/layout/RouteMotion";
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
  const isRouting = useIsRouting();
  const isAuthRoute = () =>
    [
      "/login",
      "/signup",
      "/verify-email",
      "/reset-password",
      "/two-factor",
    ].includes(
      location.pathname,
    );
  const isDashboard = () =>
    location.pathname === "/account" ||
    location.pathname.startsWith("/account/") ||
    location.pathname === "/admin" ||
    location.pathname.startsWith("/admin/");
  const chromeless = () => isAuthRoute() || isDashboard();
  // Cart and checkout swap the storefront chrome for a slim, task-focused bar.
  const isCheckoutFlow = () =>
    location.pathname === "/cart" || location.pathname === "/checkout";

  // Routes that read a pending resource suspend, so the fallback below is what
  // the visitor actually looks at while the catalogue loads. Match its shape to
  // the page being opened.
  const skeletonVariant = (): SkeletonVariant => {
    const path = location.pathname;
    if (/^\/products\/[^/]+$/.test(path)) return "detail";
    if (path === "/products") return "grid";
    if (path === "/categories") return "games";
    if (/^\/categories\/[^/]+$/.test(path)) return "game";
    if (path.startsWith("/categories/")) return "subpage";
    return "page";
  };

  return (
    <MetaProvider>
      <Title>My Little TCG Haven</Title>
      {/* A thin bar across the top while the next page loads. */}
      <div
        class="route-progress"
        classList={{ "route-progress-active": isRouting() }}
        aria-hidden="true"
      />
      {!chromeless() && (isCheckoutFlow() ? <CheckoutHeader /> : <Navbar />)}
      <Suspense
        fallback={
          chromeless()
            ? undefined
            : <RouteSkeleton variant={skeletonVariant()} />
        }
      >
        {/* Keyed on pathname so the motion wrapper remounts once per route. */}
        <Show when={location.pathname} keyed>
          {_ => <RouteMotion enabled={!chromeless()}>{props.children}</RouteMotion>}
        </Show>
      </Suspense>
      {!chromeless() && (isCheckoutFlow() ? <CheckoutFooter /> : <Footer />)}
    </MetaProvider>
  );
}
