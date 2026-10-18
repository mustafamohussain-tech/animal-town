// Jobs: each one (except builder) needs its workplace building to exist.
export const JOBS = {
  none: { emoji: '🙂', place: null },
  builder: { emoji: '🔨', place: null },
  shopkeeper: { emoji: '🛒', place: 'shop' },
  farmer: { emoji: '🌾', place: 'farm' },
  chef: { emoji: '🍳', place: 'restaurant' },
  police: { emoji: '👮', place: 'police' },
  firefighter: { emoji: '🚒', place: 'firestation' },
  teacher: { emoji: '📚', place: 'school' },
  fisher: { emoji: '🎣', place: 'dock' },
  doctor: { emoji: '🩺', place: 'hospital' },
  imam: { emoji: '🕌', place: 'mosque' },
  professor: { emoji: '🎓', place: 'university' },
  pilot: { emoji: '🧑‍✈️', place: 'airport' },
  operator: { emoji: '🎡', place: 'amusement' },
};
export const JOB_ORDER = ['builder', 'shopkeeper', 'farmer', 'chef', 'police', 'firefighter', 'teacher', 'fisher', 'doctor', 'imam', 'professor', 'pilot', 'operator'];
