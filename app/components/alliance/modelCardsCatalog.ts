export interface ModelCardDef {
  id: string;
  folder: string;
  imageFolder: string;
  imageFile: string;
  title: string;
  emoji: string;
  accent: string;
  info: string;
}

const XP_2_100 =
  '100 xal XP zərər vurur. Zərər istifadəçi sayına uyğun hesablanır: 50 nəfərlik ittifaqda 100 xal, 5 nəfərlik ittifaqda 10 xal. Hər istifadəçiyə 2 xal düşür.';
const XP_10_500 =
  '500 xal XP zərər vurur. Zərər istifadəçi sayına uyğun hesablanır: 50 nəfərlik ittifaqda 500 xal, 5 nəfərlik ittifaqda 50 xal. Hər istifadəçiyə 10 xal düşür.';
const XP_4_200 =
  '200 xal XP zərər vurur. Zərər istifadəçi sayına uyğun hesablanır: 50 nəfərlik ittifaqda 200 xal, 5 nəfərlik ittifaqda 20 xal. Hər istifadəçiyə 4 xal düşür.';

/** public/models: `karti` = info, `kartı` = şəkil. Yalnız bu 13 kart göstərilir. */
export const MODEL_CARD_DEFS: ModelCardDef[] = [
  {
    id: '2x',
    folder: '2X karti',
    imageFolder: '2X kartı',
    imageFile: '2x kartı.jpeg',
    title: '2X Kartı',
    emoji: '✖️',
    accent: '#f59e0b',
    info: `2X Kartı\nBu kart istifadə olunduğu zaman qazanılan xalların miqdarını iki dəfə (2x) artırmaq üçün nəzərdə tutulub.\nDamage vurmaz — 0 xal XP zərər. Digər kartın təsirini 2 dəfə artırır.`,
  },
  {
    id: 'casus',
    folder: 'casus karti',
    imageFolder: 'casus kartı',
    imageFile: 'casus kartı.jpeg',
    title: 'Cəsus Kartı',
    emoji: '🕵️',
    accent: '#64748b',
    info: `Cəsus Kartı\nBu kart rəqib ittifaq barədə kəşfiyyat aparmaq üçün nəzərdə tutulub.\n🕵️‍♂️ Əsas Təsir: Atıldığı zaman rəqib ittifaqın onlayn istifadəçilərini göstərir. Döyüş zamanı isə rəqibin seçdiyi 5 kartdan 3 dənəsini görməyə imkan verir. (Qeyd: Duman kartı istisnadır, cəsus kartı onu heç bir halda görə bilməz).\n${XP_2_100}`,
  },
  {
    id: 'duman',
    folder: 'duman karti',
    imageFolder: 'duman kartı',
    imageFile: 'duman kartı.jpeg',
    title: 'Duman Kartı',
    emoji: '🌫️',
    accent: '#94a3b8',
    info: `Duman Kartı\nBu kart özündən sonra atılan istənilən növbəti kartı dumanla örtərək gizlətmək üçün nəzərdə tutulub.\n🌫️ Əsas Təsir: Atıldıqdan sonra növbəti kartı gizlədir və rəqib həmin kartın nə olduğunu görə bilmir. Əgər gizlədilən kart klik tələb edən və rəqib ittifaqa bildiriş göndərilməli olan bir kartdırsa, duman səbəbindən hədəf ittifaqa heç bir bildiriş getmir.\n${XP_2_100}`,
  },
  {
    id: 'guzgu',
    folder: 'Güzgə karti',
    imageFolder: 'Güzgü kartı',
    imageFile: 'güzgü.jpeg',
    title: 'Güzgü Kartı',
    emoji: '🪞',
    accent: '#67e8f9',
    info: `Güzgü Kartı (Əks-Etdirmə)\nBu kart rəqib tərəfindən sənə tətbiq edilən hücum kartını tamamilə əksinə çevirərək sahibinə üstünlük qazandıran unikal əks-hücum mexanizmidir.\n✨ Əsas Təsir: Rəqibin sənə atdığı kartın təsiri (məsələn, xal oğurluğu və ya zərər) güzgü effekti ilə geri qaytarılır. Rəqib sənə ziyan vurmaq əvəzinə, həmin təsirin əksini özü yaşayır.\n${XP_2_100}\n💡 Qeyd: Xalların ittifaqdakı istifadəçi sayına uyğun olaraq hesablanması kiçik klanların böyük klanlar qarşısında əzilməməsi üçündür. Mexanika tam ədalətli balans üzərində qurulub.`,
  },
  {
    id: 'joker',
    folder: 'Joker karti',
    imageFolder: 'Joker kartı',
    imageFile: 'Joker.jpeg',
    title: 'Joker Kartı',
    emoji: '🃏',
    accent: '#a855f7',
    info: `Joker Kartı\nBu kart oyundakı istənilən digər kartı təqlid etmək və onun funksiyalarını yerinə yetirmək üçün nəzərdə tutulub. Atıldığı zaman təsadüfi bir kartın rolunu üzərinə götürür.\n${XP_2_100}`,
  },
  {
    id: 'ogru',
    folder: 'ogru karti',
    imageFolder: 'oğru kartı',
    imageFile: 'oğru kartı.jpeg',
    title: 'Oğru Kartı',
    emoji: '🥷',
    accent: '#334155',
    info: `Oğru Kartı\nBu kart rəqib ittifaqdan xal oğurlamaq üçün nəzərdə tutulub.\n${XP_10_500}`,
  },
  {
    id: 'qaya',
    folder: 'qaya (das karti)',
    imageFolder: 'qaya (daş kartı)',
    imageFile: 'qaya (daş adam) kartı.jpeg',
    title: 'Qaya Kartı',
    emoji: '🪨',
    accent: '#78716c',
    info: `Qaya (Daş Adam) Kartı\nBu kart rəqibin sonuncu atdığı kartın funksiyalarını bloklamaq və əngəlləmək üçün nəzərdə tutulub (xüsusilə 2X və Güzgü kimi kartlara qarşı çox effektivdir).\n${XP_2_100}`,
  },
  {
    id: 'qul',
    folder: 'qul eden karti (zəncirlənmə)',
    imageFolder: 'qul eden kartı (zəncirlənmə)',
    imageFile: 'qul edən kartı (zəncirlənmə kartı).jpeg',
    title: 'Qul Edən Kartı',
    emoji: '⛓️',
    accent: '#b45309',
    info: 'Qul Edən Kartı (Zəncirlənmə)\nBu kart düşmən ittifaqa atıldıqda hədəf tərəfə xüsusi bildiriş göndərilir. Əgər kartın təsiri vaxtında dayandırılmazsa, ittifaq ağır bədəl ödəyir.\nDamage vurmaz — 0 xal XP zərər. Əsas təsiri rəqibin son 1 saatdakı ən yüksək 10 dəqiqəlik xal göstəricisini əldə etməkdir.\nMüdafiə və Klik Mexanizmi:\nKartın təsirini ləğv etmək və xal itkisinin qarşısını almaq üçün ittifaq üzvləri vaxtında klikləməlidirlər:\nBöyük klanlar: 7 klik\nOrta klanlar: 5 klik\nKiçik klanlar: 3 klik\n💡 Qeyd: Xalların və tələb olunan klik sayının ittifaqdakı istifadəçi sayına uyğun tənzimlənməsi kiçik klanların böyük klanlar qarşısında əzilməməsi üçündür. Mexanika tam ədalətli balans üzərində qurulub.',
  },
  {
    id: 'qutb',
    folder: 'qütblərin seçimi karti (od və buz)',
    imageFolder: 'qütblərin seçimi kartı (od və buz)',
    imageFile: 'qütblərin seçimi (od və buz).jpeg',
    title: 'Qütblərin Seçimi',
    emoji: '🔥',
    accent: '#ef4444',
    info: `Qütblərin Seçimi (Od və Buz)\nBu kartı düşmən ittifaqa atarkən iki təsir yolundan birini seçməlisən:\n❄️ Buz: Hücum olunan ittifaqın xal qazanması 10 dəqiqə müddətinə dondurulur. ${XP_10_500}\n🔥 Yanğın: ${XP_10_500}\nYanğını Söndürmə Mexanizmi:\nYanğının qarşısını almaq üçün üzvlər vaxtında klikləməlidirlər:\nBöyük klanlar: 7 klik\nOrta klanlar: 5 klik\nKiçik klanlar: 3 klik\n💡 Qeyd: Xalların və tələb olunan klik sayının ittifaqdakı istifadəçi sayına uyğun tənzimlənməsi kiçik klanların böyük klanlar qarşısında əzilməməsi üçündür. Mexanika tam ədalətli balans üzərində qurulub.`,
  },
  {
    id: 'sehrbaz',
    folder: 'sehrbaz karti',
    imageFolder: 'sehrbaz kartı',
    imageFile: 'sehrbaz kartı.jpeg',
    title: 'Sehrbaz Kartı',
    emoji: '🧙',
    accent: '#6366f1',
    info: `Sehrbaz / Cadugər\nBu kart rəqib tərəfin əlindəki 5 kartdan birini təsadüfi olaraq başqa bir kartla dəyişdirmək üçün nəzərdə tutulub.\n${XP_2_100}`,
  },
  {
    id: 'tikanli',
    folder: 'tikanli məftil karti',
    imageFolder: 'tikanlı məftil kartı',
    imageFile: 'tikanlı məftil kartı.jpeg',
    title: 'Tikanlı Məftil',
    emoji: '🪢',
    accent: '#ca8a04',
    info: 'Tikanlı Məftil Kartı\nDamage vurmaz — 0 xal XP zərər. Əsas təsiri rəqibi istifadə etdiyi kartı yenidən oynamağa məcbur etməkdir.',
  },
  {
    id: 'felaket',
    folder: 'Təbii fəlakətlər karti',
    imageFolder: 'Təbii fəlakətlər kartı',
    imageFile: 'təbii fəlakətlər.jpeg',
    title: 'Təbii Fəlakətlər',
    emoji: '🌊',
    accent: '#0ea5e9',
    info: `Təbii Fəlakətlər: Zəlzələ və Tsunami\nBu kartı düşmən ittifaqa atarkən iki fəlakət növündən birini seçməlisən:\n⚡ Zəlzələ: 10 saniyə ərzində kliklənib söndürülməzsə, hədəf ittifaqa ziyan vurur. ${XP_10_500}\n🌊 Tsunami: 5 saniyə ərzində kliklənib söndürülməzsə, hədəf ittifaqa ziyan vurur. ${XP_4_200}\nMüdafiə və Klik Mexanizmi:\nFəlakətlərin qarşısını almaq üçün ittifaq üzvləri vaxtında klikləməlidirlər:\nBöyük klanlar: 7 klik\nOrta klanlar: 5 klik\nKiçik klanlar: 3 klik\n💡 Qeyd: Ziyanın miqdarı və tələb olunan klik sayının ittifaqdakı istifadəçi sayına uyğun tənzimlənməsi kiçik klanların böyük klanlar qarşısında əzilməməsi üçündür. Mexanika tam ədalətli balans üzərində qurulub.`,
  },
  {
    id: 'usyan',
    folder: 'üsyan karti',
    imageFolder: 'üsyan kartı',
    imageFile: 'üsyan kartı.jpeg',
    title: 'Üsyan Kartı',
    emoji: '⚔️',
    accent: '#dc2626',
    info: 'Üsyan Kartı (Əks-Hücum)\nBu kart düşmən tərəfindən atılan "Qul edən" kartına qarşı öz ittifaqının içində qaldırılan üsyan və qisas mexanizmidir. Kart düşmənə deyil, birbaşa öz ittifaqına tətbiq edilir.\nDamage vurmaz — 0 xal XP zərər. Qul edən kartına qarşı istifadə olunur və uğurlu olduqda onun təsirini 2 dəfə artırır.\nMüdafiə və Klik Mexanizmi (İkiqat Çətinlik):\nÜsyanı uğurla başa çatdırmaq və dəstəkləmək üçün ittifaq üzvləri normal tələbdən iki dəfə çox klikləməlidirlər:\nBöyük klanlar: 14 klik\nOrta klanlar: 10 klik\nKiçik klanlar: 6 klik\n💡 Qeyd: Xalların və tələb olunan klik sayının ittifaqdakı istifadəçi sayına uyğun tənzimlənməsi kiçik klanların böyük klanlar qarşısında əzilməməsi üçündür. Mexanika tam ədalətli balans üzərində qurulub.',
  },
];

export const MODEL_CARD_COUNT = MODEL_CARD_DEFS.length;

export function modelCardPublicUrl(folder: string, file: string): string {
  const encodedFolder = folder.split('/').map(encodeURIComponent).join('/');
  return `/models/${encodedFolder}/${encodeURIComponent(file)}`;
}

export function modelCardImageUrl(def: ModelCardDef): string {
  return modelCardPublicUrl(def.imageFolder, def.imageFile);
}

export function modelCardInfoUrls(def: ModelCardDef): string[] {
  return [
    modelCardPublicUrl(def.folder, 'info.json'),
    modelCardPublicUrl(def.folder, 'info.js'),
    modelCardPublicUrl(def.imageFolder, 'info.json'),
    modelCardPublicUrl(def.imageFolder, 'info.js'),
  ];
}

export interface ParsedModelCardInfo {
  title?: string;
  body: string;
  image?: string;
}

export function parseModelCardInfo(raw: string): ParsedModelCardInfo {
  let text = raw.replace(/^\uFEFF/, '').trim();
  if (text.startsWith('{}')) text = text.slice(2).trim();
  if (!text || text === '{}') return { body: '' };

  try {
    const json = JSON.parse(text) as unknown;
    if (typeof json === 'string') return { body: json.trim() };
    if (json && typeof json === 'object') {
      const rec = json as Record<string, unknown>;
      const body = [rec.desc, rec.info, rec.text, rec.description, rec.body]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .find(Boolean) ?? '';
      return {
        title: typeof rec.title === 'string' ? rec.title.trim() : undefined,
        body,
        image: typeof rec.image === 'string' ? rec.image.trim() : undefined,
      };
    }
  } catch {
    /* plain text info.json */
  }

  const firstLine = text.split(/\r?\n/, 1)[0]?.trim();
  return { title: firstLine, body: text };
}
