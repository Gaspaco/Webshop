import { z } from "zod";
import { getPostnlEnv } from "~/lib/env.server";

export class PostnlError extends Error {}

const barcodeResponseSchema = z.object({
  Barcode: z.string().trim().min(6).max(64),
});

const labelResponseSchema = z.object({
  ResponseShipments: z.array(
    z.object({
      Barcode: z.string().trim().min(6).max(64).optional(),
      Labels: z.array(
        z.object({
          Content: z.string().min(1).max(10_000_000),
        }).passthrough(),
      ).min(1),
    }).passthrough(),
  ).min(1),
}).passthrough();

type ShippingAddress = {
  firstName?: string;
  lastName?: string;
  streetAndHouseNumber?: string;
  postalCode?: string;
  city?: string;
  countryCode: string;
};

type SenderAddress = {
  companyName: string;
  email: string;
  streetAndHouseNumber: string;
  postalCodeAndCity: string;
};

function splitStreetAndHouseNumber(value: string) {
  const match = value.trim().match(/^(.*?)\s+(\d+)(?:\s*([\p{L}\p{N}/-]+))?$/u);
  if (!match?.[1] || !match[2]) {
    throw new PostnlError(
      "The shipping address must end with a house number, for example: Streetname 12A.",
    );
  }
  return {
    street: match[1],
    houseNumber: match[2],
    houseNumberExtension: match[3] ?? "",
  };
}

function splitPostalCodeAndCity(value: string) {
  const match = value.trim().match(/^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new PostnlError("The configured PostNL sender address is invalid.");
  }
  return { postalCode: match[1].replaceAll(" ", "").toUpperCase(), city: match[2] };
}

function postnlError(status: number, body: unknown) {
  const parsed = z
    .object({
      Errors: z
        .array(z.object({ Description: z.string().optional() }).passthrough())
        .optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .safeParse(body);
  const descriptions = parsed.success
    ? parsed.data.Errors?.map(error => error.Description).filter(Boolean)
    : [];
  return new PostnlError(
    descriptions?.length
      ? descriptions.join(" ")
      : parsed.success && parsed.data.message
        ? parsed.data.message
        : `PostNL rejected the request (${status}).`,
  );
}

async function postnlJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw postnlError(response.status, body);
  return body;
}

function makeTrackingUrl(barcode: string, postalCode: string, countryCode: string) {
  const url = new URL("https://www.postnl.nl/tracktrace/");
  url.searchParams.set("L", "EN");
  url.searchParams.set("B", barcode);
  url.searchParams.set("P", postalCode.replaceAll(" ", ""));
  url.searchParams.set("D", countryCode);
  url.searchParams.set("T", "C");
  return url.toString();
}

export async function createPostnlLabel(input: {
  orderNumber: string;
  customerEmail: string;
  shippingAddress: ShippingAddress;
  senderAddress: SenderAddress;
  weightGrams: number;
  productCode: string;
}) {
  const env = getPostnlEnv();
  const baseUrl =
    env.POSTNL_MODE === "production"
      ? "https://api.postnl.nl"
      : "https://api-sandbox.postnl.nl";
  const headers = {
    Accept: "application/json",
    apikey: env.POSTNL_API_KEY,
  };
  const barcodeUrl = new URL("/shipment/v1_1/barcode", baseUrl);
  barcodeUrl.searchParams.set("CustomerCode", env.POSTNL_CUSTOMER_CODE);
  barcodeUrl.searchParams.set("CustomerNumber", env.POSTNL_CUSTOMER_NUMBER);
  barcodeUrl.searchParams.set("Type", "3S");
  const barcodeBody = barcodeResponseSchema.parse(
    await postnlJson(barcodeUrl.toString(), { headers }),
  );

  const recipientStreet = splitStreetAndHouseNumber(
    input.shippingAddress.streetAndHouseNumber ?? "",
  );
  const senderStreet = splitStreetAndHouseNumber(
    input.senderAddress.streetAndHouseNumber,
  );
  const senderPlace = splitPostalCodeAndCity(input.senderAddress.postalCodeAndCity);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const recipientName =
    [input.shippingAddress.firstName, input.shippingAddress.lastName]
      .filter(Boolean)
      .join(" ") || "Customer";
  const payload = {
    Customer: {
      Address: {
        AddressType: "02",
        City: senderPlace.city,
        CompanyName: input.senderAddress.companyName,
        Countrycode: "NL",
        HouseNr: senderStreet.houseNumber,
        ...(senderStreet.houseNumberExtension
          ? { HouseNrExt: senderStreet.houseNumberExtension }
          : {}),
        Street: senderStreet.street,
        Zipcode: senderPlace.postalCode,
      },
      CollectionLocation: env.POSTNL_COLLECTION_LOCATION,
      ContactPerson: input.senderAddress.companyName,
      CustomerCode: env.POSTNL_CUSTOMER_CODE,
      CustomerNumber: env.POSTNL_CUSTOMER_NUMBER,
      Email: input.senderAddress.email,
      Name: input.senderAddress.companyName,
    },
    Message: {
      MessageID: crypto.randomUUID(),
      MessageTimeStamp: timestamp,
      Printertype: "GraphicFile|PDF",
    },
    Shipments: [
      {
        Addresses: [
          {
            AddressType: "01",
            City: input.shippingAddress.city,
            Countrycode: input.shippingAddress.countryCode,
            FirstName: input.shippingAddress.firstName,
            HouseNr: recipientStreet.houseNumber,
            ...(recipientStreet.houseNumberExtension
              ? { HouseNrExt: recipientStreet.houseNumberExtension }
              : {}),
            Name: input.shippingAddress.lastName || recipientName,
            Street: recipientStreet.street,
            Zipcode: input.shippingAddress.postalCode?.replaceAll(" ", "").toUpperCase(),
          },
        ],
        Barcode: barcodeBody.Barcode,
        Contacts: [
          {
            ContactType: "01",
            Email: input.customerEmail,
          },
        ],
        Dimension: { Weight: input.weightGrams },
        ProductCodeDelivery: input.productCode,
        Reference: input.orderNumber,
      },
    ],
  };
  const confirm = env.POSTNL_MODE === "production";
  const labelUrl = new URL("/shipment/v2_2/label", baseUrl);
  labelUrl.searchParams.set("confirm", String(confirm));
  const labelBody = labelResponseSchema.parse(
    await postnlJson(labelUrl.toString(), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  const shipment = labelBody.ResponseShipments[0]!;
  const label = shipment.Labels[0]!;
  const barcode = shipment.Barcode ?? barcodeBody.Barcode;

  return {
    barcode,
    trackingUrl: makeTrackingUrl(
      barcode,
      input.shippingAddress.postalCode ?? "",
      input.shippingAddress.countryCode,
    ),
    pdfBase64: label.Content,
    mode: env.POSTNL_MODE,
    confirmed: confirm,
  };
}
