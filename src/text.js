const tokens = (t) => t.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'-]*/gu) || [];

// Learn vocabulary only. An edit is not evidence for a permanent substitution.
export function correctedVocabulary(before, after, dictionary) {
  const known = new Set([...tokens(before), ...dictionary.map((d) => d.word)].map((w) => w.toLowerCase()));
  return tokens(after).filter((word) => {
    if (word.length < 2 || known.has(word.toLowerCase())) return false;
    known.add(word.toLowerCase());
    return true;
  });
}

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function replacePhrase(text, phrase, value, punctuation = false) {
  const re = new RegExp("(^|[^\\p{L}\\p{M}\\p{N}_])" + escapeRe(phrase) + "(?=$|[^\\p{L}\\p{M}\\p{N}_])" + (punctuation ? "[.,!?]?" : ""), "giu");
  return text.replace(re, (_, prefix) => prefix + value);
}

export function localFormat(raw, enabled) {
  if (!enabled) return raw;
  return raw.replace(/\bnew paragraph\b[,.]?\s*/gi, "\n\n").replace(/\bnew line\b[,.]?\s*/gi, "\n").trim();
}
