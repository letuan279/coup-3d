import type { DictPair } from './index';

/** In-world labels / speech bubbles (owned by client/src/scene). */
export const scene: DictPair = {
  vi: {
    'scene.bubble.claim': '{char} — {action}!',
    'scene.bubble.claimTarget': '{char} — {action} ➜ {target}!',
    'scene.bubble.action': '{action}!',
    'scene.bubble.actionTarget': '{action} ➜ {target}!',
    'scene.bubble.challenge': 'Thách thức!',
    'scene.bubble.block': 'Chặn bằng {char}!',
    'scene.bubble.proven': 'Có {char} thật nhé!',
    'scene.bubble.caught': 'Bắt quả tang!',
    'scene.bubble.lost': 'Ối!',
    'scene.bubble.eliminated': 'Thua rồi…',
    'scene.bubble.timeout': 'Hết giờ…',
    'scene.bubble.win': 'Thắng rồi!',
    'scene.bubble.blocked': 'Hừm…',
    'scene.bubble.exchange': 'Đổi bài nào…',

    'scene.plate.pickTarget': 'Chọn',
    'scene.plate.wins': '{n} thắng',
    'scene.plate.cards': '{n} lá úp',

    'scene.perf.fps': 'FPS',
    'scene.perf.calls': 'Lệnh vẽ',
    'scene.perf.tris': 'Tam giác',
  },
  en: {
    'scene.bubble.claim': '{char} — {action}!',
    'scene.bubble.claimTarget': '{char} — {action} ➜ {target}!',
    'scene.bubble.action': '{action}!',
    'scene.bubble.actionTarget': '{action} ➜ {target}!',
    'scene.bubble.challenge': 'I challenge!',
    'scene.bubble.block': 'Blocked with {char}!',
    'scene.bubble.proven': 'Real {char}, see?',
    'scene.bubble.caught': 'Caught you!',
    'scene.bubble.lost': 'Ouch!',
    'scene.bubble.eliminated': "I'm out…",
    'scene.bubble.timeout': 'Out of time…',
    'scene.bubble.win': 'I win!',
    'scene.bubble.blocked': 'Hmph…',
    'scene.bubble.exchange': "Let's swap…",

    'scene.plate.pickTarget': 'Pick',
    'scene.plate.wins': '{n} wins',
    'scene.plate.cards': '{n} hidden',

    'scene.perf.fps': 'FPS',
    'scene.perf.calls': 'Draw calls',
    'scene.perf.tris': 'Triangles',
  },
};
