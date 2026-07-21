import { Title } from "@solidjs/meta";
import { For } from "solid-js";
import styles from "./legal.module.scss";

const SECTIONS = [
  { id: "agreement", title: "Agreement to these terms" },
  { id: "orders", title: "Orders" },
  { id: "pricing", title: "Pricing & availability" },
  { id: "grading", title: "Card condition & grading" },
  { id: "payments", title: "Payments" },
  { id: "shipping", title: "Shipping & delivery" },
  { id: "returns", title: "Returns & the right of withdrawal" },
  { id: "account-use", title: "Account use" },
  { id: "ip", title: "Intellectual property" },
  { id: "liability", title: "Limitation of liability" },
  { id: "law", title: "Governing law" },
  { id: "changes", title: "Changes to these terms" },
  { id: "contact", title: "Questions" },
];

export default function Terms() {
  return (
    <main class={styles.page}>
      <div class={styles.wide}>
        <Title>Terms of Service | TCGHaven</Title>

        <header class={styles.header}>
          <span class={styles.headerIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 2h6l5 5v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
              <path d="M14 2v5h5" />
              <path d="M9 13h6M9 17h6" />
            </svg>
          </span>
          <div>
            <h1 class={styles.heading}>Terms of Service</h1>
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
            <section id="agreement" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>01</span>
                Agreement to these terms
              </h2>
              <p>
                These terms apply whenever you browse, create an account, or
                place an order on TCGHaven. By using the site, you're
                agreeing to them. If something here doesn't make sense,
                reach out through our <a href="/contact">contact page</a>{" "}
                before you order.
              </p>
            </section>

            <section id="orders" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>02</span>
                Orders
              </h2>
              <p>
                Placing an order means you're agreeing to purchase the items
                in your cart at the listed price. We confirm stock at the
                time of order, but in the rare case an item sells out before
                we can ship it, we'll contact you and offer a swap, a
                partial refund, or a full refund. The choice is yours.
              </p>
              <p>
                We reserve the right to cancel an order if we suspect fraud,
                reseller abuse, or a genuine pricing or stock error.
              </p>
            </section>

            <section id="pricing" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>03</span>
                Pricing & availability
              </h2>
              <p>
                Prices are shown in EUR and include applicable VAT unless
                stated otherwise. We reserve the right to correct pricing
                errors before an order ships, and to update prices at any
                time for items not yet in your cart.
              </p>
            </section>

            <section id="grading" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>04</span>
                Card condition & grading
              </h2>
              <p>
                Every card is graded honestly against standard TCG condition
                guidelines (Mint, Near Mint, Lightly Played, Moderately
                Played, Heavily Played, Damaged) and photographed so what you
                see matches what ships. Grading is a judgment call, and
                reasonable people can disagree by a shade. If a card
                arrives in meaningfully worse condition than described,
                contact us within 14 days of delivery for a replacement or
                refund.
              </p>
            </section>

            <section id="payments" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>05</span>
                Payments
              </h2>
              <p>
                Checkout is processed securely through Mollie, supporting
                iDEAL, major cards, and other regional payment methods.
                Payment is taken at the time of order. We don't store your
                card or bank details ourselves.
              </p>
            </section>

            <section id="shipping" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>06</span>
                Shipping & delivery
              </h2>
              <p>
                Orders ship from the Netherlands, typically within 1 to 2
                business days of payment confirmation. Delivery times vary
                by destination and carrier. Risk of loss passes to you once
                the order is handed to the carrier, though we'll always help
                sort out a lost or damaged parcel with the carrier on your
                behalf.
              </p>
            </section>

            <section id="returns" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>07</span>
                Returns & the right of withdrawal
              </h2>
              <p>
                As an EU consumer, you have the right to withdraw from your
                order within 14 days of delivery, without giving a reason.
                Items must be unopened and in the condition you received
                them. For sealed product, that means the seal itself must
                be intact. See our{" "}
                <a href="/shipping">shipping & returns page</a> for the
                step-by-step process and who covers return shipping in each
                case.
              </p>
            </section>

            <section id="account-use" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>08</span>
                Account use
              </h2>
              <p>
                You're responsible for keeping your account credentials
                secure and for any activity that happens under your account.
                We may suspend or close accounts used for fraud, abuse, bulk
                reselling that violates fair-use limits, or attempts to
                circumvent stock or pricing controls.
              </p>
            </section>

            <section id="ip" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>09</span>
                Intellectual property
              </h2>
              <p>
                All card names, artwork, and trademarks shown on this site
                belong to their respective publishers (Pokémon, Yu-Gi-Oh!,
                Wizards of the Coast, and others). We use product imagery
                for identification purposes only. Site content, design, and
                code belong to TCGHaven.
              </p>
            </section>

            <section id="liability" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>10</span>
                Limitation of liability
              </h2>
              <p>
                We work hard to keep listings, prices, and stock accurate,
                but we can't guarantee the site will be error-free at all
                times. To the extent permitted by law, our liability for any
                issue with an order is limited to the amount you paid for
                that order.
              </p>
            </section>

            <section id="law" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>11</span>
                Governing law
              </h2>
              <p>
                These terms are governed by the laws of the Netherlands. Any
                dispute we can't resolve directly will be handled by the
                competent Dutch courts, without prejudice to any mandatory
                consumer protections you're entitled to in your own country.
              </p>
            </section>

            <section id="changes" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>12</span>
                Changes to these terms
              </h2>
              <p>
                We may update these terms as the shop grows. Changes apply
                to orders placed after the update date at the top of this
                page, never retroactively to an order you've already
                placed.
              </p>
            </section>

            <section id="contact" class={styles.section}>
              <h2 class={styles.sectionTitle}>
                <span class={styles.sectionNum}>13</span>
                Questions
              </h2>
              <p>
                Anything unclear? Reach out through our{" "}
                <a href="/contact">contact page</a> and we'll sort it out.
              </p>
            </section>
          </div>

          <aside class={styles.aside}>
            <div class={styles.asideCard}>
              <h2 class={styles.asideTitle}>The short version</h2>
              <ul class={styles.asideList}>
                <For
                  each={[
                    "14-day EU right of withdrawal on unopened items",
                    "Cards graded honestly and photographed before shipping",
                    "Ships from the Netherlands within 1 to 2 business days",
                    "Prices in EUR, VAT included, paid securely via Mollie",
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
                No legal-speak runarounds here. Ask us and we'll give you a
                straight answer.
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
