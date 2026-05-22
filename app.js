const express = require('express');
const http = require('http');
const path = require('path');
const { initSocket } = require('./backends/socket');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontends')));

// Pass application runtime over to websocket pipeline
initSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server infrastructure processing on port ${PORT}`);
});
