export let difference = (a: Set<string>, b: Set<string>) => {
	let result = new Set(a);
	b.forEach(value => result.delete(value));
	return result;
};

export let dump = o => {
	let dump_ = (prefix, o) => {
		if (typeof o === 'object') {
			return Object.keys(o).flatMap(key => dump_(`${prefix}.${key}`, o[key]));
		} else {
			return [`${prefix} = ${o}`];
		}
	};
	return dump_('', o).sort().join('\n');
};

export let equals = (a, b) => {
	let eq;
	if (a === b)
		eq = true;
	else {
		let ta = typeof a;
		let tb = typeof b;

		if (ta === tb) {
			if (ta === 'string') {
				eq = false;
			} else if (typeof a.length === 'number') {
				if (a.length === b.length) {
					if (typeof a[0] === 'string') {
						a = a.toSorted();
						b = b.toSorted();
					}

					let b_ = true;
					for (let i = 0; i < a.length; i++) b_ &&= equals(a[i], b[i]);
					eq = b_;
				} else {
					eq = false;
				}
			} else if (ta === 'object') {
				let keys = new Set();
				for (let key of Object.keys(a)) keys.add(key);
				for (let key of Object.keys(b)) keys.add(key);
				eq = true;
				keys.forEach((key: any) => eq &&= equals(a[key], b[key]));
			} else {
				eq = false;
			}
		} else {
			eq = false;
		}
	}

	if (!eq) console.error(`not equal: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
	return eq;
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

export let shellEscape = s => {
	return `"${s.replaceAll('"', '\\"')}"`;
};
