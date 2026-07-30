// TODO: re-acquire the lock on visibilitychange
export async function keepScreenAwake() {
  return navigator.wakeLock.request('screen');
}
