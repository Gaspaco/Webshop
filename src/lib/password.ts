export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Use at least 8 characters and one special character.";

const SPECIAL_CHARACTER_PATTERN = /[^\p{L}\p{N}\s]/u;

export const meetsPasswordRequirements = (password: string) =>
  password.length >= PASSWORD_MIN_LENGTH &&
  password.length <= PASSWORD_MAX_LENGTH &&
  SPECIAL_CHARACTER_PATTERN.test(password);
