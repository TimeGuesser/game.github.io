let bridge = null;

export function registerGameBridge(api) {
  bridge = api;
}

export function getGameBridge() {
  return bridge;
}
