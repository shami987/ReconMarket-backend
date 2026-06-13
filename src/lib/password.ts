import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = async (
  password: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(password, hash);

export const hashToken = async (token: string): Promise<string> =>
  bcrypt.hash(token, SALT_ROUNDS);

export const compareToken = async (
  token: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(token, hash);
