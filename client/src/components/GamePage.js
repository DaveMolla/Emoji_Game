import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const GamePage = () => {
  // const [userPhoneNumber, setUserPhoneNumber] = useState(''); 
  const [emojis, setEmojis] = useState([]);
  const [selectedEmojis, setSelectedEmojis] = useState([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [started, setStarted] = useState(false);
  const [waitingForPlayer, setWaitingForPlayer] = useState(false);
  const [socket, setSocket] = useState(null);
  const [showStartButton, setShowStartButton] = useState(true)
  const [countdown, setCountdown] = useState(null);
  const [sessionId, setSessionId] = useState(null);


  useEffect(() => {
    const newSocket = io('http://localhost:3002');
    setSocket(newSocket);

    newSocket.on('matchFound', ({ score, emojis }) => {
      setScore(score);
      setEmojis(emojis);
    });

    newSocket.on('noMatch', () => {
    });

    newSocket.on('gameUpdate', (gameState) => {
      console.log('Received game state:', gameState);
      setStarted(true);
      setEmojis(gameState.emojis);
      setTimeLeft(gameState.timeLeft);
      setScore(gameState.score);
      setShowStartButton(false);
      setWaitingForPlayer(false);
      setSelectedEmojis([]);
      setSessionId(gameState.sessionId);
    });

    newSocket.on('clearSelectedEmojis', () => {
      setSelectedEmojis([]);
    });

    newSocket.on('waitingForPlayer', () => {
      setWaitingForPlayer(true);
      setShowStartButton(false);
    });

    newSocket.on('countdown', (count) => {
      setCountdown(count);
      if (count === 0) {
      }
    });
    newSocket.on('gameStateUpdated', (gameState) => {
      setScore(gameState.score);
      setEmojis(gameState.emojis);
      setSelectedEmojis([]);
    });

    newSocket.on('endGame', () => {
      endGame();
    });

    return () => newSocket.disconnect();
  }, []);

  // useEffect(() => {
  //   if (timeLeft === 0) {
  //     endGame();
  //   }
  // }, [timeLeft]);

  const startGame = () => {
    if (socket) {
      socket.emit('startGame');
      setShowStartButton(false);
      setWaitingForPlayer(true);
    }
  };

  const handleEmojiClick = (index) => {
    if (!started || selectedEmojis.includes(index)) {
      return;
    }
  
    const newSelectedEmojis = selectedEmojis.length < 2 ? [...selectedEmojis, index] : [index];
    setSelectedEmojis(newSelectedEmojis);
  
    if (newSelectedEmojis.length === 2) {
      const [firstEmojiIndex, secondEmojiIndex] = newSelectedEmojis;
      if (emojis[firstEmojiIndex] === emojis[secondEmojiIndex]) {
        setScore((prevScore) => prevScore + 1);
        socket.emit('emojiMatch', {
          indices: [firstEmojiIndex, secondEmojiIndex],
          sessionId
        });
      } else {
        socket.emit('emojiNoMatch', {
          indices: [firstEmojiIndex, secondEmojiIndex],
          sessionId
        });
      }
      setTimeout(() => {
        setSelectedEmojis([]);
      }, 1000);
    }
  };

  const endGame = () => {
    setStarted(false);
    setScore(0);
    setTimeLeft(60);
    setEmojis([]);
    setWaitingForPlayer(false);
    setShowStartButton(true);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Emoji Matching Game</h1>
        <div>Score: {score}</div>
        {/* <div>userPhoneNumber: {setUserPhoneNumber}</div> */}
        <div>Time Left: {timeLeft}</div>
        {waitingForPlayer && <p>Waiting for another player...</p>}
        {countdown !== null && <p>Starting in: {countdown}</p>}
        {showStartButton && !waitingForPlayer && (
          <button onClick={startGame}>Start Game</button>
        )}
        <div className="emoji-grid">
          {emojis.length > 0 && emojis.map((emoji, index) => (
            <button
              key={index}
              className={`emoji ${selectedEmojis.includes(index) ? 'selected' : ''}`}
              onClick={() => handleEmojiClick(index)}
              disabled={!started}
            >
              {emoji}
            </button>
          ))}
        </div>
      </header>
    </div>
  );
};

export default GamePage;
