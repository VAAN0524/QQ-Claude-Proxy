// Test token fetch
const response = await fetch('https://bots.qq.com/app/getAppAccessToken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId: '102862558',
    clientSecret: 'W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu'
  })
});

const data = await response.json();
console.log('Response:', JSON.stringify(data, null, 2));

if (data.access_token) {
  console.log('\n[OK] Token obtained:', data.access_token.substring(0, 20) + '...');
  console.log('Expires in:', data.expires_in);
} else {
  console.log('\n[ERROR] No token in response');
}
