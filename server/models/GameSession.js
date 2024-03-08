const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
    players: [String],
    score: String,
    // winner: 
    startTime: Date,
    endTime: Date,
    status: {
        type: Boolean,
        default: false
    },
});

module.exports = mongoose.model('GameSession', gameSessionSchema);
