import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Mock in-memory pool for matchmaking queue
interface QueuePlayer {
  userId: string;
  username: string;
  avatarId: string;
  stake: number;
  joinedAt: number;
}

let matchmakingQueue: QueuePlayer[] = [];

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', time: new Date().toISOString() });
});

// Join Matchmaking blind pool
app.post('/api/matchmaker/join', (req, res) => {
  const { userId, username, avatarId, stake } = req.body;
  if (!userId || !stake) {
    return res.status(400).json({ error: 'Missing userId or stake parameter.' });
  }

  // Remove existing entry to avoid duplication
  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);

  const newPlayer: QueuePlayer = {
    userId,
    username,
    avatarId,
    stake: parseInt(stake, 10),
    joinedAt: Date.now()
  };

  matchmakingQueue.push(newPlayer);
  console.log(`Player ${username} (${userId}) joined queue for ${stake} tickets.`);
  
  res.json({ success: true, queueLength: matchmakingQueue.length });
});

// Get matchmaking status
app.get('/api/matchmaker/status/:userId', (req, res) => {
  const { userId } = req.params;
  const player = matchmakingQueue.find(p => p.userId === userId);
  
  if (!player) {
    // If not in queue, they might have been matched
    return res.json({ status: 'matched', lobbyId: 'lobby-' + Math.random().toString(36).substring(2, 9) });
  }

  // If queue has 4 players for the same stake, they are ready to match
  const similarStakePlayers = matchmakingQueue.filter(p => p.stake === player.stake);
  if (similarStakePlayers.length >= 4) {
    // Slice off matched players
    const matchGroup = similarStakePlayers.slice(0, 4);
    const matchUserIds = matchGroup.map(p => p.userId);
    
    // Remove matched players from queue
    matchmakingQueue = matchmakingQueue.filter(p => !matchUserIds.includes(p.userId));
    
    return res.json({
      status: 'success',
      matchId: 'match-' + Date.now(),
      opponents: matchGroup.filter(p => p.userId !== userId)
    });
  }

  res.json({ status: 'searching', queueLength: similarStakePlayers.length });
});

// Leave Matchmaking queue
app.post('/api/matchmaker/leave', (req, res) => {
  const { userId } = req.body;
  matchmakingQueue = matchmakingQueue.filter(p => p.userId !== userId);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Redoapp backend running on port ${PORT}`);
});
