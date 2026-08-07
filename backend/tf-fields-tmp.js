require('dotenv').config({ path: '/Users/connormeyler/coach-portal/.env' });
const T = process.env.TYPEFORM_PERSONAL_ACCESS_TOKEN;

(async () => {
  console.log('token loaded: ' + (T ? 'yes (' + T.length + ' chars)' : 'NO'));
  for (const f of ['UPiYhp4b', 'H4Y0MeYY']) {
    const r = await fetch('https://api.typeform.com/forms/' + f, {
      headers: { Authorization: 'Bearer ' + T, Accept: 'application/json' },
    });
    console.log('\n=== ' + f + ' -> HTTP ' + r.status + ' ===');
    if (r.status !== 200) { console.log((await r.text()).slice(0, 200)); continue; }
    const j = await r.json();
    console.log(j.title);
    (j.fields || []).forEach((x, i) => {
      console.log(
        String(i + 1).padStart(2) + '  ' +
        String(x.ref).padEnd(38) +
        String(x.type).padEnd(17) +
        String(x.title || '').replace(/\n/g, ' ').slice(0, 56)
      );
    });
  }
})();
