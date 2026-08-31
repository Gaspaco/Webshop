import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
  type StoreProfile,
} from "~/lib/store-profile";
import styles from "./legal.module.scss";

const SECTIONS = [
  { id: "business", title: "The seller" },
  { id: "orders", title: "Ordering and the contract" },
  { id: "prices", title: "Prices and VAT" },
  { id: "payments", title: "Payments" },
  { id: "condition", title: "Card condition and product information" },
  { id: "delivery", title: "Delivery and shipping risk" },
  { id: "withdrawal", title: "Right of withdrawal" },
  { id: "refunds", title: "Returns and refunds" },
  { id: "guarantee", title: "Faulty, damaged, or incorrect products" },
  { id: "accounts", title: "Customer accounts" },
  { id: "complaints", title: "Complaints" },
  { id: "liability", title: "Liability" },
  { id: "law", title: "Applicable law" },
  { id: "changes", title: "Changes to these terms" },
];

export default function Terms() {
  const [profile, setProfile] = createSignal<StoreProfile>(DEFAULT_STORE_PROFILE);
  onMount(async () => setProfile(await fetchStoreProfile()));

  return (
    <main class={styles.page}>
      <div class={styles.wide}>
        <Title>Terms and conditions | TCGHaven</Title>

        <header class={styles.header}>
          <span class={styles.headerIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 2h6l5 5v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
              <path d="M14 2v5h5" />
              <path d="M9 13h6M9 17h6" />
            </svg>
          </span>
          <div>
            <h1 class={styles.heading}>Terms and conditions</h1>
            <p class={styles.updated}>Last updated: 30 August 2026</p>
          </div>
        </header>

        <div class={styles.layout}>
          <nav class={styles.toc} aria-label="Terms sections">
            <span class={styles.tocLabel}>On this page</span>
            <For each={SECTIONS}>
              {section => <a href={`#${section.id}`} class={styles.tocLink}>{section.title}</a>}
            </For>
          </nav>

          <div class={styles.content}>
            <section id="business" class={styles.section}>
              <h2 class={styles.sectionTitle}>The seller</h2>
              <p>
                These terms apply to purchases from {profile().companyName}, an online
                trading card shop established in the Netherlands.
              </p>
              <dl class={styles.identity}>
                <div><dt>Company</dt><dd>{profile().companyName}</dd></div>
                <div><dt>KVK</dt><dd>{profile().kvkNumber}</dd></div>
                <div><dt>VAT ID</dt><dd>{profile().vatId}</dd></div>
                <Show when={profile().businessAddress}>
                  <div><dt>Address</dt><dd>{profile().businessAddress}</dd></div>
                </Show>
                <div><dt>Email</dt><dd><a href={`mailto:${profile().businessEmail}`}>{profile().businessEmail}</a></dd></div>
                <div><dt>Phone</dt><dd><a href={`tel:${profile().phone.replace(/\s+/g, "")}`}>{profile().phone}</a></dd></div>
              </dl>
              <p>
                These terms are written for consumers. Mandatory consumer rights
                always take priority if a term conflicts with the law.
              </p>
            </section>

            <section id="orders" class={styles.section}>
              <h2 class={styles.sectionTitle}>Ordering and the contract</h2>
              <p>
                Product pages describe the main characteristics, condition, price,
                and available stock. Review your order before selecting the button
                that confirms your payment obligation. We send an electronic order
                confirmation after the order is accepted.
              </p>
              <p>
                If an item is unavailable or a clear price or stock error makes
                fulfilment impossible, we will contact you promptly. You can choose
                an available alternative or a refund. Any amount already collected
                for a cancelled item is returned through the original payment method.
              </p>
              <p>
                We may refuse or cancel an order where reasonably necessary to
                prevent fraud, unlawful activity, or misuse of the webshop. We will
                explain the decision unless doing so would compromise a security or
                legal investigation.
              </p>
            </section>

            <section id="prices" class={styles.section}>
              <h2 class={styles.sectionTitle}>Prices and VAT</h2>
              <p>
                Prices are shown in euros and include applicable VAT. Delivery
                charges and discounts are shown before you place the order. For
                eligible second-hand goods sold under the VAT margin scheme, VAT is
                included in the price but is not shown separately on the invoice.
              </p>
            </section>

            <section id="payments" class={styles.section}>
              <h2 class={styles.sectionTitle}>Payments</h2>
              <p>
                Mollie processes online payments and shows the payment methods
                available for the transaction. TCGHaven does not receive or store
                your complete card or online banking credentials. An order is
                prepared after payment is confirmed, unless the selected payment
                method has a later settlement period.
              </p>
            </section>

            <section id="condition" class={styles.section}>
              <h2 class={styles.sectionTitle}>Card condition and product information</h2>
              <p>
                Singles are listed with a condition, language, finish, grading
                information, and images where available. Professional grading labels
                remain the opinion of the grading company. Raw-card condition is
                assessed carefully, but minor differences in judgment can occur. A
                disclosed defect or condition issue is part of the agreed product
                description.
              </p>
              <p>
                Product names, set symbols, artwork, and trademarks belong to their
                respective rights holders. They are displayed to identify genuine
                products and are not evidence of sponsorship.
              </p>
            </section>

            <section id="delivery" class={styles.section}>
              <h2 class={styles.sectionTitle}>Delivery and shipping risk</h2>
              <p>
                We currently deliver within the Netherlands using the methods shown
                at checkout. We aim to hand paid orders to the carrier within 1 to 2
                business days. If no other delivery period is agreed, delivery will
                take place within the period required by Dutch consumer law.
              </p>
              <p>
                TCGHaven remains responsible for loss or damage during delivery until
                you, or a person designated by you, receives the order. This does not
                apply when you independently appoint a carrier that we did not offer.
                Report visible transport damage or a missing parcel as soon as
                reasonably possible so we can contact the carrier and provide a
                replacement or refund where required.
              </p>
              <p><a href="/shipping">View current shipping rates and delivery information</a>.</p>
            </section>

            <section id="withdrawal" class={styles.section}>
              <h2 class={styles.sectionTitle}>Right of withdrawal</h2>
              <p>
                Consumers may withdraw from an online purchase without giving a
                reason within 14 days after the day the product is received. For an
                order delivered in separate parts, the period starts after the final
                part is received.
              </p>
              <p>
                Tell us within that period through the <a href="/returns">online
                withdrawal form</a> or by sending an unambiguous statement to
                <a href={`mailto:${profile().businessEmail}`}> {profile().businessEmail}</a>.
                Using the form is optional and a reason is not required. We send an
                electronic acknowledgement when the online form is accepted.
              </p>
              <p>
                The statutory exceptions to withdrawal apply only where the law says
                they apply, such as a genuinely personalised product. A standard
                single card or second-hand product is not excluded just because it
                was sold online.
              </p>
            </section>

            <section id="refunds" class={styles.section}>
              <h2 class={styles.sectionTitle}>Returns and refunds</h2>
              <p>
                After notifying us of withdrawal, send the products back within
                another 14 days. For an ordinary change-of-mind withdrawal, you pay
                the direct return shipping cost. Use suitable protection and keep
                proof of dispatch because the return shipment remains your
                responsibility until it reaches us.
              </p>
              <p>
                You may inspect a product as you could in a shop. You are responsible
                for any reduction in value caused by handling beyond what is
                necessary to establish its nature, characteristics, and operation.
                Opening randomized sealed trading card products can substantially
                reduce their resale value. Any deduction is based on the actual
                reduction in value and assessed case by case.
              </p>
              <p>
                For a full-order withdrawal, we refund the purchase price and the
                cost of the least expensive standard delivery method we offered.
                Additional delivery upgrades are not refunded. We pay within 14 days
                after your withdrawal notice, using the original payment method, but
                may wait until the goods arrive or you supply proof of dispatch.
                Original delivery costs are not refunded for a partial return.
              </p>
            </section>

            <section id="guarantee" class={styles.section}>
              <h2 class={styles.sectionTitle}>Faulty, damaged, or incorrect products</h2>
              <p>
                Every consumer has the Dutch statutory right to a product that
                matches the agreement. If an item is incorrect, damaged in transit,
                counterfeit, incomplete, or meaningfully worse than its description,
                contact us within a reasonable time after discovery. Reporting within
                two months is always considered timely under Dutch consumer law.
              </p>
              <p>
                Where the product does not conform, TCGHaven is responsible for an
                appropriate legal remedy, such as replacement, repair where relevant,
                a price reduction, or a refund. Necessary return costs for a valid
                non-conformity claim are paid by TCGHaven. These rights are separate
                from the 14-day right of withdrawal.
              </p>
            </section>

            <section id="accounts" class={styles.section}>
              <h2 class={styles.sectionTitle}>Customer accounts</h2>
              <p>
                Keep your credentials confidential and notify us if you suspect
                unauthorized access. We may temporarily restrict an account to
                protect customers, investigate fraud, comply with law, or stop
                technical abuse. Closing an account does not remove records that must
                be retained for orders, tax, fraud prevention, or legal claims.
              </p>
            </section>

            <section id="complaints" class={styles.section}>
              <h2 class={styles.sectionTitle}>Complaints</h2>
              <p>
                Send a complaint through the <a href="/contact">contact page</a> or to
                <a href={`mailto:${profile().businessEmail}`}> {profile().businessEmail}</a>.
                Include your order number and a clear description. We acknowledge
                complaints within 2 business days and aim to provide a substantive
                response within 14 days. If more time is needed, we will explain why
                and give a new response date.
              </p>
              <p>
                If we cannot resolve a cross-border consumer dispute together, your
                local European Consumer Centre may be able to provide information and
                assistance. You also retain access to the courts and any mandatory
                consumer remedies.
              </p>
            </section>

            <section id="liability" class={styles.section}>
              <h2 class={styles.sectionTitle}>Liability</h2>
              <p>
                Nothing in these terms excludes or restricts liability or consumer
                rights that cannot legally be excluded. TCGHaven is not responsible
                for loss caused by circumstances outside its reasonable control,
                provided that we still meet any mandatory duty to deliver, refund,
                replace, or compensate under applicable law.
              </p>
            </section>

            <section id="law" class={styles.section}>
              <h2 class={styles.sectionTitle}>Applicable law</h2>
              <p>
                Dutch law applies to these terms. If you live in another country,
                this choice does not remove mandatory consumer protection granted by
                the law that applies to you. Disputes may be submitted to the
                competent court under applicable jurisdiction rules.
              </p>
            </section>

            <section id="changes" class={styles.section}>
              <h2 class={styles.sectionTitle}>Changes to these terms</h2>
              <p>
                We may update these terms for future orders. The version accepted
                when you placed an order continues to apply to that order. The update
                date appears at the top of this page.
              </p>
            </section>
          </div>

          <aside class={styles.aside}>
            <div class={styles.asideCard}>
              <h2 class={styles.asideTitle}>Key customer rights</h2>
              <ul class={styles.asideList}>
                <For each={[
                  "14 days to withdraw from most online purchases",
                  "Another 14 days to send a withdrawn order back",
                  "TCGHaven carries delivery risk until receipt",
                  "Statutory guarantee remains separate from returns",
                ]}>
                  {point => (
                    <li class={styles.asideItem}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      {point}
                    </li>
                  )}
                </For>
              </ul>
            </div>
            <div class={styles.asideContact}>
              <h2 class={styles.asideTitle}>Need help with an order?</h2>
              <p>Use the contact form for a question or the withdrawal form to cancel a purchase.</p>
              <a href="/returns" class={styles.asideCta}>Withdraw from an order</a>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
