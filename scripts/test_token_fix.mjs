// Test token type conversion fix
const response = await fetch('https://bots.qq.com/app/getAppAccessToken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId: '102862558',
    clientSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu'
  })
});

const data = await response.json();
console.log('Raw expires_in:', data.expires_in, 'type:', typeof data.expires_in);

// Test conversion
const expiresIn = Number(data.expires_in);
const expiresInSeconds = Math.max(30, expiresIn - 60);

console.log('Converted expiresIn:', expiresIn, 'type:', typeof expiresIn);
console.log('Final expiresInSeconds:', expiresInSeconds, 'type:', typeof expiresInSeconds);

if (isNaN(expiresInSeconds)) {
  console.log('[ERROR] expiresInSeconds is NaN!');
} else {
  console.log('[OK] Token valid for', expiresInSeconds, 'seconds');
}
