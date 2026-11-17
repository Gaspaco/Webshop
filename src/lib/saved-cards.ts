export type SavedCard = { id: string; label: string; last4: string; expires: string | null };
export type SavedCardsResponse = { available: boolean; cards: SavedCard[]; error?: string };
export const CARD_CONSENT_VERSION = "hosted-one-click-2026-11-17";
