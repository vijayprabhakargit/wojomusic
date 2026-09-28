import { getInfo } from '../youtube.mjs';

const IDS = [
  'dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'JGwWNGJdvx8', 'OPf0YbXqDm0',
  'fJ9rUzIMcZQ', '3JZ_D3ELwOQ', 'hT_nvWreIhg', 'YQHsXMglC9A', 'CevxZvSJLk8',
];

let ok = 0, fail = 0;
for (let round = 0; round < 3; round++) {
  for (const id of IDS) {
    try {
      const info = await getInfo(id);
      ok++;
      console.log(`R${round} ${id} OK: ${info.title.slice(0, 40)}`);
    } catch (e) {
      fail++;
      console.log(`R${round} ${id} FAIL: ${e.message}`);
    }
  }
}
console.log(`\nDONE ok=${ok} fail=${fail}`);
process.exit(0);
