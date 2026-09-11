/** Runs once when the server starts: fail fast on a missing or invalid secret (M0-05). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./env/server');
  }
}
