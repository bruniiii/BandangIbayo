// ─────────────────────────────────────────────
// SENSITIVE WORDS: offensive words in Group Chat messages and Reviews are
// blocked automatically (replaced with ****): English, Filipino/Tagalog,
// Bisaya/Cebuano, Ilocano and Spanish. The database does the same
// (mask_sensitive_words), so nothing gets through either way; this copy shows
// the joiner the cleaned text before it's sent.
// Keep in sync with mask_sensitive_words() in the database.
// ─────────────────────────────────────────────

// Whole words (and common spellings).
export const SENSITIVE_WORDS = [
  // English
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuckin', 'fck', 'fcking', 'fk', 'fuk', 'fuking', 'phuck', 'wtf', 'stfu', 'gtfo',
  'shit', 'shits', 'shitty', 'bullshit', 'sht', 'bitch', 'bitches', 'biatch', 'btch', 'asshole', 'assholes', 'arsehole', 'dumbass', 'jackass',
  'bastard', 'bastards', 'dick', 'dicks', 'dickhead', 'cock', 'cocks', 'pussy', 'pussies', 'cunt', 'cunts', 'slut', 'sluts', 'whore', 'whores',
  'motherfucker', 'motherfuckers', 'mf', 'mofo', 'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'fag', 'retard', 'retarded',
  'twat', 'wanker', 'prick', 'douchebag', 'porn', 'rape', 'rapist',
  // Filipino / Tagalog
  'putangina', 'putang ina', 'putanginamo', 'putang ina mo', 'puta', 'puta ka', 'tangina', 'tang ina', 'tanginamo', 'tangina mo', 'tang ina mo', 'puta mo', 'gago ka', 'ulol ka', 'tangena',
  'pakyu', 'pak yu', 'pakshet', 'pucha', 'putcha', 'punyeta', 'punyemas', 'gago', 'gaga', 'gagu', 'gagi', 'ulol', 'ulul', 'olol',
  'tarantado', 'tarantada', 'bobo', 'boba', 'bobong', 'tanga', 'tangang', 'inutil', 'siraulo', 'sira ulo', 'kupal', 'hinayupak',
  'hayop ka', 'leche', 'lintik', 'pokpok', 'kantot', 'kantutan', 'jakol', 'chupa', 'tsupa', 'titi', 'burat', 'bayag', 'betlog', 'puke',
  'pekpek', 'kepyas', 'tamod', 'hindot', 'kingina', 'kinginamo', 'engot', 'shunga', 'bwisit', 'buwisit', 'peste', 'pesteng yawa',
  // Bisaya / Cebuano
  'yawa', 'yawaa', 'piste', 'pisti', 'pistiyawa', 'buang', 'boang', 'animal ka', 'bilat', 'oten', 'otin', 'iyot', 'giatay',
  'gi atay',
  // Ilocano
  'ukinnam', 'okinnam', 'ukininam', 'okininam',
  // Spanish
  'mierda', 'pendejo', 'pendeja', 'cabron', 'cabrón', 'coño', 'joder', 'hijo de puta', 'puto',
];

const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
// Longest first, so "putang ina mo" is caught before "putang ina".
// (No lookbehind, which older iPhones don't support: the character before
// the word is matched and kept.)
const buildPattern = (words) => new RegExp(
  `(^|[^\\p{L}\\p{N}_])(${[...words].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}\\p{N}_])`,
  'giu',
);
let PATTERN = buildPattern(SENSITIVE_WORDS);

// The words the main admin keeps in System Maintenance → Chat Filter, so the
// preview hides the same words the database does (logged-in joiners).
export const loadChatFilter = async () => {
  const { supabase } = await import('./supabaseClient');
  const { data, error } = await supabase.rpc('chat_filter_list');
  if (!error && Array.isArray(data) && data.length) PATTERN = buildPattern(data);
};

export const MASK = '****';

// The text with every sensitive word replaced by ****.
export const maskSensitiveWords = (text) => String(text ?? '').replace(PATTERN, (_, before) => `${before}${MASK}`);

export const hasSensitiveWords = (text) => maskSensitiveWords(text) !== String(text ?? '');
