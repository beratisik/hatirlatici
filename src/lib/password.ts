/** En az 6 karakter ve en az 1 büyük harf. */
export const PASSWORD_PATTERN = /^(?=.*[A-Z]).{6,}$/;

export const PASSWORD_RULE_TEXT = 'En az 6 karakter ve 1 büyük harf zorunlu.';

export function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}

export function foldIdentity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export const EMAIL_RULE_TEXT = 'E-posta formatında değil. örn: ad@site.com';
export const USERNAME_RULE_TEXT = 'Kullanıcı adı 3–20 karakter; harf, rakam, nokta veya alt çizgi.';

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isValidUsername(value: string): boolean {
  return /^[a-zA-Z0-9._]{3,20}$/.test(value.trim());
}

export function identifierMatches(
  identifier: string,
  name: string,
  email: string,
  username = '',
  surname = '',
): boolean {
  const folded = foldIdentity(identifier);
  if (!folded) return false;
  const fullName = foldIdentity(`${name} ${surname}`.trim());
  return (
    folded === foldIdentity(name) ||
    folded === foldIdentity(email) ||
    (!!username && folded === foldIdentity(username)) ||
    (!!fullName && folded === fullName)
  );
}

export function secretsMatch(entered: string, stored: string): boolean {
  return entered === stored || entered.trim() === stored;
}

export function emailTaken(accounts: { email: string }[], email: string): boolean {
  const folded = foldIdentity(email);
  return accounts.some((item) => foldIdentity(item.email) === folded);
}

export function usernameTaken(accounts: { username: string }[], username: string): boolean {
  const folded = foldIdentity(username);
  return accounts.some((item) => foldIdentity(item.username) === folded);
}

export type RegisterConflict = 'email' | 'username';
