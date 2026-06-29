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
import { Avatar } from './Avatars';
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
  onNameChange?: (name: string) => void;
  onAvatarSelect?: (id: AvatarId) => void;
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
  onNameChange,
  onAvatarSelect,
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
    <div className="w-full bg-[#0c0f12] text-[#f8fafc] pixel-box-lg p-3 sm:p-5 relative overflow-hidden flex flex-col gap-4 select-none pixel-scanlines">
      
      {/* Network Connectivity bar */}
      <div className="flex justify-between items-center bg-[#18181c] p-2.5 pixel-box-sm border-black">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff66] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff66]"></span>
          </span>
          <div className="leading-none text-left">
            <span className="block text-[8px] uppercase font-black tracking-widest text-[#00ff66] font-mono">
              TON NETWORK
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              SURF_ARENA_NODE_1
            </span>
          </div>
        </div>

        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className={`px-3 py-1.5 pixel-btn-interactive text-[10px] font-black uppercase font-mono tracking-wider flex items-center gap-1.5 ${
            isConnecting
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : walletConnected
              ? 'bg-[#ff4b4b] text-black border-2 border-black shadow-[2px_2px_0_#000]'
              : 'bg-[#00d2ff] text-black border-2 border-black shadow-[2px_2px_0_#000]'
          }`}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              SYNCING...
            </>
          ) : walletConnected ? (
            <>
              <Check className="w-3 h-3 text-black" />
              {walletAddress}
            </>
          ) : (
            <>
              <Wallet className="w-3 h-3 text-black" />
              CONNECT
            </>
          )}
        </button>
      </div>

      {/* Grid statistics (Neon-bordered boxes) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            TON POINTS
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-black text-[#00d2ff]">
              {yoTokenBalance}
            </span>
            {walletConnected && !faucetClaimedToday && (
              <button
                onClick={claimFaucet}
                className="p-0.5 bg-[#00ff66] text-black border border-black hover:scale-105 active:scale-95 shrink-0"
                title="Claim daily 50 TON"
              >
                <Gift className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            TICKETS
          </span>
          <span className="block text-xs font-black text-[#ffcc00] mt-1">
            {goldenTickets} TKT
          </span>
        </div>

        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            RANK
          </span>
          <span className="block text-xs font-black text-[#ec4899] mt-1">
            LVL {playerLevel}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-5 border-2 border-black bg-slate-950 p-0.5 gap-0.5">
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
              className={`text-center py-2 text-[8px] sm:text-[9px] font-black uppercase font-mono transition-all cursor-pointer border ${
                active
                  ? 'bg-[#00d2ff] text-black border-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-[290px] sm:min-h-[320px] flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {currentTab === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 flex-1 flex flex-col justify-between"
            >
              <div className="bg-[#18181c] p-4 pixel-box-sm border-black text-center space-y-2 flex-1 flex flex-col justify-center">
                <h3 className="font-black text-xs text-[#00ff66] uppercase tracking-wider font-mono">
                  [ READY FOR MATCHMAKING ]
                </h3>
                <p className="text-[10px] text-slate-350 leading-relaxed font-sans max-w-xs mx-auto">
                  Challenge smart contract nodes. Level up your rank, prove your skills, and earn cryptographic TON points.
                </p>
                <div className="pt-2 text-[9px] font-mono text-[#ffcc00] bg-black p-1.5 border border-black inline-block max-w-[200px] mx-auto">
                  Rider: {userName}
                </div>
              </div>

              <button
                onClick={() => {
                  sound.playShuffle();
                  onStartGame();
                }}
                className="w-full py-4 bg-[#00ff66] text-black font-black text-xs sm:text-sm uppercase font-mono tracking-wider pixel-btn-interactive border-4 border-black flex items-center justify-center gap-2 shadow-[4px_4px_0_#000]"
              >
                <Play className="w-4 h-4 fill-black text-black" />
                DEAL CARDS & PLAY
              </button>
            </motion.div>
          )}

          {currentTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-3 font-mono">
                
                {/* Profile Edit Card */}
                <div className="grid grid-cols-1 gap-2.5 border-b border-black pb-3">
                  <div className="space-y-1 text-left">
                    <span className="text-[7px] text-slate-400 uppercase font-mono">Edit Surf Name</span>
                    <input 
                      type="text" 
                      maxLength={12}
                      value={userName} 
                      onChange={(e) => onNameChange?.(e.target.value)} 
                      className="pixel-box-sm bg-black border-black text-[#00ff66] text-xs font-mono px-2 py-1 w-full focus:outline-none focus:border-[#00d2ff]"
                    />
                  </div>

                  <div className="space-y-1 text-left">
                    <span className="text-[7px] text-slate-400 uppercase font-mono">Select Avatar Rider</span>
                    <div className="grid grid-cols-6 gap-1">
                      {AVATAR_LIST.map((av) => {
                        const isSelected = selectedAvatar === av.id;
                        return (
                          <button
                            key={av.id}
                            type="button"
                            onClick={() => onAvatarSelect?.(av.id)}
                            className={`p-0.5 border transition-all cursor-pointer flex items-center justify-center ${
                              isSelected 
                                ? 'bg-[#00d2ff] border-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]' 
                                : 'bg-black border-black hover:bg-slate-900'
                            }`}
                            title={av.description}
                          >
                            <Avatar id={av.id} emotion="happy" isActive={isSelected} size={24} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 bg-black p-2 border border-black">
                  <div className="flex justify-between items-center text-[8px] font-bold">
                    <span className="text-slate-450">XP PROGRESS</span>
                    <span className="text-[#00d2ff]">{currentLevelXp} / {xpNeeded} XP</span>
                  </div>
                  <div className="w-full bg-slate-900 h-3 border border-black overflow-hidden relative">
                    <div
                      className="bg-[#00d2ff] h-full transition-all duration-500 ease-out"
                      style={{ width: `${xpProgressPercentage}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-left text-[9px]">
                  <div className="bg-black p-2 border border-black">
                    <span className="block text-slate-500 text-[7px] uppercase font-bold">MATCHES</span>
                    <span className="text-xs font-black text-white">{stats.gamesPlayed}</span>
                  </div>
                  <div className="bg-black p-2 border border-black">
                    <span className="block text-slate-500 text-[7px] uppercase font-bold">WIN RATE</span>
                    <span className="text-xs font-black text-[#00d2ff]">{winRate}%</span>
                  </div>
                  <div className="bg-black p-2 border border-black">
                    <span className="block text-slate-500 text-[7px] uppercase font-bold">WINS</span>
                    <span className="text-xs font-black text-[#00ff66]">{stats.gamesWon}</span>
                  </div>
                  <div className="bg-black p-2 border border-black">
                    <span className="block text-slate-500 text-[7px] uppercase font-bold">TOTAL XP</span>
                    <span className="text-xs font-black text-[#ec4899]">{playerXp} XP</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-1.5 font-mono text-[9px]">
                <div className="flex justify-between items-center uppercase font-bold text-slate-400 pb-1 border-b border-black">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-[#00d2ff]" />
                    Transaction Log
                  </span>
                  <Globe className="w-3 h-3 text-slate-600" />
                </div>

                <div className="space-y-1 max-h-24 overflow-y-auto pr-0.5 custom-scroll">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="flex justify-between items-center p-1 bg-black border border-black leading-tight text-[8px]">
                      <div className="flex items-center gap-1 text-left">
                        <span className={`w-1.5 h-1.5 ${
                          tx.type === 'claim' ? 'bg-[#00d2ff]' : tx.type === 'mint' ? 'bg-[#00ff66]' : 'bg-[#ff4b4b]'
                        }`}></span>
                        <div>
                          <span className="text-slate-350 block">{tx.event}</span>
                          <span className="text-slate-500 text-[7px]">{tx.time}</span>
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
                  className="w-full py-2 bg-[#ff4b4b]/20 text-[#ff4b4b] border-2 border-black pixel-btn-interactive text-[9px] font-bold uppercase tracking-wider font-mono"
                >
                  Hard Reset Progress
                </button>
              )}
            </motion.div>
          )}

          {currentTab === 'tournaments' && (
            <motion.div
              key="tournaments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 h-full flex flex-col justify-center py-4"
            >
              <div className="bg-[#18181c] border border-black pixel-box-sm p-5 text-center space-y-4 relative">
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-950 border border-black px-2 py-0.5 text-[#ffcc00] text-[8px] font-mono">
                  <Lock className="w-2.5 h-2.5" /> COMING SOON
                </div>

                <div className="mx-auto w-10 h-10 bg-slate-950 border border-black flex items-center justify-center text-[#ffcc00]">
                  <Trophy className="w-5 h-5" />
                </div>

                <div className="space-y-1 font-mono">
                  <h3 className="font-black text-xs text-slate-100 uppercase">
                    CHAMPIONSHIPS
                  </h3>
                  <p className="text-[9px] text-slate-450 leading-relaxed font-sans max-w-xs mx-auto">
                    Compete in structured tournament leagues against fellow card players to share massive prize pools of TON tokens.
                  </p>
                </div>

                <div className="bg-black p-3 border border-black text-left text-[8px] font-mono space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Pool:</span>
                    <span className="text-[#00ff66] font-bold">100,000 TON</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Min Tier:</span>
                    <span>Level 3</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className="text-[#00d2ff] font-bold">Deploying Contracts</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentTab === 'pvp' && (
            <motion.div
              key="pvp"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 h-full flex flex-col justify-center py-2 text-left"
            >
              {!walletConnected ? (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-6 text-center space-y-3 font-mono">
                  <div className="mx-auto w-10 h-10 bg-slate-950 border border-black flex items-center justify-center text-[#00d2ff]">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-xs text-slate-100 uppercase">
                      Sync Wallet to Enter
                    </h3>
                    <p className="text-[9px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                      Real stake PVP battles require matching through TON wallet signatures to secure your tickets pool.
                    </p>
                  </div>
                  <button
                    onClick={connectWallet}
                    className="w-full py-2 bg-[#00d2ff] text-black font-black text-xs uppercase pixel-btn-interactive border-2 border-black"
                  >
                    Connect TON Wallet
                  </button>
                </div>
              ) : matchmakingState === 'searching' ? (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-6 text-center space-y-4 font-mono">
                  <div className="relative flex items-center justify-center mx-auto w-12 h-12 bg-slate-950 border border-black">
                    <span className="text-xs font-black text-[#00d2ff]">{5 - matchmakingTimer}S</span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-[10px] text-[#00ff66] uppercase">
                      QUEUE ACTIVE
                    </h3>
                    <p className="text-[9px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                      Anti-Sync buffer active. Gathering active tickets for a random delay. Players are anonymous to avoid collusion.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      sound.playPop();
                      setGoldenTickets(prev => prev + selectedStake);
                      setMatchmakingState('idle');
                    }}
                    className="w-full py-2 bg-[#ff4b4b] text-black border-2 border-black text-[9px] uppercase font-black pixel-btn-interactive"
                  >
                    Cancel Queue
                  </button>
                </div>
              ) : matchmakingState === 'success' ? (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-6 text-center space-y-2 font-mono">
                  <h3 className="font-black text-xs text-[#00ff66] uppercase">
                    MATCH READY!
                  </h3>
                  <p className="text-[9px] text-slate-455">
                    Stakes pool: {(selectedStake * 4 * 0.9).toFixed(1)} Tickets (10% platform tax applied)
                  </p>
                </div>
              ) : (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-3.5 space-y-3 font-mono">
                  <div className="flex justify-between items-center text-[10px]">
                    <h3 className="font-black text-slate-100 uppercase">
                      TON PVP ARENA
                    </h3>
                    <span className="text-[9px] text-[#ffcc00] bg-black px-2 py-0.5 border border-black">
                      BAL: <strong>{goldenTickets}</strong> TKT
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1">
                    {([1, 5, 10, 50] as const).map((stake) => (
                      <button
                        key={stake}
                        onClick={() => {
                          sound.playPop();
                          setSelectedStake(stake);
                        }}
                        className={`p-2 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                          selectedStake === stake
                            ? 'bg-[#00d2ff] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                            : 'bg-black border-black text-slate-450'
                        }`}
                      >
                        <span className="text-[10px] font-black">{stake}TKT</span>
                        <span className="text-[7px] block mt-0.5">{(stake * 0.5).toFixed(1)}TON</span>
                      </button>
                    ))}
                  </div>

                  <div className="bg-black p-2.5 border border-black text-[8px] leading-relaxed space-y-1 text-slate-450">
                    <div className="flex justify-between text-slate-350">
                      <span>Prize pool:</span>
                      <span className="text-[#00ff66] font-bold">{(selectedStake * 4 * 0.9).toFixed(1)} TKT</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Match Delay:</span>
                      <span>5-10s random queue</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Incognito mode:</span>
                      <span className="text-[#00ff66]">ACTIVE</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={buyTicketsWithTon}
                      disabled={buyingTickets}
                      className="flex-1 py-2 bg-black text-slate-300 border border-black text-[9px] font-black uppercase pixel-btn-interactive flex items-center justify-center gap-1"
                    >
                      {buyingTickets ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          WAIT...
                        </>
                      ) : (
                        <>
                          <span>BUY 10</span>
                          <span className="text-[#00d2ff] text-[7px]">(5T)</span>
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
                      className="flex-1 py-2 bg-[#00ff66] text-black font-black text-[9px] uppercase pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
                    >
                      FIND PVP
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {currentTab === 'rooms' && (
            <motion.div
              key="rooms"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 h-full flex flex-col justify-center py-2 text-left"
            >
              {!walletConnected ? (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-6 text-center space-y-3 font-mono">
                  <div className="mx-auto w-10 h-10 bg-slate-950 border border-black flex items-center justify-center text-[#00d2ff]">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-xs text-slate-100 uppercase">
                      Sync Wallet to Create
                    </h3>
                    <p className="text-[9px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                      Private custom matches require active wallet pairs to verify and reward the winner.
                    </p>
                  </div>
                  <button
                    onClick={connectWallet}
                    className="w-full py-2 bg-[#00d2ff] text-black font-black text-xs uppercase pixel-btn-interactive border-2 border-black"
                  >
                    Connect TON Wallet
                  </button>
                </div>
              ) : showRoomDisclaimer ? (
                <div className="bg-[#0c0f12] border-2 border-[#ff4b4b] pixel-box-sm p-4 text-center space-y-3 font-mono text-[9px]">
                  <h3 className="font-black text-xs text-[#ff4b4b] uppercase">
                    !! PRIVATE MATCH RISK !!
                  </h3>
                  <div className="text-[8px] text-slate-350 leading-relaxed text-left bg-black p-2 border border-black space-y-1.5">
                    <p>
                      <strong>You are joining a PRIVATE table.</strong> Opponents might play in collusion.
                    </p>
                    <p className="text-[#ffcc00] font-bold">
                      Platform tax is increased to 30% to prevent token abuse.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        sound.playPop();
                        setShowRoomDisclaimer(false);
                      }}
                      className="flex-1 py-1.5 bg-black text-slate-450 border border-black uppercase font-bold pixel-btn-interactive text-[8px]"
                    >
                      EXIT
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
                      className="flex-1 py-1.5 bg-[#ff4b4b] text-black uppercase font-black pixel-btn-interactive border border-black text-[8px]"
                    >
                      CONFIRM
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-3.5 space-y-3 font-mono">
                  <div className="flex justify-between items-center text-[10px]">
                    <h3 className="font-black text-slate-100 uppercase">
                      PRIVATE ROOM
                    </h3>
                    <span className="text-[9px] text-[#00d2ff] bg-black px-2 py-0.5 border border-black">
                      BAL: <strong>{goldenTickets}</strong> TKT
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-slate-400 uppercase font-mono">Select Room Stake</label>
                    <div className="grid grid-cols-4 gap-1">
                      {([1, 5, 10, 50] as const).map((stake) => (
                        <button
                          key={stake}
                          onClick={() => {
                            sound.playPop();
                            setPrivateRoomStake(stake);
                            setGeneratedLink('');
                          }}
                          className={`p-2 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                            privateRoomStake === stake
                              ? 'bg-[#00d2ff] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                              : 'bg-black border-black text-slate-450'
                          }`}
                        >
                          <span className="text-[10px] font-black">{stake}TKT</span>
                          <span className="text-[7px] block mt-0.5">{(stake * 0.5).toFixed(1)}TON</span>
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
                      className="w-full py-2.5 bg-[#00ff66] text-black font-black text-[9px] uppercase pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
                    >
                      GENERATE INVITE LINK
                    </button>
                  ) : (
                    <div className="space-y-2 text-[9px]">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          readOnly
                          value={generatedLink}
                          className="flex-1 bg-black border border-black text-slate-300 px-2 py-1.5 text-[8px] font-mono focus:outline-none select-all"
                        />
                        <button
                          onClick={() => {
                            sound.playPop();
                            navigator.clipboard.writeText(generatedLink);
                            alert("Link copied to clipboard!");
                          }}
                          className="px-3 py-1.5 bg-[#00d2ff] text-black text-[9px] font-black uppercase pixel-btn-interactive border border-black"
                        >
                          Copy
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          sound.playPop();
                          setShowRoomDisclaimer(true);
                        }}
                        className="w-full py-2 bg-black text-slate-200 border border-black text-[9px] font-black uppercase pixel-btn-interactive"
                      >
                        ENTER ROOM
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
