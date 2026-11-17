import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import ShippingSettingsFields from "~/components/admin/ShippingSettingsFields";
import { INTERNATIONAL_POSTNL_DESTINATIONS } from "~/lib/shipping";
import { DEFAULT_STORE_PROFILE, parseStoreProfile, type StoreProfile } from "~/lib/store-profile";
import styles from "./StoreSetupManager.module.scss";

type RateKey =
  | "postnlLetterCents"
  | "postnlLetterboxCents"
  | "postnlSmallParcelCents"
  | "postnlParcelCents"
  | "postnlLargeParcelCents";

const DOMESTIC_RATES: Array<{ key: RateKey; label: string; limit: string }> = [
  { key: "postnlLetterCents", label: "Letter or postcard", limit: "Up to 2 kg" },
  { key: "postnlLetterboxCents", label: "Letterbox parcel", limit: "38 × 26.5 × 3 cm" },
  { key: "postnlSmallParcelCents", label: "Small parcel", limit: "Up to 3 kg" },
  { key: "postnlParcelCents", label: "Medium parcel", limit: "Up to 10 kg" },
  { key: "postnlLargeParcelCents", label: "Large parcel", limit: "Up to 23 kg" },
];

const zoneLabel = (zone: string) => (/^EUR \d+$/.test(zone) ? `Europe zone ${zone.slice(4)}` : zone);

function MoneyInput(props: { label: string; value: number; required?: boolean; onChange: (cents: number) => void }) {
  return (
    <div class={styles.money}>
      <b aria-hidden="true">€</b>
      <input
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        required={props.required}
        aria-label={props.label}
        value={(props.value / 100).toFixed(2)}
        onInput={event => props.onChange(Math.max(0, Math.round(Number(event.currentTarget.value) * 100)))}
      />
    </div>
  );
}

export default function StoreSetupManager(props: {
  profile?: StoreProfile;
  onUpdated: () => unknown;
}) {
  const initial = () => parseStoreProfile(props.profile ?? DEFAULT_STORE_PROFILE);
  const [saved, setSaved] = createSignal(JSON.stringify(initial()));
  const [profile, setProfile] = createSignal<StoreProfile>(initial());
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<{ tone: "ok" | "error"; text: string } | null>(null);
  const [zoneFill, setZoneFill] = createSignal<Record<string, string>>({});

  const dirty = () => JSON.stringify(profile()) !== saved();
  const patch = <K extends keyof StoreProfile>(key: K, value: StoreProfile[K]) =>
    setProfile(current => ({ ...current, [key]: value }));
  const internationalRate = (code: string, fallback: number) => profile().internationalPostnlRates[code] ?? fallback;
  const setInternationalRates = (entries: Array<[string, number]>) =>
    setProfile(current => ({
      ...current,
      internationalPostnlRates: { ...current.internationalPostnlRates, ...Object.fromEntries(entries) },
    }));

  const zones = createMemo(() => {
    const groups = new Map<string, typeof INTERNATIONAL_POSTNL_DESTINATIONS[number][]>();
    for (const destination of INTERNATIONAL_POSTNL_DESTINATIONS) {
      groups.set(destination.zone, [...(groups.get(destination.zone) ?? []), destination]);
    }
    return [...groups.entries()];
  });

  const applyZone = (zone: string) => {
    const value = Number(zoneFill()[zone]);
    if (!Number.isFinite(value) || value < 0 || zoneFill()[zone] === "") return;
    const cents = Math.round(value * 100);
    setInternationalRates(INTERNATIONAL_POSTNL_DESTINATIONS.filter(entry => entry.zone === zone).map(entry => [entry.code, cents]));
    setZoneFill(current => ({ ...current, [zone]: "" }));
  };

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/store-profile", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile()),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice({ tone: "error", text: result.error ?? "Store settings could not be saved." });
        return;
      }
      setSaved(JSON.stringify(profile()));
      await Promise.resolve(props.onUpdated());
      setNotice({ tone: "ok", text: "Saved. Checkout uses the new prices straight away." });
    } catch {
      setNotice({ tone: "error", text: "Store settings are unavailable right now. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class={styles.setup} onSubmit={save}>
      <div class={styles.toolbar}>
        <p>Shipping prices apply at checkout as soon as you save.</p>
        <A href="/shipping" target="_blank">View shipping page</A>
      </div>

      <Show when={!profile().businessAddress || !profile().returnAddress}>
        <div class={styles.warning} role="note">
          <strong>Addresses missing</strong>
          <p>Add the registered business address and the Dutch return address before launch. Customers need them for legal notices and returns.</p>
        </div>
      </Show>

      <section class={styles.section}>
        <header>
          <h2>Business details</h2>
          <p>Shown in the footer, on invoices and on the legal pages.</p>
        </header>
        <div class={styles.fields}>
          <label class={styles.field}>
            <span>Company name</span>
            <input required autocomplete="organization" value={profile().companyName} onInput={event => patch("companyName", event.currentTarget.value)} />
          </label>
          <label class={styles.field}>
            <span>Phone number</span>
            <input required type="tel" autocomplete="tel" value={profile().phone} onInput={event => patch("phone", event.currentTarget.value)} />
          </label>
          <label class={styles.field}>
            <span>KVK number</span>
            <input required inputmode="numeric" value={profile().kvkNumber} onInput={event => patch("kvkNumber", event.currentTarget.value)} />
          </label>
          <label class={styles.field}>
            <span>VAT ID</span>
            <input required value={profile().vatId} onInput={event => patch("vatId", event.currentTarget.value.toUpperCase())} />
          </label>
          <label class={styles.field}>
            <span>Business email</span>
            <input required type="email" value={profile().businessEmail} onInput={event => patch("businessEmail", event.currentTarget.value)} />
            <small>Customers see this in the footer, the contact page and the legal pages.</small>
          </label>
          <label class={styles.field}>
            <span>Customer email sender</span>
            <input required type="email" value={profile().customerEmailFrom} onInput={event => patch("customerEmailFrom", event.currentTarget.value)} />
          </label>
          <label class={`${styles.field} ${styles.wide}`}>
            <span>Contact form notifications</span>
            <input required type="email" autocomplete="off" value={profile().contactNotificationEmail} onInput={event => patch("contactNotificationEmail", event.currentTarget.value)} />
            <small>Gets a copy of every contact message. Never shown publicly.</small>
          </label>
          <label class={styles.field}>
            <span>Registered business address</span>
            <textarea required rows="3" placeholder="Street and number, postcode, city, Netherlands" value={profile().businessAddress} onInput={event => patch("businessAddress", event.currentTarget.value)} />
          </label>
          <label class={styles.field}>
            <span>Return address</span>
            <textarea required rows="3" placeholder="Street and number, postcode, city, Netherlands" value={profile().returnAddress} onInput={event => patch("returnAddress", event.currentTarget.value)} />
          </label>
        </div>
      </section>

      <section class={styles.section}>
        <header>
          <h2>Delivery in the Netherlands</h2>
          <p>What customers pay for each PostNL service. The letterbox limit and parcel sizes further down decide which service fits an order.</p>
        </header>
        <div>
          <div class={styles.rates}>
            <For each={DOMESTIC_RATES}>
              {rate => (
                <div class={styles.rate}>
                  <span>
                    <strong>{rate.label}</strong>
                    <small>{rate.limit}</small>
                  </span>
                  <MoneyInput label={`${rate.label} price`} value={profile()[rate.key]} onChange={cents => patch(rate.key, cents)} />
                </div>
              )}
            </For>
          </div>
          <div class={styles.freeShipping}>
            <span>
              <strong>Free shipping from</strong>
              <small>Orders with a subtotal at or above this ship free, in the Netherlands and abroad.</small>
            </span>
            <MoneyInput label="Free shipping threshold" required value={profile().freeShippingThresholdCents} onChange={cents => patch("freeShippingThresholdCents", cents)} />
          </div>
        </div>
      </section>

      <section class={styles.section}>
        <header>
          <h2>International prices</h2>
          <p>A fixed price per country. Checkout reads the delivery country and checks the price on the server.</p>
        </header>
        <div class={styles.zones}>
          <For each={zones()}>
            {([zone, destinations]) => (
              <div class={styles.zone}>
                <div class={styles.zoneHead}>
                  <h3>
                    {zoneLabel(zone)}
                    <span>{destinations.length} countries</span>
                  </h3>
                  <div class={styles.zoneFill}>
                    <label for={`zone-fill-${zone}`}>Set all to</label>
                    <div class={styles.money}>
                      <b aria-hidden="true">€</b>
                      <input
                        id={`zone-fill-${zone}`}
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={zoneFill()[zone] ?? ""}
                        onInput={event => {
                          const value = event.currentTarget.value;
                          setZoneFill(current => ({ ...current, [zone]: value }));
                        }}
                        onKeyDown={event => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            applyZone(zone);
                          }
                        }}
                      />
                    </div>
                    <button type="button" disabled={!zoneFill()[zone]} onClick={() => applyZone(zone)}>Apply</button>
                  </div>
                </div>
                <div class={styles.countries}>
                  <For each={destinations}>
                    {destination => (
                      <label class={styles.country}>
                        <span>{destination.name}</span>
                        <MoneyInput
                          label={`${destination.name} shipping price`}
                          required
                          value={internationalRate(destination.code, destination.priceCents)}
                          onChange={cents => setInternationalRates([[destination.code, cents]])}
                        />
                      </label>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </section>

      <ShippingSettingsFields
        value={profile().shippingSettings}
        storeRates={profile()}
        onChange={value => patch("shippingSettings", value)}
      />

      <div class={styles.saveBar} data-dirty={dirty() ? "" : undefined}>
        <p role="status">
          <Show when={notice()} fallback={dirty() ? "You have unsaved changes." : "All changes saved."}>
            {current => <span data-tone={current().tone}>{current().text}</span>}
          </Show>
        </p>
        <Show when={dirty()}>
          <button type="button" class={styles.discard} disabled={busy()} onClick={() => { setProfile(JSON.parse(saved()) as StoreProfile); setNotice(null); }}>
            Discard
          </button>
        </Show>
        <button type="submit" class={styles.save} disabled={busy() || !dirty()}>
          {busy() ? "Saving…" : "Save store setup"}
        </button>
      </div>
    </form>
  );
}
