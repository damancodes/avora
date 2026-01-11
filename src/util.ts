export function generateAssetPath(url: string) {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const path = url.replace(/^\/+/, "");
  return `${base}/${path}`;
}
