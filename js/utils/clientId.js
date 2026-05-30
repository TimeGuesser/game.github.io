const CLIENT_KEY = 'historyguesser_client_id';

let memoryClientId = null;

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readStoredId() {
  try {
    return localStorage.getItem(CLIENT_KEY);
  } catch {
    return memoryClientId;
  }
}

function writeStoredId(id) {
  try {
    localStorage.setItem(CLIENT_KEY, id);
  } catch {
    memoryClientId = id;
  }
}

export function getClientId() {
  let id = readStoredId();
  if (!id) {
    id = generateUUID();
    writeStoredId(id);
  }
  return id;
}
