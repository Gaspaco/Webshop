import styles from "./PaymentMethods.module.scss";

/**
 * Payment methods accepted through Mollie. Rendered as inline SVG so the
 * marks stay crisp and load without any external requests (the site CSP
 * blocks third-party image hosts).
 */
export default function PaymentMethods() {
  return (
    <div class={styles.methods}>
      <span class={styles.label}>We accept</span>
      <ul class={styles.list}>
        <li class={styles.badge} title="iDEAL">
          <svg viewBox="0 0 40 26" role="img" aria-label="iDEAL">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <text
              x="20"
              y="17.5"
              text-anchor="middle"
              font-family="Helvetica, Arial, sans-serif"
              font-size="10"
              font-weight="700"
              fill="#CC0066"
            >
              iDEAL
            </text>
          </svg>
        </li>

        <li class={styles.badge} title="Bancontact">
          <svg viewBox="0 0 40 26" role="img" aria-label="Bancontact">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <path d="M6 16.5c3.5 0 5.5-2.5 8-5h9l-4.5 5H6Z" fill="#1E3791" />
            <path d="M34 9.5c-3.5 0-5.5 2.5-8 5h-9l4.5-5H34Z" fill="#FFD800" />
          </svg>
        </li>

        <li class={styles.badge} title="Visa">
          <svg viewBox="0 0 40 26" role="img" aria-label="Visa">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <text
              x="20"
              y="17.5"
              text-anchor="middle"
              font-family="Helvetica, Arial, sans-serif"
              font-size="10.5"
              font-weight="700"
              font-style="italic"
              fill="#1A1F71"
            >
              VISA
            </text>
          </svg>
        </li>

        <li class={styles.badge} title="Mastercard">
          <svg viewBox="0 0 40 26" role="img" aria-label="Mastercard">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <circle cx="16.5" cy="13" r="7" fill="#EB001B" />
            <circle cx="23.5" cy="13" r="7" fill="#F79E1B" />
            <path
              d="M20 7.7a7 7 0 0 0 0 10.6 7 7 0 0 0 0-10.6Z"
              fill="#FF5F00"
            />
          </svg>
        </li>

        <li class={styles.badge} title="Maestro">
          <svg viewBox="0 0 40 26" role="img" aria-label="Maestro">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <circle cx="16.5" cy="13" r="7" fill="#0099DF" />
            <circle cx="23.5" cy="13" r="7" fill="#EB001B" />
            <path
              d="M20 7.7a7 7 0 0 0 0 10.6 7 7 0 0 0 0-10.6Z"
              fill="#6C6BBD"
            />
          </svg>
        </li>

        <li class={styles.badge} title="PayPal">
          <svg viewBox="0 0 40 26" role="img" aria-label="PayPal">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <text
              x="20"
              y="17"
              text-anchor="middle"
              font-family="Helvetica, Arial, sans-serif"
              font-size="9"
              font-weight="700"
              font-style="italic"
              fill="#003087"
            >
              Pay<tspan fill="#009CDE">Pal</tspan>
            </text>
          </svg>
        </li>

        <li class={styles.badge} title="Apple Pay">
          <svg viewBox="0 0 40 26" role="img" aria-label="Apple Pay">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <g fill="#000">
              <path d="M14.6 9.5c.36-.45.6-1.06.53-1.68-.53.02-1.18.36-1.55.8-.33.39-.63 1.02-.55 1.62.6.05 1.2-.3 1.57-.74Z" />
              <path d="M15.13 10.35c-.87-.05-1.6.49-2.02.49-.42 0-1.05-.47-1.73-.46-.89.01-1.71.52-2.17 1.32-.92 1.6-.24 3.97.66 5.27.44.64.97 1.36 1.66 1.33.66-.03.92-.43 1.72-.43.8 0 1.03.43 1.73.42.72-.01 1.17-.65 1.61-1.29.5-.74.71-1.45.72-1.49-.02-.01-1.38-.53-1.4-2.11-.01-1.32 1.08-1.95 1.13-1.98-.62-.91-1.58-1.01-1.91-1.07Z" />
              <text
                x="26"
                y="17.5"
                text-anchor="middle"
                font-family="Helvetica, Arial, sans-serif"
                font-size="9.5"
                font-weight="600"
              >
                Pay
              </text>
            </g>
          </svg>
        </li>

        <li class={styles.badge} title="Klarna">
          <svg viewBox="0 0 40 26" role="img" aria-label="Klarna">
            <rect width="40" height="26" rx="3" fill="#FFB3C7" />
            <text
              x="20"
              y="17"
              text-anchor="middle"
              font-family="Helvetica, Arial, sans-serif"
              font-size="9"
              font-weight="700"
              fill="#0B051D"
            >
              Klarna
            </text>
          </svg>
        </li>

        <li class={styles.badge} title="Bank transfer">
          <svg viewBox="0 0 40 26" role="img" aria-label="Bank transfer">
            <rect width="40" height="26" rx="3" fill="#fff" />
            <g fill="none" stroke="#1F2937" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 12v6M17 12v6M23 12v6M28 12v6" />
              <path d="M10 18.5h20M20 6.5l10 4.5H10l10-4.5Z" />
            </g>
          </svg>
        </li>
      </ul>
    </div>
  );
}
