import type { gameMessages } from './gameMessages';

export type MessageKey = keyof typeof gameMessages;
export type MessageValues = Record<string, string | number>;
export type UiMessage = string | { id: MessageKey; values?: MessageValues };

export function message(id: MessageKey, values?: MessageValues): UiMessage {
  return { id, values };
}

/** Raw external errors remain intact; only explicit app messages are translated. */
export function renderUiMessage(value: UiMessage, translate: (id: MessageKey, values?: MessageValues) => string): string {
  return typeof value === 'string' ? value : translate(value.id, value.values);
}
