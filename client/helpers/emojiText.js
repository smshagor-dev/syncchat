const EMOJI_REPLACEMENTS = [
  [':)', '😊'],
  [':-)', '😊'],
  [':(', '😔'],
  [':-(', '😔'],
  ['<3', '❤️'],
  [':D', '😄'],
  [':-D', '😄'],
  [';)', '😉'],
  [';-)', '😉'],
  [':P', '😛'],
  [':-P', '😛'],
  [':o', '😮'],
  [':O', '😮'],
  [':|', '😐'],
];

export const replaceTextTokensWithEmoji = (value = '') => {
  let next = String(value || '');
  EMOJI_REPLACEMENTS.forEach(([token, emoji]) => {
    next = next.split(token).join(emoji);
  });
  return next;
};

