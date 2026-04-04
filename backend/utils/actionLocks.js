import { conflict } from "./errors.js";

const activeLocks = new Set();

export function isLocked(key) {
  return activeLocks.has(key);
}

export async function withActionLock(key, runner) {
  if (activeLocks.has(key)) {
    throw conflict("This action is already running. Please wait for it to finish.", { lockKey: key });
  }

  activeLocks.add(key);

  try {
    return await runner();
  } finally {
    activeLocks.delete(key);
  }
}

export function assertUnlocked(keys = []) {
  const blocked = keys.find((key) => activeLocks.has(key));

  if (blocked) {
    throw conflict("Another campaign action is still running. Please wait for it to finish.", { lockKey: blocked });
  }
}
