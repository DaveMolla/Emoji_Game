require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const corsOptions = {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
};

app.use(cors(corsOptions));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Store game sessions with details

const gameSessions = {};
const waitingPlayers = [];

function generateEmojiSet() {
  const emojiSet = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍"];
  return emojiSet;
}

function shuffleAndDuplicateEmojis(emojiSet) {
  let emojis = [...emojiSet];
  const duplicatedEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  emojis = [...emojis, duplicatedEmoji, duplicatedEmoji];
  emojis.sort(() => Math.random() - 0.5);
  return emojis.slice(0, 16);
}

function initializeGame(sessionId) {
  const emojiSet = generateEmojiSet();
  gameSessions[sessionId] = {
    emojis: shuffleAndDuplicateEmojis(emojiSet),
    selectedEmojis: [],
    score: 0,
    timeLeft: 60,
    players: [],
  };
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('startGame', () => {
    const sessionId = 'session_' + Date.now();
    initializeGame(sessionId);
    socket.join(sessionId);
    gameSessions[sessionId].players.push(socket.id);
    io.to(sessionId).emit('gameStarted', gameSessions[sessionId]);
  });

  socket.on('selectEmoji', ({ sessionId, emojiIndex }) => {
    const gameSession = gameSessions[sessionId];
    if (gameSession.selectedEmojis.length < 2 && !gameSession.selectedEmojis.includes(emojiIndex)) {
      gameSession.selectedEmojis.push(emojiIndex);
      if (gameSession.selectedEmojis.length === 2) {
        const [firstIndex, secondIndex] = gameSession.selectedEmojis;
        if (gameSession.emojis[firstIndex] === gameSession.emojis[secondIndex]) {
          gameSession.score++;
          gameSession.emojis = shuffleAndDuplicateEmojis(generateEmojiSet());
          io.to(sessionId).emit('matchFound', gameSession);
        } else {
          setTimeout(() => {
            io.to(sessionId).emit('noMatch', gameSession.selectedEmojis);
            gameSession.selectedEmojis = [];
          }, 1000);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Handle player disconnection and clean up the game session if necessary
  });
});

const port = process.env.PORT || 3002;
server.listen(port, () => console.log(`Server running on port ${port}`));

