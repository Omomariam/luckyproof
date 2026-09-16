import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/vendor', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'chain.js', 'favicon.svg']) {
  await copyFile(file, `dist/${file}`);
}
await copyFile('node_modules/ethers/dist/ethers.min.js', 'dist/vendor/ethers.js');
console.log('Built public app assets in dist.');
