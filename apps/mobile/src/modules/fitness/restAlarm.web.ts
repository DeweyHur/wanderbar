/** Web: no background notifications; when the rest ends with the page open, it beeps and vibrates. */
export const restAlarmSupported = false;
export async function prepareRestAlarm(_channelName: string) {
  return false;
}
export const exactAllowed = async () => true;
export const askExact = async () => true;
export async function scheduleRest(_at: Date, _content: { title: string; body: string; path: string }) {}
export async function cancelRest() {}

let audio: AudioContext | null = null;
export function buzz() {
  try {
    navigator.vibrate?.([400, 200, 400]);
  } catch {}
  try {
    audio ??= new AudioContext();
    for (const [start, freq] of [[0, 880], [0.25, 880], [0.5, 1320]] as const) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.2, audio.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + start + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + start);
      o.stop(audio.currentTime + start + 0.2);
    }
  } catch {}
}
