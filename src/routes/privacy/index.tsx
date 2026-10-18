import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
  type StoreProfile,
} from "~/lib/store-profile";
import LegalLayout from "~/components/legal/LegalLayout";
import styles from "~/styles/legal.module.scss";

const SECTIONS = [
  { id: "controller", title: "Who controls your data" },
  { id: "data", title: "Data we process" },
  { id: "purposes", title: "Purposes and legal bases" },
  { id: "providers", title: "Service providers and recipients" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "retention", title: "Retention periods" },
  { id: "security", title: "Security" },
  { id: "transfers", title: "International transfers" },
  { id: "rights", title: "Your privacy rights" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes and contact" },
];

const SUMMARY = [
  { title: "Only what the shop needs", text: "Order and account details are used to run the shop and deliver your cards." },
  { title: "Payments stay with Mollie", text: "Card and bank details are entered at Mollie. We never see or store them." },
  { title: "Never sold", text: "Your personal data is not sold or rented to anyone." },
  { title: "You're in control", text: "Ask to see, correct or delete your data and we'll answer within a month." },
];

export default function Privacy() {
  const [profile, setProfile] = createSignal<StoreProfile>(DEFAULT_STORE_PROFILE);
  onMount(async () => setProfile(await fetchStoreProfile()));

  return (
    <LegalLayout
      title="Privacy policy"
      updated="30 August 2026"
      intro="What we collect when you shop with us, why, and what you can ask us to do with it."
      sections={SECTIONS}
      summary={SUMMARY}
      contact={{
        title: "Want to see, change or delete your data?",
        text: "Tell us what you need and the email linked to your account or order. We normally answer within a month.",
        href: "/contact",
        label: "Send a privacy request",
      }}
    >
      <Title>Privacy policy | TCGHaven</Title>

            <section id="controller" class={styles.section}>
              <h2 class={styles.sectionTitle}>Who controls your data</h2>
              <p>
                {profile().companyName} is the controller responsible for the
                personal data described in this policy.
              </p>
              <dl class={styles.identity}>
                <div><dt>Company</dt><dd>{profile().companyName}</dd></div>
                <div><dt>KVK</dt><dd>{profile().kvkNumber}</dd></div>
                <div><dt>VAT ID</dt><dd>{profile().vatId}</dd></div>
                <Show when={profile().businessAddress}>
                  <div><dt>Address</dt><dd>{profile().businessAddress}</dd></div>
                </Show>
                <div><dt>Privacy email</dt><dd><a href={`mailto:${profile().businessEmail}`}>{profile().businessEmail}</a></dd></div>
                <div><dt>Phone</dt><dd><a href={`tel:${profile().phone.replace(/\s+/g, "")}`}>{profile().phone}</a></dd></div>
              </dl>
            </section>

            <section id="data" class={styles.section}>
              <h2 class={styles.sectionTitle}>Data we process</h2>
              <ul>
                <li><strong>Identity and contact data:</strong> name, email address, phone number, billing address, delivery address, and return details.</li>
                <li><strong>Account data:</strong> profile name, profile image, encrypted or hashed authentication information, verification status, two-factor settings, sessions, wishlist, and saved address.</li>
                <li><strong>Order data:</strong> products, condition and variants, price, discounts, delivery method, payment status, order history, returns, refunds, and support notes.</li>
                <li><strong>Communications:</strong> messages submitted through contact, return, account, or email channels.</li>
                <li><strong>Technical and security data:</strong> IP address, device and browser information made available with requests, timestamps, authentication attempts, rate-limit records, and administrative audit events.</li>
              </ul>
              <p>
                We do not receive or store complete card numbers or online banking
                credentials. Mollie collects the payment information needed for its
                payment service.
              </p>
            </section>

            <section id="purposes" class={styles.section}>
              <h2 class={styles.sectionTitle}>Purposes and legal bases</h2>
              <ul>
                <li><strong>Contract:</strong> create accounts, accept payments, fulfil orders, deliver products, process returns, and provide customer support.</li>
                <li><strong>Legal obligation:</strong> keep required invoices, transaction records, tax records, and information needed to answer lawful requests.</li>
                <li><strong>Legitimate interests:</strong> secure the webshop, prevent fraud, maintain reliable stock, investigate errors, keep an audit trail, and defend legal claims. We balance these interests against your rights.</li>
                <li><strong>Consent:</strong> send optional marketing messages or use non-essential tracking if these features are introduced. Consent can be withdrawn at any time.</li>
              </ul>
              <p>
                We do not use customer data for solely automated decisions that
                produce legal or similarly significant effects. Security systems may
                temporarily limit suspicious activity, with owner review available.
              </p>
            </section>

            <section id="providers" class={styles.section}>
              <h2 class={styles.sectionTitle}>Service providers and recipients</h2>
              <p>We share only the information needed for the following services:</p>
              <ul>
                <li><strong>Mollie:</strong> payment creation, payment status, refunds, and fraud controls.</li>
                <li><strong>PostNL:</strong> delivery, labels, tracking, and transport claims.</li>
                <li><strong>Vercel:</strong> application hosting, delivery, and operational request logs.</li>
                <li><strong>Railway:</strong> PostgreSQL database hosting and related infrastructure.</li>
                <li><strong>The configured mail host:</strong> account verification, password reset, order, return, and customer-service email.</li>
                <li><strong>Authorities and advisers:</strong> information required by law, necessary for legal claims, or needed to investigate fraud.</li>
              </ul>
              <p>
                Providers may also act as independent controllers for parts of their
                service. Their own privacy information explains those activities.
                TCGHaven does not sell personal data.
              </p>
            </section>

            <section id="cookies" class={styles.section}>
              <h2 class={styles.sectionTitle}>Cookies and browser storage</h2>
              <p>
                Essential authentication cookies keep sessions secure, remember
                verification state, and support account protection. The shopping cart
                is stored locally in your browser so it remains available between
                visits. These functions are necessary for services you request.
              </p>
              <p>
                TCGHaven currently does not use third-party advertising cookies or
                cross-site advertising profiles. Mollie may use its own cookies after
                you continue to its hosted checkout. If analytics or marketing cookies
                are introduced, they will remain disabled until the required consent
                has been obtained.
              </p>
            </section>

            <section id="retention" class={styles.section}>
              <h2 class={styles.sectionTitle}>Retention periods</h2>
              <ul>
                <li><strong>Orders, invoices, payments, and required accounting records:</strong> normally 7 years to meet Dutch fiscal record-keeping duties.</li>
                <li><strong>Account and wishlist data:</strong> while the account is active, then deleted or anonymised when no longer needed, except where linked records must be retained.</li>
                <li><strong>Contact and complaint records:</strong> for the time needed to resolve the matter and normally no longer than 2 years afterward, unless a dispute or legal duty requires longer.</li>
                <li><strong>Security and audit records:</strong> for a limited period proportionate to fraud prevention, incident investigation, and legal-claim needs.</li>
                <li><strong>Local cart data:</strong> until you clear the cart, clear browser storage, or remove the site data from your device.</li>
              </ul>
              <p>
                When a retention period ends, data is deleted, anonymised, or kept
                inaccessible until a protected backup expires.
              </p>
            </section>

            <section id="security" class={styles.section}>
              <h2 class={styles.sectionTitle}>Security</h2>
              <p>
                We use access controls, encrypted HTTPS connections, secure cookies,
                password hashing, optional two-factor authentication, server-side
                validation, rate limiting, restricted administrative access, payment
                verification, and audit logging. No internet service can guarantee
                absolute security. If a personal-data breach creates a legal duty to
                notify affected people or the regulator, we will do so as required.
              </p>
            </section>

            <section id="transfers" class={styles.section}>
              <h2 class={styles.sectionTitle}>International transfers</h2>
              <p>
                Some service providers may process data outside the European Economic
                Area. Where GDPR transfer restrictions apply, we rely on an adequacy
                decision, approved contractual safeguards, or another lawful transfer
                mechanism offered by the provider.
              </p>
            </section>

            <section id="rights" class={styles.section}>
              <h2 class={styles.sectionTitle}>Your privacy rights</h2>
              <p>
                Depending on the circumstances, you may request access, correction,
                deletion, restriction, portability, or object to processing based on
                legitimate interests. You may withdraw consent without affecting
                processing that was lawful before withdrawal.
              </p>
              <p>
                Send a request to <a href={`mailto:${profile().businessEmail}`}>{profile().businessEmail}</a> or use the <a href="/contact">contact page</a>.
                We normally respond within one month. We may ask for information
                needed to confirm identity, but will not request more identification
                than reasonably necessary.
              </p>
              <p>
                You may also submit a complaint to the <a href="https://autoriteitpersoonsgegevens.nl/een-tip-of-klacht-indienen-bij-de-ap" target="_blank" rel="noreferrer">Autoriteit Persoonsgegevens</a>.
              </p>
            </section>

            <section id="children" class={styles.section}>
              <h2 class={styles.sectionTitle}>Children</h2>
              <p>
                The webshop is not directed at children under 16 acting without a
                parent or guardian where consent is legally required. Contact us if
                you believe a child supplied personal data improperly so we can
                investigate and remove it where appropriate.
              </p>
            </section>

            <section id="changes" class={styles.section}>
              <h2 class={styles.sectionTitle}>Changes and contact</h2>
              <p>
                We update this policy when our processing or providers change. The
                current date appears at the top. Material changes are communicated
                through the webshop or by email where appropriate.
              </p>
              <p>
                Privacy questions can be sent to <a href={`mailto:${profile().businessEmail}`}>{profile().businessEmail}</a>.
              </p>
            </section>
    </LegalLayout>
  );
}
