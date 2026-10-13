import { BattleCardId } from './types';



export interface BattleCardAsset {

  id: BattleCardId;

  title: string;

  image: string;

  desc: string;

  tag?: string;

}



export const BATTLE_CARD_ASSETS: Record<BattleCardId, BattleCardAsset> = {

  zombi: {

    id: 'zombi',

    title: 'Zombi Kartı',

    image: '/images/battle-cards/zombi.png',

    tag: 'Oğru',

    desc: 'Zombi hədəf qala ətrafında peyda olub hücum edir. Müdafiəçilər 7 kliklə (50 üzv) dayandıra bilər; uğursuz olarsa 1500 xal oğurlanır və hücum edən ittifaqın balansına yazılır.',

  },

  yarasa: {

    id: 'yarasa',

    title: 'Yarasa Kartı',

    image: '/images/battle-cards/yarasa.png',

    tag: 'Zərər',

    desc: 'Hədəf ittifaqın oyunçu sayına uyğun zərər verir.',

  },

  duman: {

    id: 'duman',

    title: 'Duman Kartı',

    image: '/images/battle-cards/duman.png',

    tag: 'Gizlilik',

    desc: 'Bütün ittifaq fəaliyyətlərini 5 dəqiqə dumanla örtür; gizlilik və sürpriz hücum imkanı yaradır.',

  },

  mutant: {

    id: 'mutant',

    title: 'Mutant Kartı',

    image: '/images/battle-cards/barbar.png',

    tag: 'Zərərverici',

    desc: 'Mutant hədəf qala ətrafında peyda olub hücum edir. Müdafiəçilər 7 kliklə (50 üzv) dayandıra bilər; uğursuz olarsa 1500 xal zərər.',

  },

  standing: {

    id: 'standing',

    title: 'Standing Kartı',

    image: '/images/battle-cards/yarasa.png',

    tag: 'Zərərverici',

    desc: 'Standing hücumçusu hədəf qala ətrafında peyda olub hücum edir. Müdafiəçilər 5 kliklə (50 üzv) dayandıra bilər; uğursuz olarsa 1000 xal zərər.',

  },

  it: {

    id: 'it',

    title: 'İt Kartı',

    image: '/images/battle-cards/sadikIt.png',

    tag: 'Oğru',

    desc: 'Hücum iti hədəf qala ətrafında peyda olub hücum edir. Müdafiəçilər 5 kliklə (50 üzv) dayandıra bilər; uğursuz olarsa 1000 xal oğurlanır və hücum edən ittifaqın balansına yazılır.',

  },

};



export function getBattleCardAsset(id: BattleCardId): BattleCardAsset {

  return BATTLE_CARD_ASSETS[id];

}


