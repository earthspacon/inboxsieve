const TOKEN_BYTES = 16;
const ADDRESS_SUFFIX_BYTES = 5;
const SLUG_MAX_LENGTH = 24;

export function newId() {
  return crypto.randomUUID();
}

export function newWebhookToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function newForwardingAddress({ brandName, domain }: { brandName: string; domain: string }) {
  const slug =
    brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, SLUG_MAX_LENGTH) || "brand";
  const suffix = toHex(crypto.getRandomValues(new Uint8Array(ADDRESS_SUFFIX_BYTES)));

  return `${slug}-${suffix}@${domain}`;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
