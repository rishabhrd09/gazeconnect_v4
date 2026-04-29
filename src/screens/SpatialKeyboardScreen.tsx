import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GazeButton from '../components/core/GazeButton';
import { darkColors, screenThemes, typography } from '../utils/design';
import { useGazeControl } from '../components/core/GazeControlToggle';
import { GlobalNavBar } from '../components/GlobalNavBar';
import ZoneBoard from '../components/ZoneBoard';
import QuickWordsOverlay from '../components/QuickWordsOverlay';
import { useCustomization } from '../contexts/CustomizationContext';

interface SpatialKeyboardProps {
  onNavigate: (screen: string) => void;
  onSpeak: (text: string) => void;
  onTextChange?: (text: string) => void;
  initialText?: string;
  isDarkMode?: boolean;
  showHindi?: boolean;
  getPredictions?: (text: string) => void;
  predictions?: Array<{ word: string; score: number }>;
  expandAbbreviation?: (abbrev: string) => void;
  abbreviationExpansion?: string | null;
  learnWord?: (word: string) => void;
  learnSentence?: (sentence: string) => void;
}

interface SuggestionRowProps {
  title: string;
  words: Array<{ word: string; score: number }>;
  idPrefix: string;
  onPick: (word: string) => void;
  isDarkMode: boolean;
  gazeEnabled: boolean;
  gazeEnabledTimestamp: number;
  emptyLabel: string;
  height?: string;
  fontSize?: string;
  style?: React.CSSProperties;
}

const AAC_FALLBACK_WORDS = [
  'help', 'water', 'pain', 'yes', 'no',
  'please', 'nurse', 'move', 'call', 'rest',
  'sleep', 'hungry', 'bathroom', 'thanks', 'family',
];

const COMMON_WORDS_BY_LENGTH: Record<number, string[]> = {
  1: ['a', 'i'],
  2: ['to', 'go', 'no', 'do', 'we', 'in', 'on', 'at', 'it', 'is', 'me', 'my', 'up', 'us'],
  3: ['you', 'yes', 'eat', 'bed', 'car', 'can', 'cat', 'cup', 'day', 'dog', 'eye', 'for', 'get', 'hot', 'job', 'key', 'leg', 'man', 'mom', 'not', 'now', 'out', 'put', 'run', 'see', 'sit', 'tea', 'the', 'try', 'use', 'van', 'way', 'who', 'why'],
  4: ['help', 'pain', 'call', 'need', 'rest', 'plot', 'plan', 'play', 'part', 'past', 'path', 'pick', 'pink', 'plus', 'pull', 'pure', 'push', 'baby', 'back', 'ball', 'bank', 'bath', 'best', 'book', 'care', 'cold', 'come', 'cook', 'cool', 'dark', 'door', 'down', 'easy', 'face', 'fall', 'fast', 'feel', 'fine', 'food', 'foot', 'full', 'girl', 'give', 'good', 'hair', 'hand', 'have', 'hear', 'heat', 'home', 'hope', 'hour', 'idea', 'keep', 'kind', 'know', 'lamp', 'last', 'left', 'life', 'like', 'live', 'long', 'look', 'love', 'make', 'meal', 'meet', 'milk', 'mind', 'move', 'name', 'near', 'nice', 'nose', 'okay', 'open', 'pain', 'park', 'pass', 'read', 'real', 'rice', 'ride', 'room', 'safe', 'sick', 'side', 'skin', 'slow', 'soap', 'soft', 'song', 'soon', 'soup', 'stay', 'stop', 'take', 'talk', 'tall', 'team', 'tell', 'that', 'then', 'this', 'time', 'tree', 'true', 'turn', 'walk', 'want', 'warm', 'wash', 'week', 'well', 'what', 'when', 'will', 'wind', 'wine', 'with', 'work', 'yard', 'year', 'your'],
  5: ['water', 'nurse', 'please', 'sleep', 'chair', 'about', 'above', 'after', 'again', 'alone', 'ankle', 'apple', 'basic', 'beach', 'begin', 'below', 'black', 'blank', 'blink', 'blood', 'board', 'brain', 'bread', 'break', 'bring', 'brown', 'build', 'carry', 'catch', 'cause', 'check', 'chest', 'child', 'clean', 'clear', 'climb', 'clock', 'close', 'color', 'cough', 'could', 'cover', 'crazy', 'cream', 'cross', 'dance', 'drink', 'drive', 'early', 'earth', 'elbow', 'empty', 'enjoy', 'enter', 'every', 'extra', 'fever', 'field', 'fight', 'final', 'finger', 'first', 'floor', 'focus', 'force', 'fresh', 'front', 'fruit', 'glass', 'grass', 'great', 'green', 'group', 'guess', 'happy', 'heart', 'heavy', 'hello', 'house', 'human', 'hurry', 'issue', 'juice', 'kneel', 'knief', 'large', 'laugh', 'learn', 'leave', 'light', 'limit', 'lunch', 'maybe', 'money', 'month', 'morning', 'mouth', 'music', 'never', 'night', 'noise', 'north', 'often', 'onion', 'other', 'paper', 'party', 'peace', 'phone', 'piece', 'place', 'plane', 'plant', 'plate', 'point', 'pound', 'power', 'press', 'price', 'quiet', 'radio', 'raise', 'reach', 'ready', 'relax', 'right', 'river', 'rough', 'round', 'scene', 'share', 'sharp', 'sheep', 'sheet', 'shirt', 'shoes', 'short', 'sight', 'skirt', 'small', 'smile', 'smoke', 'sound', 'south', 'space', 'speak', 'speed', 'spend', 'spoon', 'sport', 'stand', 'start', 'stick', 'still', 'store', 'storm', 'story', 'sugar', 'sweet', 'table', 'taste', 'teach', 'thank', 'there', 'thing', 'think', 'those', 'three', 'thumb', 'tight', 'tired', 'toast', 'today', 'tooth', 'touch', 'towel', 'track', 'trade', 'train', 'treat', 'truck', 'trust', 'truth', 'under', 'visit', 'voice', 'watch', 'water', 'wheel', 'where', 'which', 'while', 'white', 'whole', 'woman', 'world', 'worry', 'would', 'write', 'wrong', 'yours', 'youth'],
  6: ['hungry', 'thirst', 'family', 'doctor', 'thanks', 'become', 'before', 'behind', 'better', 'bottle', 'bottom', 'bought', 'bounce', 'branch', 'breath', 'bridge', 'bright', 'broken', 'bucket', 'button', 'camera', 'cancel', 'candle', 'carpet', 'carrot', 'castle', 'casual', 'cattle', 'caught', 'center', 'chance', 'change', 'charge', 'cheese', 'cherry', 'choice', 'church', 'circle', 'clever', 'closed', 'cloudy', 'coffee', 'collar', 'common', 'corner', 'cotton', 'couple', 'course', 'cousin', 'create', 'danger', 'decide', 'degree', 'depend', 'design', 'dinner', 'direct', 'doctor', 'dollar', 'double', 'dragon', 'drawer', 'dreams', 'drinks', 'driver', 'during', 'easily', 'eating', 'effect', 'effort', 'either', 'energy', 'engine', 'enough', 'escape', 'estate', 'expect', 'fabric', 'family', 'famous', 'farmer', 'father', 'fellow', 'female', 'figure', 'finger', 'finish', 'flavor', 'flight', 'flower', 'follow', 'forest', 'forget', 'formal', 'friend', 'future', 'garden', 'garlic', 'gather', 'gentle', 'ginger', 'gloves', 'golden', 'ground', 'growth', 'guitar', 'hammer', 'handle', 'happen', 'health', 'height', 'honest', 'honey', 'hunger', 'ignore', 'impact', 'income', 'injury', 'insect', 'inside', 'invite', 'island', 'jacket', 'jungle', 'junior', 'keeper', 'kidney', 'kitchen', 'ladder', 'laptop', 'larger', 'latter', 'launch', 'lawyer', 'leader', 'leaves', 'length', 'lesson', 'letter', 'lights', 'likely', 'liquid', 'listen', 'little', 'living', 'lonely', 'longer', 'lovely', 'magnet', 'makeup', 'manage', 'manner', 'market', 'master', 'matter', 'medium', 'member', 'memory', 'mental', 'method', 'middle', 'minute', 'mirror', 'mobile', 'moment', 'monkey', 'morning', 'mother', 'motion', 'muscle', 'museum', 'mutton', 'myself', 'narrow', 'native', 'nature', 'nearby', 'needle', 'nerves', 'nobody', 'normal', 'notice', 'number', 'object', 'office', 'option', 'orange', 'orders', 'output', 'outside', 'packet', 'parent', 'parrot', 'pastry', 'people', 'pepper', 'period', 'person', 'picnic', 'pillow', 'planet', 'plants', 'plastic', 'please', 'plenty', 'pocket', 'police', 'policy', 'polish', 'polite', 'potato', 'powder', 'prayer', 'prefer', 'pretty', 'Prince', 'prison', 'profit', 'promise', 'proper', 'public', 'purple', 'puzzle', 'rabbit', 'racing', 'radius', 'random', 'rarely', 'rather', 'rating', 'reader', 'really', 'reason', 'recent', 'recipe', 'record', 'reduce', 'refuse', 'regard', 'region', 'relate', 'relief', 'remain', 'remind', 'remote', 'remove', 'repair', 'repeat', 'replay', 'report', 'rescue', 'resort', 'result', 'retail', 'retain', 'return', 'reveal', 'review', 'reward', 'rhythm', 'ribbon', 'rocket', 'rubber', 'safety', 'salad', 'salary', 'sample', 'saving', 'scale', 'school', 'screen', 'script', 'search', 'season', 'second', 'secret', 'sector', 'secure', 'select', 'senior', 'sense', 'series', 'server', 'settle', 'shadow', 'shampoo', 'shared', 'sheep', 'sheets', 'shell', 'shift', 'shirts', 'shoes', 'shoot', 'should', 'shower', 'shrimp', 'signal', 'silent', 'silver', 'simple', 'singer', 'single', 'sister', 'sketch', 'sleepy', 'sleeve', 'slices', 'slider', 'slight', 'smooth', 'snacks', 'soccer', 'social', 'socket', 'sodium', 'softly', 'solar', 'solely', 'solid', 'someday', 'sooner', 'sorrow', 'sound', 'source', 'space', 'spade', 'speech', 'speedy', 'spend', 'sphere', 'spice', 'spider', 'spinach', 'spirit', 'splash', 'split', 'spoken', 'sponge', 'sports', 'spotty', 'spread', 'spring', 'square', 'stable', 'staff', 'stage', 'stain', 'stairs', 'stamp', 'stand', 'starch', 'stare', 'start', 'state', 'statue', 'stayed', 'steady', 'steam', 'steel', 'steep', 'step', 'stick', 'sticky', 'stiff', 'still', 'sting', 'stock', 'stone', 'stool', 'stop', 'store', 'storm', 'story', 'stove', 'strap', 'straw', 'stream', 'street', 'stress', 'strict', 'strike', 'string', 'strip', 'strive', 'stroke', 'strong', 'struck', 'stuck', 'studio', 'study', 'stuff', 'stump', 'style', 'submit', 'suffer', 'sugar', 'summer', 'sunset', 'supper', 'supply', 'surely', 'switch', 'system', 'tablet', 'tackle', 'tailor', 'talked', 'target', 'tasted', 'taught', 'techno', 'temple', 'tender', 'tennis', 'terror', 'thank', 'thanks', 'theory', 'thirst', 'thirty', 'thread', 'throat', 'thumb', 'ticket', 'tiger', 'timber', 'timely', 'tissue', 'toast', 'toilet', 'tomato', 'tongue', 'topic', 'touch', 'towel', 'towers', 'track', 'trade', 'trail', 'train', 'trait', 'travel', 'treat', 'trend', 'trial', 'trick', 'tropic', 'truck', 'trust', 'truth', 'trying', 'tunnel', 'turkey', 'turnip', 'turtle', 'twelve', 'twenty', 'unable', 'uncle', 'unique', 'united', 'unless', 'update', 'upset', 'urban', 'urgent', 'useful', 'vacant', 'valley', 'value', 'velvet', 'verify', 'versus', 'vessel', 'victim', 'video', 'viewer', 'village', 'violin', 'viral', 'vision', 'visit', 'visual', 'voice', 'volume', 'voter', 'waiter', 'waking', 'walked', 'wallet', 'walnut', 'wanted', 'warmth', 'washed', 'washer', 'wasted', 'watch', 'water', 'wealth', 'weapon', 'weary', 'weave', 'wedge', 'weekly', 'weight', 'weird', 'whale', 'wheat', 'wheel', 'while', 'whole', 'wicked', 'widow', 'width', 'wildly', 'window', 'winner', 'winter', 'wisdom', 'within', 'wizard', 'wobbly', 'wonder', 'wooden', 'worker', 'world', 'worry', 'worth', 'would', 'wound', 'writer', 'writing', 'yearly', 'yellow', 'yogurt', 'young', 'zebra', 'zigzag', 'zipper', 'zombie', 'zone'],
  7: ['blanket', 'support', 'sitting', 'morning', 'evening', 'alcohol', 'already', 'another', 'answer', 'anxiety', 'anyone', 'balance', 'balcony', 'balloon', 'battery', 'bedroom', 'believe', 'benefit', 'between', 'bicycle', 'biology', 'blanket', 'blender', 'blossom', 'brother', 'buffalo', 'cabinet', 'captain', 'careful', 'cartoon', 'ceiling', 'central', 'century', 'chamber', 'channel', 'chapter', 'charity', 'chicken', 'chimney', 'chronic', 'circuit', 'citizen', 'classes', 'classic', 'cleaner', 'climate', 'closest', 'clothes', 'collect', 'college', 'comfort', 'comment', 'company', 'compass', 'complex', 'concert', 'connect', 'contact', 'contain', 'content', 'contest', 'context', 'control', 'convert', 'cooking', 'correct', 'council', 'counter', 'country', 'courage', 'cousin', 'covered', 'cricket', 'crystal', 'culture', 'cupboard', 'curious', 'curtain', 'cushion', 'custom', 'damage', 'dancing', 'danger', 'darling', 'daylight', 'dealer', 'debate', 'decade', 'decent', 'decide', 'declare', 'defeat', 'defense', 'deficit', 'deliver', 'demand', 'dentist', 'deposit', 'desert', 'deserve', 'design', 'desire', 'dessert', 'destiny', 'destroy', 'detail', 'detect', 'develop', 'device', 'devote', 'diamond', 'digital', 'dinner', 'disease', 'display', 'distant', 'district', 'divorce', 'doctor', 'dolphin', 'drawing', 'dresses', 'driving', 'dryness', 'earring', 'eastern', 'economy', 'edition', 'educate', 'effective', 'elderly', 'element', 'elephant', 'embassy', 'emotion', 'empire', 'enable', 'engine', 'english', 'enough', 'episode', 'equal', 'escape', 'evening', 'exactly', 'example', 'excited', 'expense', 'expert', 'explain', 'explode', 'explore', 'express', 'extend', 'extreme', 'factory', 'failure', 'falling', 'family', 'fantasy', 'fashion', 'feather', 'feature', 'feeling', 'festival', 'fiction', 'fifteen', 'filter', 'finance', 'finding', 'fishing', 'fitness', 'flavor', 'flight', 'flower', 'folder', 'follow', 'forest', 'forever', 'formula', 'fortune', 'forward', 'founder', 'fragile', 'freedom', 'freezer', 'freight', 'friend', 'gallery', 'garment', 'gateway', 'gather', 'general', 'genetic', 'genuine', 'gesture', 'glasses', 'glimpse', 'glorious', 'gorilla', 'gradual', 'grammar', 'gravity', 'grocery', 'ground', 'growing', 'habitat', 'haircut', 'hammer', 'handful', 'handle', 'happily', 'harbor', 'harvest', 'healthy', 'hearing', 'heaven', 'height', 'helpful', 'heroic', 'highway', 'history', 'holiday', 'honest', 'horizon', 'horror', 'hospice', 'housing', 'however', 'hundred', 'hunger', 'hunting', 'husband', 'hybrid', 'illegal', 'illness', 'imagine', 'immune', 'impact', 'import', 'impress', 'improve', 'income', 'indeed', 'indoor', 'infant', 'inform', 'injury', 'inner', 'insect', 'inside', 'install', 'instant', 'instead', 'intense', 'invent', 'invest', 'invite', 'island', 'isolate', 'issue', 'jacket', 'jewelry', 'journey', 'jungle', 'junior', 'justice', 'keep', 'kennel', 'keyboard', 'kitchen', 'knight', 'landing', 'lantern', 'laptop', 'largely', 'lasting', 'lately', 'lateral', 'laugh', 'laundry', 'lawyer', 'layer', 'leader', 'league', 'learn', 'leather', 'lecture', 'legacy', 'legend', 'leisure', 'lemon', 'length', 'lesson', 'letter', 'level', 'liberal', 'liberty', 'library', 'license', 'light', 'likely', 'limited', 'linear', 'listen', 'little', 'living', 'loader', 'locate', 'locked', 'logic', 'logical', 'lonely', 'lookout', 'loose', 'loyal', 'lucky', 'luggage', 'lumber', 'luxury', 'machine', 'madness', 'magical', 'magnet', 'mailbox', 'makeup', 'manager', 'manual', 'marble', 'margin', 'marker', 'market', 'marriage', 'married', 'marvel', 'massage', 'master', 'match', 'material', 'matter', 'maximum', 'meaning', 'measure', 'medical', 'medium', 'meeting', 'melody', 'member', 'memory', 'mental', 'mention', 'message', 'method', 'middle', 'midnight', 'million', 'mineral', 'minimal', 'minimum', 'minute', 'mirror', 'misery', 'mission', 'mistake', 'mixture', 'mobile', 'modern', 'modest', 'module', 'moment', 'money', 'monitor', 'monkey', 'monster', 'monthly', 'moral', 'morning', 'mortal', 'mother', 'motion', 'motive', 'mount', 'mountain', 'mouse', 'mouth', 'movie', 'moving', 'muscle', 'museum', 'musical', 'mystery', 'narrow', 'nation', 'native', 'nature', 'nearby', 'neatly', 'necktie', 'needle', 'neither', 'nervous', 'network', 'neutral', 'newly', 'nightly', 'nobody', 'noise', 'nominal', 'normal', 'nothing', 'notice', 'nowhere', 'nuclear', 'number', 'nursery', 'object', 'observe', 'obvious', 'occurs', 'ocean', 'offense', 'offer', 'office', 'officer', 'official', 'often', 'onion', 'online', 'opening', 'operate', 'opinion', 'oppose', 'orange', 'order', 'organic', 'orient', 'origin', 'orphan', 'others', 'outdoor', 'outline', 'output', 'outside', 'package', 'painful', 'paint', 'painting', 'palace', 'panther', 'paper', 'parade', 'parent', 'parking', 'parlor', 'parrot', 'partial', 'partner', 'party', 'passage', 'passing', 'passion', 'passive', 'pastry', 'patch', 'patient', 'pattern', 'pause', 'payment', 'peacock', 'peanut', 'pearl', 'peasant', 'pebble', 'pedal', 'penalty', 'pencil', 'people', 'pepper', 'perfect', 'perform', 'perfume', 'period', 'permit', 'person', 'picture', 'piece', 'pigment', 'pillow', 'pilot', 'pirate', 'place', 'plain', 'planet', 'plasma', 'plastic', 'plate', 'player', 'please', 'plenty', 'pocket', 'podcast', 'poem', 'poet', 'poetry', 'point', 'poison', 'police', 'policy', 'polish', 'polite', 'popular', 'portion', 'portrait', 'postage', 'poster', 'potato', 'pottery', 'poverty', 'powder', 'power', 'praise', 'prayer', 'predict', 'prefer', 'premier', 'prepare', 'present', 'press', 'pretty', 'prevent', 'preview', 'price', 'pride', 'primary', 'prince', 'print', 'prison', 'private', 'prize', 'problem', 'process', 'produce', 'product', 'profile', 'profit', 'program', 'project', 'promise', 'promote', 'proof', 'proper', 'propose', 'protect', 'protein', 'protest', 'proud', 'provide', 'public', 'publish', 'pulling', 'pulse', 'pump', 'punch', 'puppy', 'purely', 'purple', 'purpose', 'pursue', 'puzzle', 'pyramid', 'quality', 'quarter', 'queen', 'quest', 'quick', 'quiet', 'rabbit', 'racial', 'racism', 'radar', 'radio', 'radius', 'railway', 'rainbow', 'raise', 'rally', 'random', 'range', 'rapid', 'rarely', 'rating', 'ratio', 'rattle', 'reach', 'react', 'reader', 'ready', 'realize', 'reason', 'receipt', 'receive', 'recent', 'recipe', 'record', 'recover', 'recruit', 'recycle', 'reduce', 'reflect', 'reform', 'refuge', 'refuse', 'regard', 'regime', 'region', 'regular', 'related', 'relax', 'relay', 'release', 'relief', 'remain', 'remark', 'remedy', 'remind', 'remote', 'removal', 'remove', 'render', 'rental', 'repair', 'repeat', 'replace', 'reply', 'report', 'request', 'rescue', 'reserve', 'resist', 'resort', 'respect', 'respond', 'restore', 'result', 'resume', 'retail', 'retain', 'retire', 'retreat', 'return', 'reveal', 'revenue', 'review', 'revise', 'revival', 'reward', 'rhythm', 'ribbon', 'rice', 'rich', 'rider', 'ridge', 'riding', 'rifle', 'right', 'rigid', 'ring', 'rise', 'risk', 'ritual', 'rival', 'river', 'road', 'roast', 'robot', 'rocky', 'role', 'roll', 'romance', 'roof', 'room', 'root', 'rope', 'rough', 'round', 'route', 'routine', 'royal', 'rubber', 'ruin', 'rule', 'ruling', 'runner', 'rural', 'rush', 'sacred', 'safety', 'sailor', 'salad', 'salary', 'salmon', 'salon', 'salt', 'sample', 'sand', 'sandal', 'sandwich', 'satellite', 'satisfy', 'sauce', 'saving', 'scale', 'scan', 'scare', 'scene', 'scenery', 'scent', 'scheme', 'school', 'science', 'scope', 'score', 'scream', 'screen', 'screw', 'script', 'search', 'season', 'seat', 'second', 'secret', 'section', 'sector', 'secure', 'seed', 'seek', 'segment', 'select', 'self', 'sell', 'send', 'senior', 'sense', 'sensor', 'series', 'serve', 'server', 'service', 'session', 'setup', 'seven', 'severe', 'sew', 'shade', 'shadow', 'shake', 'shame', 'shape', 'share', 'sharp', 'shave', 'sheep', 'sheet', 'shelf', 'shell', 'shelter', 'shift', 'shine', 'ship', 'shirt', 'shock', 'shoe', 'shoot', 'shop', 'shore', 'short', 'shot', 'should', 'shoulder', 'shout', 'show', 'shower', 'shrimp', 'shrink', 'shut', 'side', 'sight', 'sign', 'signal', 'silence', 'silent', 'silk', 'silly', 'silver', 'similar', 'simple', 'since', 'sing', 'singer', 'single', 'sink', 'sister', 'site', 'size', 'sketch', 'skill', 'skin', 'skirt', 'sky', 'slave', 'sleep', 'sleeve', 'slice', 'slide', 'slight', 'slip', 'slow', 'small', 'smart', 'smell', 'smile', 'smoke', 'smooth', 'snake', 'snap', 'snow', 'soap', 'soccer', 'social', 'society', 'sock', 'soft', 'softly', 'soil', 'solar', 'soldier', 'solid', 'solve', 'some', 'son', 'song', 'soon', 'sore', 'sort', 'soul', 'sound', 'soup', 'source', 'south', 'space', 'spare', 'spark', 'speak', 'special', 'speech', 'speed', 'spell', 'spend', 'sphere', 'spice', 'spider', 'spin', 'spirit', 'split', 'spoil', 'sponge', 'spoon', 'sport', 'spot', 'spray', 'spread', 'spring', 'squad', 'square', 'stable', 'stack', 'staff', 'stage', 'stain', 'stair', 'stake', 'stall', 'stamp', 'stand', 'star', 'stare', 'start', 'state', 'station', 'statue', 'stay', 'steak', 'steal', 'steam', 'steel', 'steep', 'step', 'stick', 'sticky', 'stiff', 'still', 'stock', 'stomach', 'stone', 'stop', 'storage', 'store', 'storm', 'story', 'stove', 'strange', 'strap', 'straw', 'stream', 'street', 'stress', 'stretch', 'strict', 'strike', 'string', 'strip', 'stroke', 'strong', 'struct', 'struggle', 'student', 'studio', 'study', 'stuff', 'stumble', 'style', 'subject', 'submit', 'subway', 'succeed', 'success', 'such', 'sudden', 'suffer', 'sugar', 'suggest', 'suit', 'summer', 'summit', 'sun', 'super', 'supper', 'supply', 'support', 'suppose', 'sure', 'surface', 'surgery', 'surname', 'surprise', 'survive', 'suspect', 'sustain', 'swallow', 'swear', 'sweat', 'sweater', 'sweet', 'swim', 'swing', 'switch', 'symbol', 'sympathy', 'symptom', 'system', 'table', 'tablet', 'tackle', 'tactic', 'tail', 'take', 'tale', 'talent', 'talk', 'tall', 'tank', 'tap', 'tape', 'target', 'task', 'taste', 'tax', 'taxi', 'tea', 'teach', 'teacher', 'team', 'tear', 'tech', 'teeth', 'tell', 'temper', 'temple', 'tenant', 'tend', 'tender', 'tennis', 'tension', 'tent', 'term', 'terrible', 'test', 'text', 'texture', 'thank', 'thanks', 'theater', 'theme', 'theory', 'therapy', 'there', 'thermal', 'thick', 'thief', 'thin', 'thing', 'think', 'third', 'thirst', 'thirty', 'this', 'thought', 'thread', 'threat', 'three', 'thrill', 'throats', 'through', 'throw', 'thumb', 'thunder', 'ticket', 'tide', 'tidy', 'tie', 'tiger', 'tight', 'tile', 'time', 'timing', 'tiny', 'tip', 'tire', 'tired', 'tissue', 'title', 'toast', 'today', 'toe', 'toilet', 'token', 'tomato', 'tonight', 'tool', 'tooth', 'top', 'topic', 'torch', 'total', 'touch', 'tough', 'tour', 'tourist', 'towel', 'tower', 'town', 'toy', 'trace', 'track', 'trade', 'tradition', 'traffic', 'tragedy', 'trail', 'train', 'trait', 'transfer', 'transit', 'trap', 'trash', 'travel', 'tray', 'treat', 'treaty', 'tree', 'trek', 'trend', 'trial', 'tribe', 'trick', 'trip', 'triumph', 'troop', 'trouble', 'truck', 'true', 'trunk', 'trust', 'truth', 'try', 'tube', 'tune', 'tunnel', 'turkey', 'turn', 'turtle', 'twelve', 'twenty', 'twice', 'twin', 'twist', 'type', 'typical', 'ugly', 'unable', 'uncle', 'under', 'unit', 'unite', 'unity', 'universe', 'unless', 'until', 'unusual', 'update', 'upper', 'upset', 'urban', 'urge', 'urgent', 'usage', 'use', 'used', 'useful', 'user', 'usual', 'utility', 'vacation', 'vacuum', 'valid', 'valley', 'value', 'van', 'vanilla', 'variety', 'various', 'vary', 'vast', 'vegetable', 'vehicle', 'venture', 'verbal', 'verify', 'version', 'vertical', 'very', 'vessel', 'vest', 'veteran', 'via', 'victim', 'victory', 'video', 'view', 'village', 'violent', 'virtual', 'virus', 'visible', 'vision', 'visit', 'visitor', 'visual', 'vital', 'voice', 'volume', 'vote', 'voyage', 'wage', 'wagon', 'waist', 'wait', 'waiter', 'wake', 'walk', 'walker', 'wall', 'wallet', 'wander', 'want', 'war', 'warm', 'warmth', 'warn', 'warning', 'warrant', 'wash', 'waste', 'watch', 'water', 'wave', 'way', 'weak', 'wealth', 'weapon', 'wear', 'weather', 'weave', 'web', 'wedding', 'week', 'weekend', 'weekly', 'weigh', 'weight', 'weird', 'welcome', 'welfare', 'well', 'west', 'western', 'wet', 'whale', 'what', 'wheat', 'wheel', 'when', 'where', 'whether', 'which', 'while', 'whisper', 'white', 'who', 'whole', 'why', 'wicked', 'wide', 'widow', 'width', 'wife', 'wild', 'will', 'willing', 'win', 'wind', 'window', 'wine', 'wing', 'winner', 'winter', 'wire', 'wisdom', 'wise', 'wish', 'wit', 'witch', 'with', 'within', 'witness', 'wolf', 'woman', 'wonder', 'wood', 'wooden', 'wool', 'word', 'work', 'worker', 'world', 'worry', 'worse', 'worst', 'worth', 'would', 'wound', 'wrap', 'wrist', 'write', 'writer', 'writing', 'wrong', 'yard', 'yeah', 'year', 'yell', 'yellow', 'yes', 'yesterday', 'yet', 'yield', 'yoga', 'yogurt', 'you', 'young', 'your', 'youth', 'zebra', 'zero', 'zone', 'zoo', 'zoom'],
};

const normalizeWord = (value: string): string => value.trim().toLowerCase();

const UI_FONT = typography.fontFamily.primary;
const KEYBOARD_THEME = screenThemes.keyboard;
const BORDER_COLOR = KEYBOARD_THEME.keyBorder;
const DISPLAY_BG = KEYBOARD_THEME.textAreaBg;
const SUGGESTION_BG = KEYBOARD_THEME.predictionBg;
const TEXT_MAIN = KEYBOARD_THEME.keyText;
const TEXT_SUB = KEYBOARD_THEME.keyTextMuted;
const TEXT_DIM = KEYBOARD_THEME.keyTextMuted;
const CARET_COLOR = darkColors.accent.main;

// --- COMPONENTS ---

// Connected Grid Suggestion Row
const SuggestionRow: React.FC<SuggestionRowProps> = ({
  title,
  words,
  idPrefix,
  onPick,
  gazeEnabled,
  gazeEnabledTimestamp,
  emptyLabel,
  height = '140px',
  fontSize = 'clamp(30px, 3.35vh, 42px)',
  style,
}) => {
  return (
    // Wrapper handles positioning and external style (radius, border, etc)
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, width: '100%', overflow: 'hidden', ...style }}>
      {/* Title (Small Label) */}
      <div style={{
        color: TEXT_DIM, fontWeight: 760, fontSize: 'clamp(14px, 1.45vh, 18px)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '4px',
        fontFamily: UI_FONT,
      }}>{title}</div>

      {/* Connected Grid - 1px Separators */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '1px', // The separator
          height: '100%', // Fill wrapper height (controlled by prop)
          minHeight: height,
          backgroundColor: BORDER_COLOR,
          border: 'none',
          borderRadius: '0', // Controlled by wrapper
        }}
      >
        {words.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', backgroundColor: SUGGESTION_BG, color: TEXT_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(23px, 2.55vh, 32px)', fontWeight: 650, fontFamily: UI_FONT }}>
            {emptyLabel}
          </div>
        ) : (
          words.map((entry, idx) => (
            <GazeButton
              key={`${idPrefix}-${entry.word}-${idx}`}
              id={`${idPrefix}-${idx}`}
              gazeEnabled={gazeEnabled}
              gazeEnabledTimestamp={gazeEnabledTimestamp}
              dwellCategory="keyboardKey"
              onClick={() => onPick(entry.word)}
              style={{
                width: '100%', height: '100%',
                backgroundColor: SUGGESTION_BG,
                border: 'none',
                color: TEXT_MAIN,
                fontWeight: 720,
                fontSize: fontSize,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: UI_FONT,
              }}
            >
              {entry.word}
            </GazeButton>
          ))
        )}
      </div>
    </div>
  );
};

// --- MAIN SCREEN ---

const SpatialKeyboardScreen: React.FC<SpatialKeyboardProps> = ({
  onNavigate,
  onSpeak,
  onTextChange,
  initialText = '',
  isDarkMode = true,
  showHindi = false,
  getPredictions,
  predictions = [],
  learnWord,
  learnSentence,
}) => {
  const displayRef = useRef<HTMLDivElement>(null);
  const { isGazeEnabled, toggleGaze, lastEnabledTimestamp } = useGazeControl();

  const [text, setText] = useState(initialText);
  const [wordLengthHint, setWordLengthHint] = useState<number | null>(null);
  const [quickWordsOpen, setQuickWordsOpen] = useState(false);
  const { data: { quickWords } } = useCustomization();

  // Auto-scroll
  useEffect(() => {
    if (displayRef.current) displayRef.current.scrollTop = displayRef.current.scrollHeight;
  }, [text]);

  const updateText = useCallback((updater: (prev: string) => string) => {
    setText(prev => {
      const next = updater(prev);
      onTextChange?.(next);
      return next;
    });
  }, [onTextChange]);

  // --- LOGIC ---
  const currentPrefix = useMemo(() => {
    const trimmed = text.replace(/\s+$/, '');
    if (!trimmed) return '';
    const tokens = trimmed.split(/\s+/);
    return normalizeWord(tokens[tokens.length - 1] || '');
  }, [text]);

  const currentWordDisplay = useMemo(() => {
    const trimmed = text.replace(/\s+$/, '');
    if (!trimmed) return '';
    const tokens = trimmed.split(/\s+/);
    return (tokens[tokens.length - 1] || '').trim();
  }, [text]);

  const rankedPredictions = useMemo(() => {
    const dedupe = new Set<string>();
    return [...predictions]
      .sort((a, b) => b.score - a.score)
      .filter((item) => {
        const key = normalizeWord(item.word);
        if (!key || dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      });
  }, [predictions]);

  // Bottom Row (Smart)
  const generalSecondary = useMemo(() => {
    const out: Array<{ word: string; score: number }> = [];
    const seen = new Set<string>();
    if (currentPrefix) {
      rankedPredictions.filter(p => normalizeWord(p.word).startsWith(currentPrefix))
        .forEach(p => { if (!seen.has(p.word)) { seen.add(p.word); out.push(p); } });
    }
    if (out.length < 5) {
      AAC_FALLBACK_WORDS.forEach(w => {
        if (out.length < 5 && !seen.has(w)) { seen.add(w); out.push({ word: w, score: 0.5 }); }
      });
    }
    return out.slice(0, 5);
  }, [currentPrefix, rankedPredictions]);

  // Top Row (Length Aware)
  const lengthAwareTop = useMemo(() => {
    if (!wordLengthHint) return rankedPredictions.slice(0, 5);
    const isHigh = wordLengthHint === 7;
    const out: Array<{ word: string; score: number }> = [];
    const seen = new Set<string>();
    const matchesHint = (w: string) => (isHigh ? w.length >= 7 : w.length === wordLengthHint);

    if (currentPrefix) {
      rankedPredictions.filter(p => matchesHint(p.word) && normalizeWord(p.word).startsWith(currentPrefix))
        .forEach(p => { if (!seen.has(p.word)) { seen.add(p.word); out.push(p); } });
    }
    if (out.length < 5) {
      rankedPredictions.filter(p => matchesHint(p.word))
        .forEach(p => { if (!seen.has(p.word)) { seen.add(p.word); out.push(p); } });
    }
    if (out.length < 5) {
      const pool = isHigh
        ? [...(COMMON_WORDS_BY_LENGTH[7] || []), ...(COMMON_WORDS_BY_LENGTH[8] || [])]
        : (COMMON_WORDS_BY_LENGTH[wordLengthHint] || []);

      // 1. First Pass: Prioritize Prefix Match in Fallback Pool
      if (currentPrefix) {
        pool.forEach(w => {
          if (out.length < 5 && !seen.has(w) && normalizeWord(w).startsWith(currentPrefix)) {
            seen.add(w); out.push({ word: w, score: 0.1 });
          }
        });
      }

      // 2. Second Pass: Fill remaining slots with generic words (only if needed)
      pool.forEach(w => {
        if (out.length < 5 && !seen.has(w)) {
          seen.add(w); out.push({ word: w, score: 0.05 });
        }
      });
    }
    return out.slice(0, 5);
  }, [rankedPredictions, wordLengthHint, currentPrefix]);


  // --- HANDLERS ---
  const applySuggestion = (word: string) => {
    updateText(prev => {
      let next = '';
      if (!prev || prev.endsWith(' ')) next = `${prev}${word} `;
      else {
        const tokens = prev.trim().split(' ');
        tokens[tokens.length - 1] = word;
        next = `${tokens.join(' ')} `;
      }
      if (getPredictions) getPredictions(next);
      return next;
    });
    setWordLengthHint(null);
    learnWord?.(word);
  };

  const handleLetterTyped = (letter: string) => {
    updateText(prev => {
      const next = `${prev}${letter}`;
      if (getPredictions) getPredictions(next);
      return next;
    });
  };

  const handleNumberHint = (val: string) => {
    let num = parseInt(val, 10);
    if (val === '7+') num = 7;
    if (isNaN(num)) return;
    setWordLengthHint(num);
    // Speaking handled by button click effect or explicit call? 
    // Button doesn't speak automatically unless configured. 
    // We can announce here if needed, but ZoneBoard usually does it?
    if (getPredictions) getPredictions(text);
  };

  const handleSpace = () => {
    updateText(prev => {
      const next = `${prev} `;
      if (getPredictions) getPredictions(next);
      return next;
    });
  };

  const handleDelete = () => {
    updateText(prev => {
      const next = prev.slice(0, -1);
      if (getPredictions) getPredictions(next);
      return next;
    });
  };

  const handleSpeakText = () => {
    if (text.trim()) { onSpeak(text); learnSentence?.(text); }
  };

  // --- RENDER ---
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      backgroundColor: KEYBOARD_THEME.shellBg,
      padding: '4px', // Minimal padding
      gap: '0px', // NO GAP
      boxSizing: 'border-box', overflow: 'hidden'
    }}>

      {/* 1. TOP PREDICTIONS - Reduced Height slightly to give more room to Grid */}
      <div style={{ flexShrink: 0, marginBottom: '0px', zIndex: 2 }}>
        <SuggestionRow
          title={wordLengthHint ? `Suggestions (${wordLengthHint === 7 ? '7+' : wordLengthHint})` : "Predictions"}
          words={lengthAwareTop}
          idPrefix="spatial-top"
          onPick={applySuggestion}
          isDarkMode={isDarkMode}
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          emptyLabel="Start typing..."
          height="102px"
          style={{ borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
        />
      </div>

      {/* 2. TEXT DISPLAY (Unified Portal) - Slightly reduced height */}
      <div style={{
        display: 'flex', flexDirection: 'row',
        width: '100%', height: '114px',
        backgroundColor: DISPLAY_BG,
        borderRadius: '0', // Connected look
        border: `2px solid ${BORDER_COLOR}`,
        borderTop: 'none', // Merge with top
        borderBottom: 'none', // Merge with bottom
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 1,
        marginTop: '0px', // Connected
        marginBottom: '0px', // Connected
      }}>
        {/* Left: Text */}
        <div
          ref={displayRef}
          style={{
            flex: 1, padding: '4px 26px 3px',
            overflowY: 'hidden', display: 'flex', alignItems: 'flex-start',
            scrollBehavior: 'smooth',
          }}
        >
          <span style={{
            color: TEXT_MAIN,
            fontSize: 'clamp(41px, 4.95vh, 58px)', fontWeight: 700, lineHeight: '1.16',
            textAlign: 'left', wordBreak: 'break-word', whiteSpace: 'pre-wrap', width: '100%',
            fontFamily: UI_FONT,
          }}>
            {text}
            <span style={{ display: 'inline-block', width: '4px', height: '1em', backgroundColor: CARET_COLOR, marginLeft: '6px', animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
          </span>
        </div>

        {/* Right: Quick Words Action Button */}
        <GazeButton
          id="spatial-action-btn"
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          onClick={() => onNavigate('quickwords')}
          dwellCategory="standardButton"
          style={{
            width: '98px', height: '100%', borderRadius: 0,
            backgroundColor: 'transparent',
            border: 'none', borderLeft: `2px solid ${BORDER_COLOR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: TEXT_SUB,
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </GazeButton>
      </div>

      {/* 3. ZONE BOARD (Connected Grid) */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        marginTop: '0px',
        marginBottom: '0px',
        zIndex: 0,
      }}>
        <ZoneBoard
          onLetterTyped={handleLetterTyped}
          onNumberSelected={handleNumberHint}
          onDelete={handleDelete}
          onSpace={handleSpace}
          onSpeak={handleSpeakText}
          onClear={() => setText('')}
          onAnnounce={(msg) => onSpeak(msg)}
          gazeEnabled={isGazeEnabled}
          gazeEnabledTimestamp={lastEnabledTimestamp}
          isDarkMode={isDarkMode}
          currentWord={currentWordDisplay}
          style={{
            borderRadius: '0 0 4px 4px',
            borderTop: 'none',
            width: '100%', // Explicit width
          }}
        />
      </div>

      {/* 4. BOTTOM PREDICTIONS (Large) */}
      <SuggestionRow
        title="Smart Suggestions"
        words={generalSecondary}
        idPrefix="spatial-bot"
        onPick={applySuggestion}
        isDarkMode={isDarkMode}
        gazeEnabled={isGazeEnabled}
        gazeEnabledTimestamp={lastEnabledTimestamp}
        emptyLabel="General words..."
        height="90px"
        fontSize="clamp(30px, 3.35vh, 42px)"
      />

      {/* 5. BOTTOM NAV BAR — uses GlobalNavBar matching keyboard screen style */}
      <div style={{ marginTop: 'clamp(8px, 1.1vh, 14px)', paddingBottom: 'clamp(10px, 1.4vh, 18px)', flexShrink: 0 }}>
        <GlobalNavBar
          currentPage="spatial"
          onNavigate={onNavigate}
          onSpeak={onSpeak}
          isDarkMode={true}
          showZoneBoardButton={false}
          onQuickWords={() => onNavigate('quickwords')}
        />
      </div>

      <style>{`@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }`}</style>

      {/* Quick Words Overlay */}
      <QuickWordsOverlay
        isOpen={quickWordsOpen}
        onClose={() => setQuickWordsOpen(false)}
        categories={quickWords?.categories ?? []}
        coreWords={quickWords?.coreWords}
        onWordSelect={(word) => applySuggestion(word.en)}
        isDarkMode={isDarkMode}
        gazeEnabled={isGazeEnabled}
        gazeEnabledTimestamp={lastEnabledTimestamp}
        showHindi={showHindi}
      />
    </div>
  );
};

export default React.memo(SpatialKeyboardScreen);
