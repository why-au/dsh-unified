/**
 * Trae 桌面 App 的本地登录凭据读取（自动发现 + 解密）。
 *
 * Trae 是 VS Code 分支（iCube），登录态存在
 * `<APPDATA>/<数据目录>/User/globalStorage/storage.json` 的
 * `iCubeAuthInfo://icube.cloudide` 键里，用「tc」信封加密：
 *
 *   [6B 头 "tc\x05\x10\x00\x00"][32B 随机数][AES-128-CBC 密文]
 *   plaintext = [64B SHA-512 摘要][PKCS#7 填充的 JSON]
 *   key/iv    = SHA-512(SHA-512(随机数) || SALT_A^SALT_B) 的 [0..16] / [16..32]
 *
 * 盐是 App 前端里的静态常量，算法出自 MIT 许可的 Trae2api-cn
 * （src/trae_decrypt.py），这里用 node:crypto 重新实现 —— 不引入依赖。
 *
 * 为什么插件要自己读：容器/宿主都只看得到用户的 `$DSH_HOME`，以前靠
 * `export-trae-plain.mjs` 手动导出快照，脚本还不在包里 —— 等于 Trae 渠道不可用。
 * 现在每次 resolve 自动发现并解密，用户只要装好 Trae 并登录过一次即可。
 *
 * 只读：本模块绝不写 Trae 自己的目录。
 */

import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";

const SALT_A = Buffer.from([
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251,
  124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203,
  84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78,
  8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
]);
const SALT_B = Buffer.from([
  31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95,
  96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239,
  160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97,
  23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
]);

/** storage.json 里登录态的键。 */
const STORAGE_KEY = "iCubeAuthInfo://icube.cloudide";
/** 设备号键的前缀（写接口需要；缺了只是不能签到）。 */
const DEVICE_KEY_PREFIX = "iCubeAuthInfo://icube-dc";

/** 数据目录名（快速路径；真正的兜底是下面「名字含 trae」的扫描）。 */
const KNOWN_DIR_NAMES = [
  "Trae CN",
  "Trae",
  "Trae SOLO CN",
  "TRAE SOLO CN",
  "TRAE SOLO",
  "Trae SOLO",
];

function xorInto(a, b) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

/**
 * 解密一个「tc」信封，返回明文 JSON 字符串；解不开就抛错。
 * 头字节不是已知形态时抛出 —— 调用方据此跳过该候选。
 */
export function decryptStorageValue(base64Value) {
  const buffer = Buffer.from(String(base64Value ?? ""), "base64");
  if (buffer.length < 38 + 64) throw new Error("trae: 信封太短");
  const header = buffer.subarray(0, 6);
  const isTc = header[0] === 0x74 && header[1] === 0x63 &&
    header[2] === 0x05 && header[3] === 0x10 && header[4] === 0x00 && header[5] === 0x00;
  const isPrivate = header[0] === 18 && header[1] === 57 && header[2] === 32 &&
    header[3] === 32 && header[4] === 2 && header[5] === 3;
  if (!isTc && !isPrivate) throw new Error(`trae: 未知的加密头 ${header.toString("hex")}`);
  const random = buffer.subarray(6, 38);
  const encrypted = buffer.subarray(38);
  const salt = xorInto(SALT_A, SALT_B);
  const hashOfRandom = createHash("sha512").update(random).digest();
  const finalHash = createHash("sha512").update(Buffer.concat([hashOfRandom, salt])).digest();
  const key = finalHash.subarray(0, 16);
  const iv = finalHash.subarray(16, 32);
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const storedHash = decrypted.subarray(0, 64);
  let body = decrypted.subarray(64);
  const pad = body[body.length - 1];
  if (pad >= 1 && pad <= 16 && body.length > pad) {
    let valid = true;
    for (let i = body.length - pad; i < body.length; i++) if (body[i] !== pad) { valid = false; break; }
    if (valid) body = body.subarray(0, body.length - pad);
  }
  if (!storedHash.equals(createHash("sha512").update(body).digest())) {
    throw new Error("trae: 凭据摘要校验失败");
  }
  return body.toString("utf8");
}

/** 数据目录的候选根（Windows 同时试 Roaming 与 Local，老版本装在 Roaming）。 */
function dataRoots() {
  const home = homedir();
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [...new Set([roaming, local])];
  }
  if (process.platform === "darwin") return [join(home, "Library", "Application Support")];
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(home, ".local", "share");
  return [...new Set([configHome, dataHome])];
}

/** 从一个 storage.json 里取出登录记录与设备号。 */
function readStorage(storagePath) {
  if (!existsSync(storagePath)) return undefined;
  let storage;
  try {
    storage = JSON.parse(readFileSync(storagePath, "utf8"));
  } catch {
    return undefined;
  }
  if (storage === null || typeof storage !== "object") return undefined;
  const encrypted = storage[STORAGE_KEY];
  if (typeof encrypted !== "string" || encrypted.length === 0) return undefined;
  let auth;
  try {
    const trimmed = encrypted.trim();
    // 加密信封或（兼容旧实现）明文 JSON。
    const plain = trimmed.startsWith("{") ? trimmed : decryptStorageValue(trimmed);
    auth = JSON.parse(plain);
  } catch {
    return undefined;
  }
  if (auth === null || typeof auth !== "object" || typeof auth.token !== "string" || auth.token.length === 0) return undefined;
  // 设备号：同一份 storage 里以固定前缀存着（值可能是明文）。
  let deviceId = "";
  for (const key of Object.keys(storage)) {
    if (!key.startsWith(DEVICE_KEY_PREFIX)) continue;
    const value = storage[key];
    if (typeof value === "string" && value.trim() !== "") {
      deviceId = value.trim();
      break;
    }
  }
  return { ...auth, deviceId };
}

/** storage.json 路径 → 数据目录名（诊断用）。 */
function dirOfStorage(storagePath) {
  return basename(dirname(dirname(dirname(storagePath))));
}

/**
 * 扫描本机已安装并登录过的 Trae，返回第一条可用登录记录：
 * `{ token, refreshToken, userId, account, host, deviceId, expiredAt, _path, _dir }`。
 * 找不到返回 undefined（绝不抛）。
 */
export function discoverDesktopAuth({ logger } = {}) {
  const roots = dataRoots();
  const candidates = [];
  const seen = new Set();
  const push = (storagePath) => {
    const key = storagePath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(storagePath);
  };
  for (const root of roots) {
    for (const name of KNOWN_DIR_NAMES) {
      push(join(root, name, "User", "globalStorage", "storage.json"));
    }
    // 宽松扫描：任何名字含 trae 的目录（改名/新渠道也找得到）。
    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().includes("trae")) continue;
      push(join(root, entry.name, "User", "globalStorage", "storage.json"));
    }
  }
  for (const storagePath of candidates) {
    const auth = readStorage(storagePath);
    if (auth === undefined) continue;
    logger?.info?.(`dsh-trae-connect: 已从本机 Trae 读取登录态（${dirOfStorage(storagePath)}）`);
    return { ...auth, _path: storagePath, _dir: dirOfStorage(storagePath) };
  }
  logger?.warn?.(
    `dsh-trae-connect: 扫描 ${roots.join("、")} 未找到可用的 Trae 登录态 —— ` +
    "请确认 Trae 桌面程序已安装并登录过（扫描期间保持程序启动）",
  );
  return undefined;
}
