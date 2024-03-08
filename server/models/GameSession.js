const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
  sessionId: String,
  players: [String], // You can store phone numbers or user IDs here
  scores: Map, // A map of phone numbers/user IDs to scores
  winner: String, // Store the winner's phone number or user ID
  startTime: Date,
  endTime: Date,
});

module.exports = mongoose.model('GameSession', gameSessionSchema);
