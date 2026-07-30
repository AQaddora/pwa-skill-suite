export function alertUser(title, body) {
  new Notification(title, { body });
}
