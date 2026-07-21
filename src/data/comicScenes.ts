import angryBadgerBalcony from '../../FOR AI/WEBSITE/Angry_badger_on_stone_balcony_202607191329.jpeg';
import angryBadgerHallway from '../../FOR AI/WEBSITE/Angry_badger_walking_dark_hallway_202607191329.jpeg';
import angryBadgerWindow from '../../FOR AI/WEBSITE/Angry_pixel_art_badger_window_202607191329.jpeg';
import blueGirlWindow from '../../FOR AI/WEBSITE/Blue-haired_girl_behind_window_202607191329.jpeg';
import blueGirlThrone from '../../FOR AI/WEBSITE/Blue-haired_girl_on_throne_202607191329.jpeg';
import blueGirlForest from '../../FOR AI/WEBSITE/Blue-haired_girl_walking_forest_202607191329.jpeg';
import cyclopsPier from '../../FOR AI/WEBSITE/Cyclops_plush_sitting_on_pier_202607191329.jpeg';
import cyclopsFloor from '../../FOR AI/WEBSITE/Cyclops_sitting_on_stone_floor_202607191329.jpeg';
import pepeWindow from '../../FOR AI/WEBSITE/Pepe_behind_rainy_window_202607191329.jpeg';
import pepeHeart from '../../FOR AI/WEBSITE/Pepe_frog_holding_pink_heart_202607191329.jpeg';
import charactersChamber from '../../FOR AI/WEBSITE/Pixel_art_characters_in_chamber_202607191329.jpeg';
import girlHallway from '../../FOR AI/WEBSITE/Pixel_art_girl_in_hallway_202607191329.jpeg';
import type { ComicSceneConfig } from '../types/comic';

export const TELEGRAM_APP_URL =
  'https://t.me/redo_appbot/app?startapp=ref_KNVPOU';

export const comicScenes: ComicSceneConfig[] = [
  {
    id: 'before-the-first-move',
    chapter: '01',
    eyebrow: 'BEFORE THE FIRST MOVE',
    title: 'Four windows. One table waiting.',
    description:
      'Every player arrives with a story. Scroll down to bring these four into the same match.',
    scrollVh: 285,
    mobileScrollVh: 280,
    layout: 'center',
    motionPreset: 'rain-windows',
    images: [
      {
        src: blueGirlWindow,
        alt: 'A blue-haired girl waits behind a rain-covered window.',
        objectPosition: '50% 48%',
      },
      {
        src: angryBadgerWindow,
        alt: 'A determined badger looks through a rain-covered window.',
        objectPosition: '50% 45%',
      },
      {
        src: pepeWindow,
        alt: 'A hooded frog holds a glowing pink heart behind a rainy window.',
        objectPosition: '50% 48%',
      },
    ],
    bubbles: [
      { text: 'Who starts?', tone: 'speech', x: 59, y: 38, mobileX: 28, mobileY: 43, rotate: -2 },
      { text: 'I am ready.', tone: 'shout', x: 76, y: 28, mobileX: 68, mobileY: 55, rotate: 2 },
      {
        text: 'Room for one more?',
        tone: 'reaction',
        x: 72,
        y: 67,
        mobileX: 56,
        mobileY: 68,
        rotate: -1,
      },
    ],
    soundEffects: [
      { text: 'TAP…', tone: 'cyan', x: 20, y: 73, mobileX: 23, mobileY: 78, rotate: -8 },
      { text: 'REDO', tone: 'red', x: 78, y: 76, mobileX: 72, mobileY: 82, rotate: 4 },
    ],
  },
  {
    id: 'everyone-walks-in-alone',
    chapter: '02',
    eyebrow: 'THE FIRST STEP',
    title: 'Everyone walks in alone.',
    description:
      'Practice without a wallet. Learn the rhythm against bots before the next door opens.',
    scrollVh: 300,
    mobileScrollVh: 295,
    layout: 'right',
    motionPreset: 'hallway-split',
    images: [
      {
        src: girlHallway,
        alt: 'A blue-haired girl stands in a vast stone hallway lined with carved faces.',
        objectPosition: '50% 50%',
      },
      {
        src: angryBadgerHallway,
        alt: 'A badger walks through a dark stone hallway lit by a torch.',
        objectPosition: '50% 54%',
      },
      {
        src: cyclopsFloor,
        alt: 'A small hooded figure sits alone on the floor of a ruined stone chamber.',
        objectPosition: '50% 52%',
      },
    ],
    bubbles: [
      { text: 'Which way?', tone: 'speech', x: 58, y: 35, mobileX: 28, mobileY: 43, rotate: -2 },
      {
        text: 'Still looking for a rival.',
        tone: 'shout',
        x: 75,
        y: 33,
        mobileX: 56,
        mobileY: 27,
        rotate: 2,
      },
      { text: 'Not alone again.', tone: 'thought', x: 57, y: 70, mobileX: 28, mobileY: 70 },
    ],
    soundEffects: [
      { text: 'STEP', tone: 'yellow', x: 70, y: 78, mobileX: 70, mobileY: 80, rotate: 6 },
      { text: 'ECHO…', tone: 'white', x: 19, y: 82, mobileX: 13, mobileY: 86, rotate: -4 },
    ],
  },
  {
    id: 'choose-your-way-in',
    chapter: '03',
    eyebrow: 'CHOOSE YOUR WAY IN',
    title: 'One path. Three ways to play.',
    description:
      'Start in offline practice, enter public PVP, or create a private room for friends.',
    scrollVh: 275,
    mobileScrollVh: 285,
    layout: 'left',
    motionPreset: 'center-iris',
    images: [
      {
        src: blueGirlForest,
        alt: 'The blue-haired girl walks along a misty forest path toward a white light.',
        objectPosition: '50% 52%',
      },
      {
        src: cyclopsPier,
        alt: 'A one-eyed character sits on a night pier beside a small blue light.',
        objectPosition: '50% 56%',
      },
    ],
    facts: [
      { label: 'PRACTICE', text: 'Offline play against bots. No wallet required.' },
      { label: 'PUBLIC PVP', text: 'Queue for a table with 2, 3, or 4 players.' },
      { label: 'PRIVATE ROOM', text: 'Invite friends with a code or Telegram link.' },
    ],
    bubbles: [
      {
        text: 'First, learn the moves.',
        tone: 'speech',
        x: 27,
        y: 34,
        mobileX: 17,
        mobileY: 31,
        rotate: -2,
      },
      {
        text: 'Then bring your crew.',
        tone: 'reaction',
        x: 42,
        y: 67,
        mobileX: 54,
        mobileY: 69,
        rotate: 2,
      },
    ],
    soundEffects: [
      { text: 'CHOOSE', tone: 'cyan', x: 75, y: 29, mobileX: 65, mobileY: 24, rotate: 4 },
      { text: 'GO!', tone: 'yellow', x: 22, y: 77, mobileX: 17, mobileY: 81, rotate: -6 },
    ],
  },
  {
    id: 'attitude-hits-the-table',
    chapter: '04',
    eyebrow: 'THE CHALLENGE',
    title: 'Attitude hits the table first.',
    description:
      'Play free or choose a supported TKT stake. Every format supports two, three, or four players.',
    scrollVh: 305,
    mobileScrollVh: 300,
    layout: 'right',
    motionPreset: 'rivalry',
    images: [
      {
        src: angryBadgerBalcony,
        alt: 'A hooded badger issues a challenge from a moonlit stone balcony.',
        objectPosition: '55% 48%',
      },
      {
        src: blueGirlThrone,
        alt: 'The blue-haired girl sits calmly on a ruined stone throne.',
        objectPosition: '50% 48%',
      },
      {
        src: pepeHeart,
        alt: 'A hooded frog holds a pink heart beneath a red moon among dark roses.',
        objectPosition: '50% 48%',
      },
    ],
    facts: [
      { label: 'PLAYERS', text: '2 · 3 · 4' },
      { label: 'TKT STAKES', text: '0 · 0.3 · 0.5 · 1 · 5 · 10 · 30' },
    ],
    bubbles: [
      { text: 'This round is mine.', tone: 'shout', x: 74, y: 28, mobileX: 48, mobileY: 26, rotate: 3 },
      { text: 'Wait for your turn.', tone: 'speech', x: 58, y: 43, mobileX: 28, mobileY: 48, rotate: -2 },
      { text: 'I do not pass.', tone: 'reaction', x: 72, y: 69, mobileX: 56, mobileY: 69, rotate: 1 },
    ],
    soundEffects: [
      { text: 'READY?', tone: 'red', x: 23, y: 76, mobileX: 14, mobileY: 79, rotate: -7 },
      { text: 'SHUFFLE', tone: 'yellow', x: 72, y: 82, mobileX: 56, mobileY: 85, rotate: 5 },
    ],
  },
  {
    id: 'redo-impact',
    chapter: '05',
    eyebrow: 'THE TABLE',
    title: 'The separate paths meet.',
    description:
      'Two rivals stand in the same chamber. From here, every move belongs to the match.',
    scrollVh: 320,
    mobileScrollVh: 315,
    layout: 'center',
    motionPreset: 'impact',
    impact: true,
    images: [
      {
        src: girlHallway,
        alt: 'The girl approaches through the long stone hallway.',
        objectPosition: '50% 50%',
      },
      {
        src: angryBadgerHallway,
        alt: 'The badger approaches through a parallel dark hallway.',
        objectPosition: '50% 54%',
      },
      {
        src: charactersChamber,
        alt: 'The girl and the badger finally stand together in a vast chamber, casting long shadows.',
        objectPosition: '50% 55%',
      },
    ],
    bubbles: [
      { text: 'Your move.', tone: 'speech', x: 58, y: 36, mobileX: 28, mobileY: 44, rotate: -2 },
      { text: 'On it.', tone: 'shout', x: 71, y: 35, mobileX: 59, mobileY: 28, rotate: 2 },
      {
        text: 'Last card!',
        tone: 'shout',
        x: 72,
        y: 68,
        mobileX: 54,
        mobileY: 66,
        rotate: -3,
      },
    ],
    soundEffects: [
      { text: 'WHOOSH!', tone: 'cyan', x: 22, y: 73, mobileX: 14, mobileY: 75, rotate: -8 },
      { text: 'REDO!', tone: 'red', x: 50, y: 50, mobileX: 50, mobileY: 51, rotate: -4 },
      { text: 'POW!', tone: 'yellow', x: 78, y: 79, mobileX: 68, mobileY: 82, rotate: 8 },
    ],
  },
  {
    id: 'the-crew-stays',
    chapter: '06',
    eyebrow: 'AFTER THE ROUND',
    title: 'The round ends. The crew stays.',
    description:
      'Create a private room, share the Telegram link, and bring everyone back for another match.',
    scrollVh: 290,
    mobileScrollVh: 290,
    layout: 'left',
    motionPreset: 'connection',
    images: [
      {
        src: cyclopsPier,
        alt: 'The one-eyed character sits quietly on the glowing night pier.',
        objectPosition: '50% 55%',
      },
      {
        src: pepeHeart,
        alt: 'The frog carries a bright pink heart through a field of dark roses.',
        objectPosition: '50% 48%',
      },
      {
        src: blueGirlWindow,
        alt: 'The girl returns to the rainy window, ready to join.',
        objectPosition: '50% 48%',
      },
      {
        src: pepeWindow,
        alt: 'The frog waits at the rainy window with the glowing heart.',
        objectPosition: '50% 48%',
      },
    ],
    facts: [
      { label: 'KEEP MOVING', text: 'Quests, XP, energy, and referral progress live inside the Mini App.' },
    ],
    bubbles: [
      { text: 'One more?', tone: 'speech', x: 27, y: 38, mobileX: 28, mobileY: 44, rotate: -2 },
      { text: 'Send the link.', tone: 'reaction', x: 42, y: 56, mobileX: 55, mobileY: 56, rotate: 2 },
      { text: 'I am in.', tone: 'system', x: 39, y: 72, mobileX: 56, mobileY: 71 },
    ],
    soundEffects: [
      { text: 'PING!', tone: 'pink', x: 23, y: 77, mobileX: 17, mobileY: 80, rotate: -5 },
      { text: 'JOIN!', tone: 'cyan', x: 74, y: 79, mobileX: 64, mobileY: 83, rotate: 5 },
    ],
  },
  {
    id: 'your-next-move',
    chapter: '07',
    eyebrow: 'YOUR NEXT MOVE',
    title: 'The next match starts here.',
    description:
      'Practice without a wallet. Queue for public PVP. Or bring friends into a private room.',
    scrollVh: 285,
    mobileScrollVh: 300,
    layout: 'finale',
    motionPreset: 'finale',
    finale: true,
    images: [
      {
        src: blueGirlForest,
        alt: 'A forest path opens toward a bright destination.',
        objectPosition: '50% 52%',
      },
      {
        src: charactersChamber,
        alt: 'Two Redoapp characters stand together in the stone chamber.',
        objectPosition: '50% 55%',
      },
      {
        src: '/banner.png',
        alt: 'The four Redoapp characters sit together between blue and red card motifs.',
        objectPosition: '50% 50%',
        mobileObjectPosition: '50% 50%',
      },
    ],
    bubbles: [
      { text: 'Your move.', tone: 'speech', x: 76, y: 36, mobileX: 56, mobileY: 35, rotate: 2 },
    ],
    soundEffects: [
      { text: 'GO!', tone: 'yellow', x: 51, y: 68, mobileX: 76, mobileY: 66, rotate: -7 },
    ],
  },
];
