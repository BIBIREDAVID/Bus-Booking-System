// Tests mint JWTs directly (signAccessToken) rather than going through
// /auth/login, so the password itself is never exercised — this fixed
// hash just satisfies the column's NOT NULL constraint.
const PLACEHOLDER_PASSWORD_HASH = '$2b$10$PG5tk00BwW4lXTeFYoEUt.uhOamL70PNrBjnhgA2Iblzb7PTYWlwW'

let counter = 0

/** A unique email/passwordHash pair to merge into a prisma.user.create() call in tests. */
export function testUserCreds() {
  counter += 1
  return {
    email: `test-user-${Date.now()}-${counter}@test.local`,
    passwordHash: PLACEHOLDER_PASSWORD_HASH,
  }
}
