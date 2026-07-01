import React, { useState, useEffect, useRef } from 'react';
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
  onStartGame: (mode: 'offline' | 'pvp' | 'private', stake: number) => void;
  onNameChange?: (name: string) => void;
  onAvatarSelect?: (id: AvatarId) => void;
  onOpenRules?: () => void;
  goldenTickets: number;
  setGoldenTickets: React.Dispatch<React.SetStateAction<number>>;
  transactions: any[];
  setTransactions: React.Dispatch<React.SetStateAction<any[]>>;
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
  onOpenRules,
  goldenTickets,
  setGoldenTickets,
  transactions,
  setTransactions,
}: Web3DashboardProps) {
  const [currentTab, setCurrentTab] = useState<'profile' | 'tournaments' | 'pvp' | 'rewards'>('profile');
  const [pvpSubMode, setPvpSubMode] = useState<'public' | 'private' | 'practice'>('public');

  const [tonConnectUI] = useTonConnectUI();
  const rawAddress = useTonAddress();
  const walletConnected = !!rawAddress;
  
  const walletAddress = walletConnected 
    ? `${rawAddress.substring(0, 6)}...${rawAddress.substring(rawAddress.length - 4)}` 
    : '';

  const [isConnecting, setIsConnecting] = useState(false);

  // Track wallet connection changes to add transaction logs
  const prevConnectedRef = useRef(walletConnected);
  useEffect(() => {
    if (walletConnected && !prevConnectedRef.current) {
      const newTx = {
        id: `tx-connect-${Date.now()}`,
        event: 'Wallet Connected',
        value: 'TON Wallet',
        time: 'Just now',
        type: 'claim'
      };
      setTransactions((prev) => {
        if (prev.some(t => t.event === 'Wallet Connected' && t.time === 'Just now')) return prev;
        return [newTx, ...prev].slice(0, 10);
      });
    } else if (!walletConnected && prevConnectedRef.current) {
      const newTx = {
        id: `tx-disconnect-${Date.now()}`,
        event: 'Wallet Disconnected',
        value: 'TON Wallet',
        time: 'Just now',
        type: 'disconnect'
      };
      setTransactions((prev) => {
        if (prev.some(t => t.event === 'Wallet Disconnected' && t.time === 'Just now')) return prev;
        return [newTx, ...prev].slice(0, 10);
      });
    }
    prevConnectedRef.current = walletConnected;
  }, [walletConnected, setTransactions]);

  const [yoTokenBalance, setYoTokenBalance] = useState<number>(() => {
    const saved = localStorage.getItem('yo_token_balance');
    if (saved) return parseInt(saved, 10);
    return 150 + (stats.gamesPlayed * 25) + (stats.gamesWon * 100);
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
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    if (lastFaucetClaim) {
      const hoursSinceClaim = (Date.now() - lastFaucetClaim) / (1000 * 60 * 60);
      setFaucetClaimedToday(hoursSinceClaim < 24);
    }
  }, [lastFaucetClaim]);

  useEffect(() => {
    localStorage.setItem('yo_token_balance', yoTokenBalance.toString());
  }, [yoTokenBalance]);

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
        setShowConnectModal(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleActualConnect = async () => {
    setShowConnectModal(false);
    setIsConnecting(true);
    try {
      sound.playPop();
      await tonConnectUI.openModal();
    } catch (e) {
      console.error(e);
    } finally {
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
              onStartGame('pvp', selectedStake);
            }, 1000);
            return 5;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [matchmakingState, onStartGame, selectedStake]);

  const winRate = stats.gamesPlayed > 0 
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
    : 0;

  return (
    <div className="w-full bg-[#0c0f12] text-[#f8fafc] pixel-box-lg p-3 sm:p-5 relative overflow-hidden flex flex-col gap-4 select-none pixel-scanlines">
      
      {/* 1. Tabs (Swapped to the top of the card) */}
      <div className="grid grid-cols-4 border-2 border-black bg-slate-950 p-0.5 gap-0.5 z-10">
        {[
          { id: 'profile', label: 'ME' },
          { id: 'tournaments', label: 'TOUR' },
          { id: 'pvp', label: 'PVP' },
          { id: 'rewards', label: 'REWARDS' },
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

      {/* 2. Network Connectivity bar */}
      <div className="flex justify-between items-center bg-[#18181c] p-2.5 pixel-box-sm border-black">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff66] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff66]"></span>
          </span>
          <div className="leading-none text-left">
          </div>
        </div>

        <div className="flex items-center gap-2">
          {walletConnected && !faucetClaimedToday && (
            <button
              onClick={claimFaucet}
              className="p-1 bg-[#00ff66] text-black border-2 border-black pixel-btn-interactive text-[8px] font-black uppercase font-mono tracking-wider flex items-center justify-center gap-1"
              title="Claim daily 50 TON Points"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>CLAIM</span>
            </button>
          )}
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
      </div>

      {/* 3. Grid statistics (XP instead of TON Points) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950 p-2 border border-black pixel-box-sm flex flex-col justify-between text-left font-mono">
          <span className="text-[7px] uppercase font-bold text-slate-400">
            XP POINTS
          </span>
          <span className="block text-xs font-black text-[#00d2ff] mt-1">
            {playerXp} XP
          </span>
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

      {/* 4. Tab Content */}
      <div className="flex-1 min-h-[290px] sm:min-h-[320px] flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {currentTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-3 font-mono">
                
                {/* Profile Read-Only Info */}
                {(() => {
                  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
                  const isTelegramUser = !!tgUser;
                  const telegramUsername = tgUser?.username || tgUser?.first_name || '';
                  const telegramAvatarUrl = tgUser?.photo_url || '';
                  return (
                    <div className="flex items-center gap-3 border-b border-black pb-3">
                      <div className="w-12 h-12 bg-slate-950 border border-black flex items-center justify-center relative overflow-hidden">
                        {telegramAvatarUrl ? (
                          <img 
                            src={telegramAvatarUrl} 
                            alt="Telegram Avatar" 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full">
                            <Avatar id={selectedAvatar} emotion="happy" isActive={false} size={32} />
                          </div>
                        )}
                      </div>
                      <div className="text-left font-mono">
                        <span className="block text-[7px] text-slate-400 uppercase">Telegram Profile</span>
                        <span className="text-xs font-black text-[#00ff66]">
                          {isTelegramUser ? `@${telegramUsername}` : 'guest'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-1 bg-black p-2 border border-black">
                  <div className="flex justify-between items-center text-[8px] font-bold">
                    <span className="text-slate-455">XP PROGRESS</span>
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
                    <span className="block text-slate-500 text-[7px] uppercase font-bold">TON POINTS</span>
                    <span className="text-xs font-black text-[#ffcc00]">{yoTokenBalance} pts</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={isConnecting}
                  className={`w-full py-2 border-2 border-black pixel-btn-interactive text-[9px] font-bold uppercase tracking-wider font-mono ${
                    isConnecting
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : walletConnected
                      ? 'bg-[#ff4b4b]/20 text-[#ff4b4b] border-black hover:bg-[#ff4b4b]/30'
                      : 'bg-[#00d2ff]/20 text-[#00d2ff] border-black hover:bg-[#00d2ff]/30'
                  }`}
                >
                  {isConnecting ? 'SYNCING...' : walletConnected ? 'Disconnect Wallet' : 'Connect Wallet'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Wanna completely reset all stats and XP?')) {
                      sound.playPop();
                      resetStats();
                    }
                  }}
                  className="w-full py-2 bg-[#ff4b4b]/10 text-[#ff4b4b]/70 hover:text-[#ff4b4b] border border-black/40 pixel-btn-interactive text-[9px] font-bold uppercase tracking-wider font-mono"
                >
                  Hard Reset Progress
                </button>
              </div>
            </motion.div>
          )}

          {currentTab === 'rewards' && (
            <motion.div
              key="rewards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3 h-full flex flex-col justify-between py-2 text-left"
            >
              {/* Daily Faucet Bonus */}
              <div className="bg-[#18181c] border border-black pixel-box-sm p-3.5 text-center space-y-3 font-mono">
                <div className="mx-auto w-10 h-10 bg-slate-950 border border-black flex items-center justify-center text-[#00ff66] animate-bounce-subtle">
                  <Gift className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-xs text-slate-100 uppercase">
                    Daily Bonus Faucet
                  </h3>
                  <p className="text-[9px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                    Claim your daily reward of 50 TON Points. Use them to play, level up, and show off your rank!
                  </p>
                </div>

                {!walletConnected ? (
                  <div className="text-[8.5px] text-[#ff4b4b] bg-black p-2 border border-black uppercase font-bold">
                    Connect wallet to claim daily bonus
                  </div>
                ) : faucetClaimedToday ? (
                  <div className="w-full py-2 bg-slate-950 text-[#00ff66] border border-black/40 text-[10px] font-black uppercase font-mono flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4 text-[#00ff66]" />
                    DAILY BONUS CLAIMED
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={claimFaucet}
                    className="w-full py-2.5 bg-[#00ff66] hover:bg-[#00e55b] text-black font-black text-xs uppercase tracking-wider pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
                  >
                    Claim +50 TON Points
                  </button>
                )}
              </div>

              {/* Activity & Payouts Log */}
              <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-1.5 font-mono text-[9px] flex-1 flex flex-col">
                <div className="flex justify-between items-center uppercase font-bold text-slate-400 pb-1 border-b border-black">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-[#00d2ff]" />
                    Activity & Payouts Log
                  </span>
                  <Globe className="w-3 h-3 text-slate-600" />
                </div>

                <div className="space-y-1 overflow-y-auto custom-scroll flex-1 max-h-[140px] pr-0.5">
                  {transactions.length === 0 ? (
                    <div className="text-center py-6 text-slate-600 text-[8px] uppercase">
                      No activity recorded yet
                    </div>
                  ) : (
                    transactions.map((tx: any) => (
                      <div key={tx.id} className="flex justify-between items-center p-1 bg-black border border-black leading-tight text-[8px]">
                        <div className="flex items-center gap-1 text-left">
                          <span className={`w-1.5 h-1.5 ${
                            tx.type === 'claim' ? 'bg-[#00d2ff]' : tx.type === 'mint' ? 'bg-[#00ff66]' : 'bg-[#ff4b4b]'
                          }`}></span>
                          <div>
                            <span className="text-slate-355 block">{tx.event}</span>
                            <span className="text-slate-500 text-[7px]">{tx.time}</span>
                          </div>
                        </div>
                        <span className="font-extrabold text-slate-200">{tx.value}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
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
                  <p className="text-[9px] text-slate-455 leading-relaxed font-sans max-w-xs mx-auto">
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
              {/* Consolidated PVP Sub Mode selector */}
              <div className="grid grid-cols-3 border border-black bg-slate-950 p-0.5 gap-0.5 text-[8px] font-mono font-bold">
                {(['public', 'private', 'practice'] as const).map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => {
                      sound.playPop();
                      setPvpSubMode(sub);
                    }}
                    className={`text-center py-1 uppercase transition-all cursor-pointer border ${
                      pvpSubMode === sub
                        ? 'bg-[#00ff66]/20 text-[#00ff66] border-[#00ff66]/40 shadow-[inset_1px_1px_rgba(255,255,255,0.1)]'
                        : 'text-slate-400 border-transparent hover:text-slate-200'
                    }`}
                  >
                    {sub === 'public' ? 'Public' : sub === 'private' ? 'Private' : 'Practice'}
                  </button>
                ))}
              </div>

              {/* Sub Mode Content */}
              {pvpSubMode === 'public' && (
                <>
                  {!walletConnected ? (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-3 font-mono">
                      <div className="mx-auto w-8 h-8 bg-slate-950 border border-black flex items-center justify-center text-[#00d2ff]">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-black text-[10px] text-slate-100 uppercase">
                          Sync Wallet to Enter
                        </h3>
                        <p className="text-[8px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                          Real stake PVP battles require matching through TON wallet signatures to secure your tickets pool.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={connectWallet}
                        className="w-full py-1.5 bg-[#00d2ff] text-black font-black text-[9px] uppercase pixel-btn-interactive border border-black"
                      >
                        Connect TON Wallet
                      </button>
                    </div>
                  ) : matchmakingState === 'searching' ? (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-3 font-mono">
                      <div className="relative flex items-center justify-center mx-auto w-10 h-10 bg-slate-950 border border-black">
                        <span className="text-[10px] font-black text-[#00d2ff]">{5 - matchmakingTimer}S</span>
                      </div>
                      <div className="space-y-0.5">
                        <h3 className="font-black text-[9px] text-[#00ff66] uppercase">
                          QUEUE ACTIVE
                        </h3>
                        <p className="text-[8px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                          Anti-Sync buffer active. Gathering active tickets for a random delay. Players are anonymous to avoid collusion.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playPop();
                          setGoldenTickets(prev => prev + selectedStake);
                          setMatchmakingState('idle');
                        }}
                        className="w-full py-1.5 bg-[#ff4b4b] text-black border border-black text-[9px] uppercase font-black pixel-btn-interactive"
                      >
                        Cancel Queue
                      </button>
                    </div>
                  ) : matchmakingState === 'success' ? (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-2 font-mono">
                      <h3 className="font-black text-[10px] text-[#00ff66] uppercase">
                        MATCH READY!
                      </h3>
                      <p className="text-[8px] text-slate-455">
                        Stakes pool: {(selectedStake * 4 * 0.9).toFixed(1)} Tickets (10% platform tax applied)
                      </p>
                    </div>
                  ) : (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-3 font-mono">
                      <div className="flex justify-between items-center text-[9px]">
                        <h3 className="font-black text-slate-100 uppercase">
                          TON PVP ARENA
                        </h3>
                        <span className="text-[8px] text-[#ffcc00] bg-black px-1.5 py-0.5 border border-black">
                          BAL: <strong>{goldenTickets}</strong> TKT
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1">
                        {([1, 5, 10, 50] as const).map((stake) => (
                          <button
                            key={stake}
                            type="button"
                            onClick={() => {
                              sound.playPop();
                              setSelectedStake(stake);
                            }}
                            className={`p-1.5 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                              selectedStake === stake
                                ? 'bg-[#00d2ff] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                                : 'bg-black border-black text-slate-450'
                            }`}
                          >
                            <span className="text-[9px] font-black">{stake}TKT</span>
                            <span className="text-[6px] block mt-0.5">{stake.toFixed(1)}TON</span>
                          </button>
                        ))}
                      </div>

                      <div className="bg-black p-2 border border-black text-[7.5px] leading-relaxed space-y-1 text-slate-450">
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
                          type="button"
                          onClick={buyTicketsWithTon}
                          disabled={buyingTickets}
                          className="flex-1 py-1.5 bg-black text-slate-300 border border-black text-[9px] font-black uppercase pixel-btn-interactive flex items-center justify-center gap-1"
                        >
                          {buyingTickets ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <span>BUY 10</span>
                              <span className="text-[#00d2ff] text-[7px]">(10T)</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (goldenTickets < selectedStake) {
                              alert(`You need at least ${selectedStake} tickets to join this queue. Buy tickets or claim points.`);
                              return;
                            }
                            sound.playShuffle();
                            setMatchmakingState('searching');
                            setMatchmakingTimer(0);
                          }}
                          className="flex-1 py-1.5 bg-[#00ff66] text-black font-black text-[9px] uppercase pixel-btn-interactive border border-black shadow-[2px_2px_0_#000]"
                        >
                          FIND PVP
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {pvpSubMode === 'private' && (
                <>
                  {!walletConnected ? (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-3 font-mono">
                      <div className="mx-auto w-8 h-8 bg-slate-950 border border-black flex items-center justify-center text-[#00d2ff]">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-black text-[10px] text-slate-100 uppercase">
                          Sync Wallet to Create
                        </h3>
                        <p className="text-[8px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                          Private custom matches require active wallet pairs to verify and reward the winner.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={connectWallet}
                        className="w-full py-1.5 bg-[#00d2ff] text-black font-black text-[9px] uppercase pixel-btn-interactive border border-black"
                      >
                        Connect TON Wallet
                      </button>
                    </div>
                  ) : showRoomDisclaimer ? (
                    <div className="bg-[#0c0f12] border-2 border-[#ff4b4b] pixel-box-sm p-3 text-center space-y-2 font-mono text-[8px]">
                      <h3 className="font-black text-[9px] text-[#ff4b4b] uppercase">
                        !! PRIVATE MATCH RISK !!
                      </h3>
                      <div className="text-[7.5px] text-slate-355 leading-relaxed text-left bg-black p-2 border border-black space-y-1">
                        <p>
                          <strong>You are joining a PRIVATE table.</strong> Opponents might play in collusion.
                        </p>
                        <p className="text-[#ffcc00] font-bold">
                          Platform tax is increased to 30% to prevent token abuse.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playPop();
                            setShowRoomDisclaimer(false);
                          }}
                          className="flex-1 py-1 bg-black text-slate-455 border border-black uppercase font-bold pixel-btn-interactive text-[8px]"
                        >
                          EXIT
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (goldenTickets < privateRoomStake) {
                              alert("Insufficient tickets for this private room stake.");
                              return;
                            }
                            sound.playShuffle();
                            setShowRoomDisclaimer(false);
                            onStartGame('private', privateRoomStake);
                          }}
                          className="flex-1 py-1 bg-[#ff4b4b] text-black uppercase font-black pixel-btn-interactive border border-black text-[8px]"
                        >
                          CONFIRM
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#18181c] border border-black pixel-box-sm p-3 space-y-3 font-mono">
                      <div className="flex justify-between items-center text-[9px]">
                        <h3 className="font-black text-slate-100 uppercase">
                          PRIVATE ROOM
                        </h3>
                        <span className="text-[8px] text-[#00d2ff] bg-black px-1.5 py-0.5 border border-black">
                          BAL: <strong>{goldenTickets}</strong> TKT
                        </span>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[7px] font-bold text-slate-400 uppercase font-mono">Select Room Stake</label>
                        <div className="grid grid-cols-4 gap-1">
                          {([1, 5, 10, 50] as const).map((stake) => (
                            <button
                              key={stake}
                              type="button"
                              onClick={() => {
                                sound.playPop();
                                setPrivateRoomStake(stake);
                                setGeneratedLink('');
                              }}
                              className={`p-1.5 border transition-all cursor-pointer font-mono text-center flex flex-col items-center justify-center ${
                                privateRoomStake === stake
                                  ? 'bg-[#00d2ff] text-black border-black font-black shadow-[inset_1px_1px_rgba(255,255,255,0.4)]'
                                  : 'bg-black border-black text-slate-450'
                              }`}
                            >
                              <span className="text-[9px] font-black">{stake}TKT</span>
                              <span className="text-[6px] block mt-0.5">{stake.toFixed(1)}TON</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {!generatedLink ? (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playShuffle();
                            const randomRoom = Math.random().toString(36).substring(2, 8);
                            setGeneratedLink(`https://t.me/redo_appbot/app?startapp=room_${randomRoom}`);
                          }}
                          className="w-full py-2 bg-[#00ff66] text-black font-black text-[9px] uppercase pixel-btn-interactive border border-black shadow-[2px_2px_0_#000]"
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
                              className="flex-1 bg-black border border-black text-slate-350 px-2 py-1.5 text-[7px] font-mono focus:outline-none select-all"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                sound.playPop();
                                navigator.clipboard.writeText(generatedLink);
                                alert("Link copied to clipboard!");
                              }}
                              className="px-2 py-1.5 bg-[#00d2ff] text-black text-[8px] font-black uppercase pixel-btn-interactive border border-black"
                            >
                              Copy
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playPop();
                              setShowRoomDisclaimer(true);
                            }}
                            className="w-full py-1.5 bg-black text-slate-200 border border-black text-[9px] font-black uppercase pixel-btn-interactive"
                          >
                            ENTER ROOM
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {pvpSubMode === 'practice' && (
                <div className="bg-[#18181c] border border-black pixel-box-sm p-4 text-center space-y-3 font-mono">
                  <h3 className="font-black text-[10px] text-[#00ff66] uppercase tracking-wider">
                    [ READY TO PRACTICE ]
                  </h3>
                  <p className="text-[8px] text-slate-350 leading-relaxed font-sans max-w-xs mx-auto">
                    Practice card matches for free against AI bots. Level up your rank, learn game mechanics, and test your deck strategies.
                  </p>
                  
                  <button
                    type="button"
                    onClick={() => {
                      sound.playShuffle();
                      onStartGame('offline', 0);
                    }}
                    className="w-full py-3 bg-[#00ff66] text-black font-black text-[10px] uppercase tracking-wider pixel-btn-interactive border border-black flex items-center justify-center gap-1.5 shadow-[2px_2px_0_#000]"
                  >
                    <Play className="w-3.5 h-3.5 fill-black text-black" />
                    PLAY FOR FREE (VS BOTS)
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* WALLET CONNECT OVERLAY MODAL */}
      <AnimatePresence>
        {showConnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono select-none"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#12161a] border-4 border-black p-5 relative shadow-[6px_6px_0_#000] pixel-box-lg flex flex-col gap-4 text-center"
            >
              {/* Retro top decoration bar */}
              <div className="absolute -top-3 left-6 bg-[#00d2ff] text-black text-[7px] font-black uppercase px-2 py-0.5 border-2 border-black">
                SECURE GATEWAY
              </div>

              {/* Large pulsing TON Connect Icon */}
              <div className="mx-auto w-14 h-14 bg-slate-950 border-2 border-black flex items-center justify-center text-[#00d2ff] relative overflow-hidden shadow-[inset_0_0_10px_rgba(0,210,255,0.2)] mt-2">
                <Wallet className="w-7 h-7 text-[#00d2ff]" />
              </div>

              <div className="space-y-2">
                <h3 className="font-black text-xs min-[370px]:text-sm text-slate-100 uppercase tracking-wider">
                  Sync TON Wallet
                </h3>
                <p className="text-[9px] min-[370px]:text-[10px] text-slate-400 leading-relaxed font-sans max-w-xs mx-auto">
                  To participate in PVP battles with ticket stakes, buy ticket packs, and compete in tournaments, you need to connect your TON wallet.
                </p>
              </div>

              {/* Benefit list */}
              <div className="bg-slate-950 p-3 border border-black text-left text-[8px] min-[370px]:text-[9px] space-y-2 text-slate-300">
                <div className="flex gap-2 items-start">
                  <span className="text-[#00ff66]">✓</span>
                  <span>Access PVP Arena with stakes from 1 to 50 tickets.</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-[#00ff66]">✓</span>
                  <span>Instant deposits and secure payout distribution.</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-[#00ff66]">✓</span>
                  <span>Zero passwords needed. Sign transactions directly.</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleActualConnect}
                  className="w-full py-2.5 bg-[#00ff66] hover:bg-[#00e55b] text-black font-black text-xs uppercase tracking-wider pixel-btn-interactive border-2 border-black shadow-[2px_2px_0_#000]"
                >
                  Sync with TON Connect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playPop();
                    setShowConnectModal(false);
                  }}
                  className="w-full py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 border border-black/40 pixel-btn-interactive text-[10px] font-bold uppercase font-mono"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
