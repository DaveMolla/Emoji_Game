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


const gameSessions = {};
const waitingPlayers = [];

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('startGame', () => {
        waitingPlayers.push(socket.id);
        console.log('Current waiting players:', waitingPlayers);

        if (waitingPlayers.length >= 2) {
            const playerOneId = waitingPlayers.shift();
            const playerTwoId = waitingPlayers.shift();
            const sessionId = createGameSession();
            gameSessions[sessionId] = initializeGame();

            io.sockets.sockets.get(playerOneId)?.join(sessionId);
            io.sockets.sockets.get(playerTwoId)?.join(sessionId);

            io.to(sessionId).emit('gameUpdate', gameSessions[sessionId]);

            // let countdown = 3;
            // const countdownInterval = setInterval(() => {
            //     io.to(sessionId).emit('countdown', countdown);
            //     countdown -= 1;

            //     if (countdown < 0) {
            //         clearInterval(countdownInterval);
            //         // After countdown, start the game
            //         io.to(sessionId).emit('startGame', gameSessions[sessionId]);
            //     }
            // }, 1000);
        } else {
            socket.emit('waitingForPlayer');
        }
    });

    socket.on('emojiMatch', ({ indices, sessionId }) => {
        const gameState = gameSessions[sessionId];

        if (gameState) {
            const [firstIndex, secondIndex] = indices;

            gameState.score += 1;

            gameState.matchedPairs.add(firstIndex);
            gameState.matchedPairs.add(secondIndex);

            gameSessions[sessionId] = initializeGame();

            io.to(sessionId).emit('gameUpdate', gameState);
        }

    });

    socket.on('emojiNoMatch', ({ indices, sessionId }) => {
        const gameState = gameSessions[sessionId];
        if (gameState) {
            io.to(sessionId).emit('clearSelectedEmojis');
        }
    });
    socket.on('emojiClick', ({ sessionId, emojiIndex }) => {
        console.log(`Emoji clicked with index ${emojiIndex} in session ${sessionId}`);
        updateGame(sessionId, emojiIndex, socket);
    });
});


function createGameSession() {
    const sessionId = 'session_' + Date.now();
    return sessionId;
}

function updateGame(sessionId, emojiIndex) {
    const gameState = gameSessions[sessionId];
    if (!gameState.selectedEmojis.includes(emojiIndex) && !gameState.matchedPairs.has(emojiIndex)) {
        gameState.selectedEmojis.push(emojiIndex);

        if (gameState.selectedEmojis.length === 2) {
            const [firstIndex, secondIndex] = gameState.selectedEmojis;
            if (gameState.emojis[firstIndex] === gameState.emojis[secondIndex]) {
                gameState.score += 1;
                gameState.matchedPairs.add(firstIndex);
                gameState.matchedPairs.add(secondIndex);
                gameState.emojis = shuffleAndDuplicateOneEmoji(emojiSet);
                io.to(sessionId).emit('gameUpdate', gameState);
            } else {
                setTimeout(() => {
                    io.to(sessionId).emit('clearSelectedEmojis');
                }, 1000);
            }
            gameState.selectedEmojis = [];
        }
    }
}

function initializeGame() {
    const emojiSet = ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍"];
    let shuffledEmojis = shuffleAndDuplicateEmojis(emojiSet);
    return {
        emojis: shuffledEmojis,
        selectedEmojis: [],
        score: 0,
        timeLeft: 60,
        sessionId: null,
    };
}

function shuffleAndDuplicateEmojis(emojiSet) {
    let emojis = [...emojiSet];
    emojis.sort(() => Math.random() - 0.5);

    const duplicatedIndex = Math.floor(Math.random() * emojis.length);
    const duplicatedEmoji = emojis[duplicatedIndex];
    emojis.push(duplicatedEmoji);

    emojis.sort(() => Math.random() - 0.5);

    return emojis.slice(0, 16);
}


// Registration route
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
    res.status(200).json({ message: 'Login successful.', token: token });
});

// Middleware for authentication
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).send('No token provided');
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).send('Unauthorized: ' + error.message);
    }
};

// Start Game route (you might need to modify this based on your game logic)
app.post('/start-game', authMiddleware, async (req, res) => {
    const userId = req.userId;
    const newGameSession = new GameSession({
        players: [userId],
        startTime: new Date(),
        status: true
    });
    await newGameSession.save();
    res.status(201).json({ message: 'Game started', gameSessionId: newGameSession._id });
});
const port = process.env.PORT || 3002;
server.listen(port, () => console.log(`Server running on port ${port}`));
