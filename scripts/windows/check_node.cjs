// Keep code out of PowerShell native argument strings (Windows PowerShell 5.1).
if (Number(process.versions.node.split('.')[0]) < 18 || process.arch !== 'x64') {
  console.error('Node.js 18+ x64 is required. Node 22 x64 is the validation baseline.');
  process.exit(1);
}
console.log(`Node ${process.version}, ${process.arch}`);
