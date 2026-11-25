export type DeviceIdentity = {
  alias: string;
  deviceType: 'desktop' | 'mobile';
  os: string;
  browser: string;
};

const ADJECTIVES = [
  'Cobalt', 'Neon', 'Silver', 'Golden', 'Crimson', 'Azure', 'Emerald', 'Violet',
  'Amber', 'Indigo', 'Ruby', 'Sapphire', 'Pearl', 'Onyx', 'Ivory', 'Jade',
  'Coral', 'Bronze', 'Copper', 'Steel', 'Titanium', 'Obsidian', 'Quartz', 'Opal',
  'Topaz', 'Garnet', 'Citrine', 'Peridot', 'Aquamarine', 'Tanzanite', 'Morganite'
];

const ANIMALS = [
  'Fox', 'Falcon', 'Wolf', 'Eagle', 'Hawk', 'Lion', 'Tiger', 'Bear',
  'Panther', 'Lynx', 'Otter', 'Dolphin', 'Shark', 'Whale', 'Eagle', 'Raven',
  'Crow', 'Swan', 'Heron', 'Crane', 'Owl', 'Kite', 'Osprey', 'Condor',
  'Vulture', 'Kestrel', 'Merlin', 'Peregrine', 'Goshawk', 'Harrier'
];

let sessionAlias: string | null = null;

export function generateAlias(): string {
  if (sessionAlias) {
    return sessionAlias;
  }
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  sessionAlias = `${adjective} ${animal}`;
  return sessionAlias;
}

export function detectDeviceType(): 'desktop' | 'mobile' {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return 'desktop';
  }
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone'];
  const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
  const isSmallScreen = window.innerWidth < 768;
  return isMobileUA || isSmallScreen ? 'mobile' : 'desktop';
}

export function detectOS(): string {
  if (typeof navigator === 'undefined') {
    return 'Unknown';
  }
  const userAgent = navigator.userAgent;
  if (/windows nt/i.test(userAgent)) return 'Windows';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  if (/chrome os/i.test(userAgent)) return 'Chrome OS';
  return 'Unknown';
}

export function detectBrowser(): string {
  if (typeof navigator === 'undefined') {
    return 'Unknown';
  }
  const userAgent = navigator.userAgent;
  if (/edg/i.test(userAgent)) return 'Edge';
  if (/chrome|crios/i.test(userAgent)) return 'Chrome';
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  if (/opera|opr/i.test(userAgent)) return 'Opera';
  if (/msie|trident/i.test(userAgent)) return 'Internet Explorer';
  return 'Unknown';
}

const STORAGE_KEY = 'regex_device_identity';

export function saveDeviceIdentity(identity: DeviceIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore localStorage errors (quota exceeded, private mode, etc.)
  }
}

export function loadDeviceIdentity(): DeviceIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    if (!isValidDeviceIdentity(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isValidDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.alias === 'string' &&
    (obj.deviceType === 'desktop' || obj.deviceType === 'mobile') &&
    typeof obj.os === 'string' &&
    typeof obj.browser === 'string'
  );
}