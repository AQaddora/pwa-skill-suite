async function loginWithGoogle() {
  await prepareAuthRequest();
  const popup = window.open('https://accounts.google.com/o/oauth2/auth', 'oauth', 'width=500,height=600');
  return popup;
}
