// Atomic fixed-window counter: INCR, set the TTL only on the first hit of the
// window, and read the remaining TTL — in one Lua script so a counter can never
// be left without an expiry (no permanent lockout), even under concurrency.
// Kept free of `server-only` so the opt-in live-verification script can import
// the exact script the app runs.
export const FIXED_WINDOW_LUA =
  "local c = redis.call('INCR', KEYS[1]); " +
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; " +
  "local t = redis.call('PTTL', KEYS[1]); " +
  "return {c, t}";
