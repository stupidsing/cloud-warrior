export let difference = (a: Set<string>, b: Set<string>) => {
	let result = new Set(a);
	b.forEach(value => result.delete(value));
	return result;
};

export let replace = (s: string) => {
	let t = '';
	let q = 0;
	for (let c of s) {
		if (c === '{') q++;
		else if (c === '}') q--;
		if (c === '/') {
			t = t + ':';
		} else {
			t = t + c;
		}
	}
};
