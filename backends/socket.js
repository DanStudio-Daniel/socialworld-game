const socketIo = require('socket.io');

// Active local application memory storage state
const players = {};

function initSocket(server) {
    const io = socketIo(server);

    io.on('connection', (socket) => {
        console.log(`Connection hand-shake verified: ${socket.id}`);

        socket.on('joinGame', (data) => {
            const { username, color, age, gender } = data;
            
            // Check for profile duplicates inside the active partition
            const isDuplicate = Object.values(players).some(
                p => p.username.toLowerCase() === username.toLowerCase()
            );
            
            if (isDuplicate) {
                socket.emit('joinError', 'That username is already connected to this server layer.');
                return;
            }

            // Assign profile record metadata directly to the live state pool
            players[socket.id] = {
                id: socket.id,
                username: username,
                color: color || '#00fff2',
                age: age || 'Unknown',
                gender: gender || 'Unspecified',
                x: Math.random() * 1600 + 200,
                y: Math.random() * 1600 + 200,
                isMoving: false,
                bubbleText: '',
                isWaving: false,
                waveTime: 0
            };
            
            socket.emit('currentPlayers', players);
            socket.broadcast.emit('newPlayer', players[socket.id]);
        });

        socket.on('playerMovement', (movementData) => {
            if (players[socket.id]) {
                players[socket.id].x = movementData.x;
                players[socket.id].y = movementData.y;
                players[socket.id].isMoving = movementData.isMoving;
                if (movementData.isMoving) {
                    players[socket.id].isWaving = false;
                }
                socket.broadcast.emit('playerMoved', players[socket.id]);
            }
        });

        socket.on('triggerEmote', (emoteType) => {
            if (players[socket.id] && emoteType === 'wave') {
                players[socket.id].isWaving = true;
                players[socket.id].waveTime = Date.now();
                players[socket.id].isMoving = false;
                io.emit('playerEmote', { id: socket.id, emote: 'wave' });
            }
        });

        socket.on('chatMessage', (msg) => {
            if (!players[socket.id]) return;
            io.emit('incomingMessage', { 
                id: socket.id, 
                text: msg.substring(0, 60), 
                username: players[socket.id].username
            });
        });

        socket.on('disconnect', () => {
            if (players[socket.id]) {
                console.log(`Removing account on leave: ${players[socket.id].username}`);
                // Instant physical deletion from active memory pipeline
                delete players[socket.id];
                io.emit('playerDisconnected', socket.id);
            }
        });
    });
}

module.exports = { initSocket };
