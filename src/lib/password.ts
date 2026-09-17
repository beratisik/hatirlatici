/** En az 6 karakter ve en az 1 büyük harf. */
export const PASSWORD_PATTERN = /^(?=.*[A-Z]).{6,}$/;

export const PASSWORD_RULE_TEXT = 'En az 6 karakter ve 1 büyük harf zorunlu.';

export function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}
