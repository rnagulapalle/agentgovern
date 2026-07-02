import { SITE } from "@/lib/site";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "a7e9b2c4d5f6a8g0o1v2e3r4n5a6n7a8";

export function getIndexNowKeyLocation() {
  return `${SITE.url}/${INDEXNOW_KEY}.txt`;
}

export async function submitToIndexNow(urlList: string[]) {
  const host = new URL(SITE.url).host;
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: getIndexNowKeyLocation(),
      urlList,
    }),
  });
  const ok = response.status === 200 || response.status === 202;
  return { ok, httpStatus: response.status, submitted: urlList.length };
}
