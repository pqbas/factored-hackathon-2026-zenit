// Prints the scrypt hash of a password for DEMO_USERS_JSON (passwordHash), in
// the "<salt>:<hash>" form server/src/demo-auth.ts verifies. The password is
// read from stdin so it stays out of the shell history:
//   printf '%s' "$PASSWORD" | node scripts/aws/hash-password.mjs
import { randomBytes, scryptSync } from 'node:crypto';

let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');
if (!password) {
  console.error('Empty password: pipe it on stdin.');
  process.exit(1);
}
const salt = randomBytes(16);
console.log(
  `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`,
);
