'use strict';

// A whole project in one file: the plan, every photo and the aerial picture, packed as an
// ordinary zip. "Export project" writes one and the new project page can start from one.
//
// Files are stored as they are, without compressing them: photos are compressed already. Zips
// that were made or repacked by another program, which do compress, can still be read.

const ZIP_PLAIN = 0;
const ZIP_DEFLATED = 8;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Packs [{ name, data }] into one zip, where each `data` is a Blob or File. The result refers to
// the files instead of holding copies of them, so a folder of large photos does not have to fit
// in memory at once. `onStep(done, total)` is called as each file is read.
async function zipBlob(entries, onStep = () => {}) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [i, e] of entries.entries()) {
    onStep(i + 1, entries.length);
    const name = new TextEncoder().encode(e.name);
    const crc = crc32(new Uint8Array(await e.data.arrayBuffer()));
    const size = e.data.size;
    // What the two headers have in common, from the version needed to the name's length.
    const common = new DataView(new ArrayBuffer(26));
    [20, 0x0800, ZIP_PLAIN, time, date].forEach((v, n) => common.setUint16(n * 2, v, true)); // 0x0800: names are UTF-8
    common.setUint32(10, crc, true);
    common.setUint32(14, size, true);
    common.setUint32(18, size, true);
    common.setUint16(22, name.length, true);
    const local = new DataView(new ArrayBuffer(4));
    local.setUint32(0, 0x04034b50, true);
    const listed = new DataView(new ArrayBuffer(6));
    listed.setUint32(0, 0x02014b50, true);
    listed.setUint16(4, 20, true);
    const where = new DataView(new ArrayBuffer(14)); // comment length, disk, attributes, then the offset
    where.setUint32(10, offset, true);
    parts.push(local, common, name, e.data);
    central.push(listed, common, where, name);
    offset += 30 + name.length + size;
    if (offset > 0xffffffff || entries.length > 0xffff) throw new Error('the project is too large for one zip file (over 4 GB)');
  }
  const centralSize = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

// The files listed in a zip: [{ name, method, size, offset }].
async function zipEntries(file) {
  const tail = new DataView(await file.slice(Math.max(0, file.size - 66000)).arrayBuffer());
  let at = tail.byteLength - 22;
  while (at >= 0 && tail.getUint32(at, true) !== 0x06054b50) at--;
  if (at < 0) throw new Error('that is not a zip file');
  const count = tail.getUint16(at + 10, true);
  const listSize = tail.getUint32(at + 12, true);
  const listAt = tail.getUint32(at + 16, true);
  if (count === 0xffff || listAt === 0xffffffff) throw new Error('that zip file is too large for this app to read');
  const list = new DataView(await file.slice(listAt, listAt + listSize).arrayBuffer());
  const entries = [];
  for (let p = 0, n = 0; n < count && list.getUint32(p, true) === 0x02014b50; n++) {
    const nameLength = list.getUint16(p + 28, true);
    entries.push({
      name: new TextDecoder().decode(new Uint8Array(list.buffer, p + 46, nameLength)).replaceAll('\\', '/'),
      method: list.getUint16(p + 10, true),
      size: list.getUint32(p + 20, true),
      offset: list.getUint32(p + 42, true),
    });
    p += 46 + nameLength + list.getUint16(p + 30, true) + list.getUint16(p + 32, true);
  }
  return entries;
}

// One file out of a zip, as a Blob.
async function zipData(file, e) {
  const head = new DataView(await file.slice(e.offset, e.offset + 30).arrayBuffer());
  const start = e.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const packed = file.slice(start, start + e.size);
  if (e.method === ZIP_PLAIN) return packed;
  if (e.method === ZIP_DEFLATED) return new Response(packed.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  throw new Error(`${e.name} is packed in a way this app cannot read`);
}

// Every file under a folder of the project, as paths from the project folder.
async function filesUnder(dir) {
  const found = [];
  for (const e of await store.list(dir)) {
    if (e.kind === 'directory') found.push(...await filesUnder(`${dir}/${e.name}`));
    else found.push(`${dir}/${e.name}`);
  }
  return found;
}

// The open project as one zip: its plan as it is now, and everything in `photos`, `reference` and `quotes`.
async function exportProject(onStep) {
  await flushSave();
  const entries = [{ name: PLAN_FILE, data: new Blob([planFileText()]) }];
  for (const path of [...await filesUnder('photos'), ...await filesUnder('reference'), ...await filesUnder('quotes')]) entries.push({ name: path, data: await store.file(path) });
  return zipBlob(entries, onStep);
}

// Unpacks an exported project into the project folder: its photos and reference pictures go
// where the plan expects them. Returns the plan, which the caller saves, or null if the zip
// holds no plan. A zip of a whole project folder, with everything one folder down, works too.
async function unpackProject(file, onStep = () => {}) {
  const entries = (await zipEntries(file)).filter((e) => !e.name.endsWith('/'));
  const planEntry = entries.filter((e) => e.name.endsWith('.housemap.json')).sort((a, b) => a.name.length - b.name.length)[0];
  const p = planEntry && await readPlan(await zipData(file, planEntry));
  if (!p) return null;
  const inside = dirOf(planEntry.name) ? dirOf(planEntry.name) + '/' : '';
  const wanted = entries.filter((e) => e.name.startsWith(inside)).map((e) => ({ ...e, path: e.name.slice(inside.length) }))
    .filter((e) => /^(photos|reference|quotes)\//.test(e.path) && !e.path.split('/').includes('..'));
  for (const [i, e] of wanted.entries()) {
    onStep(i + 1, wanted.length);
    await store.write(e.path, await zipData(file, e));
  }
  return p;
}

// After a plan arrives from somewhere else: says so if it refers to photos that are not in this
// project's folder, which is what happens when a plan is imported without the photos.
async function reportMissingPhotos() {
  const paths = [...plan.photos.flatMap(shotsOf).map((s) => s.file), plan.aerial?.file].filter(Boolean);
  const missing = [];
  for (const path of paths) await store.file(path).catch(() => missing.push(path));
  if (!missing.length) return;
  const some = missing.slice(0, 8).join('\n') + (missing.length > 8 ? `\n… and ${missing.length - 8} more` : '');
  tell(`This plan refers to ${missing.length === 1 ? '1 picture that is' : `${missing.length} pictures that are`} not in this project's folder:\n\n${some}\n\nA plan file on its own does not carry photos. To bring them across, use “Export project (.zip)” in the project they came from and start a new project from that file, or copy that project's “photos” and “reference” folders into this one.`);
}
