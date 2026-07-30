async function loginWithGoogle() {
  await prepareAuthRequest();
  window.location.assign('/auth/redirect');
}

function openHelpPopup() {
  window.open('https://example.com/help', 'help');
}
