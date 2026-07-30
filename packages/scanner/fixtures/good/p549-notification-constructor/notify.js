export async function alertUser(title, body) {
  const registration = await navigator.serviceWorker.ready;
  registration.showNotification(title, { body });
}
