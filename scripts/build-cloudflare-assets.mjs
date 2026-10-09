import { readdir, mkdir, copyFile, rm, access } from "node:fs/promises";
import { resolve, join, extname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, ".cloudflare-assets");
// Only website assets enter the public deployment. Server source, SQL,
// credential files and migration exports are deliberately outside this list.
const publicDirectories = new Set(["assets", "documents", "downloads", "insurance", "personnel", "news", "tuition"]);
const publicExtensions = new Set([".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".gif", ".avif", ".pdf", ".pages", ".docx", ".woff", ".woff2", ".ttf"]);
await access(join(root, "index.html"));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
let count = 0;
async function copyPublic(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(relative, entry.name);
    if (entry.isDirectory() && (relative || publicDirectories.has(entry.name))) {
      await copyPublic(join(directory, entry.name), path);
    } else if (entry.isFile() && (publicExtensions.has(extname(entry.name).toLowerCase()) || path === "calendar-events.json" || path === "_headers" || path === "_redirects")) {
      await mkdir(resolve(output, relative), { recursive: true });
      await copyFile(join(directory, entry.name), join(output, path));
      count++;
    }
  }
}
await copyPublic(root);
console.log(`Prepared ${count} public website assets.`);
