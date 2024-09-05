export let difference = (a: Set<string>, b: Set<string>) => {
	let result = new Set(a);
	b.forEach(value => result.delete(value));
	return result;
};

export let replace = (s: string) => {
	if (s.startsWith('$(') && s.endsWith(')')) {
		s = s.substring(0, s.length - 1) + ' | tr / :' + s.substring(s.length - 1, s.length);
	}

	let t = '';
	let q = 0;
	for (let c of s) {
		if (c === '(') q++;
		else if (c === ')') q--;
		if (q === 0 && c === '/') {
			t = t + ':';
		} else {
			t = t + c;
		}
	}

	return t;
};
