'use strict';
// Windows exe'sine VOID simgesini ve sürüm bilgisini yazar (rcedit/wine gerekmez).
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

const exePath = path.resolve(process.argv[2] || 'dist/win-unpacked/VOID Premium.exe');
const icoPath = path.resolve(process.argv[3] || 'build/icon.ico');
const version = require('../package.json').version;

const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);
const icons = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath)).icons.map((i) => i.data);
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1;
const glang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, glang, icons);

const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10) || 0);
vi.setFileVersion(maj, min, pat, 0, 1033);
vi.setProductVersion(maj, min, pat, 0, 1033);
vi.setStringValues(
  { lang: 1033, codepage: 1200 },
  {
    ProductName: 'VOID Premium',
    FileDescription: 'VOID Premium',
    CompanyName: 'VOID Premium',
    LegalCopyright: '© 2026 VOID Premium',
    OriginalFilename: 'VOID Premium.exe',
    InternalName: 'VOID Premium',
  }
);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log(`Simge ve sürüm bilgisi yazıldı: ${exePath}`);
