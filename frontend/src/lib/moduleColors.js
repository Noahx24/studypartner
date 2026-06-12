// Per-module accent colours from the design system: every module gets a
// stable colour used for its card accent bar, calendar dots and session
// squares. Hashing the id keeps the assignment consistent across views
// and sessions without storing anything.
export const MODULE_PALETTE = [
  { square: 'bg-[#FF8068]', bar: 'bg-[#FF8068]', progress: 'bg-[#FF8068]' }, // coral
  { square: 'bg-[#B7A4FF]', bar: 'bg-[#B7A4FF]', progress: 'bg-[#B7A4FF]' }, // violet
  { square: 'bg-[#FFC95C]', bar: 'bg-[#FFC95C]', progress: 'bg-[#FFC95C]' }, // amber
  { square: 'bg-[#7FE0B2]', bar: 'bg-[#7FE0B2]', progress: 'bg-[#7FE0B2]' }, // mint
  { square: 'bg-[#D8F26A]', bar: 'bg-[#D8F26A]', progress: 'bg-[#D8F26A]' }, // lime
];

export function moduleColor(moduleId) {
  let h = 0;
  const s = String(moduleId || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MODULE_PALETTE[h % MODULE_PALETTE.length];
}

// "ILW1501-26-S1" → "ILW1501": the part students actually say out loud.
export function moduleCode(name) {
  return String(name || '').split('-')[0];
}
