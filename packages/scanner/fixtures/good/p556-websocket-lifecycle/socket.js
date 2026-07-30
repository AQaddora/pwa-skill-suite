function connect() {
  const socket = new WebSocket('wss://api.example.com/live');

  socket.onclose = () => {
    setTimeout(connect, backoffDelay());
  };

  socket.onmessage = (event) => {
    handleMessage(event.data);
  };

  return socket;
}
