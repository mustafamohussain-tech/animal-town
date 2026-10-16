// Turns a typed command (English or Arabic) into an order.
// Examples: "@ali build hospital", "sara doctor", "@mona dance", "add @omar lion", "fire school",
//           "@ali say hello", "@ali build house for @sara", "everyone dance", "@علي ابني مستشفى"
import { ANIMAL_ORDER } from './animals.js';
import { t } from './i18n.js';
import { makeSpec } from './buildings.js';

// normalise Arabic spelling variations + lower case
export function norm(s) {
  return String(s).toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
}
const list = s => s.split(',').map(x => norm(x.trim())).filter(Boolean);

const WORDS = {
  add: list('add,new,join,joined,follow me,اضف,ضيف,اضافه,جديد,دخل'),
  say: list('say,says,tell,shout,قل,قول,يقول,قولي,قال'),
  goal: list('goal,wish,dream,هدف,هدفه,هدفها,حلم,حلمه,حلمها,امنيه,امنيته'),
  remove: list('remove,delete,kick,bye,احذف,امسح,اطرد,شيل'),
  build: list('build,construct,builds,ابني,ابن,بني,يبني,شيد,ابنوا'),
  make: list('make,create,open,set up,اعمل,سوي,افتح'),
  work: list('be,become,work,job,as,hire,يصير,صير,خليه,خلي,اشتغل,يشتغل,وظيفه,وظف,كن,يكون'),
  for: list('for,حق,عشان,لاجل'),
  go: list('go,goto,walk,visit,run,روح,اذهب,امشي,رح,زور,يروح'),
  everyone: list('everyone,all,everybody,الكل,الجميع,كلهم'),
  fire: list('fire,burn,burning,flames,حريق,نار,احترق,يحترق,احرق'),
};
const PHRASES = {
  goHome: list('go home,go to home,go to house,روح البيت,ارجع البيت,يرجع البيت,روح بيته,ارجع للبيت'),
};

const BUILDINGS = {
  police: list('police station,station police,مركز شرطه,مركز الشرطه,قسم شرطه,مخفر'),
  firestation: list('fire station,firestation,fire house,fire dept,مركز اطفاء,مطافي,دفاع مدني,الدفاع المدني,محطه اطفاء'),
  apartment: list('apartment,apartments,flats,tower,skyscraper,عماره,شقق,برج,ناطحه'),
  house: list('house,home,cottage,villa,بيت,منزل,دار,فيلا'),
  shop: list('shop,store,market,supermarket,mall,متجر,محل,دكان,سوق,بقاله,سوبرماركت'),
  farm: list('farm,field,مزرعه,حقل'),
  restaurant: list('restaurant,cafe,kitchen,pizzeria,diner,مطعم,كافيه,مقهي,كافي'),
  hospital: list('hospital,clinic,مستشفي,عياده,مستوصف'),
  school: list('school,class,classroom,مدرسه,فصل'),
  dock: list('dock,pier,pond,lake,harbor,port,بحيره,ميناء,رصيف,بركه'),
  park: list('park,playground,garden,حديقه,منتزه,ملعب'),
};
const SHOP_VARIANTS = {
  food: list('food,grocery,fruit,fruits,طعام,اكل,فواكه,خضار'),
  clothes: list('clothes,clothing,fashion,ملابس,هدوم,ازياء'),
  toys: list('toy,toys,games,العاب,لعب,العاب'),
};
const JOBWORDS = {
  builder: list('builder,constructor,بناء,عامل بناء'),
  shopkeeper: list('shopkeeper,seller,sell,cashier,merchant,vendor,salesman,بائع,بياع,تاجر,كاشير,يبيع'),
  farmer: list('farmer,farming,مزارع,فلاح'),
  chef: list('chef,cook,cooking,طباخ,شيف,يطبخ'),
  police: list('police,cop,policeman,officer,شرطي,شرطه,بوليس'),
  firefighter: list('firefighter,fireman,اطفائي,رجل اطفاء'),
  teacher: list('teacher,teach,معلم,مدرس,استاذ,معلمه'),
  fisher: list('fisher,fisherman,fish,fishing,صياد,صيد,يصيد'),
  doctor: list('doctor,nurse,doc,dr,طبيب,دكتور,ممرض,ممرضه,طبيبه'),
};
const PLACE_JOB = { shop: 'shopkeeper', farm: 'farmer', restaurant: 'chef', police: 'police', firestation: 'firefighter', school: 'teacher', dock: 'fisher', hospital: 'doctor' };
const JOB_PLACE = Object.fromEntries(Object.entries(PLACE_JOB).map(([p, j]) => [j, p]));
const ACTIONS = {
  car: list('car,cars,سياره,سيارات,سيارته'),
  dance: list('dance,dancing,party,رقص,ارقص,يرقص,ارقصي'),
  wave: list('wave,hi,hello,hey,salam,لوح,سلم,مرحبا,هاي,اهلا,سلام'),
  jump: list('jump,hop,قفز,اقفز,نط,ينط'),
  cheer: list('cheer,yay,celebrate,happy,احتفل,هتاف,فرح,افرح'),
  sit: list('sit,rest,اجلس,اقعد,قعد,يجلس'),
  sleep: list('sleep,nap,bed,tired,نام,نوم,ينام,نم,تعبان'),
  eat: list('eat,hungry,lunch,dinner,breakfast,pizza,burger,اكل,ياكل,جوعان,غدا,عشا,فطور,كلي'),
  buy: list('buy,shopping,purchase,تسوق,اشتري,شراء,يشتري,تسوق'),
  chat: list('chat,talk,speak,gossip,تكلم,دردش,سولف,حكي,يتكلم'),
  hurt: list('hurt,injured,injury,sick,ill,accident,fall,fell,مريض,مصاب,انجرح,جريح,طاح,وقع,اصابه'),
  heal: list('heal,cure,treat,عالج,اشفي,شفاء,عالجه'),
  quit: list('quit,resign,unemployed,jobless,استقال,اترك,بطال,استقيل'),
  follow: list('follow,camera,watch,focus,تابع,صور,كاميرا,ركز'),
};
const TIME_WORDS = {
  22: list('night,midnight,dark,ليل,الليل,بالليل,ليلا,منتصف الليل'),
  9: list('day,morning,daytime,نهار,النهار,صباح,الصبح,صباحا'),
  18.4: list('sunset,evening,غروب,المغرب,مساء'),
};
const CAMERA_WORDS = {
  cinema: list('cinematic,cinema,movie,film,سينمائي,سينما,فلم,فيلم'),
  plane: list('airplane,plane,sky,aerial,drone,طائره,طياره,درون'),
};
const ANIMAL_WORDS = {
  cat: list('cat,kitty,kitten,قطه,قط,بسه'), dog: list('dog,puppy,كلب'), rabbit: list('rabbit,bunny,ارنب'),
  hamster: list('hamster,هامستر'), cow: list('cow,بقره'), pig: list('pig,خنزير'), sheep: list('sheep,lamb,خروف,غنم,نعجه'),
  chicken: list('chicken,hen,دجاجه,دجاج,فرخه'), horse: list('horse,pony,حصان,فرس'), lion: list('lion,اسد'),
  tiger: list('tiger,نمر'), bear: list('bear,دب'), monkey: list('monkey,قرد'), elephant: list('elephant,فيل'),
  giraffe: list('giraffe,زرافه'), penguin: list('penguin,بطريق'), frog: list('frog,ضفدع'), panda: list('panda,باندا'),
  fox: list('fox,ثعلب'), duck: list('duck,بطه'),
};

// Arabic words often carry "ال" (the), "و" (and), "ل"/"لل" (for/to), "ب" (at) — try without them too
function variants(tok) {
  const out = new Set([tok]);
  let x = tok.replace(/^و(?=..)/, '');
  out.add(x);
  for (const p of ['وال', 'بال', 'لل', 'ال', 'ل', 'ب']) if (x.startsWith(p) && x.length > p.length + 1) out.add(x.slice(p.length));
  return [...out];
}

// find the first key whose word list matches a token (or a phrase inside the text)
function findKey(map, text, toks) {
  for (const [k, words] of Object.entries(map)) {
    for (const w of words) {
      if (w.includes(' ') ? text.includes(w) : toks.some(tv => tv.includes(w))) return k;
    }
  }
  return null;
}
const has = (words, text, toks) => words.some(w => (w.includes(' ') ? text.includes(w) : toks.some(tv => tv.includes(w))));

export function runCommand(game, raw) {
  const original = String(raw || '').trim();
  if (!original) return null;
  const text = ' ' + norm(original).replace(/[.,!?؟،:;"“”]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const words = text.trim().split(' ');
  const toks = words.map(variants);

  // who: @mentions, plain names of citizens, or "everyone"
  const mentioned = [];
  const unknownMentions = [];
  original.split(/\s+/).forEach(w => {
    if (!w.startsWith('@')) return;
    const c = game.findChar(w);
    if (c) { if (!mentioned.includes(c)) mentioned.push(c); } else unknownMentions.push(w.replace(/[.,!?؟،]+$/, ''));
  });
  for (const w of words) {
    const c = game.findChar(w);
    if (c && !mentioned.includes(c)) mentioned.push(c);
  }
  const everyone = has(WORDS.everyone, text, toks);
  let targets = everyone ? [...game.chars] : mentioned.length ? [mentioned[0]] : game.selected ? [game.selected] : [];
  const forSomeone = has(WORDS.for, text, toks);
  if (!everyone && mentioned.length > 1 && !forSomeone) targets = mentioned;
  const who = targets[0] || null;

  // 1) add a new follower: "add @sara cat"
  const animal = findKey(ANIMAL_WORDS, text, toks);
  if (has(WORDS.add, text, toks) && (unknownMentions.length || animal)) {
    const isKeyword = w => { const n = norm(w), v = [variants(n)], tx = ' ' + n + ' '; return !!findKey(ANIMAL_WORDS, tx, v) || has(WORDS.add, tx, v); };
    const name = unknownMentions[0] || original.split(/\s+/).find(w => !isKeyword(w));
    const pickAnimal = animal || ANIMAL_ORDER[Math.floor(Math.random() * ANIMAL_ORDER.length)];
    const r = game.addCharacter({ name, animal: pickAnimal });
    return r.error ? game.log(r.error) : t('joined', { name: r.name });
  }

  // 2) say something: everything after "say"
  const sayIdx = words.findIndex(w => WORDS.say.includes(w));
  if (sayIdx >= 0) {
    // only the words before "say" decide who speaks; the rest is the message
    const parts = original.split(/\s+/);
    const before = words.slice(0, sayIdx);
    const speakers = has(WORDS.everyone, ' ' + before.join(' ') + ' ', before.map(variants)) ? [...game.chars]
      : parts.slice(0, sayIdx).map(w => game.findChar(w)).filter(Boolean);
    if (!speakers.length && game.selected) speakers.push(game.selected);
    if (!speakers.length) return game.log(t('notFound'));
    const msg = parts.slice(sayIdx + 1).join(' ').trim() || '👋';
    return speakers.map(c => game.sayText(c, msg)).pop();
  }

  // 2b) goal: "@ali goal open a pizza shop" / "@علي هدفه يفتح مطعم بيتزا"
  const goalIdx = words.findIndex(w => variants(w).some(x => WORDS.goal.includes(x)));
  if (goalIdx >= 0) {
    const parts = original.split(/\s+/);
    const c = parts.slice(0, goalIdx).map(w => game.findChar(w)).find(Boolean) || game.selected;
    if (!c) return game.log(t('notFound'));
    const goal = c.addGoal(parts.slice(goalIdx + 1).join(' '));
    if (!goal) return game.log(t('unknown'));
    game.emit('change');
    return game.log(t('goalSet', { name: c.name, goal: goal.text }));
  }

  // 3) remove
  if (has(WORDS.remove, text, toks) && who && !everyone) {
    game.removeCharacter(who);
    return t('removed', { name: who.name });
  }

  // camera: "cinematic @ali", "airplane view"
  const cam = findKey(CAMERA_WORDS, text, toks);
  if (cam === 'plane') { game.director.setMode('plane'); return game.log('✈️'); }
  if (cam === 'cinema') {
    if (!who) return game.log(t('notFound'));
    game.cinematic(who);
    return game.log(t('cinemaOn', { name: who.name }));
  }

  // number of floors: "3 floors", "٣ طوابق", "طابقين"
  const digits = text.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const fm = digits.match(/(\d+)\s*(floors?|stor(?:e)?y|stories|levels?|طابق|طوابق|ادوار|دور)/) || digits.match(/(?:floors?|طابق|طوابق|ادوار)\s*(\d+)/);
  const floors = fm ? +fm[1] : /طابقين|دورين/.test(text) ? 2 : undefined;

  // what is being talked about
  const building = findKey(BUILDINGS, text, toks);
  const variant = building === 'shop' ? findKey(SHOP_VARIANTS, text, toks) || 'food' : undefined;
  // "police station" / "fire station" should not also count as the police / fire jobs
  const withoutPlaces = building === 'police' || building === 'firestation' ? text.replace(/police|fire|شرطه|اطفاء|مطافي/g, ' ') : text;
  const job = findKey(JOBWORDS, withoutPlaces, withoutPlaces.trim().split(' ').map(variants));
  const action = findKey(ACTIONS, text, toks);
  const strongBuild = has(WORDS.build, text, toks);
  const isBuild = strongBuild || has(WORDS.make, text, toks);
  const isWork = has(WORDS.work, text, toks);
  const isFire = has(WORDS.fire, withoutPlaces, withoutPlaces.trim().split(' ').map(variants)) && !job;

  // 4) fire event: "fire school" / "حريق مدرسه"
  if (isFire && !isBuild) {
    const b = building ? game.town.nearest(building, { x: 0, z: 0 }, { variant }) : null;
    return game.startFire(b || undefined);
  }

  // 5) go home
  if (PHRASES.goHome.some(p => text.includes(p))) {
    if (!who) return game.log(t('notFound'));
    return targets.map(c => game.doAction(c, 'home')).pop();
  }

  // 6) build: "@ali build hospital", "build police" (→ police station), "@ali build house for @sara"
  if ((isBuild && building) || (strongBuild && job && JOB_PLACE[job])) {
    const type = building || JOB_PLACE[job];
    const owner = mentioned.length > 1 && forSomeone ? mentioned[1] : null;
    return game.orderBuild(mentioned[0] || game.selected || null, makeSpec(type, { variant, floors }), owner);
  }

  // 7) job: "@sara doctor", "make @ali a chef", "@ali work in the shop"
  const jobFromPlace = isWork && building && PLACE_JOB[building];
  if (job || jobFromPlace) {
    if (!targets.length) return game.log(t('notFound'));
    return targets.map(c => game.assignJob(c, job || jobFromPlace)).pop();
  }

  // 8) actions: dance, eat, sleep, buy, go to <building>…
  if (action || (has(WORDS.go, text, toks) && building)) {
    if (!targets.length) return game.log(t('notFound'));
    if (action === 'follow') { game.select(who, true); return game.log(t('following', { name: who.name })); }
    const a = action || 'goto';
    if (a === 'buy' || a === 'goto') return targets.map(c => game.doAction(c, a, { type: building || 'shop', variant })).pop();
    return targets.map(c => game.doAction(c, a)).pop();
  }

  // 9) just a building name: build it
  if (building) return game.orderBuild(who, makeSpec(building, { variant, floors }), null);

  // 10) time of day: "night", "ليل"
  const hour = findKey(TIME_WORDS, text, toks);
  if (hour) { game.setHour(+hour); return game.log(t('timeSet', { t: game.daynight.clockText })); }

  return game.log(t('unknown'));
}
