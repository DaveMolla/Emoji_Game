require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const GameSession = require('./models/GameSession');
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
  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  emojis.push(randomEmoji);

  emojis.sort(() => Math.random() - 0.5);
  return emojis.slice(0, 16);
}

// function initializeGame(sessionId) {
//   const emojiSet = generateEmojiSet();
//   gameSessions[sessionId] = {
//     emojis: shuffleAndDuplicateEmojis(emojiSet),
//     selectedEmojis: [],
//     score: 0,
//     timeLeft: 60,
//     players: [],
//   };
// }

// function initializeGame(sessionId) {
//   const emojiSet = generateEmojiSet();
//   gameSessions[sessionId] = {
//     emojis: shuffleAndDuplicateEmojis(emojiSet),
//     selectedEmojis: [],
//     scores: { playerOne: 0, playerTwo: 0 },
//     timeLeft: 60,
//     players: [],
//     timer: null
//   };
// }

function initializeGame(sessionId, playerOneId, playerTwoId) {

  if (!sessionId) {
    sessionId = 'session_' + new Date().getTime(); // Or another unique identifier
  }
  const emojiSet = generateEmojiSet();
  const shuffledEmojis = shuffleAndDuplicateEmojis(emojiSet);
  gameSessions[sessionId] = {
    emojis: shuffledEmojis,
    selectedEmojis: [],
    scores: { [playerOneId]: 0, [playerTwoId]: 0 },
    timeLeft: 60,
    players: [playerOneId, playerTwoId],
    timer: null
  };

  const scoresObject = {
    [playerOneId]: 0,
    [playerTwoId]: 0
  };

  gameSessions[sessionId] = {
    emojis: shuffledEmojis,
    selectedEmojis: [],
    scores: scoresObject, // Using plain object instead of Map
    timeLeft: 60,
    players: [playerOneId, playerTwoId],
    timer: null
  };

  const newGameSession = new GameSession({
    sessionId,
    players: [playerOneId, playerTwoId],
    scores: scoresObject, // Make sure this is a plain object
    startTime: new Date(),
    emojis: shuffledEmojis,
  });

  console.log('Attempting to save a new game session', newGameSession);

  newGameSession.save()
    .then(() => console.log('Game session saved successfully'))
    .catch(err => {
      console.error('Error saving game session:', err);
      console.error(err.message);
    });
}




function determineWinner(scores) {
  let winnerId = null;
  let highestScore = 0;

  for (const [playerId, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      winnerId = playerId;
    }
  }

  return winnerId; // Returns the ID of the player with the highest score
}

// function determineWinner(scores) {
//   // If scores is a Map, convert it to an object
//   const scoresObject = Object.fromEntries(scores);
//   let winnerId = null;
//   let highestScore = 0;

//   for (const [playerId, score] of Object.entries(scoresObject)) {
//     if (score > highestScore) {
//       highestScore = score;
//       winnerId = playerId;
//     }
//   }

//   return winnerId; // Returns the ID of the player with the highest score
// }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('startGame', async () => {
    waitingPlayers.push(socket.id);
    console.log('Current waiting players:', waitingPlayers);

    if (waitingPlayers.length >= 2) {
      const playerOneId = waitingPlayers.shift();
      const playerTwoId = waitingPlayers.shift();
      const sessionId = 'session_' + Date.now();

      initializeGame(sessionId, playerOneId, playerTwoId);

      io.to(playerOneId).socketsJoin(sessionId);
      io.to(playerTwoId).socketsJoin(sessionId);

      gameSessions[sessionId].players.push(playerOneId, playerTwoId);

      io.to(sessionId).emit('gameStarted', gameSessions[sessionId]);

      startCountdown(sessionId);
    } else {
      io.to(socket.id).emit('waitingForPlayer');
    }
  });

  socket.on('selectEmoji', async ({ sessionId, emojiIndex, playerId }) => {
    // Make sure the playerId is also sent from the client
    if (sessionId && gameSessions[sessionId]) {
      const gameSession = gameSessions[sessionId];

      if (isMatch) {
        // Update the in-memory scores
        gameSession.scores[playerId] = (gameSession.scores[playerId] || 0) + 1;

        // Update the score in the database
        const update = { $inc: {} };
        update.$inc[`scores.${playerId}`] = 1;

        try {
          const updatedSession = await GameSession.findOneAndUpdate(
            { sessionId },
            update,
            { new: true }
          );
          if (updatedSession) {
            console.log(`Updated score for player ${playerId} in session ${sessionId}`);
            // Emit an event with the updated scores
            io.to(sessionId).emit('scoresUpdated', { scores: updatedSession.scores });
          } else {
            console.log(`No session found with ID ${sessionId} to update.`);
          }
        } catch (error) {
          console.error(`Error updating score for session ID ${sessionId}:`, error);
        }
      } else {
        // ... code for no match ...
      }

      if (gameSession.selectedEmojis.length < 2 && !gameSession.selectedEmojis.includes(emojiIndex)) {
        gameSession.selectedEmojis.push(emojiIndex);
        if (gameSession.selectedEmojis.length === 2) {
          const [firstIndex, secondIndex] = gameSession.selectedEmojis;
          if (gameSession.emojis[firstIndex] === gameSession.emojis[secondIndex]) {
            // If it's a match, increment the score
            const currentScore = gameSession.scores.get(playerId) || 0;
            gameSession.scores.set(playerId, currentScore + 1);

            // Emit the matchFound event to the clients
            io.to(sessionId).emit('matchFound', { ...gameSession, playerId });

            try {
              // Update the score in the database
              const updatedSession = await GameSession.findOneAndUpdate(
                { sessionId },
                { $inc: { [`scores.${playerId}`]: 1 } },
                { new: true }
              );

              if (updatedSession) {
                console.log(`Updated score for player ${playerId} in session ${sessionId}`);
              } else {
                console.log(`No session found with ID ${sessionId} to update.`);
              }
            } catch (error) {
              console.error(`Error updating score for session ID ${sessionId}:`, error);
            }
          } else {
            // If it's not a match, emit the noMatch event to the clients
            io.to(sessionId).emit('noMatch', { selectedEmojis: gameSession.selectedEmojis });
            gameSession.selectedEmojis = [];
          }
        }
      }
    }
  });


  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// function startCountdown(sessionId) {
//   const gameSession = gameSessions[sessionId];
//   if (gameSession) {
//     gameSession.timer = setInterval(() => {
//       if (gameSession.timeLeft > 0) {
//         gameSession.timeLeft--;
//         io.to(sessionId).emit('timeUpdate', { timeLeft: gameSession.timeLeft });
//       } else {
//         clearInterval(gameSession.timer);
//         endGame(sessionId);
//       }
//     }, 1000);
//   }
// }

// function endGame(sessionId) {
//   const gameSession = gameSessions[sessionId];
//   if (gameSession) {
//     const winnerId = determineWinner(gameSession.scores);
//     io.to(sessionId).emit('endGame', { winnerId });
//     // Update the game session with the winner and end time in the database
//     GameSession.findOneAndUpdate(
//       { sessionId },
//       { winner: winnerId, endTime: new Date() },
//       { new: true }
//     ).then(updatedSession => {
//       io.to(sessionId).emit('gameOver', { session: updatedSession });
//     });
//   }
// }

function startCountdown(sessionId) {
  const gameSession = gameSessions[sessionId];
  if (gameSession) {
    gameSession.timer = setInterval(() => {
      if (gameSession.timeLeft > 0) {
        gameSession.timeLeft--;
        io.to(sessionId).emit('timeUpdate', { timeLeft: gameSession.timeLeft });
      } else {
        clearInterval(gameSession.timer);
        endGame(sessionId);
      }
    }, 1000);
  }
}
// function endGame(sessionId) {
//   const gameSession = gameSessions[sessionId];
//   if (!gameSession) {
//     console.error(`Game session with ID ${sessionId} not found.`);
//     return;
//   }

//   const winnerId = determineWinner(gameSession.scores);
//   if (!winnerId) {
//     console.error(`Winner not found for session ID ${sessionId}.`);
//     return;
//   }

//   // Emit the endGame event immediately with the winnerId
//   io.to(sessionId).emit('endGame', { winnerId, scores: gameSession.scores });

//   // Update the game session in the database
//   GameSession.findOneAndUpdate(
//     { sessionId },
//     { winner: winnerId, endTime: new Date() },
//     { new: true }
//   )
//     .then(updatedSession => {
//       if (!updatedSession) {
//         console.error(`No session updated for ID ${sessionId}.`);
//         return;
//       }
//       console.log(`Session ${sessionId} updated with winner ${winnerId}`);
//       // Emit an additional event if you need to send the updated session back to clients
//       io.to(sessionId).emit('gameOver', { session: updatedSession });
//     })
//     .catch(error => {
//       console.error(`Error updating game session with ID ${sessionId}:`, error);
//     });
// }

function endGame(sessionId) {
  const gameSession = gameSessions[sessionId];
  if (gameSession) {
    const winnerId = determineWinner(gameSession.scores);
    io.to(sessionId).emit('endGame', { winnerId });
    // Update the game session with the winner and end time in the database
    GameSession.findOneAndUpdate(
      { sessionId },
      { winner: winnerId, endTime: new Date() },
      { new: true }
    ).then(updatedSession => {
      io.to(sessionId).emit('gameOver', { session: updatedSession });
    });
  }
}




app.post('/register', async (req, res) => {
  const { phone_number, password } = req.body;
  if (!phone_number || !password) {
    return res.status(400).send('Both phone number and password are required.');
  }
  const existingUser = await User.findOne({ phone_number });
  if (existingUser) {
    return res.status(400).send('User already exists.');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ phone_number, password: hashedPassword });
  await user.save();
  res.status(201).json('User registered successfully.');
});

// Login route
app.post('/login', async (req, res) => {
  const { phone_number, password } = req.body;
  const user = await User.findOne({ phone_number });
  if (!user) {
    return res.status(401).json({ message: 'User not found.' });
  }
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ message: 'Incorrect password.' });
  }
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.status(200).json({
    message: 'Login successful.',
    token: token,
    user: { phone_number: user.phone_number }
  });
});

// // Registration route
// app.post('/register', async (req, res) => {
//   const { phone_number, password } = req.body;
//   // console.log('so far so good');
//   if (!phone_number || !password) {
//     return res.status(400).send('Both phone number and password are required.');
//   }
//   const existingUser = await User.findOne({ phone_number });
//   if (existingUser) {
//     return res.status(400).send('User already exists.');
//   }
//   const hashedPassword = await bcrypt.hash(password, 10);
//   const user = new User({ phone_number, password: hashedPassword });
//   await user.save();
//   res.status(201).json('User registered successfully.');
// });

// // Login route
// app.post('/login', async (req, res) => {
//   const { phone_number, password } = req.body;
//   const user = await User.findOne({ phone_number });
//   if (!user) {
//     return res.status(401).json({ message: 'User not found.' });
//   }
//   const validPassword = await bcrypt.compare(password, user.password);
//   if (!validPassword) {
//     return res.status(401).json({ message: 'Incorrect password.' });
//   }
//   const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
//   res.status(200).json({ message: 'Login successful.', token: token });
// });

const port = process.env.PORT || 3002;
server.listen(port, () => console.log(`Server running on port ${port}`));
