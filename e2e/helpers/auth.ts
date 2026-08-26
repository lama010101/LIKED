/**
 * Test credentials — configurable via env vars so tests can run against
 * any environment (local, Vercel preview, Vercel production) with any user.
 *
 * Usage:
 *   BASE_URL=https://liked-zeta.vercel.app \
 *   TEST_EMAIL=e2e-test@liked.app \
 *   TEST_PASSWORD=E2eTestPass123! \
 *   npx playwright test
 *
 * Or for local:
 *   npx playwright test  # defaults to localhost:3001
 */

export const TEST_EMAIL = process.env.TEST_EMAIL ?? "e2e-test@liked.app";
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "E2eTestPass123!";
export const STORAGE_STATE = "e2e/.auth/storageState.json";

/**
 * Known users in the DB (for reference — passwords are not stored here):
 *   e2e-test@liked.app     — E2E test user (password: E2eTestPass123!)
 *   test@liked.app         — test user
 *   deploy@liked.local     — deploy user
 *   laurent.martenot@gmail.com — Google OAuth user
 *   a@a.com                — test user
 *
 * To test with a different user, set TEST_EMAIL + TEST_PASSWORD env vars.
 */
