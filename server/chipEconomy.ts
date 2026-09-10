export const CHIPS_PER_GRAM = 100;
export const MAX_WALLET_DEPOSIT_GRAM = 100_000;
export const MAX_CHIP_AMOUNT = MAX_WALLET_DEPOSIT_GRAM * CHIPS_PER_GRAM;

export type ChipAmount = number;

function decimalInput(value: unknown): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  return typeof value === 'string' ? value.trim() : null;
}

/** Parse a public chip amount. Chips are indivisible throughout the product. */
export function parseChips(value: unknown, options: { allowZero?: boolean; max?: number } = {}): ChipAmount | null {
  const raw = decimalInput(value);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const amount = Number(raw);
  const maximum = options.max ?? MAX_CHIP_AMOUNT;
  if (!Number.isSafeInteger(amount) || amount > maximum) return null;
  return options.allowZero ? (amount >= 0 ? amount : null) : (amount > 0 ? amount : null);
}

/**
 * Parse the legacy decimal GRAM/TKT boundary without using floating-point
 * multiplication. Internally the result is always an integer chip amount.
 */
export function parseGramAsChips(value: unknown, options: { allowZero?: boolean; maxGram?: number } = {}): ChipAmount | null {
  const raw = decimalInput(value);
  if (raw === null || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const [wholeRaw, fractionRaw = ''] = raw.split('.');
  const whole = Number(wholeRaw);
  const fraction = Number((fractionRaw + '00').slice(0, 2));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) return null;
  const chips = whole * CHIPS_PER_GRAM + fraction;
  const maximum = (options.maxGram ?? MAX_WALLET_DEPOSIT_GRAM) * CHIPS_PER_GRAM;
  if (!Number.isSafeInteger(chips) || chips > maximum) return null;
  return options.allowZero ? (chips >= 0 ? chips : null) : (chips > 0 ? chips : null);
}

export function chipsToGram(chips: unknown): number {
  const parsed = parseChips(chips, { allowZero: true });
  if (parsed === null) throw new Error('Invalid integer chip amount.');
  return parsed / CHIPS_PER_GRAM;
}

export function assertChipBalance(value: unknown, label = 'chip balance'): asserts value is ChipAmount {
  if (parseChips(value, { allowZero: true }) === null) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export function checkedAddChips(balance: unknown, delta: unknown): ChipAmount {
  assertChipBalance(balance);
  if (!Number.isSafeInteger(delta)) throw new Error('Chip delta must be a safe integer.');
  const next = balance + (delta as number);
  if (!Number.isSafeInteger(next) || next < 0 || next > MAX_CHIP_AMOUNT) {
    throw new Error('Chip balance would leave the supported range.');
  }
  return next;
}

export function sumChips(values: readonly unknown[]): ChipAmount {
  return values.reduce<number>((total, value) => checkedAddChips(total, value), 0);
}
