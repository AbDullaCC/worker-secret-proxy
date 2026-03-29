// Quick smoke test for the proxy endpoint
async function main() {
	console.log('=== 1. Health check ===');
	const health = await fetch('http://localhost:8787/');
	console.log(await health.json());

	console.log('\n=== 2. Proxy with placeholder ===');
	const proxy = await fetch('http://localhost:8787/proxy/stripe/charges', {
		method: 'POST',
		headers: {
			Authorization: 'Bearer ' + '{{stripe_api_key}}',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ amount: 1000, currency: 'usd' }),
	});
	console.log('Status:', proxy.status);
	console.log(await proxy.json());

	console.log('\n=== 3. Bad placeholder ===');
	const bad = await fetch('http://localhost:8787/proxy/stripe/charges', {
		method: 'POST',
		headers: {
			Authorization: 'Bearer ' + '{{wrong_key}}',
		},
	});
	console.log('Status:', bad.status);
	console.log(await bad.json());

	console.log('\n=== 4. Direct mock (real key) ===');
	const direct = await fetch('http://localhost:8787/mock/stripe/charges', {
		method: 'POST',
		headers: {
			Authorization: 'Bearer sk_test_4eC39HqLyjWDarjtT1zdp7dc',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ amount: 2500, currency: 'eur' }),
	});
	console.log('Status:', direct.status);
	console.log(await direct.json());

	console.log('\n=== 5. Direct mock (no auth - should 401) ===');
	const noauth = await fetch('http://localhost:8787/mock/stripe/charges', {
		method: 'POST',
	});
	console.log('Status:', noauth.status);
	console.log(await noauth.json());
}

main().catch(console.error);
