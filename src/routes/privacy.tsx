import { Title } from "@solidjs/meta";
import { For } from "solid-js";
import styles from "./legal.module.scss";

const SECTIONS = [
  { id: "who-we-are", title: "Who we are" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "how-we-use-it", title: "How we use it" },
  { id: "who-we-share-it-with", title: "Who we share it with" },
  { id: "cookies", title: "Cookies" },
  { id: "retention", title: "How long we keep it" },
  { id: "your-rights", title: "Your rights" },
  { id: "children", title: "Children's privacy" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
];

export default function Privacy() {
  return (
    <main class={styles.page}>
      <div class={styles.wide}>
        <Title>Privacy Policy | TCGHaven</Title>

        <header class={styles.header}>
          <span class={styles.headerIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <div>
            <h1 class={styles.heading}>Privacy Policy</h1>
            <p class={styles.updated}>Last updated: January 2026</p>
          </div>
        </header>

        <div class={styles.layout}>
          <nav class={styles.toc} aria-label="Sections">
            <span class={styles.tocLabel}>On this page</span>
            <For each={SECTIONS}>
              {(section, i) => (
                <a href={`#${section.id}`} class={styles.tocLink}>
                  <span class={styles.tocNum}>{String(i() + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              )}
            </For>
          </nav>

          <div class={styles.content}>
            <section id="who-we-are" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>01</span>
                Who we are
              </h2>
              <p>
                My Little TCG Haven ("TCGHaven", "we", "us") runs an online
                shop for trading card game singles, sealed product, and
                accessories out of the Netherlands. This policy explains
                what personal data we collect when you use our site, why we
                collect it, and what choices you have.
              </p>
            </section>

            <section id="what-we-collect" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>02</span>
                What we collect
              </h2>
              <p>We collect information in three ways:</p>
              <ul>
                <li>
                  <strong>Information you give us:</strong> your name, email
                  address, shipping and billing address, and phone number
                  when you create an account, check out, or contact support.
                </li>
                <li>
                  <strong>Order and account data:</strong> your order
                  history, wishlist, and cart contents, so you can pick up
                  where you left off across visits.
                </li>
                <li>
                  <strong>Basic technical data:</strong> your IP address,
                  browser type, and pages visited, collected automatically to
                  keep the site secure and working correctly.
                </li>
              </ul>
              <p>
                We don't collect anything beyond what's needed to run your
                account, fulfil your orders, and keep the shop secure.
              </p>
            </section>

            <section id="how-we-use-it" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>03</span>
                How we use it
              </h2>
              <ul>
                <li>To process, pack, and ship your orders</li>
                <li>To manage your account, wishlist, and order history</li>
                <li>To send order confirmations, shipping updates, and support replies</li>
                <li>To send restock, drop, or newsletter emails, only if you've opted in</li>
                <li>To detect and prevent fraud or abuse of the checkout</li>
                <li>To improve the site based on how it's actually used</li>
              </ul>
              <p>We never sell your data to third parties, and we never will.</p>
            </section>

            <section id="who-we-share-it-with" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>04</span>
                Who we share it with
              </h2>
              <p>
                We share the minimum data necessary with a small number of
                trusted parties so the shop can function:
              </p>
              <ul>
                <li>
                  <strong>Mollie</strong> handles payment processing. We
                  don't see or store your full card or bank details. That's
                  between you and Mollie.
                </li>
                <li>
                  <strong>Shipping carriers</strong> receive your name and
                  delivery address to get your order to your door.
                </li>
                <li>
                  <strong>Our hosting and email providers</strong> process
                  data on our behalf under their own confidentiality
                  obligations.
                </li>
              </ul>
            </section>

            <section id="cookies" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>05</span>
                Cookies
              </h2>
              <p>
                We use a small number of essential cookies to keep you signed
                in and to remember your cart between visits. If you opt in to
                marketing emails, we may use a cookie to remember that
                choice. We don't use cookies for third-party advertising or
                cross-site tracking.
              </p>
            </section>

            <section id="retention" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>06</span>
                How long we keep it
              </h2>
              <p>
                We keep account and order data for as long as your account is
                active, plus a period afterward to meet our tax and
                accounting obligations under Dutch law. If you delete your
                account, we remove what we can beyond that legal minimum.
              </p>
            </section>

            <section id="your-rights" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>07</span>
                Your rights
              </h2>
              <p>
                Under the GDPR, you have the right to access, correct, or
                delete the personal data we hold about you, to restrict or
                object to certain processing, and to receive your data in a
                portable format. To exercise any of these, reach out through
                our <a href="/contact">contact page</a> and we'll handle it
                within a reasonable timeframe. If you're not satisfied with
                our response, you can lodge a complaint with the Dutch Data
                Protection Authority (Autoriteit Persoonsgegevens).
              </p>
            </section>

            <section id="children" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>08</span>
                Children's privacy
              </h2>
              <p>
                TCGHaven isn't directed at children under 16. If you believe
                a child has given us personal data without a parent or
                guardian's consent, contact us and we'll remove it.
              </p>
            </section>

            <section id="changes" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>09</span>
                Changes to this policy
              </h2>
              <p>
                If we make meaningful changes to how we handle your data,
                we'll update this page and adjust the date at the top. We
                won't use data in a new way without letting you know first.
              </p>
            </section>

            <section id="contact" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>10</span>
                Contact
              </h2>
              <p>
                Questions about this policy or your data? Reach out anytime
                through our <a href="/contact">contact page</a>.
              </p>
            </section>
          </div>

          <aside class={styles.aside}>
            <div class={styles.asideCard}>
              <h2 class={styles.asideTitle}>The short version</h2>
              <ul class={styles.asideList}>
                <For
                  each={[
                    "We only collect what your orders and account actually need",
                    "Payments run through Mollie. We never see your card details",
                    "No selling data, no ad tracking, no third-party cookies",
                    "You can view, correct, or delete your data anytime",
                  ]}
                >
                  {point => (
                    <li class={styles.asideItem}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {point}
                    </li>
                  )}
                </For>
              </ul>
            </div>

            <div class={styles.asideContact}>
              <h2 class={styles.asideTitle}>Something unclear?</h2>
              <p>
                We're a small shop with real people behind it. Ask us
                anything about your data.
              </p>
              <a href="/contact" class={styles.asideCta}>
                Contact us
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
