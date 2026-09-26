// Keep code out of PowerShell native argument strings (Windows PowerShell 5.1).
// 22.12 is Electron 44's own floor (its package and @electron/get declare it).
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12) || process.arch !== 'x64') {
  console.error(`Node.js 22.12+ x64 is required (found ${process.version}, ${process.arch}). Node 22 LTS x64 is the validation baseline.`);
  process.exit(1);
}
console.log(`Node ${process.version}, ${process.arch}`);
