const socket = new WebSocket('ws://api.example.com/live');

socket.onmessage = (event) => {
  handleMessage(event.data);
};
