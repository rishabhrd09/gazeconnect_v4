/**
 * Add to Message (10 Oct 2026, maintainer request).
 *
 * From the keyboard or Zone Board, Quick Words opens a screen of four cards: Quick Phrases,
 * Phrases, People and Daily Assistance. What is chosen behind them is added to the message
 * being typed instead of being spoken, and the person is taken back to the typing screen
 * to go on or press Speak. Urgent care requests are the exception: they are still spoken
 * at once, never left waiting in a message. Reached from Home, the same screens speak as before.
 */

export type TypingScreen = 'keyboard' | 'spatial';

export const ADD_TO_MESSAGE_SCREEN = 'add-to-message';

/** The screens of the flow: the four cards and the screens they open. */
export const ADD_TO_MESSAGE_FLOW: ReadonlySet<string> = new Set([
  ADD_TO_MESSAGE_SCREEN, 'quickwords', 'phrases', 'people', 'medical',
]);

/** What the flow gives the screens it opens. */
export interface AddToMessage {
  /** The message typed so far, shown while choosing. */
  text: string;
  /** Adds the chosen words to the message and returns to the typing screen. */
  add: (words: string) => void;
  /** Back to the four cards. */
  back: () => void;
}

const isTypingScreen = (screen: string): screen is TypingScreen => screen === 'keyboard' || screen === 'spatial';

/**
 * The typing screen the flow returns to after a move from `from` to `to`, `current` being the
 * one it had: set when the flow is entered from a typing screen, kept while the person moves
 * within it, and ended by any other screen (the typing screen itself, Home, ...).
 */
export function messageReturnAfter(from: string, to: string, current: TypingScreen | null): TypingScreen | null {
  if (!ADD_TO_MESSAGE_FLOW.has(to)) return null;
  return isTypingScreen(from) ? from : current;
}

/** The message with `words` added: one space between, and one after for the next word. */
export function appendToMessage(message: string, words: string): string {
  const addition = words.replace(/\s+/g, ' ').trim();
  if (!addition) return message;
  return message === '' || /\s$/.test(message) ? `${message}${addition} ` : `${message} ${addition} `;
}

/** The end of the message, short enough for one line: what is being added to. */
export function messageTail(message: string, maxChars = 48): string {
  const text = message.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const tail = text.slice(text.length - maxChars + 1);
  const wordStart = tail.indexOf(' ');
  return '…' + (wordStart > 0 && wordStart < 12 ? tail.slice(wordStart + 1) : tail);
}
