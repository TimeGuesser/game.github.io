export function withTimeout(
  promise,
  ms = 28000,
  message = 'Нет ответа от Supabase. Проверьте интернет/расширения (AdBlock, VPN) и повторите.'
) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}
