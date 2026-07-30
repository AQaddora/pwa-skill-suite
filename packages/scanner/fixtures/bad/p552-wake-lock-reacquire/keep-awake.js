export async function keepScreenAwake() {
  const lock = await navigator.wakeLock.request('screen');
  return lock;
}
