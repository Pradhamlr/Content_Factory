export function logEvent(event, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...payload
  };

  console.log(JSON.stringify(entry));
}
