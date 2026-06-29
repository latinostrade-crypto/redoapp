import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import {
  Wallet,
  Coins,
  Sparkles,
  Check,
  Loader2,
  Gift,
  Play,
  History,
  Globe,
  Lock,
  Trophy,
  Ticket,
} from 'lucide-react';
import { sound } from '../utils/sound';
import { AvatarId, GameStats } from '../types';

interface Web3DashboardProps {
  userName: string;
  selectedAvatar: AvatarId;
  AVATAR_LIST: { id: AvatarId; emoji: string; bg: string; description: string }[];
  stats: GameStats;
  playerLevel: number;
  currentLevelXp: number;
  xpNeeded: number;
  xpProgressPercentage: number;
  playerXp: number;
  resetStats: () => void;
  onStartGame: () => void;
}

export function Web3Dashboard({
  userName,
  selectedAvatar,
  AVATAR_LIST,
  stats,
  playerLevel,
  currentLevelXp,
  xpNeeded,
  xpProgressPercentage,
  playerXp,
  resetStats,
  onStartGame,
}: Web3DashboardProps) {
  const [currentTab, setCurrentTab] = useState<'lobby' | 'profile' | 'tournaments' | 'pvp' | 'rooms'>('lobby');

  const [tonConnectUI] = useTonConnectUI();
  const rawAddress = useTonAddress();
  const walletConnected = !!rawAddress;
  
  const walletAddress = walletConnected 
    ? `${rawAddress.substring(0, 6)}...${rawAddress.substring(rawAddress.length - 4)}` 
    : '';

  const [isConnecting, setIsConnecting] = useState(false);

  const [yoTokenBalance, setYoTokenBalance] = useState<number>(() => {
    const saved = localStorage.getItem('yo_token_balance');
    if (saved) return parseInt(saved, 10);
    return 150 + (stats.gamesPlayed * 25) + (stats.gamesWon * 100);
  });

  const [goldenTickets, setGoldenTickets] = useState<number>(() => {
    const saved = localStorage.getItem('uno_golden_tickets');
    return saved ? parseInt(saved, 10) : 10;
  });

  const [lastFaucetClaim, setLastFaucetClaim] = useState<number>(() => {
    const saved = localStorage.getItem('uno_last_faucet');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [faucetClaimedToday, setFaucetClaimedToday] = useState(false);

  const [selectedStake, setSelectedStake] = useState<1 | 5 | 10 | 50>(1);
  const [matchmakingState, setMatchmakingState] = useState<'idle' | 'searching' | 'success'>('idle');
  const [matchmakingTimer, setMatchmakingTimer] = useState(0);
  const [buyingTickets, setBuyingTickets] = useState(false);

  const [privateRoomStake, setPrivateRoomStake] = useState<1 | 5 | 10 | 50>(1);
  const [generatedLink, setGeneratedLink] = useState('');
  const [showRoomDisclaimer, setShowRoomDisclaimer] = useState(false);

  const [transactions, setTransactions] = useState<any[]>(() => {
    const saved = localStorage.getItem('yo_transactions');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'tx-001', event: 'Genesis Deck Minted', value: 'NFT #1209', time: '1 day ago', type: 'mint' },
      { id: 'tx-002', event: 'Initial Airdrop Claim', value: '+150 TON', time: '1 day ago', type: 'claim' },
    ];
  });

  useEffect(() => {
    if (lastFaucetClaim) {
      const hoursSinceClaim = (Date.now() - lastFaucetClaim) / (1000 * 60 * 60);
      setFaucetClaimedToday(hoursSinceClaim < 24);
    }
  }, [lastFaucetClaim]);

  useEffect(() => {
    localStorage.setItem('yo_token_balance', yoTokenBalance.toString());
    localStorage.setItem('uno_golden_tickets', goldenTickets.toString());
    localStorage.setItem('yo_transactions', JSON.stringify(transactions));
  }, [yoTokenBalance, goldenTickets, transactions]);

  const connectWallet = async () => {
    sound.playPop();
    try {
      if (walletConnected) {
        await tonConnectUI.disconnect();
        const newTx = {
          id: `tx-${Date.now()}`,
          event: 'Wallet Disconnected',
          value: 'TON Wallet',
          time: 'Just now',
          type: 'disconnect'
        };
        setTransactions((prev) => [newTx, ...prev].slice(0, 10));
      } else {
        setIsConnecting(true);
        await tonConnectUI.openModal();
        setIsConnecting(false);
      }
    } catch (e) {
      console.error(e);
      setIsConnecting(false);
    }
  };

  const claimFaucet = () => {
    if (faucetClaimedToday) return;
    sound.playShuffle();
    setYoTokenBalance((prev) => prev + 50);
    setLastFaucetClaim(Date.now());
    setFaucetClaimedToday(true);
    localStorage.setItem('uno_last_faucet', Date.now().toString());

    const newTx = {
      id: `tx-${Date.now()}`,
      event: 'Daily Faucet Claim',
      value: '+50 TON',
      time: 'Just now',
      type: 'claim'
    };
    setTransactions((prev) => [newTx, ...prev].slice(0, 10));
  };

  const buyTicketsWithTon = async () => {
    if (!walletConnected) {
      alert("Please connect your wallet first.");
      return;
    }
    sound.playPop();
    setBuyingTickets(true);
    try {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [{
          address: "UQDa34V_x0Lp34M920D-Jp_v1038V90234_VaDe240_01A5d",
          amount: "5000000000",
        }]
      });
      
      setGoldenTickets((prev) => prev + 10);
      const newTx = {
        id: `tx-${Date.now()}`,
        event: 'Purchased 10 Tickets',
        value: '+10 Tickets',
        time: 'Just now',
        type: 'mint'
      };
      setTransactions((prev) => [newTx, ...prev].slice(0, 10));
    } catch (e) {
      console.error(e);
      if (window.confirm("Could not complete blockchain transaction. Do you want to credit 10 mock tickets for testing?")) {
        setGoldenTickets((prev) => prev + 10);
        const newTx = {
          id: `tx-mock-${Date.now()}`,
          event: 'Mock Ticket Purchase',
          value: '+10 Tickets',
          time: 'Just now',
          type: 'mint'
        };
        setTransactions((prev) => [newTx, ...prev].slice(0, 10));
      }
    } finally {
      setBuyingTickets(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (matchmakingState === 'searching') {
      interval = setInterval(() => {
        setMatchmakingTimer((prev) => {
          if (prev >= 5) {
            clearInterval(interval);
            setMatchmakingState('success');
            setTimeout(() => {
              setMatchmakingState('idle');
              setMatchmakingTimer(0);
              onStartGame();
            }, 1000);
            return 5;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [matchmakingState, onStartGame]);

  const winRate = stats.gamesPlayed > 0 
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
    : 0;

  return (
    <div className="w-full bg-[#0B0E14] text-slate-100 rounded-3xl border border-slate-800 p-3 sm:p-5 shadow-2xl relative overflow-hidden flex flex-col gap-3 sm:gap-4 select-none">
      
      <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex justify-between items-center bg-slate-900/40 p-2 sm:p-3 rounded-2xl border border-slate-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
          </span>
          <div className="leading-none text-left">
            <span className="block text-[8px] sm:text-[9px] uppercase font-black tracking-widest text-cyan-400">
              TON Network
            </span>
            <span className="text-[10px] sm:text-xs font-mono text-slate-400">
              Surf Arena
            </span>
          </div>
        </div>

        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className={`px-2.5 py-1.5 rounded-xl border text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
            isConnecting
              ? 'bg-slate-850 border-slate-700 text-slate-450 cursor-not-allowed'
              : walletConnected
              ? 'bg-blue-950/40 border-blue-500/40 text-blue-300 hover:bg-rose-950/40 hover:border-rose-500/40 hover:text-rose-350'
              : 'bg-gradient-to-r from-blue-500 to-cyan-500 border-blue-400 text-white hover:brightness-110 shadow-lg shadow-blue-500/10'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Syncing...
            </>
          ) : walletConnected ? (
            <>
              <Check className="w-3.5 h-3.5 text-cyan-450" />
              {walletAddress}
            </>
          ) : (
            <>
              <Wallet className="w-3.5 h-3.5 text-white" />
              Connect Wallet
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-slate-900/40 border border-slate-800/80 p-1.5 sm:p-2 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-1">
            <div className="p-1 bg-cyan-400/10 rounded-lg border border-cyan-400/20 shrink-0">
              <Coins className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="leading-none text-left">
              <span className="text-[7px] uppercase font-bold text-slate-400">
                TON Points
              </span>
              <span className="block text-[11px] font-black text-cyan-455">
                {yoTokenBalance}
              </span>
            </div>
          </div>
          {walletConnected && !faucetClaimedToday && (
            <button
              onClick={claimFaucet}
              className="p-0.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 rounded transition-transform hover:scale-105 active:scale-95 cursor-pointer shrink-0"
              title="Claim daily 50 TON"
            >
              <Gift className="w-3 h-3 text-slate-950" />
            </button>
          )}
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-1.5 sm:p-2 rounded-xl flex items-center gap-1">
          <div className="p-1 bg-sky-400/10 rounded-lg border border-sky-400/20 shrink-0">
            <Ticket className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="leading-none text-left">
            <span className="text-[7px] uppercase font-bold text-slate-400">
              Tickets
            </span>
            <span className="block text-[11px] font-black text-sky-400">
              {goldenTickets} TKT
            </span>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-1.5 sm:p-2 rounded-xl flex items-center gap-1">
          <div className="p-1 bg-indigo-500/10 rounded-lg border border-indigo-500/20 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="leading-none text-left">
            <span className="text-[7px] uppercase font-bold text-slate-400">
              Rank
            </span>
            <span className="block text-[11px] font-black text-indigo-300">
              Lvl {playerLevel}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950/40 p-1 rounded-xl gap-1">
        {[
          { id: 'lobby', label: 'PLAY' },
          { id: 'profile', label: 'ME' },
          { id: 'tournaments', label: 'TOUR' },
          { id: 'pvp', label: 'PVP' },
          { id: 'rooms', label: 'ROOMS' },
        ].map((tab) => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                sound.playPop();
                setCurrentTab(tab.id as any);
              }}
              className={`text-center py-2 text-[8px] sm:text-[10px] font-black uppercase tracking-tight rounded-lg transition-all cursor-pointer ${
                active
                  ? 'bg-slate-900 text-slate-100 shadow-md border-b-2 border-slate-500'
                  : 'text-slate-450 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-[290px] sm:min-h-[320px]">
        <AnimatePresence mode="wait">
          {currentTab === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-slate-900/30 p-4 rounded-2xl border border-slate-800/80 text-center space-y-2">
                <h3 className="font-extrabold text-sm text-cyan-400 uppercase tracking-wider">
                  Ready for Matchmaking
                </h3>
                <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Challenge our smart contract AI nodes. Level up your rank, prove your skills, and earn cryptographic TON points.
                </p>
                <div className="pt-2 text-[9px] font-mono text-slate-400 bg-slate-950/60 p-1.5 rounded-lg inline-block border border-slate-850">
                  Rider: {userName}
                </div>
              </div>

              <button
                onClick={() => {
                  sound.playShuffle();
                  onStartGame();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl border-b-4 border-blue-800 flex items-center justify-center gap-1.5 hover:brightness-115 active:scale-[0.98] transition-all shadow-lg cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white text-white" />
                DEAL CARDS & ENTER GAME
              </button>
            </motion.div>
          )}

          {currentTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <div className="text-sm font-black text-white flex items-center gap-1.5">
                      {userName}
                      {walletConnected && (
                        <span className="text-[8px] uppercase tracking-wider font-extrabold bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                          PRO VERIFIED
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {walletConnected ? `Address: ${walletAddress}` : 'No Web3 Wallet Connected'}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850/80">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-400">XP PROGRESS</span>
                    <span className="text-cyan-400 font-mono">{currentLevelXp} / {xpNeeded} XP</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden relative border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${xpProgressPercentage}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-left">
                  <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-850/80">
                    <span className="block text-slate-400 text-[9px] uppercase font-bold">GAMES PLAYED</span>
                    <span className="text-sm font-black text-white">{stats.gamesPlayed} MATCHES</span>
                  </div>
                  <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-850/80">
                    <span className="block text-slate-400 text-[9px] uppercase font-bold">WIN RATE (%)</span>
                    <span className="text-sm font-black text-cyan-400">{winRate}% SUCCESS</span>
                  </div>
                  <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-850/80">
                    <span className="block text-slate-400 text-[9px] uppercase font-bold">WINS</span>
                    <span className="text-sm font-black text-cyan-455">{stats.gamesWon} VICTORIES</span>
                  </div>
                  <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-850/80">
                    <span className="block text-slate-400 text-[9px] uppercase font-bold">TOTAL ACCUMULATED XP</span>
                    <span className="text-sm font-black text-cyan-300">{playerXp} XP</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-2xl space-y-1.5">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 pb-1 border-b border-slate-800">
                  <span className="flex items-center gap-1">
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    Transaction Log
                  </span>
                  <Globe className="w-3 h-3 animate-spin text-slate-600" style={{ animationDuration: '8s' }} />
                </div>

                <div className="space-y-1.5 max-h-24 overflow-y-auto pr-0.5 custom-scroll">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="flex justify-between items-center p-1.5 bg-slate-950/50 rounded-lg border border-slate-900 text-[9px] font-mono leading-tight">
                      <div className="flex items-center gap-1.5 text-left">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          tx.type === 'claim' ? 'bg-cyan-450' : tx.type === 'mint' ? 'bg-teal-450' : 'bg-blue-450'
                        }`}></span>
                        <div>
                          <span className="text-slate-300 block">{tx.event}</span>
                          <span className="text-slate-500 text-[8px]">{tx.time}</span>
                        </div>
                      </div>
                      <span className="font-extrabold text-slate-200">{tx.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {(stats.gamesPlayed > 0 || playerXp > 0) && (
                <button
                  onClick={() => {
                    if (window.confirm('Wanna completely reset all stats and XP?')) {
                      sound.playPop();
                      resetStats();
                    }
                  }}
                  className="w-full py-2 bg-rose-950/40 text-rose-300 hover:bg-rose-950/80 border border-rose-900/60 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
                >
                  Hard Reset Progress
                </button>
              )}
            </motion.div>
          )}

          {currentTab === 'tournaments' && (
            <motion.div
              key="tournaments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 h-full flex flex-col justify-center py-4"
            >
              <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl text-center space-y-4 relative">
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full text-cyan-400 text-[8px] font-mono">
                  <Lock className="w-2.5 h-2.5" /> COMING SOON
                </div>

                <div className="mx-auto w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 rounded-full flex items-center justify-center text-cyan-400 shadow-md">
                  <Trophy className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-black text-sm text-slate-100 uppercase tracking-widest">
                    Championship Brackets
                  </h3>
                  <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                    Compete in structured tournament leagues against fellow card players to share massive prize pools of <strong className="text-cyan-400">TON</strong> tokens and badges.
                  </p>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-850/80 text-left text-[9px] font-mono space-y-2 text-slate-400">
                  <div className="flex justify-between">
                    <span>Target Pool:</span>
                    <span className="text-cyan-405 font-bold">100,000 TON</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Entry Tier:</span>
                    <span>Level 3 minimum</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="text-blue-450 font-bold">Deploying Contracts</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentTab === 'pvp' && (
            <motion.div
              key="pvp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3 h-full flex flex-col justify-center py-2 text-left"
            >
              {!walletConnected ? (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl text-center space-y-3">
                  <div className="mx-auto w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center text-blue-400 shadow-md">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-sm text-slate-100 uppercase tracking-widest">
                      Sync Wallet to Enter Arena
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Real stake PVP battles require matching through TON wallet signatures to secure your tickets pool.
                    </p>
                  </div>
                  <button
                    onClick={connectWallet}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    Connect Wallet via TON Connect
                  </button>
                </div>
              ) : matchmakingState === 'searching' ? (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl text-center space-y-4">
                  <div className="relative flex items-center justify-center mx-auto">
                    <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
                    <span className="absolute text-xs font-mono font-bold text-cyan-400">{5 - matchmakingTimer}s</span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-xs text-cyan-455 uppercase tracking-wider">
                      Matchmaker Queue Active
                    </h3>
                    <p className="text-[9px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Anti-Sync buffer active. Gathering active tickets for a random delay. Players are anonymous to avoid collusion.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      sound.playPop();
                      setGoldenTickets(prev => prev + selectedStake);
                      setMatchmakingState('idle');
                    }}
                    className="px-3 py-1 bg-rose-950 text-rose-300 border border-rose-900 text-[10px] uppercase font-bold tracking-widest rounded-xl hover:bg-rose-900 transition-all cursor-pointer"
                  >
                    Cancel Queue
                  </button>
                </div>
              ) : matchmakingState === 'success' ? (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl text-center space-y-2">
                  <h3 className="font-black text-sm text-cyan-400 uppercase tracking-widest">
                    Match Ready
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Stakes pool: {(selectedStake * 4 * 0.9).toFixed(1)} Tickets (10% platform tax applied)
                  </p>
                </div>
              ) : (
                <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-xs text-slate-100 uppercase tracking-wider">
                      TON PVP Arena Room
                    </h3>
                    <span className="text-[10px] font-mono text-cyan-400 bg-slate-950/40 px-2 py-0.5 rounded border border-slate-800">
                      Balance: <strong>{goldenTickets}</strong> Tickets
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {([1, 5, 10, 50] as const).map((stake) => (
                      <button
                        key={stake}
                        onClick={() => {
                          sound.playPop();
                          setSelectedStake(stake);
                        }}
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          selectedStake === stake
                            ? 'bg-cyan-950/60 border-cyan-400 text-cyan-300 font-black shadow-md'
                            : 'bg-slate-950/40 border-slate-800 text-slate-455'
                        }`}
                      >
                        <span className="block text-xs font-black">{stake} TKT</span>
                        <span className="text-[7px] block text-slate-455 mt-0.5">{(stake * 0.5).toFixed(1)} TON</span>
                      </button>
                    ))}
                  </div>

                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 text-[8px] font-mono leading-relaxed space-y-1.5 text-slate-455">
                    <div className="flex justify-between text-slate-350">
                      <span>Prize pool model:</span>
                      <span className="text-cyan-400 font-bold">{(selectedStake * 4 * 0.9).toFixed(1)} Tickets</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Match Delay Buffering:</span>
                      <span>5-10s random queue</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Anti-Collusion Mode:</span>
                      <span className="text-cyan-455">Incognito active</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={buyTicketsWithTon}
                      disabled={buyingTickets}
                      className="flex-1 py-2 bg-slate-950 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      {buyingTickets ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <span>Buy 10 Tickets</span>
                          <span className="text-cyan-400 text-[8px] font-mono">(5 TON)</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (goldenTickets < selectedStake) {
                          alert(`You need at least ${selectedStake} tickets to join this queue. Buy tickets or claim points.`);
                          return;
                        }
                        sound.playShuffle();
                        setGoldenTickets(prev => prev - selectedStake);
                        setMatchmakingState('searching');
                        setMatchmakingTimer(0);
                      }}
                      className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:brightness-110 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center"
                    >
                      Find PvP Match
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {currentTab === 'rooms' && (
            <motion.div
              key="rooms"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3 h-full flex flex-col justify-center py-2 text-left"
            >
              {!walletConnected ? (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl text-center space-y-3">
                  <div className="mx-auto w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center text-blue-400 shadow-md">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-sm text-slate-100 uppercase tracking-widest">
                      Sync Wallet to Create Rooms
                    </h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                      Private custom matches require active wallet pairs to verify and reward the winner.
                    </p>
                  </div>
                  <button
                    onClick={connectWallet}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    Connect Wallet via TON Connect
                  </button>
                </div>
              ) : showRoomDisclaimer ? (
                <div className="bg-slate-950/80 border border-rose-500/40 p-4 rounded-2xl text-center space-y-3">
                  <h3 className="font-black text-xs text-rose-400 uppercase tracking-widest">
                    Private Room Disclaimer
                  </h3>
                  <div className="text-[9px] text-slate-400 leading-relaxed text-left bg-slate-900/60 p-2.5 rounded-xl border border-slate-850 space-y-2">
                    <p>
                      <strong>You are joining a PRIVATE table.</strong> This match was created via a direct link. Opponents might play in collusion.
                    </p>
                    <p className="text-cyan-400 font-bold">
                      Platform tax is increased to 30% to prevent commercial abuse and token dumps.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        sound.playPop();
                        setShowRoomDisclaimer(false);
                      }}
                      className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-450 border border-slate-800 text-[9px] uppercase font-bold tracking-widest rounded-lg cursor-pointer"
                    >
                      Safe PVP
                    </button>
                    <button
                      onClick={() => {
                        if (goldenTickets < privateRoomStake) {
                          alert("Insufficient tickets for this private room stake.");
                          return;
                        }
                        sound.playShuffle();
                        setGoldenTickets(prev => prev - privateRoomStake);
                        setShowRoomDisclaimer(false);
                        onStartGame();
                      }}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[9px] uppercase font-bold tracking-widest rounded-lg cursor-pointer"
                    >
                      Accept & Enter
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-xs text-slate-100 uppercase tracking-wider">
                      Private Room Creator
                    </h3>
                    <span className="text-[9px] font-mono text-cyan-400 bg-slate-950/40 px-2 py-0.5 rounded border border-slate-800">
                      Balance: <strong>{goldenTickets}</strong> Tickets
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Select Room Stake</label>
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      {([1, 5, 10, 50] as const).map((stake) => (
                        <button
                          key={stake}
                          onClick={() => {
                            sound.playPop();
                            setPrivateRoomStake(stake);
                            setGeneratedLink('');
                          }}
                          className={`p-2 rounded-xl border transition-all cursor-pointer ${
                            privateRoomStake === stake
                              ? 'bg-cyan-950/60 border-cyan-400 text-cyan-300 font-black shadow-md'
                              : 'bg-slate-950/40 border-slate-800 text-slate-450'
                          }`}
                        >
                          <span className="block text-xs font-black">{stake} TKT</span>
                          <span className="text-[7px] block text-slate-455 mt-0.5">{(stake * 0.5).toFixed(1)} TON</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {!generatedLink ? (
                    <button
                      onClick={() => {
                        sound.playShuffle();
                        const randomRoom = Math.random().toString(36).substring(2, 8);
                        setGeneratedLink(`https://t.me/yo_uno_bot/app?startapp=room_${randomRoom}`);
                      }}
                      className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:brightness-110 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center"
                    >
                      Generate Invite Link
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={generatedLink}
                          className="flex-1 bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-[9px] font-mono select-all focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            sound.playPop();
                            navigator.clipboard.writeText(generatedLink);
                            alert("Link copied to clipboard!");
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[9px] font-bold uppercase rounded-lg border border-slate-750 cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          sound.playPop();
                          setShowRoomDisclaimer(true);
                        }}
                        className="w-full py-2 bg-slate-950 text-slate-300 hover:text-white border border-slate-850 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                      >
                        Enter Room Lobby
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
